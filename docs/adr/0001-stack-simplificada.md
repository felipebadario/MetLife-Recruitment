# ADR 0001 — Stack simplificada, sem dependência da TI corporativa

- **Data:** 2026-10-15
- **Status:** Aceita

## Contexto

A proposta inicial previa Azure (Container Apps, PostgreSQL gerenciado, Key Vault) e login via Microsoft Entra ID. Isso exigiria envolvimento da TI da MetLife desde o primeiro dia. A decisão do produto foi começar de forma simplificada, sem essa dependência, preservando o caminho de evolução.

## Decisão

- **Backend Python + FastAPI.** O núcleo do produto é ingestão de Excel e agregações analíticas; o ecossistema Python é o mais forte nisso (openpyxl, polars). FastAPI gera OpenAPI e valida entradas com Pydantic.
- **SQLite como banco padrão**, via SQLAlchemy 2 + Alembic. Um arquivo, sem servidor. O volume esperado (23 planilhas/mês) cabe com folga. Migrar para PostgreSQL é trocar `DATABASE_URL`: os tipos JSON usam JSONB no Postgres automaticamente.
- **React + Vite + Tailwind** no frontend, servido pelo próprio backend em produção: **um único processo** para hospedar.
- **Autenticação local** (usuário e senha), em vez de SSO corporativo.
- **Importação assíncrona** (Fase 4) com tarefas em segundo plano do próprio processo, sem Redis ou fila externa.

## Consequências

- Roda em qualquer máquina ou servidor com Python, sem custo de infraestrutura gerenciada.
- SQLite tem um único escritor por vez; adequado para uso interno com poucos usuários simultâneos. Se a equipe crescer ou houver concorrência de escrita, migrar para PostgreSQL.
- Senhas passam a ser responsabilidade da aplicação (ver ADR 0002).
- A estrutura permite, depois, trocar a autenticação por Entra ID sem alterar permissões: o perfil continua vindo da tabela `users`.
