# process-ai

**Framework open-source de mapeamento de processos com agentes de IA.**

Uma equipe de 6 agentes — Déa, Bento, Miguel, Júlia, Zanoni e Laura — conduz uma pessoa comum, por perguntas e respostas, até documentar a arquitetura completa de um processo: da cadeia de valor aos diagramas BPMN e aos POPs, com ingestão de documentos existentes como evidência. **O usuário não precisa saber metodologia; os agentes sabem — e conduzem.**

[![Node.js](https://img.shields.io/badge/node-%3E%3D24.0.0-brightgreen)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
[![Tests](https://img.shields.io/badge/tests-313%20passing-brightgreen)](./tests/)

---

## Por que existe

Nas PMEs, os processos críticos vivem na cabeça das pessoas. Quando alguém sai, o conhecimento vai junto. A operação fica frágil, não escala e reprova em auditorias. Sair disso exige consultoria cara ou ferramenta que pede especialista.

O **process-ai** resolve isso herdando o **rigor do Reversa** (confiança 🟢🟡🔴, rastreabilidade, não-destrutivo) e o **modo de conduzir do BMad** — aplicados ao domínio de processos. O resultado é um framework que qualquer um instala e usa, sem treinamento.

---

## A equipe

| Agente | Papel | Artefatos |
|--------|-------|-----------|
| **Déa** 🧭 | Condutora — orquestra a pipeline, abre gates de qualidade, entrega o resumo final | `summary-report` |
| **Bento** 🔍 | Descoberta — entrevista guiada, SIPOC, cadeia de valor | `discovery-interview`, `sipoc`, `value-chain` |
| **Miguel** 🏗️ | Mapeamento — hierarquia Macro→Tarefa (5 níveis) | `hierarchy` |
| **Júlia** 📐 | Modelagem — fluxo BPMN 2.0 XML + gargalos | `flow` |
| **Zanoni** 📋 | Padronização — POPs + diagnóstico consolidado | `pop` |
| **Laura** 🗄️ | Arquivista — ingestão de documentos (PDF/DOCX/PPTX) como material de referência | `reference-material` |

---

## Instalação

```bash
# Pré-requisito: Node.js ≥ 24 LTS
cd meu-projeto
npx process-ai
```

`npx process-ai` instala o framework no diretório atual. Em **TTY** (terminal interativo) abre um prompt curto (diretório, method-pack, IDE); em **CI** (não-TTY) ou com flags, instala headless com defaults.

O que o install faz:

- copia as skills (Déa + 5 especialistas) para `.claude/skills/`;
- cria `.process-ai/config` (installer-managed, regenerado a cada install) e `.process-ai/config.user` (seus overrides — nunca sobrescritos pelo installer);
- escreve `.process-ai/install-manifest.toml` — o **manifest de instalação** (versão, IDE, pack ativo, e cada arquivo com seu SHA-256), que habilita `update`/`status` e a detecção de arquivos modificados.

A instalação é **idempotente** — pode ser re-rodeada sem efeito colateral. Para instalar como dependência de projeto, `npm install process-ai` executa o mesmo install no `postinstall`.

```bash
npx process-ai                                       # install (interativo em TTY; headless em CI)
npx process-ai install --target <dir>                # install explícito (headless)
npx process-ai install --status                      # estado da instalação (não escreve)
npx process-ai update   [--target <dir>]             # atualiza/repara instalação existente
npx process-ai uninstall [--target <dir>] [--purge]  # remove skills + manifest
npx process-ai ingest   --path <arquivo|diretório>   # ingere PDF/DOCX/PPTX como reference-material
```

Flags de install: `--target <dir>` (default: cwd), `--ide <id>` (v1: `claude-code`), `--pack <id>` (default: `bpmn-sipoc`), `--full` (instala tudo, não-interativo), `--status` (apenas relata estado).

**Update** detecta a instalação prévia via manifest: re-instala se a versão mudou (`stale`) ou se algum arquivo foi editado (`modified`), fazendo **backup `.bak`** dos editados antes de sobrescrever. **Uninstall** remove skills + manifest mas **preserva** `.process-ai/config` e o estado de sessão; `--purge` remove todo o `.process-ai/`.

**Por que instalar?** O Claude Code (engine v1) descobre slash-commands pelos arquivos em `.claude/skills/` do projeto. O `npx process-ai` coloca as skills **fisicamente** em `.claude/skills/process-ai/SKILL.md` e faz o scaffolding do config. Em engines futuros (Codex, Cursor, Gemini CLI), cada adapter fará o equivalente — a porta `IdeSetup` (ver [`docs/toolkit.md`](./docs/toolkit.md)) isola esse conhecimento.

Após a instalação, o slash-command `/process-ai` está disponível no Claude Code dentro do projeto (aceite o diálogo de workspace trust).

---

## Uso

```bash
/process-ai
```

A Déa pergunta: *"Qual processo vamos mapear?"*

A partir daí, ela conduz o usuário pela pipeline completa:

```
[Ingestão documental (Laura)] → Gate 0 (escopo) → Bento (descoberta)
→ Gate 1 → Miguel (hierarquia) → Gate 2 → Júlia (BPMN)
→ Gate 3 → Zanoni (POPs) → Gate 4 → Resumo final + Relatório de Confiança
```

A ingestão documental é opcional e pode ser executada antes ou durante a sessão: `process-ai ingest --path <arquivo|diretório>` converte PDF, DOCX e PPTX em artefatos `reference-material` que os especialistas usam como evidência.

Cada gate **bloqueia** a próxima etapa até aprovação humana, exibindo a contagem de itens 🟢 (confirmados), 🟡 (inferidos) e 🔴 (gaps).

---

## Confiança 🟢🟡🔴

Toda afirmação de cada agente carrega um **marcador de confiança mecânico**:

- 🟢 **Confirmado** — fonte citada e **verificável** (SHA-256 do artefato + trecho conferido)
- 🟡 **Inferido** — concluído pelo agente a partir de indícios, **sem fonte direta**
- 🔴 **Gap** — desconhecido, não documentado, **precisa de decisão**

O toolkit valida cada 🟢: a fonte citada **resolve** a um artefato commitado no repositório local. Trechos (`excerpt`) são verificados como **substring** do conteúdo canônico da fonte. Fontes fantasmas ou forward-refs são **degradadas a 🟡** automaticamente.

**Nenhum artefato sai sem marcador. Nenhuma inferência é apresentada como fato.**

---

## Rastreabilidade bidirecional

Cada afirmação é **navegável à sua fonte nos dois sentidos**:

- **Forward:** afirmação → fonte (artefato + SHA-256 + trecho)
- **Reverse:** artefato-fonte → todas as afirmações que o citam

O relatório de confiança consolidado lista **todos os itens por nível** (claimId, statement, fonte, degradationReason, excerpt-status), com breakdown por tipo de artefato e índice reverso.

---

## Arquitetura

```
┌─────────────────────────────────────────┐
│  Skills (Déa + especialistas)           │
│  Propõem via CLI — nunca escrevem direto│
└──────────────┬──────────────────────────┘
               │ process-ai propose
               ▼
┌─────────────────────────────────────────┐
│  Toolkit Node (único escritor)          │
│  • commit SHA-256 + manifesto           │
│  • confiança 🟢🟡🔴 mecânica            │
│  • checkpoint/resume atômico (WAL)      │
│  • schema-núcleo + validador            │
│  • method-pack loader                   │
└──────────────┬──────────────────────────┘
               │
    ┌──────────┴──────────┐
    ▼                     ▼
┌──────────┐       ┌──────────────┐
│ _process │       │ .process-ai/ │
│ _ai_out  │       │ (checkpoint, │
│ put/     │       │  manifestos, │
│(artefatos)│      │  ledger)     │
└──────────┘       └──────────────┘
```

**Invariantes de arquitetura:**
- **AD-1:** O toolkit é o **único escritor** — skills só propõem via CLI
- **AD-2:** Method-packs **estendem aditivamente** o schema-núcleo (nunca redefinem)
- **AD-3:** Core **engine-agnostic** — importa só `node:*` + relativos
- **AD-4:** Checkpoint é a **fonte autoritativa** — commit+checkpoint atômicos
- **AD-5:** 🟢 exige **fonte verificável** — ghost/forward-ref → 🟡
- **AD-6:** BPMN on-disk é **XML 2.0 canônico** toolkit-owned
- **AD-7:** Distribuição via **npm** — bootstrap registra no engine

---

## Method-packs

O framework é **method-agnostic**: a metodologia (BPMN+SIPOC, Lean, Six Sigma, etc.) é empacotada como **method-pack plugável**.

```toml
# method-packs/bpmn-sipoc/pack.toml
[pack]
name = "bpmn-sipoc"
version = "1.0.0"
artifact_types = ["sipoc", "value-chain", "flow"]
```

Cada pack declara schemas **aditivos** (estendem o schema-núcleo sem redefinir), prompts por especialista e glossário method-specific. O validador **rejeita** packs que tentam alterar pipeline, papéis ou invariantes do core.

**Criar um pack:** veja [`docs/method-packs.md`](./docs/method-packs.md).

---

## Desenvolvimento

```bash
git clone https://github.com/sandovalmedeiros/process-ai.git
cd process-ai
npm install
npm test          # 313 testes, 0 falhas
npm run typecheck # tsc --noEmit
```

**Estrutura:**
```
process-ai/
├── bin/                    # CLI + bootstrap
├── toolkit/
│   ├── src/                # Core engine-agnostic
│   └── adapters/           # Engine adapters (v1: Claude Code)
├── scripts/                # Scripts Python de ingestão (PDF/DOCX/PPTX)
├── skills/                 # Skills dos agentes
├── method-packs/           # Method-packs plugáveis
│   └── bpmn-sipoc/         # Pack padrão v1
├── tests/                  # Testes determinísticos (313)
└── docs/                   # Documentação
```

**Guias:**
- [Contribuindo](./CONTRIBUTING.md)
- [Criar method-packs](./docs/method-packs.md)
- [Criar adapters](./docs/adapters.md)
- [Arquitetura do toolkit](./docs/toolkit.md)

---

## Licença

MIT © Sandoval Medeiros

---

<p align="center">
  <sub>Feito com 🧭 pelo método <strong>Reversa</strong> e a condução do <strong>BMad</strong></sub>
</p>
