# Criando Adapters de Engine

Um **adapter** conecta o process-ai a um engine de agentes (Claude Code, Codex, Cursor, etc.). O core é engine-agnostic (AD-3) — depende só da porta `EngineAdapter`.

## A porta EngineAdapter

```typescript
export interface EngineAdapter {
  installSkills(targetDir: string): Promise<void>;
  registerSlashCommands(targetDir: string): Promise<void>;
  propose(payload: ProposePayload): Promise<CommitResult>;
}
```

**Contrato:**
- `installSkills`: copia skills para o engine-alvo.
- `registerSlashCommands`: registra slash-commands no engine.
- `propose`: **pass-through** — roteia o payload ao toolkit **sem mutar**.

## Passo a passo

### 1. Crie o diretório do adapter

```
toolkit/adapters/<nome-do-engine>/
├── adapter.ts    # Implementação da porta
└── ...            # Arquivos auxiliares (templates, config)
```

### 2. Implemente a porta

```typescript
import type { EngineAdapter, ProposePayload, CommitResult } from '../../src/engine-adapter.ts';

export class MeuEngineAdapter implements EngineAdapter {
  async installSkills(targetDir: string): Promise<void> {
    // Copiar skills/ para o local esperado pelo engine.
  }

  async registerSlashCommands(targetDir: string): Promise<void> {
    // Registrar slash-commands no engine.
  }

  async propose(payload: ProposePayload): Promise<CommitResult> {
    // NUNCA mutar o payload — pass-through.
    // Chamar o toolkit (commit.ts) com o payload intacto.
  }
}
```

### 3. Registre no bootstrap

Adicione suporte ao novo engine em `bin/bootstrap.ts`:

```typescript
if (engine === 'meu-engine') {
  adapter = new MeuEngineAdapter({ cwd: target });
}
```

### 4. Teste

```bash
node --test tests/adapter.test.ts
```

## Referência: ClaudeCodeAdapter

O adapter v1 (`toolkit/adapters/claude-code/adapter.ts`) serve como implementação de referência:
- `installSkills`: copia `SKILL.md` para `.claude/skills/`.
- `registerSlashCommands`: no-op (Claude Code descobre skills automaticamente).
- `propose`: delega para `commit()` sem mutação.
