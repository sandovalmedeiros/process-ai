/**
 * tests/consumer-install.smoke.test.ts — Smoke do boundary de distribuição (RETRO Epic 3, AI-2).
 *
 * O bug fatal da story 3.4 (pacote não-consumível via npm) NÃO foi pego pela suite
 * porque rodava da raiz do repo, sem simular `npm install` num projeto consumidor.
 * Este teste exercita o caminho REAL: build → npm pack → npm install em temp dir
 * → invocação do CLI (=`npx process-ai`) → asserts.
 *
 * Caminho canônico de install: `npx process-ai` (bare). O `postinstall` é
 * best-effort — ambientes com `allow-scripts` (default crescente do npm) bloqueiam
 * scripts de install; por isso o teste NÃO depende do postinstall, e sim da
 * invocação bare do CLI (o que `npx process-ai` faz após resolver o pacote).
 *
 * É o teste que teria pego os 3 achados fatais de 3.4 (sem build tsc→dist;
 * postinstall com cwd errado; dependência circular).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const NODE = process.execPath;
// Blinda as invocações do CLI contra a verificação de update (chamada real ao
// registro) — mantém o smoke hermético: sem rede, sem writes em ~/.process-ai.
const SMOKE_ENV = { ...process.env, PROCESS_AI_SKIP_UPDATE_CHECK: '1' } as NodeJS.ProcessEnv;

/** Roda npm (shell: true — necessário no Windows onde npm é npm.cmd). */
function npm(args: string[], cwd: string): { stdout: string; stderr: string } {
  const r = spawnSync('npm', args, { encoding: 'utf8', cwd, shell: true });
  if (r.status !== 0) {
    throw new Error(
      `npm ${args.join(' ')} (cwd ${cwd}) falhou exit ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`,
    );
  }
  return { stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

test('AI-2: consumer install — npm pack → install → bare process-ai instala skills + config', () => {
  // 1. build (dist/ fresco — pega erros de tipo no código atual)
  npm(['run', 'build'], REPO_ROOT);

  // 2. npm pack → tarball
  const pack = npm(['pack', '--json'], REPO_ROOT);
  const tarball = path.join(REPO_ROOT, JSON.parse(pack.stdout)[0].filename as string);

  const consumer = mkdtempSync(path.join(os.tmpdir(), 'pa-consumer-'));
  try {
    npm(['init', '-y'], consumer);
    npm(['install', tarball], consumer); // pacote + bin disponíveis (postinstall é best-effort)

    // 3. Caminho canônico: bare `process-ai` = install (= `npx process-ai` pós-resolve).
    const cli = path.join(consumer, 'node_modules', 'process-ai', 'dist', 'bin', 'process-ai.js');
    assert.ok(existsSync(cli), 'CLI compilado deve estar em node_modules/process-ai/dist/bin/');

    const install = spawnSync(NODE, [cli], { encoding: 'utf8', cwd: consumer, env: SMOKE_ENV });
    assert.equal(
      install.status,
      0,
      `bare process-ai (install) falhou: stdout=${install.stdout}\nstderr=${install.stderr}`,
    );
    assert.match(install.stdout, /instalado/);
    // O único caminho canônico (`npx process-ai install`) provisiona o ingest
    // DENTRO do Installer.install — o summary sempre menciona Ingest (✓ deps OU
    // ⚠ Python ausente). Asserção flakiness-free: não depende de Python presente.
    assert.match(install.stdout, /Ingest:/);

    // 4. skills instaladas
    const skill = path.join(consumer, '.claude', 'skills', 'process-ai', 'SKILL.md');
    assert.ok(existsSync(skill), 'install deve criar .claude/skills/process-ai/SKILL.md');
    const skills = readdirSync(path.join(consumer, '.claude', 'skills')).filter((d) =>
      /^process-ai/.test(d),
    );
    assert.ok(skills.length >= 5, `esperado ≥5 skills, got ${skills.length}: ${skills.join(',')}`);

    // 5. config installer-managed + config.user
    assert.ok(
      existsSync(path.join(consumer, '.process-ai', 'config')),
      'install deve scaffoldar .process-ai/config',
    );
    const configUser = path.join(consumer, '.process-ai', 'config.user');
    assert.ok(existsSync(configUser), 'install deve criar .process-ai/config.user');

    // 5a. manifest de instalação presente + parseável (black-box: lê o TOML).
    const manifestPath = path.join(consumer, '.process-ai', 'install-manifest.toml');
    assert.ok(existsSync(manifestPath), 'install deve escrever .process-ai/install-manifest.toml');
    const manifest = readFileSync(manifestPath, 'utf8');
    assert.match(manifest, /ide = "claude-code"/);
    assert.match(manifest, /\[\[files\]\]/);

    // 5b. `install --status` relata o estado instalado (não escreve).
    const status = spawnSync(NODE, [cli, 'install', '--status'], { encoding: 'utf8', cwd: consumer, env: SMOKE_ENV });
    assert.equal(status.status, 0, `install --status falhou: ${status.stdout}\n${status.stderr}`);
    assert.match(status.stdout, /instalado|atualizado/i);

    // 5c. `update` é exit 0 (idempotente neste cenário).
    const update = spawnSync(NODE, [cli, 'update', '--target', consumer], { encoding: 'utf8', cwd: consumer, env: SMOKE_ENV });
    assert.equal(update.status, 0, `update falhou: ${update.stdout}\n${update.stderr}`);

    // 5d. caminho explícito `install --target` também funciona no CLI compilado
    //     (cobertura do subcommand, não só bare — plano pedia testar ambos).
    const explicit = spawnSync(NODE, [cli, 'install', '--target', consumer], {
      encoding: 'utf8',
      cwd: consumer,
      env: SMOKE_ENV,
    });
    assert.equal(
      explicit.status,
      0,
      `process-ai install --target falhou: stdout=${explicit.stdout}\nstderr=${explicit.stderr}`,
    );
    assert.match(explicit.stdout, /instalado/);

    // 6. idempotente + config.user PRESERVADO em re-run (nunca tocado pelo installer)
    writeFileSync(configUser, '# override do usuario\nactive_pack = "custom"\n', 'utf8');
    const rerun = spawnSync(NODE, [cli], { encoding: 'utf8', cwd: consumer, env: SMOKE_ENV });
    assert.equal(rerun.status, 0, `re-run bare process-ai falhou: ${rerun.stdout}\n${rerun.stderr}`);
    const preserved = readFileSync(configUser, 'utf8');
    assert.match(preserved, /override do usuario/, 'config.user deve ser preservado em re-run');

    // 7. uninstall remove skills + manifest, preserva config.
    const uninstall = spawnSync(NODE, [cli, 'uninstall', '--target', consumer], {
      encoding: 'utf8',
      cwd: consumer,
      env: SMOKE_ENV,
    });
    assert.equal(uninstall.status, 0, `uninstall falhou: ${uninstall.stdout}\n${uninstall.stderr}`);
    assert.match(uninstall.stdout, /desinstalado/);
    assert.equal(existsSync(skill), false, 'uninstall deve remover as skills');
    assert.equal(existsSync(manifestPath), false, 'uninstall deve remover o manifest');
    assert.ok(
      existsSync(path.join(consumer, '.process-ai', 'config')),
      'uninstall preserva config',
    );

    // 8. uninstall em estado limpo → not-installed (idempotente).
    const uninstall2 = spawnSync(NODE, [cli, 'uninstall', '--target', consumer], {
      encoding: 'utf8',
      cwd: consumer,
      env: SMOKE_ENV,
    });
    assert.equal(uninstall2.status, 0);
    assert.match(uninstall2.stdout, /não está instalado|nada a desinstalar/i);

    // 9. uninstall --purge remove TODO o .process-ai/.
    const purge = spawnSync(NODE, [cli, 'uninstall', '--target', consumer, '--purge'], {
      encoding: 'utf8',
      cwd: consumer,
      env: SMOKE_ENV,
    });
    assert.equal(purge.status, 0, `uninstall --purge falhou: ${purge.stdout}\n${purge.stderr}`);
    assert.equal(
      existsSync(path.join(consumer, '.process-ai')),
      false,
      'purge deve remover todo .process-ai/',
    );
  } finally {
    rmSync(consumer, { recursive: true, force: true });
    try {
      rmSync(tarball, { force: true });
    } catch {
      /* tarball já pode ter sido limpo */
    }
  }
});
