---
review: tech-webverify
target: ARCHITECTURE-SPINE.md (process-ai)
reviewer: tech-verification
date: 2026-08-01
language: pt-BR
---

# Review de Verificação Web — Decisões de Tecnologia

**Veredito: APROVADO** (1 achado LOW, sem bloqueadores)

Cada decisão de tecnologia comprometida no Stack foi verificada contra fontes web atuais em 2026-08-01. Nenhuma versão está errada em magnitude; uma única versão de patch está desatualizada por uma revisão de segurança. Todas as escolhas de categoria (runtime, gerenciador de pacotes, engine, formatos de config) estão corretas e alinhadas com o estado-da-arte em agosto de 2026.

---

## Achados

`[LOW] Node.js 24 LTS — versão de patch desatualizada (24.18.0 → 24.18.1)` — Node.js 24 **é** o Active LTS em agosto de 2026 (codinome **Krypton**, EOL 30/04/2028), confirmado na página oficial de releases. Porém o patch `24.18.0` citado no spine não é o mais recente: `v24.18.1` (security release, corrige **CVE-2026-56846** — vulnerabilidade de contagem de sessão HTTP/2) foi lançado e é o head atual do 24.x. Fontes: https://nodejs.org/en/about/previous-releases · https://nodejs.org/en/blog/release/v24.18.0 . **Fix:** subir para `24.18.1`, **ou** (preferível num *spine* de arquitetura, altitude feature) descer o pino ao menor: `Node.js 24 LTS (Krypton)` e deixar o patch exato para o `package.json` / CI. Spines não devem pino de patch — patches churnam mensalmente.

`[INFO] Node.js 24 é o Active LTS correto em ago/2026` — Confirmado. Node 26 (lançado 05/05/2026) está na linha **Current** e, sendo ímpar sob o modelo histórico (até v26), **não vira LTS** — vai EOL ~nov/2026. Logo Node 24 é a escolha Active LTS correta e não há linha LTS mais nova para confundir. Fonte: https://nodejs.org/en/about/previous-releases . (Nota de horizon: a partir do v27 o ciclo muda para anual com toda major indo a LTS — não afeta o v1.) Nada a corrigir.

`[INFO] npm como package manager — correto e default para Node 24` — Node.js 24 ships com **npm 11** (confirmado no blog de release v24.0.0: *"Node.js 24 comes with npm 11"*). npm segue sendo o package manager standard/default do Node.js. Fontes: https://nodejs.org/en/blog/release/v24.0.0 · https://nodejs.org/learn/getting-started/an-introduction-to-the-npm-package-manager . npm 12 já existe no registry, mas o npm 11 é o que acompanha o runtime — coerente. Nenhuma preocupação de fit. Nada a corrigir.

`[INFO] Claude Code como engine v1 — real e correto para "instalar skills + slash-commands + agent skills"` — Confirmado como produto vigente em 2026. Suporta nativamente os três mecanismos que a porta `EngineAdapter` exige: (1) **SKILL.md** em `.claude/skills/` (skills em markdown, condutor + especialistas — exatamente o modelo do spine); (2) **slash-commands** em `.claude/commands/` (entrypoint `/process-ai`); (3) **subagents/agent skills** + **`/plugin marketplace`** para adoção em sessão (padrão BMad-style referenciado no spine). O modelo unificado de 2026 colapsou a distinção slash-command-vs-skill, o que **reforça** a decisão de orquestrar via skill condutor + especialistas adotados em sessão. Fontes: https://code.claude.com/docs/en/skills · https://code.claude.com/docs/en/subagents · https://claudedirectory.org/blog/claude-code-slash-commands-guide · https://jsmanifest.com/claude-code-skills-slash-commands-unified-model . Nenhuma preocupação de fit. Nada a corrigir.

`[INFO] Skills em markdown (Condutor + especialistas)` — Formato nativo e canônico do Claude Code (SKILL.md com frontmatter + corpo markdown). Confirma implicitamente a fonte acima. Nada a corrigir.

`[INFO] Configs TOML + YAML` — Ambos padrão-ouro e atuais em 2026. TOML para configs de pack/method-pack (`pack.toml`) é idiomático; YAML para manifestos/checkpoint é idiomático. Sem preocupação. Nada a corrigir.

`[INFO] Tecnologias auxiliares nomeadas — todas standards` — **SHA-256** (manifestos de integridade, AD-1/AD-4), **BPMN 2.0 XML** (deferred, FR-10), **SemVer** (versionamento), **Mermaid** (diagramas no próprio spine) — todos standards abertos vigentes, sem risco de versão/depreciação. Nada a corrigir.

---

## Resumo de severidades

- BLOCKER: 0
- HIGH: 0
- MEDIUM: 0
- LOW: 1 (pino de patch Node 24.18.0 → 24.18.1 / descer pino)
- INFO: 7 (confirmações positivas)

## Fontes

- https://nodejs.org/en/about/previous-releases — status LTS Node 24 (Krypton, Active LTS, EOL 2028-04-30)
- https://nodejs.org/en/blog/release/v24.18.0 — release Node 24.18.0 LTS (security)
- https://nodejs.org/en/blog/release/v24.0.0 — Node 24 ships com npm 11
- https://nodejs.org/learn/getting-started/an-introduction-to-the-npm-package-manager — npm é o package manager standard do Node
- https://endoflife.date/nodejs — EOL dates
- https://www.pkgpulse.com/guides/nodejs-22-vs-nodejs-24-2026 — Node 24 = LTS default 2026
- https://code.claude.com/docs/en/skills — Claude Code Skills (SKILL.md, bundled/custom)
- https://code.claude.com/docs/en/subagents — Claude Code subagents
- https://claudedirectory.org/blog/claude-code-slash-commands-guide — slash commands 2026
- https://jsmanifest.com/claude-code-skills-slash-commands-unified-model — modelo unificado skill/slash 2026
- https://blog.laozhang.ai/en/posts/claude-code-hooks-slash-commands-skills — hooks vs slash vs skills
