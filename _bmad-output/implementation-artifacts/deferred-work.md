# Deferred Work — process-ai

Itens reais, porém fora do escopo prioritário do momento. Reavaliar ao tocar os arquivos/stories correspondentes.

## Resolvido — aplicado como hardening pós code review (2026-08-01)

Os itens [Low] abaixo do code review da story `1-1-scaffold-engineadapter-claudecodeadapter` foram aplicados. Validação: `tsc --noEmit` limpo + 23/23 testes (0 falhas), incluindo cobertura nova para cada item.

- ✅ **Validação de `--target` (existe + é diretório)** — `adapter.ts` `installSkills` agora valida o alvo com `fs.stat`, recusando diretório inexistente (erro acionável, sem árvore dispersa) e arquivo (evita `ENOTDIR` opaco). Testes: `adapter.test.ts` (target inexistente / arquivo).
- ✅ **Recusa de symlink no destino do `SKILL.md`** (escopo `.claude/`, defense-in-depth) — `lstat` do destino; recusa se for symlink (não segue o link). Teste: `adapter.test.ts` (symlink não é seguido/escrito).
- ✅ **Ergonomia do CLI do bootstrap** — `parseArgs` reescrito: (a) `--target=<dir>` (form com `=`); (b) `--target` duplicado rejeitado; (c) aceita nomes que começam com `--` via form `=`; (d) pré-scan de `-h`/`--help` com precedência total (`hasHelpFlag`, respeita separador POSIX); (e) separador `--` (posicionais rejeitados). Testes: `bootstrap.test.ts` (parseArgs × 5 + hasHelpFlag + `--help` E2E).
- ✅ **Hardening miscellaneous** — (a) nota de MAX_PATH no Windows no header do `bootstrap.ts`; (b) recusa de self-install quando `target === REPO_ROOT`; (d) snapshot de idempotência agora inclui `mode` (mtime/owner excluídos por voláteis); (e) teste de escrita-fora-do-alvo via snapshot do dir-pai; (f) composition root — `adapter` tipado como `EngineAdapter` (porta). Testes: `bootstrap.test.ts` (self-install / 4e).

## Mantido em aberto (pertence à story 1.2)

- **[Low → story 1.2] Validação runtime do payload de `propose`** (null/undefined/mal-formado) — ✅ **Resolvido na story 1.2** (`validatePayload` em `commit.ts`, AC6 satisfeito). `[toolkit/adapters/claude-code/adapter.ts, toolkit/src/engine-adapter.ts]`

## Deferred from: code review of 1-2-toolkit-propose-commit-sha256 (2026-08-01)

Achados do code review adversarial (3 camadas: Blind Hunter + Edge Case Hunter + Acceptance Auditor). Itens reais, porém fora do escopo prioritário do momento ou pertencem a stories futuras.

- **[W1] Falha parcial deixa artefato órfão sem manifesto/provenance** — Se manifest ou provenance falham após artefato escrito, `_process-ai_output/<type>/<sha>.md` existe sem manifesto. Exatamente a fronteira 1.3 WAL/quarentena. `[commit.ts:329-343]`
- **[W2] TOCTOU symlink race entre walk e write** — Componente de diretório trocado por symlink após `assertNoSymlinkComponent` e antes de `mkdir`/`writeFile`. Não fechável sem `O_NOFOLLOW` (não-portátil no Windows). `[commit.ts:323-325]`
- **[W3] Prototype pollution bypassa validação de payload** — `validatePayload` usa `p.artifactType`/`p.content` sem `Object.hasOwn`; propriedade herdada via `Object.prototype` poluído passaria na validação. Cenário extremamente improvável (conteúdo vem de agentes, não input externo). `[commit.ts:193-203]`
- **[W4] Sem `fsync` em `atomicWriteFile` (durabilidade)** — `temp + rename` sem fsync; em power loss o rename pode persistir com dados não-flushados. Durabilidade não é claim da 1.2. `[commit.ts:215-225]`
- **[W5] Extensão `.md` para conteúdo objeto/JSON é frágil** — Objetos escritos como `.md`; `adapter.test.ts:72` faz `JSON.parse` sobre `.md`. Acoplamento quebra quando extensões mudarem em 3.1. `[commit.ts:40, 315-316]`

## Deferred from: code review of 1-1-scaffold-engineadapter-claudecodeadapter (2026-08-01, round 2)

Achados do round 2 adversarial (pós-hardening, 3 camadas: Blind Hunter + Edge Case Hunter + Acceptance Auditor). Itens reais, porém fora do escopo prioritário do momento. Reavaliar ao tocar os arquivos/stories correspondentes.

- **[Low] TOCTOU entre `lstat` e `writeFile`** *(reclassificado de Med: requer atacante ativo + janela de ms num CLI de dev v1 → consequência real baixa)* — janela de corrida derrota a defesa de symlink; o fix correto (`O_NOFOLLOW` via `fs.open`) não é portátil no Windows (runtime-alvo) → risco residual aceito. `[toolkit/adapters/claude-code/adapter.ts:71→82]`
- **[Low] Erros raw não-traduzidos** — source skill ausente (ENOENT cru), `.claude` já existindo como arquivo regular (ENOTDIR opaco do `mkdir`), EACCES/EPERM/ELOOP relançados como errno cru (apenas ENOENT do target é traduzido para mensagem acionável). `[toolkit/adapters/claude-code/adapter.ts:43,63,65,82]`
- **[Low] `--dev=<value>` rejeitado enquanto `--dev` (bare) funciona** — o branch `=` só aceita `--target=`; `--dev=true` cai em "Argumento desconhecido". `[bin/bootstrap.ts:85-97]`
- **[Low] Snapshot de idempotência não captura diretórios nem mode de dir** — `snapshotTree` registra só arquivos; mudanças em entradas de diretório passam despercebidas pelo `deepEqual`. Teórico (o bootstrap não cria/muda dirs entre runs). `[tests/bootstrap.test.ts:27-43]`
- **[Low] HELP mostrado inconsistentemente entre erros de parsing** — alguns erros anexam `\n\n${HELP}`, outros não. `[bin/bootstrap.ts:90-127]`
- **[Low] Cleanup de teste pode flakear com EBUSY no Windows** — `rmSync({force:true})` suprime ENOENT mas não EBUSY/EPERM (antivirus/Search Indexer segurando handle do `SKILL.md` recém-escrito); passou na execução atual, latente em CI. `[tests/bootstrap.test.ts]`
- **[Low] `parseArgs` tem nome enganador (chama `process.exit(0)` no help)** — qualquer importador/teste que passe um `--help` tem o processo morto; já mitigado testando `hasHelpFlag` (pura) separadamente. Naming/refactor (`parseArgsPure` + `dispatch`). `[bin/bootstrap.ts:58-63]`

## Deferred from: code review of 1-4-toolkit-confianca-mecanica-ledger (2026-08-01)

Achados do code review adversarial (3 camadas: Blind Hunter + Edge Case Hunter + Acceptance Auditor). Itens reais, porém baixa prioridade / não-acucionáveis agora. Reavaliar ao tocar `confidence.ts` ou em 2.5 (relatório consolidado de confiança).

- **[Low] Linhas corrompidas do ledger dropadas no scan de dedupe → append duplicado possível** — `JSON.parse` falho é ignorado; chave da linha corrompida nunca entra no Set → próximo commit pode append duplicata. Corrupção não ocorre via atomic-write path. Reavaliar em 2.5 (integridade do ledger). `[toolkit/src/confidence.ts:238-246]`
- **[Low] `appendConfidenceLedger` lê o ledger 2× (scan dedupe + base append), O(n)/commit, sem cache em memória** — perf, não corretude; ledger v1 é pequeno (Decisão 3). Adicionar cache como `_provenanceCache` quando escala justificar. `[toolkit/src/confidence.ts:234-272]`
- **[Low] `buildLedgerEntries` assume `claims.length === validated.length`** — unreachable via `commit()` (derivou ambos da mesma fonte); TS-signature não enforcement de tamanho mas o produtor garante. Candidato p/ `assert` de 1 linha (belt-and-suspenders). `[toolkit/src/confidence.ts:298-299]`

## Deferred from: code review of 1-6-pipeline-minima-rascunhos (2026-08-01)

Achados do code review adversarial (3 camadas: Blind Hunter + Edge Case Hunter + Acceptance Auditor; baseline `e7b99f5`, escopo 1-6). Acceptance Auditor PASS (AC1–AC6 + ADs + sem scope creep). Itens reais, porém pré-existentes ou adiados por design (não-acucionáveis nesta story).

- **[Low] `checkpoint.artifacts[]` sem dedup por sha256 em re-propose do usuário** — `applyIntent` commit (`checkpoint.ts:354`) faz `[...state.artifacts, {...}]` sem guard de `sha256`. O fluxo normal (single-propose por artefato, o que a 1.6 faz) está correto; o `resume` também não dobra (só replays entries com `cursor > walCursor`, e um commit completo tem `cursor == walCursor`). Apenas um propose **novo e repetido** (mesmo payload) cresce a lista — o arquivo/manifesto/provenance/ledger são idempotentes, só o `checkpoint.artifacts[]` não. Pré-existente desde 1.3; não exercitado pela 1.6. Reavaliar ao tocar `checkpoint.ts` ou se re-propose entrar no fluxo de uso. `[toolkit/src/checkpoint.ts:352-358]`
- **[Low] `--agent` por-especialista não exposto no CLI `propose`** — a provenance hoje registra `agent: "claude-code"` para todo commit (o `artifactType` distingue qual especialista produziu). Identidade por-especialista (ex.: `--agent bento`) melhoraria a observabilidade (NFR-5 "log de provenance por etapa"), mas nenhum AC exige e adiciona risco (mudar o dispatcher + a composition root). Adiado por design (decisão #6 da story 1.6). Reavaliar se a granularidade de provenance virar requisito (ex.: relatório consolidado navegável da 2.5). `[bin/process-ai.ts:367-374, toolkit/adapters/claude-code/adapter.ts propose]`

## Deferred from: code review of 1-5-dea-skill-condutora (2026-08-01)

Achados do code review adversarial (3 camadas: Blind Hunter + Edge Case Hunter + Acceptance Auditor; commit `570cd4c`, escopo 1-5). Acceptance Auditor PASS (AC1–AC6 + ADs + critério implícito). Itens abaixo são reais, porém baixa prioridade / fora do modelo de uso single-session. Reavaliar ao tocar os arquivos ou em stories futuras (validação canônica → gating rico 2.6; report consolidado/streaming → 2.5).

- **[Low] `resume()` sem lock** — muta checkpoint + quarentena sem `acquireLock`; corrupção/lost-update só sob sessões concorrentes (fora do modelo single-session do produto). Documentar a assumeção single-writer ou adicionar lock se multi-session entrar no escopo. `[toolkit/src/checkpoint.ts:392-459, bin/process-ai.ts:334-337]`
- **[Low] Sem cap de tamanho na leitura do payload** — `fs.readFile` buffers o arquivo todo + `JSON.parse` dobra a memória; payload multi-GB → OOM cru. Agente escreve o payload (implausível), mas adicionar size guard é barato. `[bin/process-ai.ts:251]`
- **[Low] `status`/`report`/`resume` em cwd errado "sucedem"; `gate`/`stage` fazem `mkdir -p` silencioso** — sem `resolveRoot` no dispatcher (só `commit` valida root). `gate` num cwd com typo cria `.process-ai/` no lugar errado. `[bin/process-ai.ts:299-345]`
- **[Low] Sem validação canônica de gate IDs / stage** — `id`/`to` aceitos verbatim; typo (`gate-5`) persiste; stage pode regredir (`summary`→`init`). CLI é pass-through por design (AD-3); validação canônica pertence ao gating rico (2.6). `[bin/process-ai.ts:212-225]`
- **[Low] Leitores do report sem leaf-symlink check** — `aggregateLedger`/`countOrphans` seguem symlink; escritores (`commit`/`confidence`) recusam. Assimetria de defense-in-depth; ameaça requer atacante trocando o ledger por symlink (pasta protegida + trusted-agent mitigam). `[toolkit/src/report.ts:88,122]`
- **[Low] `aggregateLedger` sem dedupe na leitura** — conta toda linha válida; inflação só com ledger migrado/editado manualmente (o escritor dedupe em `(claimId, artifactSha256)`). `[toolkit/src/report.ts:95-108]`
- **[Low] `formatConfidenceReport` interpola `stage` sem escape markdown** — depende da validação canônica de stage; campo trusted hoje. `[toolkit/src/report.ts:187]`
- **[Low] `process.stdout.write` em pipe fechado lança fora do path de erro** — `process-ai status | head` → `ERR_STREAM_DESTROYED`, não via `✗ process-ai falhou`. Anexar handler de erro/ignorar EPIPE. `[bin/process-ai.ts:368]`
- **[Low] `process.cwd()` pode lançar ENOENT cru** — se o cwd for deletado sob o processo (comum no Windows quando outra shell rm o diretório pai). `[bin/process-ai.ts:363]`
- **[Low] `dispatch` sem guard `assertNever`** — variante futura de `ParsedCommand` não-tratada → retorna `undefined` → crash em runtime (TS pode não pegar). Adicionar `default: assertNever(cmd)`. `[bin/process-ai.ts:288-348]`
- **[Low] Valores whitespace-only passam no parser** — só checa `=== ''`; `--id "   "` persiste um gate com id em branco. Adicionar `.trim()`. `[bin/process-ai.ts:145,157]`
- **[Low] Valores com traço único aceitos na forma espaço** — só bloqueia prefixo `--`; `stage --to -9` aceita `-9`. `[bin/process-ai.ts:160]`
- **[Low] Variation selector `️` em emoji do ledger descarta entrada da contagem** — `(LEVELS).includes(level)` é byte-exato; `🟢️` ≠ `🟢`. Só com edição externa (ledger é escrito pelo toolkit com emoji nu). Normalizar (NFC/strip-FE0F). `[toolkit/src/report.ts:104]`
- **[Low] `aggregateLedger` materializa o ledger inteiro na memória** — `raw.split('\n')` dobra o pico antes do loop; ledger grande → OOM onde streaming não. Escala é 2.5. `[toolkit/src/report.ts:95]`
- **[Low] `aggregateLedger`/`report` leem sem lock → snapshot pontual potencialmente inconsistente** — commit concorrente pode landar entre as 3 leituras (ledger/checkpoint/quarantine); o relatório (embutido no entregável final) fica auto-inconsistente. Mesmo escopo single-session do item do `resume`. `[toolkit/src/report.ts:146-149]`

## Deferred from: code review of 2-2-miguel-hierarquia-completa (2026-08-02)

Achados do code review adversarial (3 camadas: Blind Hunter + Edge Case Hunter + Acceptance Auditor; baseline `4736f35`, commit `8ab577c`). Acceptance Auditor PASS (AC1–AC5 + AD-3 verde + 177/177). Itens abaixo são reais, porém pré-existentes ou pertencem a stories futuras (não-acucionáveis na 2.2 sem scope creep). Reavaliar ao tocar os arquivos ou nas stories indicadas.

- **[Low → 2.3/2.5] Scheme de IDs: contadores não-padded quebram ordenação lexical no 10º irmão (M1, M10, M2)** — qualquer consumer que ordene IDs lexicalmente (relatório, índice 2.5, JSON ordenado) obtém ordem errada da cadeia. Hoje nenhum consumer ordena IDs. `[skills/process-ai-miguel/SKILL.md:89-91]`
- **[Low → 2.3/2.5] "E1.1" é prefixo de string de "E1.10" → resolução de pai por `includes` casa pai errado** — sem delimitador/âncora no scheme de referência `— pai: <id>`. Hoje nenhum consumer resolve pai por substring. `[skills/process-ai-miguel/SKILL.md:100-107]`
- **[Low → 2.3] Contrato de ancoragem downstream sub-especificado** — a skill promete que Júlia (2.3)/Zanoni (2.4) "ancoram nestes IDs", mas só garante "estável+único"; um agente poderia emitir IDs não-hierárquicos (UUID, `task-7`) que satisfazem estável+único mas quebram a codificação `M.E.S.A.T` que downstream espera parsear. Recomendar (não exigir) o scheme `M.E.S.A.T` resolve. `[skills/process-ai-miguel/SKILL.md:87-91]`
- **[Low → 2.5/3.1] Content opaco: referência de pai órfão e divergência bidirecional pai/filho passam sem checagem** — nada valida que cada `pai: X` referencia um nó definido no artefato, nem que as duas direções concordam (M lista filho A; A nomeia pai B). Validação estrutural exige schema (3.1) ou índice (2.5). Hoje a skill pode ganhar uma instrução de self-check barata (verificar as próprias refs antes de commitar) — registrar como hardening opcional. `[skills/process-ai-miguel/SKILL.md:93,100-107]`
- **[Low → story futura] "Sourceia só `value-chain`" e "não inclua `source` em 🟡/🔴" são só prosa** — o toolkit (`confidence.ts`) valida apenas que `source` resolve, não que `artifactType == 'value-chain'`; e regras 5/6 ignoram `source` em 🟡/🔴 enquanto `buildLedgerEntries` o grava no ledger. Comportamento pré-existente do toolkit (não causado pela 2.2; AD-3 proíbe mexer no core aqui). Enforcement = mudança no toolkit = scope creep. AD-5 é honor-system por design até checagem semântica (2.5/3.1). `[toolkit/src/confidence.ts]`
- **[Low → 2.5] Marcadores de confiança desacoplados dos nós da árvore** — a árvore markdown não carrega marcadores por nó; o nível de cada nó só existe em `statements` de texto-livre dentro de `claims[]`. Consumer que parseia o `content` vê um nó 🔴 como tarefa concreta sem saber que é gap. Marcação por-nó no `content` é enhancement de 2.5 (AC3 põe marcadores nos `claims`, in-spec para 2.2). `[skills/process-ai-miguel/SKILL.md:97-108,129-148]`

## Deferred from: code review of 2-3-julia-bpmn-xml-gargalos (2026-08-02)

Achados do code review adversarial (3 camadas: Blind Hunter + Edge Case Hunter + Acceptance Auditor; baseline `9edd593`, commit `01daff3`). Acceptance Auditor PASS (AC1–AC5 + ADs + 179/179). Item abaixo é real, porém pré-existente (toolkit intocável — AD-3) / pertence a story futura. Reavaliar ao tocar `toolkit/src/confidence.ts` ou na story 2.5.

- **[Low → 2.5] `reasoning`/`statement` dos claims não são persistidos no ledger** — `ConfidenceLedgerEntry` (`toolkit/src/confidence.ts:83-101`) e `buildLedgerEntries` (`:402-414`) não copiam `statement`/`reasoning`; o caminho 🟡 (`:232-234`) nunca inspeciona `reasoning`. Consequência: a evidência FR-11 do gargalo (que cita o nó do flow no `reasoning`) não é recuperável do ledger pós-commit — um consumer do `confidence-ledger.jsonl` não reconstrói a fundamentação do gargalo. Pré-existente desde 1.4 (não causado pela 2.3); o listing rico + verificação de excerpt são escopo da story 2.5. `[toolkit/src/confidence.ts:83-101,232-234,402-414]`
