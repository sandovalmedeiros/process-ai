#!/usr/bin/env node
/**
 * bin/bootstrap.ts — CLI de bootstrap (AD-7).
 *
 * Registra o framework process-ai num projeto-alvo usando o ClaudeCodeAdapter:
 * instala a skill (tornando `/process-ai` disponível) e chama o registro de
 * slash-commands (no-op no Claude Code v1).
 *
 * Uso:
 *   node bin/bootstrap.ts --target <dir>        # default: cwd
 *   node bin/bootstrap.ts --target=<dir>        # form com '=' (aceita nomes que começam com '-')
 *   node bin/bootstrap.ts --dev                 # modo dev (sem efeito funcional em 1.1)
 *
 * Nota Windows: caminhos acima de MAX_PATH (~260 chars) podem falhar com ENOENT
 * opaco; habilite o suporte a long paths no Windows ou use um diretório-alvo mais raso.
 */
import path from 'node:path';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ClaudeCodeAdapter } from '../toolkit/adapters/claude-code/adapter.ts';
import type { EngineAdapter } from '../toolkit/src/engine-adapter.ts';
import { runInstall, formatInstallSummary } from '../toolkit/src/install.ts';

export interface BootstrapOptions {
  target: string;
  dev: boolean;
}

// bootstrap.ts está em bin/ -> 1 nível acima = repo root.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const HELP = `process-ai bootstrap

Uso:
  process-ai --target <dir> [--dev]
  process-ai --target=<dir> [--dev]   # aceita nomes que começam com '-'
  process-ai --help

Opções:
  --target <dir>   Diretório-alvo onde registrar /process-ai (default: cwd).
                   Deve existir e ser um diretório (não um arquivo).
  --dev            Modo de desenvolvimento (sem efeito funcional em 1.1).
  -h, --help       Mostra esta ajuda (tem precedência sobre os demais argumentos).
  --               Separador POSIX: tudo após é tratado como posicional.
`;

/**
 * Pré-scan puro: retorna true se `-h`/`--help` aparece como flag (antes do
 * separador POSIX `--`). [CR-hardening, item d] — help tem precedência sobre
 * erros de validação. Exportada para teste unitário (não tem side effects).
 */
export function hasHelpFlag(argv: string[]): boolean {
  for (const a of argv) {
    if (a === '--') return false; // tudo daqui é posicional
    if (a === '-h' || a === '--help') return true;
  }
  return false;
}

/**
 * Compara dois caminhos pelo destino real (resolve symlinks/junctions e case
 * canônico do filesystem). [CR-hardening R2, item 2] — `path.resolve` NÃO
 * normaliza case de drive-letter (`D:` vs `d:`) nem resolve junctions no Windows,
 * então `a === b` deixaria o self-install guard ser burlado. Se qualquer lado
 * não resolve (ex.: target ainda não existe), retorna false (deixa o adapter
 * dar a mensagem acionável de ENOENT).
 */
function sameRealpath(a: string, b: string): boolean {
  try {
    return realpathSync(a) === realpathSync(b);
  } catch {
    return false;
  }
}

export function parseArgs(argv: string[]): BootstrapOptions {
  // [CR-hardening, item d] pré-scan de help com precedência total sobre a validação.
  if (hasHelpFlag(argv)) {
    process.stdout.write(HELP);
    process.exit(0);
  }

  const options: BootstrapOptions = { target: process.cwd(), dev: false };
  let seenTarget = false;
  let positionalMode = false;
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    // [CR-hardening, item e] Separador POSIX `--`: tudo daqui é posicional.
    if (!positionalMode && arg === '--') {
      positionalMode = true;
      continue;
    }
    if (positionalMode) {
      positionals.push(arg);
      continue;
    }

    // [CR-hardening, item a/c] Form com '=': --target=<dir> — aceita valor
    // começando com '-' (ex.: diretório cujo nome inicia por '--').
    if (arg.startsWith('--') && arg.includes('=')) {
      const eqIdx = arg.indexOf('=');
      const key = arg.slice(0, eqIdx);
      const value = arg.slice(eqIdx + 1);
      if (key === '--target') {
        if (seenTarget) throw new Error('--target duplicado (informado mais de uma vez).');
        if (value === '') throw new Error('--target requer um valor (diretório).');
        options.target = value;
        seenTarget = true;
        continue;
      }
      throw new Error(`Argumento desconhecido: ${key}\n\n${HELP}`);
    }

    if (arg === '--target') {
      if (seenTarget) throw new Error('--target duplicado (informado mais de uma vez).');
      const value = argv[i + 1];
      if (value === undefined || value === '--' || value === '') {
        throw new Error('--target requer um valor (diretório). Use --target <dir> ou --target=<dir>.');
      }
      // [CR-hardening, item c] Valor começando com '--' no form espaço é ambíguo
      // (pode ser outra flag); exija o form --target=<dir> para nomes que iniciam por '-'.
      if (value.startsWith('--')) {
        throw new Error(
          `--target recebeu algo que parece uma flag ("${value}"). Para um diretório cujo nome começa com '-', use --target=${value}.`,
        );
      }
      options.target = value;
      seenTarget = true;
      i++;
      continue;
    }

    if (arg === '--dev') {
      options.dev = true;
      continue;
    }

    throw new Error(`Argumento desconhecido: ${arg}\n\n${HELP}`);
  }

  if (positionals.length > 0) {
    throw new Error(`Argumentos posicionais não suportados: ${positionals.join(' ')}\n\n${HELP}`);
  }

  return options;
}

export async function main(options: BootstrapOptions): Promise<void> {
  const target = path.resolve(options.target);

  // [CR-hardening R2, item 2] Recusa self-install: registrar no próprio repositório
  // do framework poluiria o repo com .claude/ de teste. Compara por realpath para
  // não ser burlado por case de drive-letter (`D:` vs `d:`) ou junction/symlink.
  if (sameRealpath(target, REPO_ROOT)) {
    throw new Error(
      `Recusado: --target aponta para o próprio repositório do framework (${REPO_ROOT}). Aponte --target para outro diretório de projeto.`,
    );
  }

  // [CR-hardening, item 4f] Composition root: o bootstrap depende da PORTA
  // (EngineAdapter), não do adapter concreto. ClaudeCodeAdapter é instanciado
  // aqui (único ponto que sabe que a engine v1 é o Claude Code) e usado como
  // EngineAdapter daqui em diante.
  const adapter: EngineAdapter = new ClaudeCodeAdapter();

  // Install consolidado (skills + config installer-managed em .process-ai/).
  // Reusa runInstall — MESMO caminho de `process-ai install` e do postinstall,
  // encerrando a duplicação bootstrap-vs-postinstall (retro Epic 3, AI-2).
  const result = await runInstall(adapter, target);
  process.stdout.write(formatInstallSummary(result));
}

// Entry-point guard: só executa quando invocado diretamente como CLI
// (permite importar parseArgs/main em testes sem side effects).
// [CR-hardening R1, item 2] Robusto contra: (a) argv[1] undefined (não chama
// pathToFileURL('')), e (b) case/symlink na invocação — compara por realpath
// dos dois lados em vez de igualdade estrita de URL.
const _entry = process.argv[1];
if (typeof _entry === 'string' && sameRealpath(_entry, fileURLToPath(import.meta.url))) {
  main(parseArgs(process.argv.slice(2))).catch((err) => {
    process.stderr.write(
      `✗ bootstrap falhou: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  });
}
