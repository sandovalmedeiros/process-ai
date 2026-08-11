# Contribuindo com o process-ai

O **process-ai** é um framework open-source (MIT) de mapeamento de processos com agentes de IA. Este guia cobre como contribuir com method-packs, adapters de engine e melhorias no toolkit.

## Setup rápido

```bash
git clone https://github.com/process-ai/process-ai
cd process-ai
npm install
npm run typecheck
npm test
```

**Pré-requisitos:** Node.js ≥ 24 LTS.

## Estrutura do projeto

```
process-ai/
├── bin/                    # CLI + postinstall
├── toolkit/
│   ├── src/                # Core engine-agnostic (AD-3)
│   │   ├── commit.ts       # Propose/commit (AD-1)
│   │   ├── checkpoint.ts   # Checkpoint/resume (AD-4)
│   │   ├── confidence.ts   # Confiança 🟢🟡🔴 (AD-5)
│   │   ├── report.ts       # Relatório de confiança
│   │   ├── schema-core.ts  # Schema-núcleo (AD-2)
│   │   └── pack-loader.ts  # Loader de method-packs
│   └── adapters/
│       └── claude-code/    # ClaudeCodeAdapter (v1)
├── skills/                 # Skills dos agentes (Déa+Bento+Miguel+Júlia+Guilherme+Zanoni+Laura+Tiago+Monique + time da Monique: João+Mônica+Sarah+Victor)
├── method-packs/           # Method-packs plugáveis
│   └── bpmn-sipoc/         # Pack padrão v1
└── tests/                  # Testes determinísticos (node --test)
```

## Invariantes de arquitetura (AD-1..7)

Antes de contribuir, leia `docs/toolkit.md` para entender os 7 invariantes que governam o projeto. Em resumo:

| AD | Regra |
|----|-------|
| AD-1 | Toolkit é o **único escritor** — skills só propõem via CLI |
| AD-2 | Method-packs **estendem aditivamente** o schema-núcleo |
| AD-3 | Core é **engine-agnostic** — importa só `node:*` + relativos |
| AD-4 | Checkpoint é **fonte autoritativa** — commit+checkpoint atômicos |
| AD-5 | 🟢 exige **fonte verificável** — ghost/forward → 🟡 |
| AD-6 | BPMN on-disk é **XML canônico** toolkit-owned |
| AD-7 | Distribuição via **npm** — `npx process-ai install` registra no engine |

## Convenções

- **Linguagem:** Código e comentários em inglês. Documentação e mensagens de erro em pt-BR.
- **Testes:** `node --test` (zero dependências). Testes determinísticos, sem LLM.
- **TypeScript:** strict mode. `tsc --noEmit` limpo antes de commit.
- **AD-3:** `toolkit/src/**` nunca importa pacotes npm — só `node:*` e imports relativos.

## Fluxo de contribuição

1. Crie uma branch a partir de `master`.
2. Implemente seguindo TDD (red-green-refactor).
3. `npm test` → 100% pass.
4. `npm run typecheck` → limpo.
5. PR com descrição clara + referência aos ACs.

## Guias específicos

- **Criar method-pack:** `docs/method-packs.md`
- **Criar adapter de engine:** `docs/adapters.md`
- **Trabalhar no toolkit:** `docs/toolkit.md`
