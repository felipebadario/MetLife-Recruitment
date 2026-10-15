# Regras pendentes de validação

O sistema **não inventa** regras de negócio que dependem da planilha original. Cada item abaixo está modelado de forma configurável e aguarda definição da área de negócio.

| # | Pendência | Onde impacta | Como está hoje |
|---|---|---|---|
| 1 | Definição de **contratado** (pagamento confirmado ≠ contratação) | Indicadores, funil | Categoria `hired` existe; nenhum status mapeado para ela |
| 2 | Quais status significam **aprovado**, **reprovado**, **desistente** e **em andamento** | Indicadores, ranking | Tabela `process_statuses` + `status_mappings`; valor sem mapeamento fica `unmapped` |
| 3 | Etapas reais do **funil** | Funil | Tabela `funnel_stages` com flag `is_provisional` |
| 4 | Lista oficial de **motivos de insucesso** | Gráficos de insucesso | Tabelas `loss_reasons` + `loss_reason_mappings` |
| 5 | Fórmula do **tempo médio de contratação** (de qual data até qual) | Indicador executivo | Não calculado |
| 6 | A planilha mensal é **snapshot completo** ou **só novidades do mês**? | Importação, histórico | A definir antes da Fase 4 |
| 7 | **Chave de unicidade** da candidatura (o "ID do registro" é estável entre meses?) | Deduplicação | Índice em (agência, ID do registro), sem restrição de unicidade |
| 8 | Como **identificar a agência** de cada arquivo (nome do arquivo, pasta, célula, remetente) | Importação | A definir |
| 9 | **Regional** e **sub-representante** são atributos da agência ou da candidatura? | Modelo, filtros | Guardados na candidatura (valor bruto + normalizado) |
| 10 | Significado de **programa de relacionamento**, **origem do cadastro**, **avaliação comercial** e **processo pausado** | Perfil do candidato | Guardados como texto bruto, sem interpretação |
| 11 | Tratamento de linhas **sem CPF** ou com **CPF inválido** | Deduplicação | A definir (rejeitar ou fila de revisão) |
| 12 | Denominador de cada **taxa** (aprovação, contratação, reprovação, desistência) | Indicadores | Tabela `metric_definitions` com flag `is_validated` |
| 13 | **Política de retenção** dos dados pessoais (LGPD) | Banco, backups | A definir |
| 14 | Dicionário de dados definitivo (colunas da planilha) | Modelo, importação | Campos da seção 5.3 do briefing; colunas extras preservadas em `raw_payload` |
| 15 | Identidade visual: imagem institucional de referência não foi recebida | Design system | Paleta da seção 3.1 do briefing |
