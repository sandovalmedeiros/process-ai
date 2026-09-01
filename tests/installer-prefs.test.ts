/**
 * tests/installer-prefs.test.ts — persistência das preferências do install.
 *
 * mergeConfigUser (add-only com marcador de proveniência), updateGitignore
 * (bloco idempotente) e o overlay de config.user no readConfig (WHITELIST —
 * active_pack em config.user NÃO é aplicado, invariantes do manifest).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mergeConfigUser, scaffoldConfig } from '../toolkit/src/install.ts';
import type { InstallPrefs } from '../toolkit/src/install.ts';
import { updateGitignore } from '../toolkit/src/installer/file-ops.ts';
import { readConfig } from '../toolkit/src/pack-loader.ts';

const PREFS: InstallPrefs = {
  projectName: 'pa-demo',
  userName: 'Sandoval',
  chatLanguage: 'pt-br',
  docLanguage: 'Português',
  gitStrategy: 'commit',
};

function tmpProject(): string {
  return mkdtempSync(path.join(os.tmpdir(), 'pa-prefs-'));
}

// ---- mergeConfigUser ----

test('mergeConfigUser: do stub → adiciona as 5 chaves com marcador', async () => {
  const tmp = tmpProject();
  try {
    await scaffoldConfig(tmp, {}); // cria config + stub do config.user
    await mergeConfigUser(tmp, PREFS);
    const text = readFileSync(path.join(tmp, '.process-ai', 'config.user'), 'utf8');
    assert.match(text, /project_name = "pa-demo" # definido pelo install/);
    assert.match(text, /user_name = "Sandoval" # definido pelo install/);
    assert.match(text, /chat_language = "pt-br" # definido pelo install/);
    assert.match(text, /doc_language = "Português" # definido pelo install/);
    assert.match(text, /git_strategy = "commit" # definido pelo install/);
    assert.match(text, /# Overrides do usuário/, 'stub (comentários) preservado');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('mergeConfigUser: re-run com outro valor ATUALIZA linha com marcador (idempotente)', async () => {
  const tmp = tmpProject();
  try {
    await mergeConfigUser(tmp, PREFS);
    await mergeConfigUser(tmp, { ...PREFS, projectName: 'novo-nome' });
    const text = readFileSync(path.join(tmp, '.process-ai', 'config.user'), 'utf8');
    assert.equal(text.match(/project_name =/g)?.length, 1, 'sem duplicar chave');
    assert.match(text, /project_name = "novo-nome" # definido pelo install/);
    assert.ok(!text.includes('"pa-demo"'));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('mergeConfigUser: edição MANUAL (linha sem marcador) nunca é sobrescrita', async () => {
  const tmp = tmpProject();
  try {
    await mergeConfigUser(tmp, PREFS);
    const p = path.join(tmp, '.process-ai', 'config.user');
    // usuário reescreve a linha sem o marcador (remove o comentário de proveniência)
    writeFileSync(p, readFileSync(p, 'utf8').replace('project_name = "pa-demo" # definido pelo install', 'project_name = "meu-nome-manual"'));
    await mergeConfigUser(tmp, { ...PREFS, projectName: 'installer-tentou-mudar' });
    const text = readFileSync(p, 'utf8');
    assert.match(text, /project_name = "meu-nome-manual"/, 'valor manual preservado');
    assert.ok(!text.includes('installer-tentou-mudar'));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('mergeConfigUser: cria config.user inexistente a partir do stub; CRLF preservado', async () => {
  const tmp = tmpProject();
  try {
    await mergeConfigUser(tmp, { userName: 'Ana' });
    const p = path.join(tmp, '.process-ai', 'config.user');
    assert.ok(existsSync(p));
    assert.match(readFileSync(p, 'utf8'), /user_name = "Ana" # definido pelo install/);
    // CRLF dominante é preservado
    writeFileSync(p, `# manual\r\nchat_language = "en"\r\n`);
    await mergeConfigUser(tmp, { docLanguage: 'English' });
    const text = readFileSync(p, 'utf8');
    assert.ok(text.includes('\r\n'), 'EOL CRLF preservado');
    assert.match(text, /doc_language = "English" # definido pelo install/);
    assert.match(text, /chat_language = "en"/, 'linha manual intacta');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---- updateGitignore ----

test('updateGitignore: cria com bloco; idempotente (marcador); preserva conteúdo', async () => {
  const tmp = tmpProject();
  try {
    const written = await updateGitignore(tmp);
    assert.equal(written, path.join(tmp, '.gitignore'));
    const first = readFileSync(path.join(tmp, '.gitignore'), 'utf8');
    assert.match(first, /^# process-ai\n_process-ai_output\/\n\.process-ai\/\n/);

    writeFileSync(path.join(tmp, '.gitignore'), 'node_modules/\n');
    await updateGitignore(tmp);
    const second = readFileSync(path.join(tmp, '.gitignore'), 'utf8');
    assert.match(second, /node_modules\//);
    assert.match(second, /# process-ai/);

    assert.equal(await updateGitignore(tmp), null, 're-run com marcador → no-op');
    assert.equal(readFileSync(path.join(tmp, '.gitignore'), 'utf8'), second);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('updateGitignore: arquivo sem trailing newline ganha separador', async () => {
  const tmp = tmpProject();
  try {
    writeFileSync(path.join(tmp, '.gitignore'), 'node_modules/');
    await updateGitignore(tmp);
    const text = readFileSync(path.join(tmp, '.gitignore'), 'utf8');
    assert.match(text, /node_modules\/\n\n# process-ai\n/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---- readConfig: overlay whitelist de config.user ----

async function writeConfig(root: string, configBody: string, userBody: string | null): Promise<void> {
  mkdirSync(path.join(root, '.process-ai'), { recursive: true });
  writeFileSync(path.join(root, '.process-ai', 'config'), configBody);
  if (userBody !== null) writeFileSync(path.join(root, '.process-ai', 'config.user'), userBody);
}

test('readConfig: overlay aplica as 5 chaves de config.user sobre o config', async () => {
  const tmp = tmpProject();
  try {
    await writeConfig(tmp, 'active_pack = "bpmn-sipoc"\npack_version = "1.0.0"\n',
      'project_name = "pa-demo"\nuser_name = "Sandoval"\nchat_language = "pt-br"\ndoc_language = "Português"\ngit_strategy = "gitignore"\n');
    const cfg = await readConfig(tmp);
    assert.equal(cfg.activePack?.id, 'bpmn-sipoc');
    assert.equal(cfg.projectName, 'pa-demo');
    assert.equal(cfg.userName, 'Sandoval');
    assert.equal(cfg.chatLanguage, 'pt-br');
    assert.equal(cfg.docLanguage, 'Português');
    assert.equal(cfg.gitStrategy, 'gitignore');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('readConfig: active_pack em config.user NÃO é aplicado (whitelist)', async () => {
  const tmp = tmpProject();
  try {
    await writeConfig(tmp, 'active_pack = "bpmn-sipoc"\n', 'active_pack = "custom"\n');
    const cfg = await readConfig(tmp);
    assert.equal(cfg.activePack?.id, 'bpmn-sipoc', 'config.user não troca o pack em v1');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('readConfig: sem config.user → sem overlay; lixo em config.user não lança', async () => {
  const tmp = tmpProject();
  try {
    await writeConfig(tmp, 'active_pack = "bpmn-sipoc"\n', null);
    const cfg = await readConfig(tmp);
    assert.equal(cfg.projectName, undefined);

    writeFileSync(path.join(tmp, '.process-ai', 'config.user'), '\x00\x01 lixo {{{');
    const cfg2 = await readConfig(tmp);
    assert.equal(cfg2.activePack?.id, 'bpmn-sipoc');
    assert.equal(cfg2.userName, undefined);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
