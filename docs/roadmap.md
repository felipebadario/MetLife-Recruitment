# Plano de fases

Cada fase termina com uma entrega revisável e aguarda validação antes da próxima.

| Fase | Escopo | Situação |
|---|---|---|
| **1. Foundation** | Estrutura do projeto, banco e migrações, autenticação e perfis, auditoria, design system, layout principal, gestão de usuários | ✅ Concluída |
| **2. CRM** | Base de demonstração (23 agências fictícias), indicadores do topo, data grid com paginação no servidor, busca, filtros combinados e salvos, seleção de colunas, painel lateral do candidato (4 abas), histórico, exportação Excel controlada | ✅ Concluída |
| **3. Business Intelligence** | Indicadores executivos com fórmulas configuráveis, ranking de agências (volume + taxa + alerta de amostra pequena), ~~funil configurável~~ (retirado: só classificação), encerramentos sem sucesso, evolução mensal, turmas, análise de perfil descritiva, filtros globais | ✅ Concluída |
| **4. Importação** | Upload XLSX no modelo da turma, validação de estrutura e dados, classificação de status por catálogo, deduplicação, histórico, controle de importações e reprocessamento idempotente | ✅ Concluída |
| **5. Integrações** | Microsoft Graph: SharePoint/OneDrive/Outlook, detecção de arquivos novos, processamento automático | Depende de credenciais |
| **6. Qualidade** | Testes ampliados (incl. E2E), revisão de segurança, otimização, documentação de operação, preparação de deploy | |

## Critérios de pronto por fase

- **Fase 1:** login funcionando; admin vê as três áreas; viewer vê apenas Candidatos e recebe 403 nas demais rotas da API; testes automatizados passando.
- **Fase 2:** filtrar, ordenar, abrir candidato e exportar, com mascaramento conforme o perfil.
- **Fase 3:** todos os componentes respondem aos filtros globais em menos de 1 s com a base de demonstração.
- **Fase 4:** importar o mesmo arquivo duas vezes não altera nada; um arquivo alterado gera histórico correto.
