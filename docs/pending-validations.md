# Regras pendentes de validação

O sistema **não inventa** regras de negócio. Cada item abaixo está modelado de forma configurável e aguarda definição da área de negócio. Atualizado após o recebimento do modelo real da planilha (turma "SAFEE T61 - Prova 21/01/26").

| # | Pendência | Onde impacta | Como está hoje |
|---|---|---|---|
| 1 | **Significado de cada status VGCF**: Aguardando Pagamento, Enviado para MLPARCEIRO, Cancelado VGCF, Reprovado Entrevista, Pagamento Confirmado, Entrevista METLIFE, Solicitado Kit Ferramenta, Entrevista, Validação SUSEP | Todos os indicadores | A **lista** de status é oficial (a planilha traz o nome completo) e já vem cadastrada. O **significado** de cada um começa "não classificado"; o administrador classifica em Administração > Status e catálogos (aprovado, reprovado, contratado, desistência, em andamento). Nada é presumido — inclusive "Pagamento Confirmado" não é tratado como contratação automaticamente. Status fora da lista entra com aviso na importação |
| 2 | Definição de **contratado** (pagamento confirmado ≠ contratação, conforme o briefing) | Indicadores | Depende da classificação do item 1 |
| 3 | ~~Etapas do funil~~ | — | Retirado a pedido da área de negócio: a análise usa só a classificação de cada status |
| 4 | **Fórmulas das taxas** (numerador e denominador) | Indicadores | Provisório: classificações relevantes sobre o total de candidaturas classificadas. Editável e marcado "Provisória" até validação |
| 5 | **Tempo médio de contratação** (de qual data até qual) | Indicador executivo | Não calculado; exibido como pendente |
| 6 | **Motivos de insucesso**: a planilha não tem essa coluna | Gráfico de insucesso | O painel usa os status classificados como reprovação/desistência |
| 7 | **Chave da candidatura**: o "ID" da planilha é único e estável entre reenvios? | Deduplicação | A candidatura é localizada pelo ID; reenvio da mesma turma atualiza em vez de duplicar |
| 8 | **Identificação do candidato** sem CPF | Deduplicação de pessoas | Pelo nome normalizado (sem acentos, maiúsculas ou espaços extras). Homônimos seriam unidos — pendente decidir se a planilha passará a trazer CPF ou outro identificador |
| 9 | **Agências**: "AVANTI" e "AVANTI CUIABA" (e casos similares) são a mesma agência? | Ranking | Tratadas como agências distintas, criadas automaticamente na importação |
| 10 | A planilha de cada turma é **snapshot completo** (todos os candidatos com status atual) ou parcial? | Histórico | Tratada como snapshot: cada reenvio atualiza status e registra a mudança no histórico. Candidatos ausentes em um reenvio não são alterados |
| 11 | Significado de **Programa Relacionamento** (Integral, Básico) e **SUSEP Ativa?** no processo | Análise de perfil | Usados apenas como dimensões descritivas |
| 12 | Linhas com **dados faltando** | Importação | ID, Agência e Nome obrigatórios (linha rejeitada sem eles); status vazio e data inválida geram aviso |
| 13 | **Política de retenção** dos dados pessoais (LGPD) | Banco, backups | Auditoria definida: acessos 90 dias, demais ações 365 dias, com limpeza automática (ajustável por variável de ambiente). Candidatos e importações: a definir |
| 14 | **Hospedagem definitiva**: o Render (EUA, plano gratuito) serve para validação; dados reais em produção dependem de aprovação | Infraestrutura | Ver ADR 0003 |
| 15 | Campos do briefing ausentes no modelo (CPF, contato, escolaridade, renda, experiências, avaliação comercial) | CRM, análise de perfil | Estrutura do banco pronta para recebê-los; telas mostram apenas o que a planilha traz |
