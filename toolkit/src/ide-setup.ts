/**
 * toolkit/src/ide-setup.ts — PORTA IdeSetup (install-time).
 *
 * Análogo install-time do `EngineAdapter` (runtime). O orquestrador de install
 * (`installer/orchestrator.ts`) depende SÓ desta porta — nunca de um adapter
 * concreto (e.g. `ClaudeCodeIdeSetup`). Isso mantém o core agnóstico à IDE,
 * espelhando o padrão hexagonal do `engine-adapter.ts` (AD-3).
 *
 * Por que uma porta separada (e não métodos em `EngineAdapter`):
 *  - `EngineAdapter` é o canal de RUNTIME (propose/checkpoint via CLI). Ele
 *    carrega `installSkills`/`registerSlashCommands` por legado (deprecated),
 *    mas install-time é um concern distinto — cada IDE tem um layout próprio
 *    (skills no Claude Code, rules no Cursor, etc.). A porta `IdeSetup` dá a
 *    esse concern o seu próprio seam, permitindo que o core orquestre install
 *    sem conhecer nenhuma IDE concreta.
 *
 * FR-21: v1 só Claude Code (`ClaudeCodeIdeSetup`); a porta permite adicionar
 * Cursor/Windsurf/etc. depois sem tocar o core.
 *
 * import-boundary: só tipos, sem imports (zero deps). Adapters a implementam.
 */

/** Opções passadas ao setup de uma IDE (espelham `ScaffoldOptions`). */
export interface IdeSetupOptions {
  activePack?: string;
  packVersion?: string;
  processAiVersion?: string;
}

/** Arquivo instalado: caminho forward-slash relativo ao target + seu SHA-256. */
export interface InstalledFile {
  path: string;
  sha256: string;
}

/** Resultado de `setupIde`: a IDE alvo e os arquivos efetivamente escritos. */
export interface IdeSetupResult {
  ide: string;
  files: InstalledFile[];
}

/** Resultado de `uninstallIde`: diretórios/remoções realizadas. */
export interface IdeUninstallResult {
  /** Caminhos (relativos ao target, forward-slash) removidos. */
  removed: string[];
}

/**
 * Porta install-time. O adapter concreto instancia a porta `EngineAdapter`
 * (runtime) E esta porta (install) na composition root (`bin/`).
 */
export interface IdeSetup {
  /** Identificador estável da IDE (e.g. "claude-code"). */
  ideId(): string;
  /**
   * Instala os artefatos da IDE em `targetDir` (skills no Claude Code) e
   * retorna a lista de arquivos escritos com seus hashes (para o manifest).
   * Idempotente.
   */
  setupIde(targetDir: string, opts?: IdeSetupOptions): Promise<IdeSetupResult>;
  /** Remove os artefatos da IDE de `targetDir`. Idempotente. */
  uninstallIde(targetDir: string): Promise<IdeUninstallResult>;
}
