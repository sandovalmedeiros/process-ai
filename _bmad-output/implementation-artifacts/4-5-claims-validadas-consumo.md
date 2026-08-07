# Story 4.5: Claims de contrato/doc validadas contra consumo

Status: review

## Story

As a dev/contribuidor,
I want que nenhuma header/JSDoc/claim afirme enforcement que o código não cumpre,
so that a intenção declarada e o comportamento real sejam indistinguíveis.

## Acceptance Criteria

1. ✅ Teste no estilo `doesNotMatch` cobre schema-core, pack-loader, e docs
2. ✅ Claims falsas são removidas ou corrigidas
3. ✅ Teste integrado à suite principal

## Dev Agent Record

### Agent Model Used
deepseek-v4-pro (2026-08-07)

### Completion Notes List
- AC1: ✅ tests/claims.test.ts — 6 testes doesNotMatch
- AC2: ✅ pack-loader.ts — claim "required vazio" corrigido
- AC3: ✅ npm test inclui claims.test.ts

### File List
- tests/claims.test.ts (NEW — 6 testes)
- toolkit/src/pack-loader.ts (UPDATE — claim stale)
