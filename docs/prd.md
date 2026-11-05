# PRD — MetLife Recruitment CRM (reconstrução do zero)

- **Versão:** 1.0 · 05/11/2026
- **Base:** estado da branch `main` após o PR #11 (padrão da planilha com campos editáveis e campos novos; status novos entram no Status VGCF).
- **Para quem:** quem vai iniciar um desenvolvimento novo deste mesmo produto. O documento descreve **o que** o sistema faz e **por quê**; a seção 12 sugere o **como**.

> Este PRD não cria regra de negócio nova. Tudo que ainda depende da área de negócio está marcado como **[pendente]** e listado na seção 14 (espelho de `docs/pending-validations.md`).

---

## 1. Contexto e problema

A MetLife recruta corretores por meio de **agências parceiras** (hoje 23). Cada agência indica candidatos, que passam por um processo seletivo organizado em **turmas** (ex.: "SAFEE T61 - Prova 21/01/26"). O acompanhamento é feito em **planilhas Excel por turma**, enviadas periodicamente pelas agências, com candidatos de várias agências na mesma planilha.

Problemas que o produto resolve:

1. **Dados espalhados**: cada turma é um arquivo; não há visão consolidada de candidatos nem histórico.
2. **Sem medição de agências**: não dá para comparar volume e qualidade das indicações por agência e por representante.
3. **Status sem significado padronizado**: a coluna "Status VGCF" traz nomes de status cujo significado (aprovado, contratado, desistência…) não está formalizado.
4. **Dados pessoais (CPF) circulando em planilhas**, sem controle de acesso nem trilha.

## 2. Objetivos

| # | Objetivo | Como medir |
|---|---|---|
| O1 | Consolidar todas as planilhas de turma numa base única e deduplicada | Reimportar a mesma planilha não altera nada; mesmo CPF em turmas diferentes vira uma pessoa com várias candidaturas |
| O2 | Dar um CRM de candidatos com busca, filtros, ficha e histórico | Encontrar um candidato por nome ou CPF em menos de 3 s |
| O3 | Medir a performance por agência, representante, turma e mês | Dashboard responde aos filtros em menos de 1 s com a base de demonstração |
| O4 | Deixar o significado dos status e as fórmulas nas mãos do negócio | Nenhuma regra fixa no código: classificações, fórmulas e padrão da planilha editáveis pela interface |
| O5 | Proteger dados pessoais (LGPD) | CPF nunca em claro no banco; acesso por perfil; auditoria das ações |
| O6 | Rodar sem depender da TI corporativa | Deploy de um único serviço + banco, com custo zero para validação |

### Fora do escopo (nesta versão)

- Contato com candidatos (e-mail, WhatsApp), agenda de entrevistas, workflow de aprovação.
- Edição manual de dados da candidatura (a fonte de verdade é a planilha; a equipe só adiciona observações internas).
- SSO corporativo (Entra ID) e integração automática com SharePoint/OneDrive/Outlook: ficam como evolução (seção 11), mas o modelo já deve prever.
- Funil de etapas: **retirado a pedido do negócio**. A análise usa só a classificação de cada status.

## 3. Princípios de produto

1. **Não inventar regra de negócio.** O sistema nunca presume o significado de um status. Todo status começa "não classificado" e só o administrador classifica. "Pagamento Confirmado" **não** é contratação por padrão.
2. **Valor bruto e valor interpretado lado a lado.** Guardar sempre o que veio da planilha (`*_raw`) separado da interpretação (catálogos/`*_norm`). A linha original inteira fica preservada.
3. **Importar é idempotente.** Mesma planilha duas vezes = nada muda. Planilha atualizada = só as diferenças, com histórico.
4. **Configuração pela interface, não por código**: padrão de colunas, nomes de campos, classificações, cores, fórmulas.
5. **Permissão checada no backend.** O frontend só esconde o que o perfil não acessa.
6. **Nada de dados reais no repositório.** Testes e demonstração usam um gerador de planilhas fictícias.
7. **Interface em português simples**, sem caixa alta em rótulos, cor nunca carregando significado sozinha (sempre com rótulo/legenda; paleta validada para daltonismo).

## 4. Usuários e perfis

| Perfil | Quem é | Acesso |
|---|---|---|
| **Administrador** (`admin`) | Responsável pelo programa de recrutamento | Tudo: Candidatos, Performance, Importação (inclusive "Apagar dados") e o menu Administração. Vê CPF completo. |
| **Operacional** (`operational`) | Equipe que recebe e sobe as planilhas, acompanha candidatos | Candidatos, Performance e Importação completos (envia, reprocessa e exclui planilhas), exporta e gera apresentação. **Não** acessa Administração nem "Apagar dados". |
| **Visualizador** (`viewer`) | Gestores ou parceiros com consulta pontual | Somente leitura de Candidatos, com CPF/e-mail/telefone mascarados. Sem exportação, sem Performance. |

### Matriz de permissões

Os endpoints exigem **permissões**, não perfis, para que um perfil novo possa ser criado sem mexer nas rotas.

| Permissão | admin | operational | viewer |
|---|:-:|:-:|:-:|
| `candidates.view` | ✓ | ✓ | ✓ |
| `candidates.view_sensitive` (CPF, e-mail e telefone sem máscara) | ✓ | ✓ | |
| `candidates.export` | ✓ | ✓ | |
| `candidates.notes_write` | ✓ | ✓ | |
| `performance.view` | ✓ | ✓ | |
| `imports.manage` | ✓ | ✓ | |
| `imports.reset` ("Apagar dados") | ✓ | | |
| `catalogs.manage` | ✓ | | |
| `users.manage` | ✓ | | |
| `audit.view` | ✓ | | |
| `integrations.manage` | ✓ | | |

## 5. Conceitos do domínio

| Conceito | Definição |
|---|---|
| **Agência** | Parceira que indica candidatos. Identificada pelo **Nome Agência**; a coluna "Agência" (ex.: FLO, POA 2) é guardada como código/praça. Criada automaticamente na importação. |
| **Representante (R.N)** | Quem indicou o candidato dentro da agência. Usado no ranking por representante (dentro de cada agência). |
| **Turma** | Grupo do processo seletivo, com data de prova. Vem da coluna Turma ou, sem ela, do título acima do cabeçalho. |
| **Candidato** | A pessoa. Única pelo CPF (via hash). Sem CPF válido, pelo nome normalizado (com aviso). |
| **Candidatura** | A participação de um candidato numa turma, indicada por uma agência. Chave: **CPF (ou nome) + Turma**; se a coluna ID estiver ligada no padrão, o **ID**. Uma pessoa pode ter várias. |
| **Status VGCF** | Situação da candidatura, com o nome completo vindo da planilha. Nove iniciais já cadastrados; valor novo entra na lista automaticamente, com aviso. |
| **Classificação** | O significado de um status para os indicadores (Contratado, Aprovado, Em andamento, Reprovado, Desistência, ou outra criada pelo admin). "Não classificado" é do sistema. |
| **Fórmula (indicador)** | Taxa = soma de classificações no numerador ÷ soma no denominador. Marcada "Provisória" até validação. |
| **Importação (lote)** | Um arquivo recebido, com resultado do processamento (criadas, atualizadas, sem mudança, rejeitadas) e inconsistências. |

### Status VGCF iniciais

Aguardando Pagamento · Enviado para MLPARCEIRO · Cancelado VGCF · Reprovado Entrevista · Pagamento Confirmado · Entrevista METLIFE · Solicitado Kit Ferramenta · Entrevista · Validação SUSEP.

Valores já vistos em planilhas recentes, que entram como status novos: aprovado, declinio, erro inscricao, pendente, reprovado.

### Classificações iniciais (editáveis)

| Código | Nome | Cor padrão |
|---|---|---|
| `hired` | Contratado | `#5E8F1B` |
| `approved` | Aprovado | `#0061A0` |
| `in_progress` | Em andamento | `#4FA3D9` |
| `rejected` | Reprovado | `#C2412C` |
| `withdrawn` | Desistência | `#D39A1E` |
| `unmapped` | Não classificado (sistema, não pode ser excluída) | `#AAB4C0` |

Sugestões de cor para classificações novas: `#7B5EA7`, `#2A9D8F`, `#B5578C`, `#8C6D46`, `#3F5873`, `#E07B39`.

### Fórmulas iniciais (todas provisórias) **[pendente]**

Denominador de todas: candidaturas classificadas (Em andamento + Aprovado + Reprovado + Contratado + Desistência). Amostra mínima padrão: 30.

| Código | Nome | Numerador |
|---|---|---|
| `approval_rate` | Taxa de aprovação | Aprovado + Contratado |
| `hiring_rate` | Taxa de contratação | Contratado |
| `rejection_rate` | Taxa de reprovação | Reprovado |
| `withdrawal_rate` | Taxa de desistência | Desistência |

## 6. Funcionalidades

Prioridade: **P0** = necessário para a primeira entrega utilizável; **P1** = segunda entrega; **P2** = evolução.

### 6.1 Autenticação e sessão (P0)

- Login por e-mail e senha (usuários locais). Primeiro administrador criado por linha de comando ou por variáveis `INITIAL_ADMIN_EMAIL`/`INITIAL_ADMIN_PASSWORD` no primeiro início (só se não houver usuário).
- Senha: mínimo de 10 caracteres, com letras e números; hash forte (scrypt ou argon2) com sal por senha.
- Bloqueio de 15 minutos após 5 tentativas erradas; resposta com o mesmo tempo para e-mail existente ou não.
- Sessão em cookie `httpOnly`, `SameSite=Lax`, `Secure` em produção, validade de 8 h. Trocar ou redefinir a senha encerra as outras sessões. Usuário desativado perde o acesso na requisição seguinte.
- Proteção CSRF: requisições que alteram estado exigem `X-Requested-With: XMLHttpRequest` (sem CORS habilitado).
- Menu do usuário: nome, perfil, "Alterar senha", "Sair".

**Aceite:** visualizador recebe 403 em qualquer rota fora de Candidatos; sessão some após troca de senha em outro navegador.

### 6.2 Importação de planilhas (P0)

Menu próprio **Importação** (`/importacao`), permissão `imports.manage` (admin e operacional). Ver a tela de referência em `menu-importacao/tela-operacional.png` (arquivos do projeto).

**Envio**
- Área de arrastar e soltar + botão "Escolher arquivos". Até **20 planilhas .xlsx por envio**, até **10 MB cada**.
- Processadas **uma por vez, na ordem escolhida**, em segundo plano. A tela mostra o andamento.
- Botão "Baixar planilha fictícia de teste" no padrão em vigor.

**Leitura da planilha**
- O cabeçalho é localizado pelos nomes das colunas nas **15 primeiras linhas** de qualquer aba, sem diferenciar maiúsculas, acentos e pontuação. A posição das colunas não importa; colunas a mais são preservadas no registro original da linha.
- Se houver uma linha de título acima do cabeçalho (ex.: "SAFEE T61 - Prova 21/01/26"), ela dá a turma e a data da prova quando a planilha não tiver a coluna Turma.
- Colunas e nomes aceitos seguem o **Padrão da planilha** (6.6).
- Tipos de valor: texto, identificador, CPF, data (aceita data completa ou só mês/ano, ex. "Nov/2023", gravada no dia 1º), número inteiro.

**Validação**
- Erro de estrutura (falta coluna obrigatória) → lote falha com mensagem clara.
- Linha rejeitada: sem Nome do candidato ou sem Nome Agência (campos travados como obrigatórios).
- Avisos (não rejeitam a linha): status vazio, CPF inválido (candidato identificado pelo nome), data ou número não reconhecidos, linha duplicada dentro da mesma planilha, **status VGCF novo** (um aviso por valor, e o status é criado na lista, sem classificação), planilha sem título.

**Gravação**
- Idempotência por arquivo: mesmo SHA-256 já importado com sucesso → "Já importada antes", sem processar.
- Idempotência por linha: hash da linha igual ao da última importação → "sem mudança".
- Candidatura existente com mudanças → atualiza; mudança de status vai para o **histórico de status**; mudança de outros campos vai para o **histórico campo a campo**.
- Candidato: pelo CPF (hash). Com CPF, só une a um homônimo que não tenha CPF. Sem CPF, pelo nome normalizado.
- Agências desconhecidas são criadas automaticamente.
- Planilha tratada como **snapshot**: candidatos ausentes num reenvio não são alterados **[pendente]**.
- O arquivo original fica guardado no lote para reprocessamento.

**Histórico de importações**
- Lista paginada: arquivo, recebido em, quem enviou, situação (recebido, processando, concluída, concluída com inconsistências, falhou, já importada), contagens (linhas, criadas, atualizadas, sem mudança, rejeitadas).
- Detalhe: turma e data da prova identificadas, lista de inconsistências (linha, campo, valor, mensagem, severidade).
- **Reprocessar** um lote (relê o arquivo guardado com o padrão atual).
- **Excluir planilha** (com confirmação): candidaturas que vieram só dela são apagadas (com histórico e observações); as que também vieram de outra voltam aos dados da planilha anterior mais recente, sem gerar histórico; o histórico gravado por ela é removido; candidatos e agências sem candidaturas são apagados.
- **Apagar dados** (só admin, `imports.reset`, no fim da página, confirmação digitando "APAGAR"): remove candidatos, candidaturas e importações; mantém usuários, classificações dos status, fórmulas e padrão da planilha.

**Aceite:** importar o mesmo arquivo duas vezes não altera nada; um arquivo com 3 status alterados gera exatamente 3 entradas de histórico; excluir a última planilha de uma turma restaura os dados da anterior.

### 6.3 Candidatos — CRM (P0)

Menu **Candidatos** (`/candidatos`), todos os perfis.

- **Indicadores do topo**: total de candidatos, de candidaturas e contagem por classificação.
- **Tabela** com paginação e ordenação no servidor. Colunas escolhidas pelo usuário (seletor de colunas, lembrado no navegador), incluindo os campos criados pelo admin. Os títulos das colunas seguem o "Campo no sistema" do Padrão da planilha.
- **Busca**: nome (sem acento/maiúscula), CPF completo (pelo hash), ID do cadastro, representante.
- **Filtros combinados** (os mesmos do dashboard, seção 6.5): agência, regional, representante, status, classificação, turma, período por data de cadastro, e as dimensões descritivas ligadas.
- **Filtros salvos** por usuário (nome + definição), reaplicáveis com um clique; podem ser marcados como compartilhados.
- **Ficha do candidato** (painel lateral) com quatro abas:
  - *Dados pessoais*: nome, CPF (mascarado ou completo conforme permissão), contato quando houver.
  - *Perfil profissional*: dimensões descritivas da candidatura.
  - *Processo seletivo*: agência, código, regional, representante, executivo, turma, data da prova, status VGCF (com classificação), Status ENS, Status Final, suspenso, provas, datas, campos criados pelo admin; linha original da planilha (CPF mascarado).
  - *Histórico*: linha do tempo com mudanças de status, mudanças de campos (por importação) e observações internas (autor e data). Campo para adicionar observação (`candidates.notes_write`).
  - Bloco "Outras candidaturas desta pessoa".
- **Exportação Excel** (`candidates.export`) do recorte filtrado, até 50 000 linhas, com CPF mascarado; a ação fica na auditoria.
- Estados vazios: "Nenhum candidato na base ainda" (com atalho para Importar) e "Nenhum candidato com esses filtros".

**Aceite:** filtrar, ordenar, abrir candidato e exportar, com mascaramento conforme o perfil.

### 6.4 Administração (P0)

Menu **Administração** (`/administracao`), só admin. Subpáginas:

**Usuários** — lista (nome, e-mail, perfil, situação, último acesso); criar (senha inicial informada à pessoa por canal seguro); editar nome, perfil e situação (desativar bloqueia sem apagar histórico); redefinir senha (encerra sessões).

**Status e catálogos** — três blocos:
1. *Classificações*: criar (nome + cor, com sugestões), renomear, trocar a cor, excluir. Excluir devolve os status dela a "não classificado" e a tira das fórmulas; **bloqueado** se ela for a única classificação no denominador de uma taxa. "Não classificado" não pode ser editado nem excluído. O código é estável e gerado na criação.
2. *Classificação dos status*: cada status VGCF com nome como veio, nome de exibição, abreviação (só exibição; **não** é reconhecida na importação), classificação e contagem de candidaturas. Status que chegaram pelas planilhas (fora dos nove iniciais) e não têm candidaturas podem ser excluídos, um a um ou por "Excluir status sem uso"; se voltarem numa planilha, voltam sem classificação. A classificação vale para todo o histórico.
3. *Fórmulas dos indicadores*: para cada taxa, marcar classificações do numerador e da base de cálculo (denominador), amostra mínima e marca "Provisória"/validada.

**Padrão da planilha** (6.6).

**Auditoria** — lista paginada filtrável por tipo de ação: data, usuário (e-mail no momento), ação, entidade, detalhes (sem senhas nem dados pessoais), IP. Mostra o prazo de retenção em vigor.

**Integrações** — página reservada (P2).

### 6.5 Performance — dashboard (P1)

Menu **Performance** (`/performance`), admin e operacional. Todos os blocos respondem aos **filtros globais** (os mesmos do CRM).

| Bloco | Conteúdo |
|---|---|
| Indicadores executivos | Candidaturas, candidatos, classificadas, e cada taxa configurada (valor, numerador/denominador, alerta de amostra pequena, selo "Provisória"). Tempo médio de contratação exibido como pendente **[pendente]**. |
| Resultado por classificação | Composição das candidaturas por classificação, com aviso de quantos status ainda estão sem classificação. |
| Ranking de agências | Volume por classificação ao lado das taxas, ordenável por coluna, com alerta de amostra pequena. Clicar numa agência filtra o dashboard por ela. |
| Desempenho por representante | Representante (R.N) dentro de cada agência, com busca. Clicar filtra pelo representante. |
| Distribuição por status VGCF | Contagem por status, no total ou por agência/representante. |
| Encerramentos sem sucesso | Status classificados como reprovação ou desistência, no total ou por agência. |
| Evolução mensal | Candidaturas por mês de cadastro, empilhadas por classificação, com tabela de taxas por mês. |
| Turmas | Resultado de cada turma (nome, data da prova, volume, taxas). |
| Análise de perfil | Leitura descritiva (ex.: regional, SUSEP ativa, programa) vs. resultado. Grupos com menos de 5 candidaturas não exibem taxa. Aviso: "não é usada para decidir contratações". |

**Apresentação exportável** (`/performance/apresentacao`): versão em páginas 16:9 (uma por tela) dos indicadores, com seletores de turma e mês, pronta para "Imprimir → PDF".

Implementação recomendada: **uma consulta agregada** (GROUP BY nas dimensões) alimentando todos os blocos, montados em memória.

**Aceite:** todos os blocos respondem aos filtros em menos de 1 s com a base de demonstração; trocar a classificação de um status muda os números na hora.

### 6.6 Padrão da planilha configurável (P0)

Administração > **Padrão da planilha** (`/administracao/padrao-planilha`).

- Uma linha por campo: **Campo no sistema** (editável; vira o título na tela de Candidatos, na ficha e na exportação), **Nomes da coluna na planilha** (vários aceitos, o primeiro é o principal), **Lida** (liga/desliga), **Obrigatória**.
- Campos travados ("Sempre lida"): Nome do candidato e Agência (nome).
- **Campo novo** sem código: o admin dá nome e nomes de coluna; o valor é guardado como texto, como veio, numa estrutura flexível da candidatura (chave `extra_…`). Até 30 campos novos. Aparecem no seletor de colunas, na ficha e na exportação. Retirar um campo novo pede confirmação.
- "Restaurar o padrão" volta ao padrão inicial.
- O padrão salvo vale para as próximas importações (e para reprocessamentos).
- A planilha fictícia de teste é gerada a partir do padrão em vigor.
- Limite conhecido: campo com tipo próprio (data, número) ou usado em filtro/indicador ainda exige código.

**Padrão inicial** (planilha "Base_selecao"):

| Campo (chave) | Nome no sistema | Coluna(s) aceitas | Tipo | Regra |
|---|---|---|---|---|
| `cohort_name` | Turma | Turma | identificador | Sem a coluna, vale o título |
| `cpf` | CPF | CPF Candidato, CPF | CPF | Hash + criptografado + mascarado |
| `full_name` | Nome do candidato | Candidato | texto | Obrigatória, travada |
| `sub_representative` | Representante (R.N) | R.N, RN | texto | |
| `agency` | Agência (nome) | Nome Agência | texto | Obrigatória, travada |
| `agency_branch` | Agência (código) | Agência | texto | |
| `regional` | Regional | Regional | texto | |
| `executive` | Executivo | Executivo | texto | |
| `suspended` | Suspenso | Suspenso, Suspensado, Suspepado | texto | |
| `exams_count` | Provas | Provas | inteiro | |
| `status` | Status VGCF | Status VGCF | texto | Obrigatória |
| `status_ens` | Status ENS | Status ENS | texto | Guardado como veio |
| `status_final` | Status final | Status Final | texto | Guardado como veio |
| `evaluation_date` | Data de avaliação | Data Avaliação | data | Aceita mês/ano |
| `site_registered_at` | Data de cadastro | Data Cadastro, Cadastro no site | data | Referência dos filtros de período |
| `external_record_id` | ID do cadastro | ID | identificador | **Desligado**; ligado, vira a chave da candidatura |
| `susep_active` | SUSEP ativa | SUSEP Ativa? | texto | Desligado |
| `susep_number` | Número SUSEP | Número SUSEP | identificador | Desligado |
| `relationship_program` | Programa de relacionamento | Programa Relacionamento | texto | Desligado |

### 6.7 Auditoria e retenção (P0)

- Gravar em `audit_logs` (append-only): login (sucesso, falha, bloqueio), logout, troca e redefinição de senha, criação/edição de usuário, acesso negado, exportação, importação enviada/reprocessada/excluída, apagar dados, observação interna adicionada, mudanças em classificações, status, fórmulas e padrão da planilha. Recomendado na reconstrução (o sistema atual não faz): registrar também a abertura de ficha com CPF completo.
- Retenção automática (na inicialização e a cada 24 h): acessos 90 dias, demais ações 365 dias; ajustável por `AUDIT_ACCESS_RETENTION_DAYS` e `AUDIT_RETENTION_DAYS`.

### 6.8 Modo demonstração (P0)

- Gerador de planilhas **fictícias** no padrão em vigor (nomes, CPFs válidos gerados, 23 agências fictícias, status variados).
- Comando `seed-demo` para popular 8 turmas fictícias.
- Registros de demonstração marcados (`is_demo`); com `DEMO_MODE=true`, faixa permanente no topo: "Ambiente de demonstração: todos os dados exibidos são fictícios."

## 7. Telas e navegação

```
/login
/candidatos                     todos os perfis
/performance                    admin, operacional
/performance/apresentacao       admin, operacional (sem a moldura do app, para impressão)
/importacao                     admin, operacional
/administracao                  admin
  /usuarios
  /catalogos                    Status e catálogos
  /padrao-planilha
  /auditoria
  /integracoes                  reservada
```

- **Layout**: barra lateral com logo (MetLife Recruitment CRM) e menus visíveis conforme o perfil; cabeçalho com título da página e menu do usuário (iniciais, nome, perfil). Em telas pequenas, a barra lateral vira gaveta.
- **Design system**: fonte Figtree; azul institucional `#007ABC` (ações, navegação), azul profundo `#0061A0`, verde institucional `#A4CE4E` só em marcadores positivos (texto em `#5C7D1C`); fundo `#F5F7FA`, linhas `#E3E8EF`, texto `#16283A`/`#475569`/`#6B7A8D`; raio 10 px em controles e 14 px em painéis. Componentes: Botão, Campo, Painel, Selo (badge), Alerta, Diálogo, Painel lateral com abas, Estado vazio, Esqueleto de carregamento, Faixa de métricas, gráficos.
- **Logo**: símbolo da MetLife redesenhado em SVG; trocar pelo arquivo oficial quando houver.
- Estados vazios com uma frase explicando o que fazer e um atalho (ex.: "Importar planilha").
- Título da aba do navegador: "<Página> | MetLife Recruitment CRM".

## 8. Modelo de dados

Proposta para a reconstrução, já enxuta (sem as tabelas e colunas do levantamento inicial que nunca foram usadas, como funil e motivos de perda; ver 8.3).

```
users ──< audit_logs
users ──< saved_filters
agencies ──< applications >── candidates
applications >── process_statuses >── outcome_categories (por código)
applications ──< application_status_history
applications ──< application_field_changes
applications ──< internal_notes
import_batches ──< import_rows ──> applications
import_batches ──< import_issues
import_columns          (padrão da planilha)
metric_definitions      (fórmulas)
integration_sources     (P2, sem segredos)
```

### 8.1 Tabelas

**users** — id, name, email (único), password_hash, role (`admin|operational|viewer`), is_active, password_changed_at, last_login_at, failed_login_attempts, locked_until, timestamps.

**candidates** — id, full_name, name_search (minúsculo, sem acento, indexado), cpf_hash (HMAC-SHA256, único), cpf_encrypted (Fernet/AES-GCM), cpf_masked (`***.***.*47-25`), email, phone (opcionais, futuros), first_seen_at, is_demo, timestamps.

**agencies** — id, code (único, gerado do nome), name, is_active, is_demo, notes, timestamps.

**applications** (candidatura) — id, candidate_id, agency_id, cohort_name, exam_date, external_record_id, site_registered_at (data de referência dos períodos), evaluation_date, agency_branch_raw, regional_raw, regional_norm, sub_representative_raw, sub_representative_norm, executive_raw, suspended_raw, exams_count, status_raw, status_id, status_changed_at, status_ens_raw, status_final_raw, susep_active_raw, susep_number, relationship_program_raw, custom_fields (JSON: `{extra_chave: texto}`), raw_payload (JSON, linha original com CPF mascarado), row_hash, first_import_batch_id, last_import_batch_id, is_demo, timestamps.
Índices: (agency_id, site_registered_at), (status_id, site_registered_at), (candidate_id, cohort_name), external_record_id.

**application_status_history** — id, application_id, from_status_raw, to_status_raw, from_status_id, to_status_id, changed_at, source (`import|manual|system|demo`), import_batch_id, user_id, note.

**application_field_changes** — id, application_id, import_batch_id, field, old_value, new_value, changed_at.

**internal_notes** — id, application_id, author_id, body, timestamps.

**outcome_categories** — id, code (único, estável), label, color (`#RRGGBB`), position, is_system.

**process_statuses** — id, code (único), label (nome como veio), display_label, abbreviation (só exibição), outcome (código da classificação, padrão `unmapped`), position (oficiais 1–9, demais 100), is_official (um dos nove iniciais), description, timestamps.

**metric_definitions** — id, code (único), label, description, numerator_outcomes (lista de códigos), denominator_outcomes (lista), min_sample_size (padrão 30), is_active, is_validated.

**import_columns** — id, field (único; chave de `FIELDS` ou `extra_…`), label (nome no sistema; vazio = padrão), headers (lista de nomes aceitos), is_required, is_active, position.

**import_batches** — id, source (`manual|sharepoint|onedrive|outlook|demo`), status (`received|processing|completed|completed_with_errors|failed|skipped_duplicate`), file_name, file_sha256, file_size, file_content (binário, ou caminho em storage), sheet_title, cohort_name, exam_date, received_at, started_at, finished_at, rows_total/created/updated/unchanged/rejected, error_message, triggered_by_id, reprocess_of_id, external_id, external_etag.

**import_rows** — id, batch_id, row_number, raw (JSON, CPF mascarado), row_hash, outcome (`pending|created|updated|unchanged|rejected`), application_id.

**import_issues** — id, batch_id, row_number, field, code, severity (`error|warning`), message, raw_value, details.

**saved_filters** — id, user_id, scope (`candidates|performance`), name, definition (JSON), is_shared; único (user_id, scope, name).

**audit_logs** — id, created_at, user_id, actor_email, action, entity_type, entity_id, details (JSON), ip_address, user_agent.

**integration_sources** (P2) — id, kind, name, is_enabled, config (JSON não secreto), delta_token, subscription_id, subscription_expires_at, last_sync_at, last_error.

### 8.2 Regras de dados

- CPF: normalizar (11 dígitos), validar dígitos verificadores, gerar hash com chave `CPF_HASH_KEY`, criptografar com `FIELD_ENCRYPTION_KEY`, mascarar. **Nunca** em claro em banco, log ou `raw_payload`. Perder a chave de criptografia = não ler mais os CPFs (backup seguro do `.env`).
- Classificação de uma candidatura = classificação do status dela; sem status → "não classificado".
- JSON portátil: JSON no SQLite, JSONB no PostgreSQL.
- Toda mudança de modelo com migração versionada; o CI confere se modelos e migrações batem.

### 8.3 O que não recriar

O sistema atual mantém, sem uso, tabelas e colunas do levantamento inicial, para não perder dados: `funnel_stages`, `process_statuses.funnel_stage_id`, `loss_reasons`, `loss_reason_mappings`, `status_mappings`, `value_mappings` e colunas de perfil do briefing em `applications` (escolaridade, renda, experiências, avaliação comercial, origem, segmentos). Numa base nova, **não criar**; campos que vierem a existir na planilha entram como campo novo (`custom_fields`) ou, se precisarem de tipo/filtro, como coluna própria com migração.

## 9. API (referência)

Todas em `/api`, JSON, sessão por cookie. Erros com `detail` em português.

| Método e rota | Permissão | Função |
|---|---|---|
| `POST /auth/login` · `POST /auth/logout` · `GET /auth/me` · `POST /auth/change-password` | — | Sessão |
| `GET /health` · `GET /meta` | — | Saúde, modo demo, versão |
| `GET /candidates` | candidates.view | Lista paginada (filtros + `sort`) |
| `GET /candidates/summary` | candidates.view | Totais do topo |
| `GET /candidates/options` | candidates.view | Valores para os filtros |
| `GET /candidates/export` | candidates.export | Excel do recorte |
| `GET /applications/{id}` | candidates.view | Ficha com histórico |
| `POST /applications/{id}/notes` | candidates.notes_write | Observação interna |
| `GET/POST/DELETE /saved-filters` | candidates.view | Filtros salvos |
| `GET /performance/dashboard` | performance.view | Todos os blocos do dashboard |
| `POST /imports` · `POST /imports/bulk` | imports.manage | Envio (1 ou até 20) |
| `GET /imports` · `GET /imports/{id}` | imports.manage | Histórico e detalhe |
| `POST /imports/{id}/reprocess` · `DELETE /imports/{id}` | imports.manage | Reprocessar, excluir |
| `GET /imports/sample` | imports.manage | Planilha fictícia |
| `POST /imports/reset` | imports.reset | Apagar dados |
| `GET /catalogs/fields` | usuário logado | Nomes dos campos (títulos das colunas) |
| `GET/POST/PATCH/DELETE /catalogs/outcomes` | catalogs.manage (lista pública para usuário logado) | Classificações |
| `GET/PATCH/DELETE /catalogs/statuses` · `POST /catalogs/statuses/cleanup` | catalogs.manage | Status VGCF |
| `GET/PATCH /catalogs/metrics` | catalogs.manage | Fórmulas |
| `GET/PUT/DELETE /admin/import-template` · `GET /admin/import-template/sample` | catalogs.manage | Padrão da planilha |
| `GET/POST/PATCH /admin/users` · `POST /admin/users/{id}/reset-password` | users.manage | Usuários |
| `GET /admin/audit-logs` · `GET /admin/audit-logs/retention` | audit.view | Auditoria |

Filtros globais aceitos por lista, exportação e dashboard: `search`, `agency_ids`, `regionals`, `sub_representatives`, `status_ids`, `outcomes`, `cohorts`, `programs`, `susep_active`, `date_from`, `date_to`.

## 10. Requisitos não funcionais

| Área | Requisito |
|---|---|
| Desempenho | Lista de candidatos e dashboard < 1 s com a base de demonstração; importação de planilha de 2 000 linhas < 30 s |
| Volume | ~23 planilhas/mês; dezenas de milhares de candidaturas; poucos usuários simultâneos |
| Segurança | HTTPS em produção; cabeçalhos CSP, `nosniff`, `frame-ancestors none`; respostas da API sem cache; upload limitado a .xlsx e 10 MB; segredos só em variáveis de ambiente |
| LGPD | CPF protegido (8.2); mascaramento por perfil; auditoria; retenção de candidatos e importações **[pendente]**; dados reais só em hospedagem aprovada **[pendente]** |
| Acessibilidade | Contraste AA; navegação por teclado; cor sempre com rótulo; paleta validada para daltonismo |
| Idioma | Tudo em português do Brasil: interface, mensagens de erro, documentação e commits |
| Responsivo | Usável em notebook (1280 px) e tablet; CRM legível em celular |
| Operação | Um único serviço (API + frontend compilado); banco SQLite local ou PostgreSQL; migrações aplicadas na inicialização; health check em `/api/health` |
| Qualidade | Testes automatizados de importação (idempotência, histórico, exclusão), permissões e indicadores; CI com lint, testes em SQLite e PostgreSQL e build do frontend |
| Repositório | Público: nenhuma planilha real versionada |

## 11. Integrações e evolução (P2)

- **Microsoft Graph**: SharePoint/OneDrive (pasta monitorada, delta query) e Outlook (anexos de uma caixa), detectando arquivos novos e importando automaticamente. Credenciais só no ambiente; `integration_sources` guarda o resto. Depende de app registration pela TI.
- **SSO Entra ID**: troca a autenticação sem mudar permissões (perfil continua na tabela `users`).
- **Hospedagem corporativa** (Azure) quando houver aprovação para dados reais.

## 12. Stack sugerida

A stack atual funcionou bem e é a recomendação para recomeçar, com o mesmo raciocínio da ADR 0001 (ingestão de Excel e agregações, sem depender da TI):

| Camada | Sugestão | Observação |
|---|---|---|
| Backend | Python 3.12, FastAPI, Pydantic 2, SQLAlchemy 2, Alembic | `openpyxl` para ler .xlsx; tarefas em segundo plano no próprio processo (sem fila externa) |
| Banco | PostgreSQL 16 (produção) e SQLite (desenvolvimento) | Começar já com PostgreSQL também no desenvolvimento via Docker evita diferenças de comportamento |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, TanStack Query, React Router | Gráficos com uma biblioteca leve (Recharts ou SVG próprio); `@fontsource-variable/figtree` |
| Auth | Usuários locais, scrypt/argon2, JWT em cookie httpOnly | Caminho aberto para Entra ID |
| Deploy | Docker único + PostgreSQL no Render (blueprint `render.yaml`) | Plano gratuito hiberna e o banco gratuito expira: só para validação |
| Qualidade | pytest, ruff, `tsc` + build, Playwright (E2E) | CI no GitHub Actions |

Alternativa, se a equipe for só TypeScript: Node + NestJS/Fastify + Prisma + SheetJS. Perde-se um pouco na manipulação de planilhas e agregações, ganha-se uma linguagem só.

## 13. Plano de entregas sugerido

| Fase | Escopo | Pronto quando |
|---|---|---|
| 1. Base | Estrutura, banco e migrações, login e perfis, auditoria, design system, layout, usuários | Login funciona; admin vê tudo; visualizador recebe 403 fora de Candidatos |
| 2. Importação | Padrão da planilha (padrão inicial + tela), leitura, validação, deduplicação, histórico, menu Importação (envio múltiplo, histórico, reprocessar, excluir, apagar dados), gerador fictício | Mesmo arquivo duas vezes não muda nada; exclusão restaura a planilha anterior |
| 3. CRM | Lista, busca, filtros, filtros salvos, colunas, ficha com 4 abas, observações, exportação | Filtrar, ordenar, abrir, exportar, com máscara por perfil |
| 4. Catálogos e indicadores | Classificações, classificação dos status, fórmulas, dashboard, apresentação em PDF | Dashboard < 1 s; mudar uma classificação muda os números |
| 5. Integrações | Microsoft Graph | Depende de credenciais |
| 6. Qualidade | E2E, revisão de segurança, documentação de operação | |

## 14. Regras pendentes de validação com o negócio

1. Significado de cada status VGCF (todos começam "não classificados").
2. Definição de **contratado** (pagamento confirmado ≠ contratação).
3. Fórmulas das taxas (numerador e denominador), hoje provisórias.
4. Tempo médio de contratação: de qual data até qual.
5. Motivos de insucesso: a planilha não tem a coluna; o painel usa status classificados como reprovação/desistência.
6. Chave da candidatura: CPF (ou nome) + Turma, ou ID quando ligado.
7. Homônimos sem CPF são unidos pelo nome.
8. Agências com nomes parecidos ("AVANTI" e "AVANTI CUIABA") são a mesma? Hoje: distintas.
9. Planilha é snapshot completo ou parcial? Hoje: snapshot; ausentes não mudam.
10. Significado de Programa Relacionamento e SUSEP Ativa?.
11. Status ENS e Status Final devem entrar na classificação? Hoje: só exibidos.
12. Uma agência pode ter mais de um código?
13. Retenção dos dados de candidatos e importações (LGPD).
14. Hospedagem definitiva para dados reais.
15. Campos do briefing ausentes na planilha (contato, escolaridade, renda, experiências, avaliação comercial).

---

Referências no repositório atual: `docs/adr/`, `docs/data-model.md`, `docs/pending-validations.md`, `docs/roadmap.md`, `CLAUDE.md`.
