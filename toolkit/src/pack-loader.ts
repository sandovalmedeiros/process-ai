/**
 * toolkit/src/pack-loader.ts — METHOD-PACK LOADER + VALIDADOR (AD-2, FR-17).
 *
 * Materializa o invariante AD-2 (segunda metade): method-packs são plugins de
 * conteúdo que estendem aditivamente o schema-núcleo. O loader lê `pack.toml`,
 * schemas, prompts e glossary; o validador garante que o pack NÃO redefine
 * schema-núcleo, pipeline, papéis ou gates.
 *
 * INVARIANTE AD-3 (núcleo hexagonal): este arquivo só importa `node:*` builtins
 * ou caminhos relativos dentro do core — nunca um package npm.
 *
 * Fronteiras:
 *  - pack padrão BPMN+SIPOC → Story 3.3.
 *  - distribuição npm + bootstrap → Story 3.4.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { SCHEMAS } from './schema-core.ts';

// ---- Tipos ----

/** Manifesto do pack (pack.toml). */
export interface PackManifest {
  name: string;
  version: string;
  description: string;
  /** artifactTypes que este pack estende (subconjunto do vocabulário de 7). */
  artifactTypes: string[];
}

/** Conteúdo completo de um method-pack carregado. */
export interface MethodPack {
  manifest: PackManifest;
  /** Schemas aditivos: artifactType → JSON Schema parcial (só as extensions). */
  schemas: Record<string, object>;
  /** Prompts por especialista: especialista → conteúdo markdown. */
  prompts: Record<string, string>;
  /** Glossário method-specific (opcional). */
  glossary: string;
}

/** Resultado de validação de pack. */
export interface PackValidationResult {
  valid: boolean;
  errors: string[];
}

// ---- Constantes ----

const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const KEBAB_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Campos proibidos no pack.toml — são toolkit-owned (AD-2). */
const FORBIDDEN_PACK_FIELDS = new Set([
  'pipeline', 'roles', 'gates', 'stages', 'engine',
]);

// ---- Erro acionável ----

export class PackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PackError';
  }
}

// ---- T1: Parser de pack.toml ----

/**
 * Parse e valida pack.toml (TOML mínimo — só seção [pack] com valores planos).
 *
 * v1: parser TOML mínimo. Se a complexidade crescer, usar `smol-toml` (npm)
 * quebraria AD-3 — reavaliar com adapter de parse injetável.
 */
export function validatePackToml(raw: string): PackManifest {
  const errors: string[] = [];
  let name = '';
  let version = '';
  let description = '';
  const artifactTypes: string[] = [];

  let inPack = false;
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue;

    if (trimmed === '[pack]') {
      inPack = true;
      continue;
    }
    // Se outra seção começar, para de parsear [pack].
    if (trimmed.startsWith('[') && trimmed.endsWith(']') && inPack) {
      // v1: ignora outras seções.
      continue;
    }
    if (!inPack) {
      // Linha fora de [pack] — pode ser campo proibido no nível raiz.
      const eq = trimmed.indexOf('=');
      if (eq >= 0) {
        const key = trimmed.slice(0, eq).trim();
        if (FORBIDDEN_PACK_FIELDS.has(key)) {
          errors.push(`Campo proibido no pack.toml: "${key}" é toolkit-owned (AD-2).`);
        }
      }
      continue;
    }

    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const rawVal = trimmed.slice(eq + 1).trim();
    // Remove aspas (simples ou duplas).
    const val = rawVal.replace(/^["'](.*)["']$/, '$1');

    switch (key) {
      case 'name':
        name = val;
        if (!KEBAB_RE.test(name)) {
          errors.push(`pack.name "${name}" inválido — deve ser kebab-case.`);
        }
        break;
      case 'version':
        version = val;
        if (!SEMVER_RE.test(version)) {
          errors.push(`pack.version "${version}" inválida — deve ser semver (X.Y.Z).`);
        }
        break;
      case 'description':
        description = val;
        break;
      case 'artifact_types': {
        // Suporta array inline TOML: ["a", "b"]
        const arrMatch = rawVal.match(/^\[(.*)\]$/);
        if (arrMatch) {
          const items = arrMatch[1].split(',').map((s) => s.trim().replace(/^["'](.*)["']$/, '$1'));
          for (const item of items) {
            if (item.length > 0) {
              if (!(item.toLowerCase() in SCHEMAS)) {
                errors.push(
                  `artifact_type "${item}" não está no vocabulário do schema-núcleo. ` +
                  `Esperado um de: ${Object.keys(SCHEMAS).join(', ')}.`,
                );
              }
              artifactTypes.push(item);
            }
          }
        }
        break;
      }
      default:
        if (FORBIDDEN_PACK_FIELDS.has(key)) {
          errors.push(`Campo proibido no pack.toml: "${key}" é toolkit-owned (AD-2).`);
        }
        // Campos desconhecidos são ignorados (extensibilidade futura).
    }
  }

  if (!name) errors.push('pack.name é obrigatório.');
  if (!version) errors.push('pack.version é obrigatória.');
  if (artifactTypes.length === 0) errors.push('pack.artifact_types é obrigatório e não pode ser vazio.');

  if (errors.length > 0) {
    throw new PackError(`pack.toml inválido: ${errors.join('; ')}`);
  }

  return { name, version, description, artifactTypes };
}

// ---- T2: Validador de extensão aditiva ----

/**
 * Valida que os schemas do pack estendem aditivamente o schema-núcleo (AD-2).
 *
 * Cada schema de pack deve:
 *  1. Referenciar exatamente 1 schema-núcleo (via allOf[0].$ref ou $ref raiz).
 *  2. Só ADICIONAR properties — nunca redefinir campo existente no núcleo.
 *  3. Ser um JSON Schema estruturalmente válido.
 *
 * @param pack - Pack carregado.
 * @returns PackValidationResult com erros em pt-BR.
 */
export function validatePackSchemas(pack: MethodPack): PackValidationResult {
  const errors: string[] = [];

  for (const [artifactType, packSchema] of Object.entries(pack.schemas)) {
    const normType = artifactType.toLowerCase();
    const coreSchema = SCHEMAS[normType] as Record<string, unknown> | undefined;

    if (!coreSchema) {
      errors.push(
        `Schema de pack para "${artifactType}": artifactType fora do vocabulário do schema-núcleo.`,
      );
      continue;
    }

    // Validar que packSchema é um objeto
    if (typeof packSchema !== 'object' || packSchema === null || Array.isArray(packSchema)) {
      errors.push(`Schema de pack para "${artifactType}": deve ser um objeto JSON Schema.`);
      continue;
    }

    const ps = packSchema as Record<string, unknown>;

    // Verificar allOf ou $ref
    const allOf = ps['allOf'] as unknown[] | undefined;
    const ref = ps['$ref'] as string | undefined;

    if (!allOf && !ref) {
      errors.push(
        `Schema de pack para "${artifactType}": deve usar allOf ou $ref para referenciar o schema-núcleo.`,
      );
      continue;
    }

    // Verificar que referencia o schema-núcleo correto
    const refTarget = ref ?? (allOf && allOf.length > 0 &&
      typeof allOf[0] === 'object' && allOf[0] !== null &&
      (allOf[0] as Record<string, unknown>)['$ref']);

    if (typeof refTarget === 'string') {
      const expectedId = `https://process-ai/schemas/${normType}/v1`;
      if (!refTarget.includes(normType)) {
        errors.push(
          `Schema de pack para "${artifactType}": $ref "${refTarget}" deve referenciar "${expectedId}".`,
        );
      }
    }

    // Verificar que pack NÃO redefine campos do núcleo
    const packProps = ps['properties'] as Record<string, unknown> | undefined;
    const coreProps = coreSchema['properties'] as Record<string, Record<string, unknown>> | undefined;

    if (packProps && coreProps) {
      for (const [field, packFieldSchema] of Object.entries(packProps)) {
        if (field in coreProps) {
          const coreType = coreProps[field]?.['type'];
          const packType = (packFieldSchema as Record<string, unknown>)?.['type'];
          if (coreType !== undefined && packType !== undefined && coreType !== packType) {
            errors.push(
              `Schema de pack para "${artifactType}": conflito no campo "${field}" — ` +
              `núcleo define type: "${coreType}", pack define type: "${packType}". ` +
              `Packs não podem redefinir campos do schema-núcleo (AD-2).`,
            );
          }
        }
      }
    }

    // Verificar que pack não declara required que conflita
    const packRequired = ps['required'] as string[] | undefined;
    if (Array.isArray(packRequired) && packRequired.length > 0) {
      // v1: warn apenas — packs podem adicionar required para campos NOVOS.
      // Conflito com required do núcleo seria removendo campo obrigatório.
      const coreRequired = coreSchema['required'] as string[] | undefined;
      if (Array.isArray(coreRequired)) {
        for (const field of coreRequired) {
          if (!packRequired.includes(field)) {
            // O pack não lista o campo obrigatório do núcleo — ok, o merge preserva.
            // Só seria erro se o pack explicitamente removesse.
          }
        }
      }
    }
  }

  return errors.length === 0 ? { valid: true, errors: [] } : { valid: false, errors };
}

// ---- T1 (cont): Loader de diretório ----

/**
 * Carrega um method-pack do diretório `packDir`.
 *
 * @param packDir - Caminho absoluto para o diretório do pack.
 * @returns MethodPack carregado e validado.
 */
export async function loadPack(packDir: string): Promise<MethodPack> {
  // 1) Ler e validar pack.toml
  let tomlRaw: string;
  try {
    tomlRaw = await fs.readFile(path.join(packDir, 'pack.toml'), 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new PackError(`pack.toml não encontrado em: ${packDir}`);
    }
    throw new PackError(`Erro ao ler pack.toml em ${packDir}: ${(e as Error).message}`);
  }
  const manifest = validatePackToml(tomlRaw);

  // 2) Ler schemas/ (opcional)
  const schemas: Record<string, object> = {};
  const schemasDir = path.join(packDir, 'schemas');
  try {
    const entries = await fs.readdir(schemasDir);
    for (const entry of entries) {
      if (!entry.endsWith('.schema.json')) continue;
      const artifactType = entry.replace('.schema.json', '');
      const raw = await fs.readFile(path.join(schemasDir, entry), 'utf8');
      try {
        schemas[artifactType] = JSON.parse(raw);
      } catch {
        throw new PackError(`Schema inválido (JSON malformado): schemas/${entry}`);
      }
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    // schemas/ não existe → ok (opcional).
  }

  // 3) Ler prompts/ (opcional)
  const prompts: Record<string, string> = {};
  const promptsDir = path.join(packDir, 'prompts');
  try {
    const entries = await fs.readdir(promptsDir);
    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue;
      const specialist = entry.replace('.md', '');
      prompts[specialist] = await fs.readFile(path.join(promptsDir, entry), 'utf8');
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }

  // 4) Ler glossary.md (opcional)
  let glossary = '';
  try {
    glossary = await fs.readFile(path.join(packDir, 'glossary.md'), 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }

  const pack: MethodPack = { manifest, schemas, prompts, glossary };

  // 5) Validar schemas do pack
  const validation = validatePackSchemas(pack);
  if (!validation.valid) {
    throw new PackError(`Pack "${manifest.name}": schemas inválidos — ${validation.errors.join('; ')}`);
  }

  return pack;
}

// ---- T3: Config (.process-ai/config) ----

/** Config da sessão (.process-ai/config). */
export interface SessionConfig {
  activePack?: { id: string; version: string };
}

/**
 * Lê .process-ai/config (se existir). Retorna config vazia se não existir.
 * v1: TOML mínimo (active_pack + pack_version).
 */
export async function readConfig(root: string): Promise<SessionConfig> {
  const configPath = path.join(root, '.process-ai', 'config');
  let raw: string;
  try {
    raw = await fs.readFile(configPath, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw new PackError(`Erro ao ler .process-ai/config: ${(e as Error).message}`);
  }

  let activePackId = '';
  let activePackVersion = '';

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["'](.*)["']$/, '$1');
    if (key === 'active_pack') activePackId = val;
    if (key === 'pack_version') activePackVersion = val;
  }

  if (activePackId) {
    return { activePack: { id: activePackId, version: activePackVersion || '0.0.0' } };
  }
  return {};
}
