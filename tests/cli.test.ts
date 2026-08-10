/**
 * tests/cli.test.ts — CLI runtime dispatcher bin/process-ai.ts (AC #2,#3,#4,#5,#6, AD-1/AD-3/AD-4).
 *
 * Cobre o canal de propose runtime (AD-3 capacidade #3): o dispatcher depende só
 * da porta EngineAdapter (composition root instancia ClaudeCodeAdapter), lê
 * payload de arquivo, e roteia ao toolkit (único escritor). gates/estágios vão
 * por checkpointAdvance (atômico, WAL); resume/report/status são leitura pura.
 *
 * Padrão de teste (espelha 1.1–1.4): dispatch direto com adapter real injetando
 * cwd=tmpdir (rápido e determinístico) + smoke test de subprocesso ponta-a-ponta.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseArgs, dispatch, HELP } from '../bin/process-ai.ts';
import type { ParsedCommand } from '../bin/process-ai.ts';
import { ClaudeCodeAdapter } from '../toolkit/adapters/claude-code/adapter.ts';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const DISPATCHER = path.join(REPO_ROOT, 'bin', 'process-ai.ts');
const NODE = process.execPath;

function checkpointPath(root: string): string {
  return path.join(root, '.process-ai', 'checkpoint.json');
}

// ---- parseArgs (puro, sem IO) ----

test('parseArgs: help / --help / -h → {kind:"help"}', () => {
  assert.equal(parseArgs(['help']).kind, 'help');
  assert.equal(parseArgs(['--help']).kind, 'help');
  assert.equal(parseArgs(['-h']).kind, 'help');
});

test('parseArgs: argv vazio → {kind:"install"} (bare `npx process-ai` = install no cwd)', () => {
  const c = parseArgs([]) as Extract<ParsedCommand, { kind: 'install' }>;
  assert.equal(c.kind, 'install');
  assert.equal(c.target, undefined);
});

test('parseArgs: install [--target <dir>] (forma explícita; --target opcional)', () => {
  const space = parseArgs(['install', '--target', '/tmp/x']) as Extract<ParsedCommand, { kind: 'install' }>;
  assert.equal(space.kind, 'install');
  assert.equal(space.target, '/tmp/x');
  const eq = parseArgs(['install', '--target=/tmp/y']) as Extract<ParsedCommand, { kind: 'install' }>;
  assert.equal(eq.target, '/tmp/y');
  const bare = parseArgs(['install']) as Extract<ParsedCommand, { kind: 'install' }>;
  assert.equal(bare.target, undefined);
});

test('parseArgs: install --status / --full / --ide / --pack (boolean + value flags)', () => {
  const st = parseArgs(['install', '--status']) as Extract<ParsedCommand, { kind: 'install' }>;
  assert.equal(st.statusOnly, true);
  const full = parseArgs(['install', '--full']) as Extract<ParsedCommand, { kind: 'install' }>;
  assert.equal(full.full, true);
  const ide = parseArgs([
    'install',
    '--ide',
    'claude-code',
    '--pack',
    'bpmn-sipoc',
  ]) as Extract<ParsedCommand, { kind: 'install' }>;
  assert.equal(ide.ide, 'claude-code');
  assert.equal(ide.pack, 'bpmn-sipoc');
});

test('parseArgs: install --ide <outra> → erro (v1 só claude-code)', () => {
  assert.throws(() => parseArgs(['install', '--ide', 'cursor']), /não suportada|claude-code/i);
});

test('parseArgs: update [--target] e uninstall [--target] [--purge]', () => {
  const up = parseArgs(['update', '--target', '/tmp/u']) as Extract<ParsedCommand, { kind: 'update' }>;
  assert.equal(up.kind, 'update');
  assert.equal(up.target, '/tmp/u');
  const un = parseArgs([
    'uninstall',
    '--target',
    '/tmp/u',
    '--purge',
  ]) as Extract<ParsedCommand, { kind: 'uninstall' }>;
  assert.equal(un.kind, 'uninstall');
  assert.equal(un.target, '/tmp/u');
  assert.equal(un.purge, true);
  const unNoPurge = parseArgs(['uninstall']) as Extract<ParsedCommand, { kind: 'uninstall' }>;
  assert.equal(unNoPurge.purge, false);
});

test('parseArgs: propose --payload <path>', () => {
  const c = parseArgs(['propose', '--payload', 'x.json']) as Extract<ParsedCommand, { kind: 'propose' }>;
  assert.equal(c.kind, 'propose');
  assert.equal(c.payloadPath, 'x.json');
});

test('parseArgs: propose --payload=<path> (form com =)', () => {
  const c = parseArgs(['propose', '--payload=x.json']) as Extract<ParsedCommand, { kind: 'propose' }>;
  assert.equal(c.payloadPath, 'x.json');
});

test('parseArgs: propose sem --payload → erro pt-BR acionável', () => {
  assert.throws(() => parseArgs(['propose']), /payload/i);
});

test('parseArgs: gate --id <gateId> --decision <approved|rejected|changes-requested>', () => {
  const c = parseArgs(['gate', '--id', 'gate-0', '--decision', 'approved']) as Extract<ParsedCommand, { kind: 'gate' }>;
  assert.equal(c.kind, 'gate');
  assert.equal(c.id, 'gate-0');
  assert.equal(c.decision, 'approved');
});

test('parseArgs: gate aceita as três decisões canônicas', () => {
  for (const d of ['approved', 'rejected', 'changes-requested']) {
    const c = parseArgs(['gate', '--id', 'gate-1', '--decision', d]) as Extract<ParsedCommand, { kind: 'gate' }>;
    assert.equal(c.decision, d);
  }
});

test('parseArgs: gate sem --id ou --decision → erro', () => {
  assert.throws(() => parseArgs(['gate', '--decision', 'approved']), /id/i);
  assert.throws(() => parseArgs(['gate', '--id', 'gate-0']), /decision/i);
});

test('parseArgs: gate com decisão inválida → erro pt-BR', () => {
  assert.throws(
    () => parseArgs(['gate', '--id', 'gate-0', '--decision', 'maybe']),
    /decision/i,
  );
});

test('parseArgs: stage --to <stageId>', () => {
  const c = parseArgs(['stage', '--to', 'discovery']) as Extract<ParsedCommand, { kind: 'stage' }>;
  assert.equal(c.kind, 'stage');
  assert.equal(c.to, 'discovery');
});

test('parseArgs: stage sem --to → erro', () => {
  assert.throws(() => parseArgs(['stage']), /to/i);
});

test('parseArgs: resume / report / status → kinds corretos', () => {
  assert.equal(parseArgs(['resume']).kind, 'resume');
  assert.equal(parseArgs(['report']).kind, 'report');
  assert.equal(parseArgs(['status']).kind, 'status');
});

test('parseArgs: ingest --path <arquivo> [--agent <nome>]', () => {
  const c = parseArgs(['ingest', '--path', '/tmp/doc.pdf']) as Extract<ParsedCommand, { kind: 'ingest' }>;
  assert.equal(c.kind, 'ingest');
  assert.equal(c.path, '/tmp/doc.pdf');
  assert.equal(c.agent, undefined);
  const withAgent = parseArgs([
    'ingest', '--path', '/tmp/doc.pdf', '--agent', 'Laura',
  ]) as Extract<ParsedCommand, { kind: 'ingest' }>;
  assert.equal(withAgent.agent, 'Laura');
});

test('parseArgs: ingest sem --path → erro', () => {
  assert.throws(() => parseArgs(['ingest']), /path/i);
});

test('parseArgs: subcomando desconhecido → erro pt-BR', () => {
  assert.throws(() => parseArgs(['inexistente']), /subcomando|desconhecido/i);
});

test('parseArgs: flag duplicada → erro', () => {
  assert.throws(() => parseArgs(['gate', '--id', 'gate-0', '--id', 'gate-1', '--decision', 'approved']), /duplicad/i);
});

test('HELP lista todos os subcomandos (propose/gate/stage/resume/report/status/ingest) + install', () => {
  for (const sub of ['propose', 'gate', 'stage', 'resume', 'report', 'status', 'ingest']) {
    assert.ok(HELP.includes(sub), `HELP deve listar o subcomando ${sub}`);
  }
  assert.ok(HELP.includes('install'), 'HELP deve mencionar install (entry do usuário)');
});

// ---- dispatch install (integração: dispatcher → Installer.install) ----

test('dispatch install: instala skills + .process-ai/config no target; output é o resumo', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-cli-install-'));
  try {
    const adapter = new ClaudeCodeAdapter({ cwd: tmp });
    const result = await dispatch({ kind: 'install', target: tmp }, adapter, tmp);
    assert.equal(result.ok, true);
    assert.match(result.output, /process-ai instalado/);
    assert.ok(
      (await fs.stat(path.join(tmp, '.claude', 'skills', 'process-ai', 'SKILL.md'))).isFile(),
      'install deve criar .claude/skills/process-ai/SKILL.md',
    );
    const cfg = await fs.readFile(path.join(tmp, '.process-ai', 'config'), 'utf8');
    assert.match(cfg, /active_pack\s*=\s*"bpmn-sipoc"/);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('F1: dispatch install recusa self-install no repo/package do framework (guard)', async () => {
  const adapter = new ClaudeCodeAdapter({ cwd: REPO_ROOT });
  await assert.rejects(
    dispatch({ kind: 'install', target: REPO_ROOT }, adapter, REPO_ROOT),
    /próprio repositório do framework/i,
  );
});

// ---- dispatch (integration, adapter real com cwd=tmpdir) ----

test('AC4: propose lê payload de arquivo → CommitResult com sha256/path; artefato em _process-ai_output/', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-cli-prop-'));
  try {
    const payloadPath = path.join(tmp, 'payload.json');
    await fs.writeFile(payloadPath, JSON.stringify({ artifactType: 'summary-report', content: { body: '' } }), 'utf8');

    const adapter = new ClaudeCodeAdapter({ cwd: tmp });
    const result = await dispatch(parseArgs(['propose', '--payload', payloadPath]), adapter, tmp);

    const parsed = JSON.parse(result.output) as { sha256: string; artifactPath: string; manifestPath: string };
    assert.ok(typeof parsed.sha256 === 'string' && parsed.sha256.length > 0, 'CommitResult.sha256 presente');
    assert.ok(result.output.includes(parsed.sha256));
    // Artefato existe em _process-ai_output/
    const norm = (p: string) => p.replace(/\\/g, '/');
    assert.ok(norm(parsed.artifactPath).includes('_process-ai_output/'));
    await fs.access(parsed.artifactPath); // path absoluto existe
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('AC2: gate registra gate-0 no checkpoint (.process-ai/checkpoint.json gates[])', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-cli-gate-'));
  try {
    const adapter = new ClaudeCodeAdapter({ cwd: tmp });
    const result = await dispatch(parseArgs(['gate', '--id', 'gate-0', '--decision', 'approved']), adapter, tmp);

    const state = JSON.parse(result.output) as { gates: Array<{ gateId: string; decision: string }> };
    assert.ok(state.gates.some((g) => g.gateId === 'gate-0' && g.decision === 'approved'));

    // Persistido em disco
    const onDisk = JSON.parse(await fs.readFile(checkpointPath(tmp), 'utf8')) as { gates: Array<{ gateId: string }> };
    assert.ok(onDisk.gates.some((g) => g.gateId === 'gate-0'));
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('AC2: gate idempotente — re-registrar o mesmo gate substitui (não duplica)', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-cli-gateidem-'));
  try {
    const adapter = new ClaudeCodeAdapter({ cwd: tmp });
    await dispatch(parseArgs(['gate', '--id', 'gate-0', '--decision', 'approved']), adapter, tmp);
    await dispatch(parseArgs(['gate', '--id', 'gate-0', '--decision', 'rejected']), adapter, tmp);
    const onDisk = JSON.parse(await fs.readFile(checkpointPath(tmp), 'utf8')) as { gates: Array<{ gateId: string; decision: string }> };
    const g0 = onDisk.gates.filter((g) => g.gateId === 'gate-0');
    assert.equal(g0.length, 1, 'gate-0 deve aparecer uma única vez (última decisão vence)');
    assert.equal(g0[0].decision, 'rejected');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('AC3: stage avança o estágio no checkpoint', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-cli-stage-'));
  try {
    const adapter = new ClaudeCodeAdapter({ cwd: tmp });
    const result = await dispatch(parseArgs(['stage', '--to', 'discovery']), adapter, tmp);
    const state = JSON.parse(result.output) as { stage: string };
    assert.equal(state.stage, 'discovery');

    const onDisk = JSON.parse(await fs.readFile(checkpointPath(tmp), 'utf8')) as { stage: string };
    assert.equal(onDisk.stage, 'discovery');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('AC5: resume retorna state + orphans; órfão vai para quarantine/', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-cli-res-'));
  try {
    const adapter = new ClaudeCodeAdapter({ cwd: tmp });
    // Cria manifesto órfão manualmente (sem checkpoint referenciando)
    const manifestsDir = path.join(tmp, '.process-ai', 'manifests');
    await fs.mkdir(manifestsDir, { recursive: true });
    await fs.writeFile(
      path.join(manifestsDir, 'sipoc-orphan.json'),
      JSON.stringify({ sha256: 'orphan-1', artifactType: 'sipoc', artifactPath: '_process-ai_output/sipoc/orphan-1.md' }),
      'utf8',
    );

    const result = await dispatch(parseArgs(['resume']), adapter, tmp);
    const parsed = JSON.parse(result.output) as {
      state: { stage: string };
      orphans: Array<{ sha256: string }>;
    };
    assert.equal(parsed.state.stage, 'init');
    assert.ok(parsed.orphans.some((o) => o.sha256 === 'orphan-1'), 'órfão deve aparecer em orphans[]');

    const quarantineDir = path.join(tmp, '.process-ai', 'quarantine');
    const qFiles = await fs.readdir(quarantineDir);
    assert.ok(qFiles.some((f) => f === 'orphan-1.json'), 'manifesto órfão movido para quarantine/');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('AC6: report imprime relatório markdown com contagens (zeros honestos em sessão vazia)', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-cli-rep-'));
  try {
    const adapter = new ClaudeCodeAdapter({ cwd: tmp });
    const result = await dispatch(parseArgs(['report']), adapter, tmp);
    assert.ok(result.output.includes('Relatório de Confiança'), 'deve renderizar o título do relatório');
    assert.ok(/🟢|🟡|🔴/.test(result.output), 'deve conter marcadores de confiança');
    assert.ok(/0/.test(result.output), 'sessão vazia deve mostrar contagens zero');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('status imprime o CheckpointState atual (JSON)', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-cli-status-'));
  try {
    const adapter = new ClaudeCodeAdapter({ cwd: tmp });
    const result = await dispatch(parseArgs(['status']), adapter, tmp);
    const state = JSON.parse(result.output) as { stage: string; artifacts: unknown[]; gates: unknown[] };
    assert.equal(state.stage, 'init');
    assert.deepEqual(state.artifacts, []);
    assert.deepEqual(state.gates, []);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

// ---- AD-1/AD-3: nenhuma escrita direta pelo dispatcher fora do toolkit ----

test('AD-1: o dispatcher NÃO escreve diretamente — gate/stage só via checkpointAdvance (escrita só em .process-ai/)', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pa-cli-scope-'));
  try {
    const adapter = new ClaudeCodeAdapter({ cwd: tmp });
    await dispatch(parseArgs(['gate', '--id', 'gate-0', '--decision', 'approved']), adapter, tmp);
    await dispatch(parseArgs(['stage', '--to', 'discovery']), adapter, tmp);

    // Único conteúdo no root deve ser .process-ai/ (checkpoint + wal + lock)
    const top = (await fs.readdir(tmp)).sort();
    assert.deepEqual(top, ['.process-ai'], 'gate/stage só devem criar .process-ai/ (sem _process-ai_output/)');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

// ---- Smoke test de subprocesso (ponta-a-ponta real do bin) ----

test('Smoke (subprocesso): process-ai --help → exit 0 e lista subcomandos', () => {
  const res = spawnSync(NODE, [DISPATCHER, '--help'], { encoding: 'utf8' });
  assert.equal(res.status, 0, `stdout: ${res.stdout}\nstderr: ${res.stderr}`);
  assert.match(res.stdout, /propose/);
  assert.match(res.stdout, /resume/);
});

test('Smoke (subprocesso): process-ai status em tmpdir → exit 0 e CheckpointState JSON', () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'pa-cli-smoke-'));
  try {
    const res = spawnSync(NODE, [DISPATCHER, 'status'], { encoding: 'utf8', cwd: tmp });
    assert.equal(res.status, 0, `stdout: ${res.stdout}\nstderr: ${res.stderr}`);
    const state = JSON.parse(res.stdout) as { stage: string };
    assert.equal(state.stage, 'init');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('Smoke (subprocesso): process-ai gate em tmpdir registra gate e exit 0', () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'pa-cli-smokegate-'));
  try {
    const res = spawnSync(
      NODE,
      [DISPATCHER, 'gate', '--id', 'gate-0', '--decision', 'approved'],
      { encoding: 'utf8', cwd: tmp },
    );
    assert.equal(res.status, 0, `stdout: ${res.stdout}\nstderr: ${res.stderr}`);
    const onDisk = JSON.parse(readFileSync(checkpointPath(tmp), 'utf8')) as { gates: Array<{ gateId: string }> };
    assert.ok(onDisk.gates.some((g) => g.gateId === 'gate-0'));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
