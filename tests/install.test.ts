/**
 * tests/install.test.ts — scaffoldConfig + Installer.install (canônico pós-0.8.2).
 *
 * Cobre:
 *  - scaffoldConfig: config installer-managed (regenerado) + config.user (preservado).
 *  - compatibilidade com readConfig do pack-loader (formato que o loader da 3.2 lê).
 *  - Installer.install (real adapter ClaudeCodeIdeSetup): cria só `.claude/`,
 *    `.process-ai/` e `method-packs/` no target; não escreve fora do target.
 *
 * Antes do 0.8.2 isto testava `runInstall`/`formatInstallSummary` (instalador
 * legado sem manifest). Essas funções foram removidas — o ÚNICO caminho canônico
 * é `Installer.install` (`toolkit/src/installer/orchestrator.ts`). A máquina de
 * estados (fresh/update/repair/uninstall) é coberta em `installer-orchestrator.test.ts`
 * (com FakeIdeSetup); aqui cobrimos o adapter real + o invariant de escopo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { scaffoldConfig } from '../toolkit/src/install.ts';
import { readConfig } from '../toolkit/src/pack-loader.ts';
import { Installer } from '../toolkit/src/installer/orchestrator.ts';
import { ClaudeCodeIdeSetup } from '../toolkit/adapters/claude-code/ide-setup.ts';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');

// ---- scaffoldConfig ----

test('scaffoldConfig: escreve .process-ai/config com cabeçalho read-only + chaves (opts explícitos)', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-scaffold-'));
  try {
    const r = await scaffoldConfig(tmp, { activePack: 'bpmn-sipoc', packVersion: '1.0.0', processAiVersion: '0.2.1' });
    const cfg = await fs.readFile(r.configPath, 'utf8');
    assert.match(cfg, /Installer-managed/i);
    assert.match(cfg, /regenerado a cada install/i);
    assert.match(cfg, /process_ai_version\s*=\s*"0\.2\.1"/);
    assert.match(cfg, /active_pack\s*=\s*"bpmn-sipoc"/);
    assert.match(cfg, /pack_version\s*=\s*"1\.0\.0"/);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('F3: scaffoldConfig sem processAiVersion usa a versão real do package.json (não "0.0.0")', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-scaffold-ver-'));
  try {
    const r = await scaffoldConfig(tmp); // sem opts → default = FRAMEWORK_VERSION
    const cfg = await fs.readFile(r.configPath, 'utf8');
    const pkgVersion = JSON.parse(await fs.readFile(path.join(REPO_ROOT, 'package.json'), 'utf8')).version;
    assert.match(
      cfg,
      new RegExp(`process_ai_version\\s*=\\s*"${pkgVersion.replace(/\./g, '\\.')}"`),
      `config deve estampar a versão real (${pkgVersion}), não "0.0.0"`,
    );
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('F8: scaffoldConfig ESCAPA valores TOML — newline/aspas não injetam chaves', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-scaffold-esc-'));
  try {
    // valor malicioso: tenta criar uma 2ª chave active_pack via newline
    await scaffoldConfig(tmp, { activePack: 'evil\nactive_pack = "INJECTED"' });
    const cfg = await fs.readFile(path.join(tmp, '.process-ai', 'config'), 'utf8');
    const activePackLines = cfg.match(/^active_pack = /gm) ?? [];
    assert.equal(activePackLines.length, 1, 'newline no valor não deve criar uma 2ª chave active_pack');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('scaffoldConfig: cria .process-ai/config.user stub se inexistente', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-scaffold-cu-'));
  try {
    const r = await scaffoldConfig(tmp);
    assert.equal(r.configUserExisted, false);
    const cu = await fs.readFile(r.configUserPath, 'utf8');
    assert.match(cu, /NUNCA sobrescrito/i);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('scaffoldConfig: COMPATÍVEL com readConfig (loader parseia active_pack/pack_version)', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-scaffold-compat-'));
  try {
    await scaffoldConfig(tmp, { activePack: 'bpmn-sipoc', packVersion: '1.2.3', processAiVersion: '0.2.1' });
    const cfg = await readConfig(tmp);
    assert.deepEqual(cfg.activePack, { id: 'bpmn-sipoc', version: '1.2.3' });
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('scaffoldConfig: REGENERA config a cada run (sobrescreve edições diretas)', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-scaffold-regen-'));
  try {
    await scaffoldConfig(tmp);
    const configPath = path.join(tmp, '.process-ai', 'config');
    // edição direta (deve ser sobrescrita — installer-managed)
    await fs.writeFile(configPath, 'GARBAGE = "lixo"\nactive_pack = "outro"\n', 'utf8');
    await scaffoldConfig(tmp, { activePack: 'bpmn-sipoc' });
    const cfg = await fs.readFile(configPath, 'utf8');
    assert.match(cfg, /active_pack\s*=\s*"bpmn-sipoc"/);
    assert.doesNotMatch(cfg, /GARBAGE/);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('scaffoldConfig: PRESERVA config.user em re-run (nunca tocado pelo installer)', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-scaffold-preserve-'));
  try {
    await scaffoldConfig(tmp);
    const cu = path.join(tmp, '.process-ai', 'config.user');
    await fs.writeFile(cu, '# meu override\nactive_pack = "custom"\n', 'utf8');
    const r2 = await scaffoldConfig(tmp);
    assert.equal(r2.configUserExisted, true);
    const content = await fs.readFile(cu, 'utf8');
    assert.match(content, /meu override/);
    assert.doesNotMatch(content, /NUNCA sobrescrito/i);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

// ---- Installer.install (adapter real) ----

test('Installer.install: cria só .claude/, .process-ai/, method-packs/ e base-conhecimento/ no target', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-installer-scope-'));
  try {
    const inst = new Installer(new ClaudeCodeIdeSetup());
    const outcome = await inst.install({ targetDir: tmp, interactive: false });
    assert.equal(outcome.outcome, 'installed');
    assert.equal(outcome.ide, 'claude-code');
    const top = (await fs.readdir(tmp)).sort();
    assert.deepEqual(
      top,
      ['.claude', '.process-ai', 'base-conhecimento', 'method-packs'],
      `install só deve criar .claude/, .process-ai/, method-packs/ e base-conhecimento/, got ${top.join(',')}`,
    );
    // provisão de ingest sempre presente no outcome (summary)
    assert.ok(outcome.ingest, 'outcome deve carregar o resultado do provisionamento de ingest');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('Installer.install: NÃO escreve nada fora do target (snapshot do dir-pai)', async () => {
  // herda CR item 4e do antigo bootstrap.test.ts: o dir-pai deve conter só o alvo.
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-installer-pai-'));
  const target = path.join(parent, 'alvo');
  try {
    await fs.mkdir(target, { recursive: true });
    const inst = new Installer(new ClaudeCodeIdeSetup());
    await inst.install({ targetDir: target, interactive: false });
    const parentEntries = await fs.readdir(parent);
    assert.deepEqual(
      parentEntries,
      ['alvo'],
      'nada deve ser escrito fora do alvo (dir-pai deve conter só o alvo)',
    );
  } finally {
    await fs.rm(parent, { recursive: true, force: true });
  }
});
