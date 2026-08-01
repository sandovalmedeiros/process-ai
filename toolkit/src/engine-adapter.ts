/**
 * toolkit/src/engine-adapter.ts — A PORTA (AD-3).
 *
 * Este arquivo é o coração do núcleo hexagonal: define o contrato pelo qual o
 * core (toolkit/src + skills) conversa com qualquer engine de IA, sem conhecer
 * nenhuma engine específica.
 *
 * INVARIANTE (AD-3): este arquivo NÃO importa nada de engine — nem adapters
 * concretos (toolkit/adapters/**), nem SDKs de engine (@anthropic-ai/*,
 * @modelcontextprotocol/*, etc.). O teste de fronteira em
 * tests/import-boundary.test.ts materializa essa regra.
 *
 * v1 (story 1.1): define o shape mínimo. Story 1.2 cristaliza o canal
 * propose/commit (CommitResult + SHA-256); 1.4 amadurece confiança/ledger.
 */

/**
 * Payload do canal de propose. O shape é TOOLKIT-OWNED (AD-1): é o toolkit quem
 * define, e o adapter apenas roteia (pass-through) sem interpretar/mutar.
 *
 * Versão mínima em 1.1 — os campos são intencionalmente largos
 * (`content: unknown`, `claims?: unknown[]`). Eles cristalizam em histórias
 * futuras (1.2/1.4).
 */
import type { Claim } from './confidence.ts';

export interface ProposePayload {
  /** Tipo do artefato proposto, ex.: "sipoc" | "hierarchy" | "bpmn" | "pop". String em 1.1. */
  artifactType: string;
  /** Corpo do artefato proposto pelo agente. Opaco para o adapter. */
  content: unknown;
  /**
   * Afirmações + marcador/fonte propostos (AD-5, FR-14).
   * Cristalizado em 1.4 (confiança mecânica). Opcional — payloads internos do
   * toolkit (ex.: checkpoint state) não carregam claims.
   */
  claims?: Claim[];
}

/**
 * Resultado de um commit (AD-1, story 1.2): o que o toolkit devolve ao adapter
 * após commitar um artefato. É o retorno canônico de `propose()` a partir de 1.2
 * (substitui o `unknown` do stub pass-through da 1.1).
 */
export interface CommitResult {
  /** SHA-256 (hex) do artefato — chave content-addressed (determinística). */
  sha256: string;
  /** Path absoluto do artefato em `_process-ai_output/<type>/<sha>.<ext>`. */
  artifactPath: string;
  /** Path absoluto do manifesto em `.process-ai/manifests/<sha>.json`. */
  manifestPath: string;
}

/**
 * Porta que cada engine concreta deve implementar.
 *
 * Três capacidades (AD-3 / AD-7):
 *  1. installSkills        — instala as skills markdown do framework no projeto-alvo.
 *  2. registerSlashCommands — registra slash-commands públicos (ex.: /process-ai) no projeto-alvo.
 *  3. propose              — canal de propose em modo PASS-THROUGH (roteia sem mutar).
 */
export interface EngineAdapter {
  /** Instala as skills (markdown) do framework no projeto-alvo. */
  installSkills(targetProjectDir: string): Promise<void>;

  /** Registra o(s) slash-command(s) públicos (ex.: /process-ai) no projeto-alvo. */
  registerSlashCommands(targetProjectDir: string): Promise<void>;

  /**
   * Canal propose → commit (pass-through): roteia o payload ao toolkit (único
   * escritor) sem mutá-lo e devolve o CommitResult com o SHA-256 do artefato.
   */
  propose(payload: ProposePayload): Promise<CommitResult>;
}
