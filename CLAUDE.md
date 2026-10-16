# MetLife Recruitment CRM — guia para o Claude Code

Aplicação interna de recrutamento de corretores: consolida as planilhas de turma enviadas pelas agências parceiras, oferece um CRM de candidatos e um dashboard de performance por agência. Todo o produto (interface, mensagens, docs e commits) é em **português do Brasil**.

## Estrutura

- `apps/api` — backend Python 3.11+ (FastAPI, SQLAlchemy 2, Alembic). SQLite local; PostgreSQL no Render.
  - `app/importing/` — campos que a importação sabe ler e leitura da planilha (`template.py`), padrão de colunas em vigor (`columns.py`), lista oficial de status (`vgcf.py`), pipeline de importação (`service.py`), gerador de planilhas **fictícias** (`demo.py`).
  - `app/routers/` — `auth`, `admin` (usuários, auditoria), `candidates` (CRM), `imports`, `catalogs` (classificações, classificação de status, fórmulas), `performance` (dashboard).
  - `app/services/filters.py` — filtros globais compartilhados pelo CRM e pelo dashboard.
  - `alembic/versions/` — migrações escritas à mão; o CI roda `alembic check` contra os modelos.
- `apps/web` — React 19 + TypeScript + Vite + Tailwind 4 + TanStack Query + React Router.
  - `src/lib/mockApi.ts` — backend simulado no navegador, usado só no build de pré-visualização (`VITE_PREVIEW=true`).
- `docs/` — ADRs, modelo de dados, roadmap e **`pending-validations.md`** (leia antes de mexer em regra de negócio).
- `render.yaml` + `Dockerfile` — deploy no Render (serviço Docker + PostgreSQL).

## Comandos

```bash
# backend
cd apps/api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
python -m app.cli init                 # cria .env com chaves e aplica migrações
python -m app.cli create-user --role admin --name "Nome" --email voce@empresa.com
python -m app.cli seed-demo            # opcional: turmas fictícias
uvicorn app.main:app --reload          # http://127.0.0.1:8000
pytest                                 # testes
ruff check .                           # lint (linha de até 120)

# frontend (outro terminal)
cd apps/web
npm install
npm run dev                            # http://localhost:5173 (proxy /api → 8000)
npm run build                          # checagem de tipos + build
```

## Regras do projeto

- **Não inventar regra de negócio.** A coluna Status VGCF traz o nome completo de um dos nove status oficiais (`app/importing/vgcf.py`); abreviações não são reconhecidas na importação (a abreviação no catálogo é só exibição). Os status entram como "não classificados"; quem classifica é o administrador. "Pagamento Confirmado" não é contratação por padrão. Toda regra indefinida vai para `docs/pending-validations.md`.
- **Valor bruto e normalizado separados**: colunas `*_raw` guardam o que veio da planilha; `*_norm`/catálogos guardam a interpretação.
- **Nada de dados reais no repositório** (ele é público): testes e demonstração usam só `app/importing/demo.py`. Nunca versione planilhas recebidas.
- **Permissões checadas no backend** (`app/auth/permissions.py`): perfis `admin` (tudo), `operational` (tudo menos o menu Administração e o "Apagar dados" da importação, `imports.reset`) e `viewer` (somente leitura de Candidatos).
- Mudança de modelo exige migração Alembic nova (com `batch_alter_table` para funcionar no SQLite).
- Toda ação administrativa relevante grava em `audit_logs` via `record_audit`. Retenção automática (`purge_audit_logs`, na inicialização e a cada 24 h): acessos (`ACCESS_ACTIONS`) 90 dias, demais ações 365 dias; ajustável por `AUDIT_ACCESS_RETENTION_DAYS` e `AUDIT_RETENTION_DAYS`.
- Interface: tokens de cor e tipografia em `apps/web/src/styles/index.css`; cores das classificações vêm do banco; a paleta padrão (validada para daltonismo) e as sugestões para novas ficam em `src/lib/outcomes.ts`. Textos em linguagem simples, sem caixa alta em rótulos.
- Commits e PRs em português; o CI (`.github/workflows/ci.yml`) roda lint, testes em SQLite e PostgreSQL e o build do frontend.

- **Importação**: menu próprio (`/importacao`, permissão `imports.manage`, fora da Administração; `src/pages/ImportsPage.tsx`). Até 20 planilhas por envio (`POST /api/imports/bulk`), processadas em sequência. Uma planilha pode ser excluída (`DELETE /api/imports/{id}`): o que veio só dela é apagado e o que também veio de outra volta aos dados da planilha anterior.
- **Padrão da planilha configurável**: Administração > Padrão da planilha (`/administracao/padrao-planilha`, `src/pages/admin/ImportTemplatePage.tsx`, API `/api/admin/import-template`). Grava em `import_columns` os nomes de coluna aceitos, se a coluna é lida e se é obrigatória; campo sem linha segue o padrão inicial de `FIELDS` em `template.py` (planilha "Base_selecao": Turma, CPF Candidato, Candidato, R.N, Nome Agência, Agência, Regional, Executivo, Suspenso, Provas, Status VGCF, Status ENS, Status Final, Data Avaliação, Data Cadastro). Campo novo exige código (entrada em `FIELDS` + coluna no modelo). Candidatura identificada por CPF (ou nome) + Turma; com a coluna ID ligada, pelo ID. CPF nunca fica em claro (`raw_payload` guarda mascarado).
- **Indicadores**: o dashboard (`/api/performance/dashboard`) traz totais, agências, representantes (sub-representante por agência) e status por agência/representante. Peças compartilhadas em `apps/web/src/components/performance/indicators.tsx`; a apresentação exportável (PDF pela impressão, uma página 16:9 por tela) fica em `src/pages/PresentationPage.tsx`, rota `/performance/apresentacao`.
- **Logo**: símbolo da MetLife redesenhado em SVG (`BrandMark.tsx`) a partir do logotipo enviado; trocar pelo arquivo oficial quando houver.
- **Classificações editáveis**: ficam em `outcome_categories` (código estável, nome, cor). O administrador cria, renomeia, troca a cor e exclui em Administração > Status e catálogos; excluir devolve os status dela a "não classificado" e a tira das fórmulas (bloqueado se for a única base de uma taxa). Status fora da lista VGCF sem candidaturas podem ser excluídos (um a um ou "Excluir status sem uso"); se vierem de novo numa planilha, voltam sem classificação. "Não classificado" (`unmapped`) é do sistema. O frontend lê a lista por `useOutcomes()` (`src/lib/outcomes.ts`).
- **Sem funil**: a análise usa só a classificação dos status. As tabelas `funnel_stages` e `process_statuses.funnel_stage_id` continuam no banco, sem uso, para não perder dados.

## Situação

Fases 1 a 4 concluídas (ver `docs/roadmap.md`). Próximos passos em aberto: validar as regras pendentes com a área de negócio, integrações Microsoft Graph (Fase 5, depende de credenciais) e a fase de qualidade (Fase 6).

A branch `previa-local` (não mergeada) contém a pré-visualização completa no navegador, com importação de planilha sem servidor.
