/**
 * toolkit/src/installer/file-ops.ts — helpers de baixo nível para o installer.
 *
 * Extraído de `install.ts` (single implementation): `atomicWrite` (escrita
 * temp+rename) e `escapeTomlString` (escape de basic string TOML). Reusado por
 * `install.ts` (scaffoldConfig), `manifest.ts` (writeManifest) e futuros módulos
 * do installer — fecha a duplicação do padrão de escrita atômica.
 *
 * AD-3 / import-boundary: só `node:*`. Nenhum import de adapter.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

let _tempCounter = 0;

/**
 * Escrita atômica: temp + rename no mesmo diretório (rename atômico em POSIX,
 * near-atômico em NTFS). Falha mid-write (disco cheio/EIO/SIGINT) não deixa o
 * arquivo-alvo corrompido/vazio; re-run idempotente. O contador além do pid
 * evita colisão entre escritas concorrentes (espelha o padrão original de
 * `install.ts`).
 */
export async function atomicWrite(filePath: string, content: string): Promise<void> {
  const tmp = `${filePath}.tmp-${process.pid}-${_tempCounter++}`;
  await fs.writeFile(tmp, content, 'utf8');
  try {
    await fs.rename(tmp, filePath);
  } catch (e) {
    await fs.rm(tmp, { force: true });
    throw e;
  }
}

/**
 * Backup estilo BMad: copia `absPath` para `<absPath>.bak`; se existir, tenta
 * `.bak2`, `.bak3`, … até achar nome único. Preserva o original (cópia, não
 * move). Retorna o caminho do backup criado. Usado pelo fluxo de update/repair
 * antes de sobrescrever um arquivo modificado localmente.
 */
export async function backupFile(absPath: string): Promise<string> {
  let bak = `${absPath}.bak`;
  let n = 2;
  // eslint-disable-next-line no-await-in-loop
  while (await pathExists(bak)) bak = `${absPath}.bak${n++}`;
  await fs.copyFile(absPath, bak);
  return bak;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.lstat(p);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw e;
  }
}

/**
 * Escapa valor pra TOML basic string (double-quoted): neutraliza `\`, `"`,
 * CR/LF. Previne corrupção/injeção de chaves via valores (parsers TOML do
 * framework são linha-a-linha). Idêntico ao helper original de `install.ts`.
 */
export function escapeTomlString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ');
}

/** Marcador do bloco do process-ai no .gitignore (idempotência). */
const GITIGNORE_BLOCK_MARKER = '# process-ai';

/**
 * Adiciona o bloco do process-ai ao `.gitignore` do projeto-alvo (escolha
 * "uso pessoal" da pergunta de git do install). Espelha o `updateGitignore`
 * do Reversa (writer.js:307-322): bloco `\n# process-ai\n_process-ai_output/\n
 * .process-ai/\n` anexado só se o marcador não existe; cria o arquivo se
 * inexistente. Retorna o caminho escrito, ou null se já estava lá (no-op).
 * Uninstall NÃO remove o bloco (paridade Reversa — o .gitignore é do usuário).
 */
export async function updateGitignore(targetDir: string): Promise<string | null> {
  const gitignorePath = path.join(targetDir, '.gitignore');
  const block = `${GITIGNORE_BLOCK_MARKER}\n_process-ai_output/\n.process-ai/\n`;

  let existing: string | null = null;
  try {
    existing = await fs.readFile(gitignorePath, 'utf8');
  } catch {
    // sem .gitignore → cria abaixo
  }
  if (existing !== null) {
    if (existing.includes(GITIGNORE_BLOCK_MARKER)) return null;
    const sep = existing.endsWith('\n') ? '' : '\n';
    await fs.appendFile(gitignorePath, `${sep}\n${block}`, 'utf8');
    return gitignorePath;
  }
  await atomicWrite(gitignorePath, block);
  return gitignorePath;
}
