# ADR 0003 — Modelo real da planilha e hospedagem no Render

- **Data:** 2026-10-15
- **Status:** Aceita

## Contexto

O modelo real da planilha ("SAFEE T61 - Prova 21/01/26") difere do levantamento inicial do briefing:

- é **uma planilha por turma** (título com turma e data da prova), com candidatos de **várias agências**;
- tem **10 colunas**: ID, Cadastro no site, Agência, Regional, Sub Representante, Nome Potencial Parceiro, SUSEP Ativa?, Número SUSEP, Programa Relacionamento, Status VGCF;
- não traz CPF, contato, escolaridade, experiências nem motivo de insucesso;
- o status vem com o nome completo da lista oficial VGCF (ver `app/importing/vgcf.py`). A primeira transcrição da planilha, feita a partir de fotos, trazia abreviações (PAGA, AGUA...); elas não são reconhecidas. O administrador pode registrar uma abreviação de exibição no catálogo.

O produto também precisa de uma URL para validação, sem envolver a TI corporativa.

## Decisões

**Importação**
- Cabeçalho localizado pelos nomes das colunas (sem diferenciar acentos, maiúsculas e pontuação) nas 15 primeiras linhas de qualquer aba; o título acima dele dá a turma e a data da prova.
- Candidatura identificada pelo **ID** da planilha; candidato pelo **nome normalizado** (não há CPF).
- Agências e status desconhecidos são criados automaticamente. Status entram como **não classificados**; o administrador classifica cada status uma vez, e a classificação vale para todo o histórico.
- Idempotência: arquivo idêntico não é reprocessado (SHA-256); linha sem mudança não gera alteração (hash da linha). O arquivo original fica guardado no lote para reprocessamento.
- Processamento em segundo plano no próprio processo (sem fila externa), adequado ao volume.

**Indicadores**
- Fórmulas configuráveis por categoria de resultado, semeadas como provisórias.
- Ranking mostra volumes absolutos, taxas e alerta de amostra pequena.
- Análise de perfil usa só as dimensões disponíveis (SUSEP ativa, programa, regional) e oculta taxas de grupos com menos de 5 candidaturas.
- Dashboard servido por uma única consulta agregada (GROUP BY nas dimensões).

**Hospedagem (Render)**
- Blueprint `render.yaml`: serviço web Docker + PostgreSQL gerenciado, plano gratuito.
- SQLite não serve no Render gratuito (disco apagado a cada deploy/reinício); por isso PostgreSQL.
- Segredos gerados pelo Render; o primeiro administrador vem de `INITIAL_ADMIN_EMAIL`/`INITIAL_ADMIN_PASSWORD` (o plano gratuito não tem terminal).
- CI roda a suíte também contra PostgreSQL.

## Consequências e riscos

- **Plano gratuito do Render**: o serviço hiberna após inatividade (primeiro acesso demora ~1 minuto) e o PostgreSQL gratuito expira após um período definido pelo Render. Para uso contínuo, migrar para plano pago ou infraestrutura aprovada.
- **Dados pessoais fora da infraestrutura corporativa**: o Render fica nos EUA. Para validação, preferir a planilha fictícia; carregar a planilha real é decisão do responsável pelos dados (LGPD).
- **Repositório público**: nenhuma planilha real é versionada; testes e demonstração usam apenas dados gerados.
