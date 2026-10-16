# MetLife Recruitment CRM

Plataforma interna para consolidar as planilhas mensais das 23 agências parceiras de recrutamento de corretores, acompanhar candidatos e candidaturas e medir a performance de cada agência.

> **Status:** Fases 1 a 4 entregues: autenticação e perfis, importação da planilha da turma, CRM de candidatos, catálogos configuráveis e dashboard de performance. Deploy no Render. Veja o [plano de fases](docs/roadmap.md) e as [regras pendentes de validação](docs/pending-validations.md).

## Publicar no Render

1. No [Render](https://dashboard.render.com), escolha **New > Blueprint** e conecte este repositório.
2. O Render lê o `render.yaml` e cria o serviço web e o banco PostgreSQL.
3. Preencha **INITIAL_ADMIN_EMAIL** e **INITIAL_ADMIN_PASSWORD** (mínimo de 10 caracteres, com letras e números). Esse usuário é criado no primeiro início, e só se ainda não houver nenhum usuário.
4. Aguarde o deploy (alguns minutos) e acesse a URL `https://<nome>.onrender.com`.
5. Entre com o administrador e troque a senha pelo menu do usuário.

No plano gratuito, o serviço hiberna após um período sem uso; o primeiro acesso depois disso leva cerca de um minuto. Veja a [ADR 0003](docs/adr/0003-modelo-real-e-render.md) sobre limites e cuidados com dados reais.

## Como validar com a planilha

1. Em **Administração > Importações**, envie a planilha da turma (.xlsx) ou baixe a **planilha fictícia de teste** no mesmo modelo.
2. Em **Administração > Status e catálogos**, classifique cada código de status (PAGA, AGUA, REPRC...) e associe-o a uma etapa do funil.
3. Abra **Performance** e **Candidatos**: os indicadores e filtros já refletem a classificação.

Para trocar a base de teste pela real, use **Apagar dados** no fim da página de Importações (mantém usuários e a classificação dos status).

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Python 3.11+, FastAPI, SQLAlchemy 2, Alembic |
| Banco | SQLite local (zero infraestrutura) ou PostgreSQL (Render) via `DATABASE_URL` |
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

### Base de demonstração (opcional, só dados fictícios)

```bash
python -m app.cli seed-demo                      # importa 8 turmas fictícias
python -m app.cli demo-spreadsheet teste.xlsx    # gera uma planilha fictícia no modelo da turma
```

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
