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

/** Remove aspas externas (simples ou duplas) de um escalar/chave TOML. */
function unquote(v: string): string {
  return v.replace(/^["'](.*)["']$/, '$1');
}

/**
 * True se `name` (chave, nome de seção ou 1º segmento dotted) é toolkit-owned.
 * Pega: `pipeline`, `pipeline.stages` (1º segmento), `[pipeline]`, `[pipeline.x]`.
 */
function isForbiddenName(name: string): boolean {
  const clean = unquote(name).trim();
  if (FORBIDDEN_PACK_FIELDS.has(clean)) return true;
  const dot = clean.indexOf('.');
  if (dot > 0) {
    const firstSeg = clean.slice(0, dot).trim();
    if (FORBIDDEN_PACK_FIELDS.has(firstSeg)) return true;
  }
  return false;
}

/**
 * Parse e valida pack.toml (TOML mínimo — seção [pack] + arrays inline/multi-linha).
 *
 * v1: parser TOML mínimo. Se a complexidade crescer, usar `smol-toml` (npm)
 * quebraria AD-3 — reavaliar com adapter de parse injetável.
 *
 * Hardening (code review Epic 3 / 3.2):
 *  - seções/tabelas proibidas ([pipeline], [roles]...) e chaves dotted (pipeline.stages)
 *    são rejeitadas, não só a forma `key = value` (AD-2 / AC1).
 *  - `inPack` é resetado ao trocar de seção (campos de [other] não sobrescrevem [pack]).
 *  - arrays `artifact_types` multi-linha (forma canônica TOML) são suportados.
 *  - chaves duplicadas e chaves aspadas são detectadas.
 */
export function validatePackToml(raw: string): PackManifest {
  const errors: string[] = [];
  let name = '';
  let version = '';
  let description = '';
  const artifactTypes: string[] = [];
  const seenKeys = new Set<string>();

  let inPack = false;
  let inArray = false;
  let arrayKey = '';
  let arrayBuf = '';

  /** Parse do conteúdo de um array (inline ou multi-linha acumulado) para artifact_types. */
  const parseArtifactArray = (arrayRaw: string) => {
    const inner = arrayRaw.replace(/^\[/, '').replace(/\][,;\s]*$/, '').trim();
    if (inner.length === 0) return; // array vazio → erro genérico capturado no fim
    const items = inner.split(',').map((s) => unquote(s.trim()));
    for (const item of items) {
      const clean = item.trim();
      if (clean.length === 0) continue; // trailing comma
      if (!(clean.toLowerCase() in SCHEMAS)) {
        errors.push(
          `artifact_type "${clean}" não está no vocabulário do schema-núcleo. ` +
          `Esperado um de: ${Object.keys(SCHEMAS).join(', ')}.`,
        );
      }
      artifactTypes.push(clean);
    }
  };

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue;

    // Continuação de array multi-linha
    if (inArray) {
      arrayBuf += '\n' + trimmed;
      if (trimmed.includes(']')) {
        inArray = false;
        if (arrayKey === 'artifact_types') parseArtifactArray(arrayBuf);
      }
      continue;
    }

    // Header de seção [section] ou [a.b]
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const sectionName = trimmed.slice(1, -1).trim();
      if (isForbiddenName(sectionName)) {
        errors.push(`Seção proibida no pack.toml: "[${sectionName}]" é toolkit-owned (AD-2).`);
      }
      inPack = sectionName === 'pack'; // reset ao trocar de seção (hardening)
      continue;
    }

    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const rawKey = trimmed.slice(0, eq).trim();
    const key = unquote(rawKey);
    if (key !== rawKey) {
      errors.push(`Chave aspada ("${rawKey}") não suportada no pack.toml — use ${key}.`);
    }
    const rawVal = trimmed.slice(eq + 1).trim();

    // Chave duplicada (TOML spec proíbe; antes era last-wins silencioso)
    const dupKey = (inPack ? 'pack.' : 'root.') + key;
    if (seenKeys.has(dupKey)) {
      errors.push(`Chave duplicada no pack.toml: "${key}" (seção ${inPack ? '[pack]' : 'raiz'}).`);
    }
    seenKeys.add(dupKey);

    // Campo proibido (toolkit-owned) — detectado em QUALQUER contexto e tipo de valor
    // (raiz, [pack], escalar OU array). Antes só `key=value` escalar era pego e o
    // branch de array fazia continue antes da checagem (pipeline.stages=[..] passava).
    if (isForbiddenName(key)) {
      errors.push(`Campo proibido no pack.toml: "${key}" é toolkit-owned (AD-2).`);
    }

    // Início de array multi-linha: value começa com '[' mas não fecha na linha
    if (rawVal.startsWith('[') && !rawVal.includes(']')) {
      inArray = true;
      arrayKey = key;
      arrayBuf = rawVal;
      continue;
    }

    // Array inline [a, b]
    if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
      if (key === 'artifact_types') parseArtifactArray(rawVal);
      continue;
    }

    // Escalar
    const val = unquote(rawVal);
    if (!inPack) {
      continue; // root: outras chaves (não-proibidas) são ignoradas
    }

    switch (key) {
      case 'name':
        name = val;
        if (name && !KEBAB_RE.test(name)) {
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
      case 'artifact_types':
        errors.push('pack.artifact_types deve ser um array TOML (ex.: ["sipoc", "flow"]).');
        break;
      default:
      // Campos desconhecidos (não-proibidos) são ignorados (extensibilidade futura).
    }
  }

  if (inArray) {
    errors.push('pack.toml: array não fechado — "]" ausente.');
  }
  if (!name) errors.push('pack.name é obrigatório.');
  if (!version) errors.push('pack.version é obrigatória.');
  if (artifactTypes.length === 0) {
    errors.push('pack.artifact_types é obrigatório e não pode ser vazio.');
  }

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
  const declaredTypes = new Set(pack.manifest.artifactTypes.map((t) => t.toLowerCase()));

  for (const [artifactType, packSchema] of Object.entries(pack.schemas)) {
    const normType = artifactType.toLowerCase();
    const coreSchema = SCHEMAS[normType] as Record<string, unknown> | undefined;

    if (!coreSchema) {
      errors.push(
        `Schema de pack para "${artifactType}": artifactType fora do vocabulário do schema-núcleo.`,
      );
      continue;
    }

    // Cross-check (hardening): o tipo do schema deve estar declarado em artifact_types.
    if (!declaredTypes.has(normType)) {
      errors.push(
        `Schema de pack para "${artifactType}": tipo não listado em pack.toml artifact_types ` +
        `(${pack.manifest.artifactTypes.join(', ')}).`,
      );
    }

    // Validar que packSchema é um objeto
    if (typeof packSchema !== 'object' || packSchema === null || Array.isArray(packSchema)) {
      errors.push(`Schema de pack para "${artifactType}": deve ser um objeto JSON Schema.`);
      continue;
    }

    const ps = packSchema as Record<string, unknown>;

    // refTarget obrigatório e válido — allOf:[] / allOf:[null] / sem $ref → rejeita.
    const allOf = ps['allOf'] as unknown[] | undefined;
    const ref = ps['$ref'] as string | undefined;
    let refTarget: string | undefined;
    if (typeof ref === 'string') {
      refTarget = ref;
    } else if (Array.isArray(allOf) && allOf.length > 0) {
      const first = allOf[0];
      if (first !== null && typeof first === 'object'
        && typeof (first as Record<string, unknown>)['$ref'] === 'string') {
        refTarget = (first as Record<string, unknown>)['$ref'] as string;
      }
    }
    if (refTarget === undefined) {
      errors.push(
        `Schema de pack para "${artifactType}": deve referenciar o schema-núcleo via allOf[0].$ref ` +
        `ou $ref raiz válido (allOf vazio/nulo não referencia nada).`,
      );
      continue;
    }

    // $ref EXATO contra o $id versionado do schema-núcleo (antes era substring match).
    const expectedId = `https://process-ai/schemas/${normType}/v1`;
    if (refTarget !== expectedId) {
      errors.push(
        `Schema de pack para "${artifactType}": $ref "${refTarget}" deve ser exatamente "${expectedId}".`,
      );
    }

    // AD-2 aditivo (estrito): pack SÓ adiciona properties — jamais redeclara campo do núcleo.
    // Coleta properties declaradas pelo pack em top-level E em cada elemento de allOf
    // (packs reais usam allOf[1].properties; alguns podem usar top-level).
    const packFieldNames = new Set<string>();
    const topLevelProps = ps['properties'];
    if (topLevelProps && typeof topLevelProps === 'object') {
      for (const f of Object.keys(topLevelProps as Record<string, unknown>)) packFieldNames.add(f);
    }
    if (Array.isArray(allOf)) {
      for (const el of allOf) {
        if (el && typeof el === 'object') {
          const elProps = (el as Record<string, unknown>)['properties'];
          if (elProps && typeof elProps === 'object') {
            for (const f of Object.keys(elProps as Record<string, unknown>)) packFieldNames.add(f);
          }
        }
      }
    }
    const coreProps = coreSchema['properties'] as Record<string, Record<string, unknown>> | undefined;
    if (coreProps) {
      for (const field of packFieldNames) {
        if (field in coreProps) {
          errors.push(
            `Schema de pack para "${artifactType}": campo "${field}" pertence ao schema-núcleo — ` +
            `packs não podem redefinir campos do núcleo (AD-2).`,
          );
        }
      }
    }
    // v1.1: `required: ['body']` do núcleo está ativo (AD-2 enforcement).
    // Packs podem adicionar `required` para campos NOVOS, mas não redefinir os do núcleo.
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
      // Lowercase do artifactType (chave de lookup) — consistente com SCHEMAS e
      // validatePackSchemas (hardening: 'Sipoc.schema.json' → key 'sipoc').
      const artifactType = entry.slice(0, -'.schema.json'.length).toLowerCase();
      const raw = await fs.readFile(path.join(schemasDir, entry), 'utf8');
      try {
        schemas[artifactType] = JSON.parse(raw);
      } catch {
        throw new PackError(`Schema inválido (JSON malformado): schemas/${entry}`);
      }
    }
  } catch (e) {
    if (e instanceof PackError) throw e;
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new PackError(`Erro ao ler schemas/ do pack: ${(e as Error).message}`);
    }
    // schemas/ não existe → ok (opcional).
  }

  // 3) Ler prompts/ (opcional)
  const prompts: Record<string, string> = {};
  const promptsDir = path.join(packDir, 'prompts');
  try {
    const entries = await fs.readdir(promptsDir);
    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue;
      const specialist = entry.slice(0, -'.md'.length);
      prompts[specialist] = await fs.readFile(path.join(promptsDir, entry), 'utf8');
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new PackError(`Erro ao ler prompts/ do pack: ${(e as Error).message}`);
    }
  }

  // 4) Ler glossary.md (opcional)
  let glossary = '';
  try {
    glossary = await fs.readFile(path.join(packDir, 'glossary.md'), 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new PackError(`Erro ao ler glossary.md do pack: ${(e as Error).message}`);
    }
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
    // Não fabricamos "0.0.0" quando pack_version ausente (hardening — antes
    // corrompia provenance silenciosamente). Retorna string vazia; commit usa
    // a versão do pack carregado (truthful) e warn se a config divergir.
    return { activePack: { id: activePackId, version: activePackVersion } };
  }
  return {};
}
