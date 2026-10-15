# MetLife Recruitment CRM

Plataforma interna para consolidar as planilhas mensais das 23 agências parceiras de recrutamento de corretores, acompanhar candidatos e candidaturas e medir a performance de cada agência.

> **Status:** Fase 1 (Foundation) concluída: estrutura do projeto, banco de dados, autenticação com perfis, auditoria, design system e layout principal. Veja o [plano de fases](docs/roadmap.md) e as [regras pendentes de validação](docs/pending-validations.md).

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Python 3.11+, FastAPI, SQLAlchemy 2, Alembic |
| Banco | SQLite (padrão, zero infraestrutura) — pronto para PostgreSQL via `DATABASE_URL` |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, TanStack Query, React Router |
| Autenticação | Usuários locais, senha com scrypt, sessão em cookie httpOnly |

Em produção, **um único processo** serve a API e o frontend compilado. Decisões e justificativas em [docs/adr](docs/adr).

## Perfis de acesso

| Perfil | Acesso |
|---|---|
| **Administrador** (`admin`) | Tudo: Candidatos, Performance, Administração e exportação. Vê dados pessoais completos. |
| **Visualizador** (`viewer`) | Somente leitura da aba Candidatos. CPF, e-mail e telefone mascarados. Sem exportação. |

As permissões são verificadas no backend; o frontend apenas esconde o que o perfil não acessa.

## Como rodar localmente

Pré-requisitos: **Python 3.11+** e **Node.js 20.19+**.

### 1. Backend

```bash
cd apps/api
python -m venv .venv
# macOS/Linux:
source .venv/bin/activate
# Windows (PowerShell):
# .venv\Scripts\Activate.ps1

pip install -r requirements-dev.txt

# Gera o .env com chaves aleatórias e cria o banco
python -m app.cli init

# Cria o primeiro administrador (a senha é pedida no terminal)
python -m app.cli create-user --role admin --name "Seu Nome" --email voce@empresa.com

uvicorn app.main:app --reload
```

A API fica em http://127.0.0.1:8000 (documentação interativa em `/docs` fora de produção).

> **Guarde uma cópia segura do arquivo `apps/api/.env`.** Sem a `FIELD_ENCRYPTION_KEY`, os CPFs armazenados não podem ser lidos.

### 2. Frontend (em outro terminal)

```bash
cd apps/web
npm install
npm run dev
```

Acesse http://localhost:5173. As chamadas `/api` são encaminhadas ao backend.

### Testes

```bash
cd apps/api && pytest
cd apps/web && npm run build   # checagem de tipos + build
```

## Rodando como um único serviço

```bash
cd apps/web && npm install && npm run build      # gera apps/web/dist
cd ../api && uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Ou com Docker (opcional):

```bash
docker build -t metlife-crm .
docker run -p 8000:8000 --env-file apps/api/.env -v crm-data:/app/apps/api/data metlife-crm
```

Em produção, sirva por HTTPS e defina `ENVIRONMENT=production` e `COOKIE_SECURE=true`.

## Estrutura

```
apps/
  api/                 Backend FastAPI
    app/
      core/            configuração, segurança, criptografia, middlewares
      auth/            sessão, permissões por perfil
      models/          modelo de dados (SQLAlchemy)
      routers/         endpoints HTTP
      services/        regras compartilhadas (auditoria, ...)
      cli.py           comandos de administração
    alembic/           migrações do banco
    tests/
  web/                 Frontend React
    src/
      auth/            sessão e guardas de rota
      components/ui/   design system
      components/layout/  navegação lateral, cabeçalho
      pages/           telas
docs/
  adr/                 decisões arquiteturais
  data-model.md        modelo de dados
  pending-validations.md  regras de negócio pendentes
  roadmap.md           plano de fases
```

## Segurança e LGPD

- CPF nunca é armazenado em claro: hash HMAC para deduplicação, cópia criptografada e versão mascarada.
- Sessão em cookie httpOnly + SameSite, proteção CSRF, bloqueio após 5 tentativas de login.
- Trilha de auditoria de acessos e ações administrativas.
- Cabeçalhos de segurança (CSP, nosniff, frame-deny) e respostas da API sem cache.
- **Desenvolvimento e testes usam apenas dados fictícios.**
