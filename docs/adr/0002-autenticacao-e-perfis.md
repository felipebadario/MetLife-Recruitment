# ADR 0002 — Autenticação local e dois perfis de acesso

- **Data:** 2026-10-15
- **Status:** Aceita

## Decisão

**Perfis**

| Perfil | Permissões |
|---|---|
| `admin` | Todas |
| `viewer` | `candidates.view` (somente leitura da aba Candidatos, dados pessoais mascarados) |

A matriz fica em `apps/api/app/auth/permissions.py`. Endpoints exigem permissões, não perfis, para que um terceiro perfil possa ser criado sem tocar nas rotas.

**Senhas**

- scrypt (biblioteca padrão do Python), N=2^16, r=8, p=2, sal aleatório por senha.
- Política: mínimo de 10 caracteres, letras e números.
- Bloqueio de 15 minutos após 5 tentativas erradas; resposta com o mesmo tempo para e-mail existente ou não.

**Sessão**

- JWT assinado (HS256) em cookie `httpOnly`, `SameSite=Lax`, `Secure` em produção; validade de 8 horas.
- O token carrega a data da última troca de senha: trocar ou redefinir a senha encerra todas as outras sessões.
- Usuário desativado perde o acesso na requisição seguinte.

**CSRF**

Requisições que alteram estado precisam do cabeçalho `X-Requested-With: XMLHttpRequest`. Navegadores não enviam cabeçalhos customizados entre sites sem pré-verificação CORS (que não é habilitada).

**Auditoria**

Login (sucesso, falha, bloqueio), logout, troca de senha, criação e edição de usuários e acessos negados são registrados em `audit_logs`, sem senhas ou dados pessoais nos detalhes.

## Alternativas consideradas

- **Microsoft Entra ID (SSO):** melhor experiência e governança, mas exige app registration pela TI. Fica como evolução.
- **bcrypt:** igualmente adequado; scrypt foi escolhido por não exigir dependência compilada.
