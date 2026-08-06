/**
 * toolkit/src/schema-core.ts — SCHEMA-NÚCLEO TOOLKIT-OWNED (AD-2, FR-17).
 *
 * Materializa o invariante AD-2: existe um schema-núcleo versionado para cada
 * artifactType, toolkit-owned. Method-packs só podem estender aditivamente
 * (campos/conteúdo method-specific), nunca redefinir o shape central.
 *
 * Cada schema define o shape MÍNIMO canônico: os campos que TODO artefato daquele
 * tipo DEVE ter para ser válido. O validador é executado no commit ANTES de
 * qualquer escrita (abort-before-write, mesmo princípio de `validateClaims`).
 *
 * Schemas v1 são validados manualmente (zero dependências npm) — AD-3 compliant.
 * Se a complexidade crescer (packs com schemas aninhados, 3.2+), reavaliar `ajv`.
 *
 * INVARIANTE AD-3 (núcleo hexagonal): este arquivo só importa `node:*` builtins
 * ou caminhos relativos dentro do core — nunca um package npm. O teste
 * tests/import-boundary.test.ts cobre `schema-core.ts` automaticamente.
 *
 * Fronteiras (NÃO faça aqui — pertence a outra story):
 *  - loader de method-packs + merge schema-núcleo + pack-schema → Story 3.2.
 *  - validador de extensão (pack não redefine núcleo) → Story 3.2.
 *  - registro de pack_id+versão no checkpoint → Story 3.2.
 *  - pack padrão BPMN+SIPOC → Story 3.3.
 */

// ---- Tipos ----

/** Resultado da validação de schema. */
export interface SchemaValidationResult {
  valid: boolean;
  /** Erros em pt-BR (vazio se valid === true). */
  errors: string[];
}

// ---- Schemas canônicos v1 (AD-2) ----

/**
 * Schema para discovery-interview (entrevista de descoberta).
 * Shape mínimo: body markdown com perguntas e respostas.
 */
const DISCOVERY_INTERVIEW_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://process-ai/schemas/discovery-interview/v1',
  type: 'object',
  // v1: sem campos obrigatórios — backward-compat com payloads existentes (AC4).
  // required: ['body'], // ← ativar em 3.2 quando method-packs definirem requisitos de conteúdo.
  properties: {
    body: { type: 'string', description: 'Markdown com perguntas e respostas da entrevista.' },
  },
  // v1: additionalProperties: true — backward-compat (AC4). Fechar em 3.2.
  additionalProperties: true,
  'x-extensible': true,
} as const;

/**
 * Schema para SIPOC.
 * Shape mínimo: body markdown + campos estruturados opcionais.
 */
const SIPOC_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://process-ai/schemas/sipoc/v1',
  type: 'object',
  // v1: sem campos obrigatórios — backward-compat com payloads existentes (AC4).
  // required: ['body'], // ← ativar em 3.2 quando method-packs definirem requisitos de conteúdo.
  properties: {
    body: { type: 'string', description: 'Markdown com tabela SIPOC.' },
    suppliers: { type: 'array', items: { type: 'string' } },
    inputs: { type: 'array', items: { type: 'string' } },
    process: { type: 'array', items: { type: 'string' } },
    outputs: { type: 'array', items: { type: 'string' } },
    customers: { type: 'array', items: { type: 'string' } },
  },
  // v1: additionalProperties: true — backward-compat (AC4). Fechar em 3.2.
  additionalProperties: true,
  'x-extensible': true,
} as const;

/**
 * Schema para value-chain (cadeia de valor).
 * Shape mínimo: body markdown + links opcionais.
 */
const VALUE_CHAIN_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://process-ai/schemas/value-chain/v1',
  type: 'object',
  // v1: sem campos obrigatórios — backward-compat com payloads existentes (AC4).
  // required: ['body'], // ← ativar em 3.2 quando method-packs definirem requisitos de conteúdo.
  properties: {
    body: { type: 'string', description: 'Markdown com cadeia de valor.' },
    links: { type: 'array', items: { type: 'string' }, description: 'Nomes dos elos da cadeia.' },
  },
  // v1: additionalProperties: true — backward-compat (AC4). Fechar em 3.2.
  additionalProperties: true,
  'x-extensible': true,
} as const;

/**
 * Schema para hierarchy (hierarquia de processos).
 * Shape mínimo: body markdown + levels opcional.
 */
const HIERARCHY_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://process-ai/schemas/hierarchy/v1',
  type: 'object',
  // v1: sem campos obrigatórios — backward-compat com payloads existentes (AC4).
  // required: ['body'], // ← ativar em 3.2 quando method-packs definirem requisitos de conteúdo.
  properties: {
    body: { type: 'string', description: 'Markdown com árvore hierárquica (M1.E1.S1.A1.T1).' },
    levels: { type: 'integer', minimum: 1, maximum: 6, description: 'Número de níveis na hierarquia.' },
  },
  // v1: additionalProperties: true — backward-compat (AC4). Fechar em 3.2.
  additionalProperties: true,
  'x-extensible': true,
} as const;

/**
 * Schema para flow (BPMN 2.0 XML canônico — AD-6).
 * Shape mínimo: body XML string.
 */
const FLOW_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://process-ai/schemas/flow/v1',
  type: 'object',
  // v1: sem campos obrigatórios — backward-compat com payloads existentes (AC4).
  // required: ['body'], // ← ativar em 3.2 quando method-packs definirem requisitos de conteúdo.
  properties: {
    body: { type: 'string', description: 'BPMN 2.0 XML canônico (AD-6).' },
  },
  // v1: additionalProperties: true — backward-compat (AC4). Fechar em 3.2.
  additionalProperties: true,
  'x-extensible': true,
} as const;

/**
 * Schema para pop (POP + diagnóstico — FR-12, FR-13).
 * Shape mínimo: body markdown com POPs + diagnóstico consolidado.
 */
const POP_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://process-ai/schemas/pop/v1',
  type: 'object',
  // v1: sem campos obrigatórios — backward-compat com payloads existentes (AC4).
  // required: ['body'], // ← ativar em 3.2 quando method-packs definirem requisitos de conteúdo.
  properties: {
    body: { type: 'string', description: 'Markdown com POPs + diagnóstico consolidado (FR-13).' },
  },
  // v1: additionalProperties: true — backward-compat (AC4). Fechar em 3.2.
  additionalProperties: true,
  'x-extensible': true,
} as const;

/**
 * Schema para summary-report (relatório final da Déa).
 * Shape mínimo: body markdown narrativo + relatório de confiança embutido.
 */
const SUMMARY_REPORT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://process-ai/schemas/summary-report/v1',
  type: 'object',
  // v1: sem campos obrigatórios — backward-compat com payloads existentes (AC4).
  // required: ['body'], // ← ativar em 3.2 quando method-packs definirem requisitos de conteúdo.
  properties: {
    body: { type: 'string', description: 'Markdown narrativo + relatório de confiança embutido.' },
  },
  // v1: additionalProperties: true — backward-compat (AC4). Fechar em 3.2.
  additionalProperties: true,
  'x-extensible': true,
} as const;

/**
 * Schema para reference-material (documento ingerido — Laura, a Arquivista).
 * Shape mínimo: body markdown + metadados do arquivo-fonte.
 */
const REFERENCE_MATERIAL_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://process-ai/schemas/reference-material/v1',
  type: 'object',
  properties: {
    body: { type: 'string', description: 'Markdown estruturado do documento ingerido.' },
    source_file: { type: 'string', description: 'Nome do arquivo original (ex.: manual-qualidade.pdf).' },
    source_format: { type: 'string', enum: ['pdf', 'docx', 'pptx'], description: 'Formato do arquivo-fonte.' },
    page_count: { type: 'integer', minimum: 1, description: 'Número de páginas (PDF/DOCX) ou slides (PPTX).' },
    metadata: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Título extraído do documento.' },
        author: { type: 'string', description: 'Autor extraído dos metadados.' },
        created: { type: 'string', description: 'Data de criação (ISO-8601) extraída dos metadados.' },
      },
      description: 'Metadados extraídos do arquivo-fonte.',
    },
  },
  additionalProperties: true,
  'x-extensible': true,
} as const;

// ---- Mapa de schemas ----

/** Mapa artifactType → schema canônico. */
export const SCHEMAS: Record<string, object> = {
  'discovery-interview': DISCOVERY_INTERVIEW_SCHEMA,
  'sipoc': SIPOC_SCHEMA,
  'value-chain': VALUE_CHAIN_SCHEMA,
  'hierarchy': HIERARCHY_SCHEMA,
  'flow': FLOW_SCHEMA,
  'pop': POP_SCHEMA,
  'summary-report': SUMMARY_REPORT_SCHEMA,
  'reference-material': REFERENCE_MATERIAL_SCHEMA,
};

/** ArtifactTypes canônicos (derivados das chaves de SCHEMAS). */
export const VALID_ARTIFACT_TYPES: readonly string[] = Object.keys(SCHEMAS);

// ---- Validador manual (Opção A — zero npm, AD-3 compliant) ----

/**
 * Valida `content` contra o schema-núcleo do `artifactType` (AD-2).
 *
 * Função PURA — zero IO. Validação manual (sem `ajv`) para manter AD-3.
 *
 * POSTURA v1 (leniente — AC4 backward-compat): aceita strings, números, arrays
 * e objetos; rejeita apenas `null`/`undefined`, `artifactType` não-string, e
 * campos conhecidos com tipo errado. `required` está desativado (comentado nos
 * schemas) e `additionalProperties` é `true` (shape NÃO fechado). Enforcement
 * estrito (rejeitar não-objetos, ativar required, fechar additionalProperties,
 * rejeitar objetos exóticos) → DEFERIDO para uma story dedicada (ver
 * `deferred-work.md`, code review Epic 3 / 3-1).
 *
 * @param artifactType - Tipo do artefato (deve estar em VALID_ARTIFACT_TYPES).
 * @param content - Conteúdo proposto pelo agente.
 * @param packSchemas - (opcional, 3.2) schemas aditivos de um method-pack ativo:
 *   artifactType → JSON Schema parcial do pack. Quando presente, os campos que o
 *   pack adiciona ao schema-núcleo também são validados (merge AD-2). Objeto
 *   simples (não o tipo `MethodPack`) para evitar dependência circular.
 * @returns SchemaValidationResult com erros em pt-BR.
 */
export function validateContent(
  artifactType: string,
  content: unknown,
  packSchemas?: Record<string, unknown>,
): SchemaValidationResult {
  // 0) artifactType deve ser string — guard de contrato (a função "nunca lança").
  //    Commit-side callers são protegidos por validatePayload, mas a API é
  //    exportada e um consumer de biblioteca pode passar null/undefined.
  if (typeof artifactType !== 'string') {
    return {
      valid: false,
      errors: [
        `artifactType deve ser string, recebeu ${artifactType === null ? 'null' : typeof artifactType}.`,
      ],
    };
  }

  // 1) artifactType conhecido? (case-insensitive — sanitizeArtifactType roda depois).
  //    v1: artifactTypes desconhecidos são aceitos (backward-compat AC4).
  //    Validação estrita de vocabulário → 3.2 (method-pack loader).
  const normalized = artifactType.toLowerCase();
  const schema = SCHEMAS[normalized] as Record<string, unknown> | undefined;
  if (!schema) {
    // artifactType fora do vocabulário — aceita no v1 (pode ser type de pack futuro).
    return { valid: true, errors: [] };
  }

  // 2) content é um valor JSON válido? (não-nulo, não-undefined)
  if (content === null || content === undefined) {
    return {
      valid: false,
      errors: [
        `"${artifactType}": content não pode ser null ou undefined.`,
      ],
    };
  }

  // 3) Se content é objeto, validar tipos dos campos conhecidos (best-effort).
  //    v1: strings, números, arrays e objetos são aceitos (backward-compat AC4).
  //    Validação estrutural profunda (required, additionalProperties) → 3.2.
  if (typeof content !== 'object' || Array.isArray(content)) {
    // strings, números, arrays — todos válidos no v1.
    return { valid: true, errors: [] };
  }

  const obj = content as Record<string, unknown>;
  const errors: string[] = [];

  // Validar tipos dos campos conhecidos (properties) — best-effort.
  // Se um campo conhecido está presente, seu tipo deve estar correto.
  // Campos desconhecidos são aceitos (additionalProperties: true no v1).
  //
  // MERGE AD-2 / 3.2: quando um method-pack ativo adiciona propriedades ao tipo,
  // elas são mergeadas nas properties validadas (best-effort, mesma postura v1).
  const coreProps = schema['properties'] as Record<string, Record<string, unknown>> | undefined;
  const packSchema = packSchemas?.[normalized] as Record<string, unknown> | undefined;
  const packProps = packSchema?.['properties'] as Record<string, Record<string, unknown>> | undefined;
  const properties: Record<string, Record<string, unknown>> | undefined =
    coreProps || packProps ? { ...(coreProps ?? {}), ...(packProps ?? {}) } : undefined;
  if (properties) {
    for (const [field, fieldSchema] of Object.entries(properties)) {
      if (!(field in obj) || obj[field] === undefined || obj[field] === null) continue; // campo ausente → ok

      const expectedType = fieldSchema['type'] as string | undefined;
      const value = obj[field];

      if (expectedType === 'string' && typeof value !== 'string') {
        errors.push(`"${artifactType}": campo "${field}" deve ser string, recebeu ${typeof value}.`);
      } else if (expectedType === 'integer' && !Number.isInteger(value)) {
        errors.push(`"${artifactType}": campo "${field}" deve ser inteiro, recebeu ${typeof value}.`);
      } else if (expectedType === 'array') {
        if (!Array.isArray(value)) {
          errors.push(`"${artifactType}": campo "${field}" deve ser array, recebeu ${typeof value}.`);
        } else {
          const itemType = fieldSchema['items'] as Record<string, unknown> | undefined;
          if (itemType && itemType['type'] === 'string') {
            for (let i = 0; i < value.length; i++) {
              if (typeof value[i] !== 'string') {
                errors.push(`"${artifactType}": campo "${field}[${i}]" deve ser string, recebeu ${typeof value[i]}.`);
              }
            }
          }
        }
      }

      // integer range validation
      if (expectedType === 'integer' && Number.isInteger(value)) {
        const num = value as number;
        const min = fieldSchema['minimum'] as number | undefined;
        const max = fieldSchema['maximum'] as number | undefined;
        if (min !== undefined && num < min) {
          errors.push(`"${artifactType}": campo "${field}" deve ser ≥ ${min}, recebeu ${num}.`);
        }
        if (max !== undefined && num > max) {
          errors.push(`"${artifactType}": campo "${field}" deve ser ≤ ${max}, recebeu ${num}.`);
        }
      }
    }
  }

  return errors.length === 0 ? { valid: true, errors: [] } : { valid: false, errors };
}
