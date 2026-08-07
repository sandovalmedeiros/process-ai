# Criando Method-Packs

Um **method-pack** é um plugin de conteúdo que estende o schema-núcleo com campos, prompts e glossário method-specific — sem tocar no core do process-ai.

## Estrutura do pack

```
method-packs/<nome-do-pack>/
├── pack.toml          # Obrigatório — manifesto do pack
├── schemas/           # Opcional — schemas aditivos
│   └── <type>.schema.json
├── prompts/           # Opcional — prompts por especialista
│   └── <especialista>.md
└── glossary.md        # Opcional — glossário method-specific
```

## pack.toml

```toml
[pack]
name = "meu-pack"
version = "1.0.0"
description = "Descrição do pack"
artifact_types = ["sipoc", "flow"]
```

**Regras (AD-2):**
- `name`: kebab-case, único.
- `version`: semver (X.Y.Z).
- `artifact_types`: array não-vazio. Cada tipo deve estar no vocabulário do schema-núcleo (7 tipos).
- **Proibido** declarar: `pipeline`, `roles`, `gates`, `stages`, `engine` — esses são toolkit-owned.

## Schemas aditivos

Cada schema no pack **estende aditivamente** o schema-núcleo via `allOf`:

```json
{
  "allOf": [
    { "$ref": "https://process-ai/schemas/sipoc/v1" },
    {
      "properties": {
        "industry": { "type": "string" }
      }
    }
  ]
}
```

**Regras:**
- O arquivo deve ser nomeado `<artifactType>.schema.json`.
- Referenciar exatamente 1 schema-núcleo via `allOf[0].$ref`.
- **Só adicionar** `properties` — nunca redefinir campos do núcleo.
- O validador (3.2) rejeita packs que conflitam com o núcleo.

## Prompts

Arquivos `.md` em `prompts/` substituem o prompt padrão do especialista:
- `bento.md` — entrevista + SIPOC + cadeia de valor
- `miguel.md` — hierarquia
- `julia.md` — BPMN + gargalos
- `zanoni.md` — POPs + diagnóstico

O loader carrega prompts presentes; especialistas sem prompt no pack usam o prompt padrão do core.

## Ativação

1. Coloque o pack em `method-packs/`.
2. Configure `.process-ai/config`:
   ```toml
   active_pack = "meu-pack"
   pack_version = "1.0.0"
   ```
3. O próximo commit registrará `pack_id`+`pack_version` no manifesto.

## Validação

Para validar seu pack em desenvolvimento (raiz do repo, ESM — `"type": "module"`):

```bash
# Importe o loader compilado e valide a estrutura do pack
node --input-type=module -e "
  const { loadPack } = await import('./toolkit/dist/pack-loader.js');
  const pack = await loadPack('./method-packs/meu-pack');
  console.log('OK:', pack.manifest.name);
"
```

> **Nota:** O pack é validado automaticamente quando ativado via `.process-ai/config` — o toolkit rejeita packs que violem AD-2 (redefinir schema-núcleo, declarar pipeline/roles, etc.).

O pack padrão `bpmn-sipoc` (method-packs/bpmn-sipoc/) serve como referência completa.
