# Relatório de Erros — Instalação process-ai em Nova Máquina

- **Data:** 2026-08-08
- **Versão testada:** 0.8.1
- **Ambiente:** Windows, Node.js v24, instalação local (`npm install process-ai`)
- **Sintoma:** 5 erros ao executar `/process-ai` em máquina limpa

---

## Erro 1: `process-ai: command not found`

**Severidade:** 🔴 Crítico (bloqueia toda a pipeline)

**Sintoma:**
```
Bash(process-ai resume)
Error: Exit code 127
/usr/bin/bash: line 1: process-ai: command not found
```

**Causa:** O CLI `process-ai` foi instalado localmente (`npm install process-ai`) e o binário em `node_modules/.bin/` não está no PATH. A Déa executa `process-ai resume` diretamente, mas o comando não é encontrado.

**Solução:** Atualizar a skill `process-ai/SKILL.md` para usar `npx process-ai` em vez de `process-ai` em todos os comandos Bash. O `npx` resolve o binário automaticamente independente do PATH.

**Arquivos afetados:** `skills/process-ai/SKILL.md` (todas as ocorrências de `process-ai` nos blocos Bash)

---

## Erro 2: Bug no conversor Python de PDF

**Severidade:** 🟡 Médio (bloqueia ingestão documental, não a pipeline principal)

**Sintoma:** O script `scripts/ingest_pdf.py` encontrou erro interno ao processar um PDF.

**Causa:** Dependências Python listadas em `scripts/requirements-ingest.txt` não instaladas na nova máquina, OU PDF com características não tratadas pelo parser.

**Solução:**
1. Documentar pré-requisito: `pip install -r node_modules/process-ai/scripts/requirements-ingest.txt`
2. Se o erro persistir com PDF específico, capturar traceback para diagnóstico de edge case

**Arquivos afetados:** `scripts/ingest_pdf.py`, `scripts/requirements-ingest.txt`

---

## Erro 3: `content deve ser um objeto, recebeu string`

**Severidade:** 🔴 Crítico (bloqueia o commit de todo artefato)

**Sintoma:**
```
artifactType "discovery-interview": content inválido — content deve ser um objeto, recebeu string
```

**Causa:** O schema enforcement do Épico 4 (Story 4.1, versão 0.8.0+) exige que `content` seja `{ body: "..." }`. As skills dos especialistas (Bento, Miguel, Júlia, Zanoni, Tiago, Laura) ainda geram payloads com `content` como string pura, formato pré-4.1.

**Payload correto:**
```json
{ "artifactType": "discovery-interview", "content": { "body": "# Entrevista..." } }
```

**Payload incorreto (pré-4.1):**
```json
{ "artifactType": "discovery-interview", "content": "# Entrevista..." }
```

**Solução:** Atualizar todas as skills de especialistas para montar o payload com `{ body: "..." }`. Uma alternativa é o `commit.ts` aceitar string pura convertendo automaticamente para `{ body: string }` (backward-compat), mas isso enfraquece o enforcement.

**Arquivos afetados:**
- `skills/process-ai-bento/SKILL.md`
- `skills/process-ai-miguel/SKILL.md`
- `skills/process-ai-julia/SKILL.md`
- `skills/process-ai-guilherme/SKILL.md`
- `skills/process-ai-zanoni/SKILL.md`
- `skills/process-ai-tiago/SKILL.md`
- `skills/process-ai-laura/SKILL.md`

---

## Erro 4: Falha ao localizar instalação do process-ai

**Severidade:** 🟡 Baixo (consequência do Erro 1)

**Sintoma:** A Déa tenta localizar o `process-ai` vasculhando o cache do npx com glob que não encontra nada.

**Causa:** Consequência direta do Erro 1. A Déa está tentando se recuperar da falha de PATH.

**Solução:** Resolve automaticamente ao corrigir o Erro 1.

---

## Erro 5: Playwright/Chromium não instalado

**Severidade:** 🟡 Médio (bloqueia visualização BPMN, não a pipeline principal)

**Sintoma:**
```
browserType.launch: Executable doesn't exist at
C:\Users\Sei\AppData\Local\ms-playwright\chromium_headless_shell-1234\...
Please run: npx playwright install
```

**Causas (2 problemas independentes):**

**A)** O Guilherme não está usando o renderizador built-in (`scripts/bpmn-renderer/render.ts`) — está reescrevendo o script do zero como `render-bpmn.mjs`. A skill precisa instruí-lo a usar o módulo pronto.

**B)** O navegador Chromium não foi baixado. O Playwright (npm) está instalado, mas o download do Chromium (~190 MB) é um passo separado.

**Solução para (A):** A skill do Guilherme já foi atualizada (commit `84aec4f`) para usar `npx tsx -e "const { renderBpmn } = await import('./scripts/bpmn-renderer/render.ts'); ..."`. Aguardando publicação no npm.

**Solução para (B):** Documentado como **Decisão D2** no `deferred-work.md`. Recomendação: abordagem lazy — o Guilherme detecta a falta do Chromium e executa `npx playwright install chromium` automaticamente na primeira renderização.

**Pré-requisito manual atual:**
```bash
npx playwright install chromium
```

---

## Resumo

| # | Erro | Severidade | Bloqueia | Causa raiz |
|---|------|-----------|----------|-----------|
| 1 | `command not found` | 🔴 Crítico | Pipeline inteira | PATH — `process-ai` vs `npx process-ai` |
| 2 | Bug conversor PDF | 🟡 Médio | Ingestão | Dependências Python ausentes |
| 3 | `content deve ser objeto` | 🔴 Crítico | Todo commit | Skills não atualizadas pós-4.1 |
| 4 | Falha localizar instalação | 🟡 Baixo | — | Consequência do #1 |
| 5 | Chromium não instalado | 🟡 Médio | Visualização | Setup de ambiente + skill desatualizada |

## Prioridade de correção

1. **Erro 1** — 1 linha por ocorrência (`process-ai` → `npx process-ai` na skill Déa)
2. **Erro 3** — atualizar 7 skills para `{ body: "..." }`
3. **Erro 5** — publicar versão com skill do Guilherme atualizada + documentar Chromium
4. **Erro 2** — documentar dependências Python
5. **Erro 4** — resolve com #1
