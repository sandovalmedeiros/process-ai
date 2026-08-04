/**
 * tests/installer-prompts.test.ts — gatherInstallOptions com readline fake.
 *
 * O módulo de prompts recebe um `PromptRl` duck-typed — aqui injetamos um fake
 * que devolve respostas canned, cobrindo: defaults aplicados (respostas vazias),
 * seleção explícita, e rejeição de target vazio. (O gate TTY/headless fica no
 * bin e é exercitado só em smoke.)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { gatherInstallOptions, type PromptRl } from '../toolkit/src/installer/prompts.ts';

/** Fake readline: devolve respostas canned na ordem (uma por question()). */
class FakeRl implements PromptRl {
  private queue: string[];
  calls = 0;
  closed = false;
  constructor(answers: string[]) {
    this.queue = [...answers];
  }
  async question(_query: string): Promise<string> {
    this.calls++;
    return this.queue.shift() ?? '';
  }
  close(): void {
    this.closed = true;
  }
}

const DEFAULTS = { targetDir: '/tmp/pa-x', ide: 'claude-code', activePack: 'bpmn-sipoc', full: true };

test('respostas vazias → defaults aplicados', async () => {
  const rl = new FakeRl(['', '', '', '']); // 4 prompts
  const resolved = await gatherInstallOptions(rl, DEFAULTS);
  assert.equal(resolved.ide, 'claude-code');
  assert.equal(resolved.activePack, 'bpmn-sipoc');
  assert.equal(resolved.full, true);
  assert.equal(rl.calls, 4);
  assert.equal(rl.closed, false); // gather não fecha; o caller fecha
});

test('seleção explícita + confirm não → ide/pack defaults, full=false', async () => {
  const rl = new FakeRl(['/some/path', '1', '1', 'n']);
  const resolved = await gatherInstallOptions(rl, DEFAULTS);
  assert.equal(resolved.ide, 'claude-code');
  assert.equal(resolved.activePack, 'bpmn-sipoc');
  assert.equal(resolved.full, false);
  assert.ok(path.isAbsolute(resolved.targetDir));
});

test('target vazio (default vazio + resposta vazia) → erro acionável', async () => {
  // askInput substitui resposta vazia pelo default; o guard só dispara quando o
  // próprio default é vazio (defensive — caller normalmente passa cwd()).
  const rl = new FakeRl(['', '', '', '']);
  await assert.rejects(
    () => gatherInstallOptions(rl, { ...DEFAULTS, targetDir: '' }),
    /não pode ser vazio/,
  );
});
