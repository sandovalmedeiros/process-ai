/**
 * tests/installer-prompts.test.ts — fluxo interativo v2 (gatherInstallAnswers).
 *
 * Contrato: checkbox de engines via KeySource scriptado (raw-mode DI) + inputs
 * 2-6 via FakeRl duck-typed (question/close). O gate TTY fica no bin (só
 * exercitado em smoke); aqui o fluxo é dirigido por key-script/respostas
 * canned. Paridade Reversa: 6 perguntas, Claude Code como default (todas as
 * engines marcáveis), validação de nome não-vazio, git commit|gitignore.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { gatherInstallAnswers } from '../toolkit/src/installer/prompts.ts';
import type { KeySource, KeyPress } from '../toolkit/src/installer/interact.ts';

/** KeySource scriptado — yields os keys na ordem e esgota (EOF). */
function keyScript(script: KeyPress[]): KeySource {
  async function* gen(): KeySource {
    for (const k of script) yield k;
  }
  return gen();
}

/** FakeRl duck-typed: fila de respostas canned p/ question(); conta e fecha. */
function fakeRl(answers: string[]): {
  rl: { question(q: string): Promise<string>; close(): void };
  state: { calls: number; closed: boolean };
} {
  const state = { calls: 0, closed: false };
  const rl = {
    question(_q: string): Promise<string> {
      state.calls++;
      return Promise.resolve(answers[state.calls - 1] ?? '');
    },
    close(): void {
      state.closed = true;
    },
  };
  return { rl, state };
}

/** Engines fixture (detectada + em breve ×2). */
const ENGINES = [
  { id: 'claude-code', name: 'Claude Code', supported: true, detected: true },
  { id: 'codex', name: 'Codex', supported: false, detected: false },
  { id: 'cursor', name: 'Cursor', supported: false, detected: false },
];

const DEPS = { projectName: 'pa-demo', chatLanguage: 'pt-br', docLanguage: 'Português' };

test('defaults: enter no checkbox + defaults → engines detectadas, defaults, git commit', async () => {
  const { rl, state } = fakeRl(['', 'Sandoval', '', '', '']);
  const answers = await gatherInstallAnswers({
    makeRl: () => rl,
    keys: () => keyScript([{ name: 'return' }]),
    engines: ENGINES,
    defaults: DEPS,
  });
  assert.deepEqual(answers.engines, ['claude-code']);
  assert.equal(answers.projectName, 'pa-demo');
  assert.equal(answers.userName, 'Sandoval');
  assert.equal(answers.chatLanguage, 'pt-br');
  assert.equal(answers.docLanguage, 'Português');
  assert.equal(answers.gitStrategy, 'commit');
  assert.equal(state.calls, 5, 'inputs 2-6 = 5 question()');
  assert.equal(state.closed, true, 'rl fechado no finally');
});

test('explicit: nome/chamar/idiomas/git preenchidos; git=2 → gitignore', async () => {
  const { rl } = fakeRl(['meu-projeto', 'Sandoval', 'en', 'English', '2']);
  const answers = await gatherInstallAnswers({
    makeRl: () => rl,
    keys: () => keyScript([{ name: 'return' }]),
    engines: ENGINES,
    defaults: DEPS,
  });
  assert.deepEqual(answers.engines, ['claude-code']);
  assert.equal(answers.projectName, 'meu-projeto');
  assert.equal(answers.userName, 'Sandoval');
  assert.equal(answers.chatLanguage, 'en');
  assert.equal(answers.docLanguage, 'English');
  assert.equal(answers.gitStrategy, 'gitignore');
});

test('checkbox: "a" ×2 desliga tudo → enter no-op (validação) → espaço religa → confirma', async () => {
  const { rl } = fakeRl(['', 'Sandoval', '', '', '']);
  const answers = await gatherInstallAnswers({
    makeRl: () => rl,
    // com todas alternáveis: 1º 'a' LIGA todas, 2º desliga; enter com zero é
    // no-op (validação); espaço religa a focada (claude-code, cursor 0).
    keys: () => keyScript([{ name: 'a' }, { name: 'a' }, { name: 'return' }, { name: 'space' }, { name: 'return' }]),
    engines: ENGINES,
    defaults: DEPS,
  });
  assert.deepEqual(answers.engines, ['claude-code']);
});

test('nome do projeto vazio → erro acionável', async () => {
  const { rl } = fakeRl(['', '', '', '', '']);
  // default vazio + resposta vazia
  await assert.rejects(
    gatherInstallAnswers({
      makeRl: () => rl,
      keys: () => keyScript([{ name: 'return' }]),
      engines: ENGINES,
      defaults: { ...DEPS, projectName: '' },
    }),
    /Nome do projeto não pode ser vazio/,
  );
});

test('"como te chamar" vazio → erro acionável (validação do Reversa)', async () => {
  const { rl } = fakeRl(['proj', '', '', '', '']);
  await assert.rejects(
    gatherInstallAnswers({
      makeRl: () => rl,
      keys: () => keyScript([{ name: 'return' }]),
      engines: ENGINES,
      defaults: DEPS,
    }),
    /não pode ser vazio/,
  );
});

test('engine sem adapter marcável → persistida: nota pós-checkbox + engines completas', async () => {
  const { rl } = fakeRl(['', 'Sandoval', '', '', '']);
  const outChunks: string[] = [];
  const answers = await gatherInstallAnswers({
    makeRl: () => rl,
    keys: () => keyScript([{ name: 'down' }, { name: 'space' }, { name: 'return' }]),
    engines: ENGINES,
    defaults: DEPS,
    out: { write(s: string): boolean { outChunks.push(s); return true; } },
  });
  // down: claude-code → codex; space marca codex; enter confirma.
  assert.deepEqual(answers.engines, ['claude-code', 'codex']);
  const note = outChunks.join('');
  assert.match(note, /Codex fica no config\.user/);
  assert.match(note, /instala quando o adapter chegar/);
});
