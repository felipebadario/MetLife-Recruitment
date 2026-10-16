# Modelo de dados

Migração inicial: `apps/api/alembic/versions/0001_initial_schema.py`. Modelos em `apps/api/app/models/`.

```
agencies ─────────────┐
                      │ 1:N
candidates ──1:N── applications ──1:N── application_status_history
                      │            ├─1:N── application_field_changes
                      │            └─1:N── internal_notes
                      ├── N:1 process_statuses   (funnel_stages fica no banco, sem uso)
                      └── N:1 loss_reasons

import_batches ──1:N── import_rows
               └─1:N── import_errors

status_mappings / loss_reason_mappings / value_mappings   (valor bruto → normalizado)
metric_definitions                                         (fórmulas configuráveis)
users ── audit_logs, saved_filters
integration_sources                                        (Microsoft Graph, sem segredos)
```

## Princípios

- **Candidato ≠ candidatura.** O candidato é único (pelo CPF, via hash); cada candidatura guarda o perfil daquele processo e tem histórico próprio.
- **Valor bruto e valor normalizado lado a lado.** Colunas `*_raw` guardam o valor da planilha; `*_norm` (ou chaves para catálogos) guardam a interpretação usada nos indicadores. A linha original inteira fica em `raw_payload` e em `import_rows` (com o CPF mascarado). O padrão de colunas lido na importação fica em `import_columns` (Administração > Padrão da planilha).
- **Nada é inferido.** Valor sem mapeamento é classificado como "não mapeado" até que um administrador o classifique.
- **Dados de demonstração identificados.** `is_demo` em agências, candidatos e candidaturas; o ambiente de demonstração exibe uma faixa permanente.

## CPF

| Coluna | Conteúdo | Uso |
|---|---|---|
| `cpf_hash` | HMAC-SHA256 do CPF normalizado (chave `CPF_HASH_KEY`) | Deduplicação |
| `cpf_encrypted` | CPF criptografado (Fernet, chave `FIELD_ENCRYPTION_KEY`) | Exibição completa para administradores |
| `cpf_masked` | `***.***.*47-25` | Listagens e perfil visualizador |
