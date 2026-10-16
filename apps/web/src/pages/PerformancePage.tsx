import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, BarChart3, FileSpreadsheet, ListChecks } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";

import { CompositionBar, FunnelChart, HorizontalBars, OutcomeLegend, StackedColumns } from "@/components/charts/charts";
import { FilterBar } from "@/components/filters/FilterBar";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Field";
import { MetricStrip, type Metric } from "@/components/ui/MetricStrip";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Skeleton } from "@/components/ui/Skeleton";
import { api, ApiError, withQuery } from "@/lib/api";
import { filtersToQuery, useFilters } from "@/lib/filters";
import { OUTCOME_COLORS, OUTCOME_LABELS, formatRate } from "@/lib/outcomes";
import type { Dashboard, FilterOptions, GroupStats } from "@/lib/types";
import { cn, formatDate, formatNumber } from "@/lib/utils";

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function monthLabel(period: string): string {
  const [year, month] = period.split("-");
  return `${MONTHS[Number(month) - 1]}/${year.slice(2)}`;
}

function SampleTag({ base, min }: { base: number; min: number }) {
  return (
    <span
      className="ml-1.5 rounded-full bg-warning-50 px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap text-warning-700"
      title={`Taxa calculada sobre ${base} candidaturas classificadas (menos de ${min}). Interprete com cautela.`}
    >
      amostra pequena
    </span>
  );
}

type RankKey = "name" | "total" | "approved" | "rejected" | "hired" | "withdrawn" | "approval_rate" | "hiring_rate" | "withdrawal_rate";

function rankValue(row: Dashboard["agencies"][number], key: RankKey): number | string {
  switch (key) {
    case "name":
      return row.name;
    case "total":
      return row.total;
    case "approved":
    case "rejected":
    case "hired":
    case "withdrawn":
      return row.by_outcome[key];
    default:
      return row.rates[key] ?? -1;
  }
}

function AgencyRanking({ data }: { data: Dashboard }) {
  const [sort, setSort] = useState<{ key: RankKey; desc: boolean }>({ key: "total", desc: true });
  const rows = useMemo(() => {
    const sorted = [...data.agencies].sort((a, b) => {
      const va = rankValue(a, sort.key);
      const vb = rankValue(b, sort.key);
      const cmp = typeof va === "string" ? va.localeCompare(String(vb)) : va - (vb as number);
      return sort.desc ? -cmp : cmp;
    });
    return sorted;
  }, [data.agencies, sort]);

  const columns: { key: RankKey; label: string; rate?: boolean }[] = [
    { key: "name", label: "Agência" },
    { key: "total", label: "Candidaturas" },
    { key: "approved", label: "Aprovados" },
    { key: "rejected", label: "Reprovados" },
    { key: "hired", label: "Contratados" },
    { key: "withdrawn", label: "Desistências" },
    { key: "approval_rate", label: "Taxa de aprovação", rate: true },
    { key: "hiring_rate", label: "Taxa de contratação", rate: true },
    { key: "withdrawal_rate", label: "Taxa de desistência", rate: true },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[920px] text-left text-[13px]">
        <thead className="bg-surface/60 text-muted">
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cn("px-3 py-2.5 font-semibold whitespace-nowrap", c.key !== "name" && "text-right")}>
                <button
                  className="inline-flex items-center gap-1 hover:text-ink"
                  onClick={() => setSort((s) => ({ key: c.key, desc: s.key === c.key ? !s.desc : c.key !== "name" }))}
                >
                  {c.label}
                  {sort.key === c.key && (sort.desc ? <ArrowDown className="size-3.5 text-brand-500" /> : <ArrowUp className="size-3.5 text-brand-500" />)}
                </button>
              </th>
            ))}
            <th scope="col" className="w-40 px-3 py-2.5 font-semibold">
              Composição
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={row.agency_id} className="hover:bg-surface/50">
              <td className="px-3 py-2.5 font-semibold text-ink">{row.name}</td>
              <td className="tabular px-3 py-2.5 text-right">{formatNumber(row.total)}</td>
              <td className="tabular px-3 py-2.5 text-right">{formatNumber(row.by_outcome.approved)}</td>
              <td className="tabular px-3 py-2.5 text-right">{formatNumber(row.by_outcome.rejected)}</td>
              <td className="tabular px-3 py-2.5 text-right">{formatNumber(row.by_outcome.hired)}</td>
              <td className="tabular px-3 py-2.5 text-right">{formatNumber(row.by_outcome.withdrawn)}</td>
              {(["approval_rate", "hiring_rate", "withdrawal_rate"] as const).map((code, i) => (
                <td key={code} className="tabular px-3 py-2.5 text-right whitespace-nowrap text-ink">
                  {formatRate(row.rates[code])}
                  {i === 0 && row.low_sample && row.rate_base > 0 && <SampleTag base={row.rate_base} min={data.min_sample_size} />}
                </td>
              ))}
              <td className="px-3 py-2.5">
                <CompositionBar byOutcome={row.by_outcome} label={row.name} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupTable({
  groups,
  firstLabel,
  minGroup,
  compact = false,
}: {
  groups: (GroupStats & { value?: string; name?: string; exam_date?: string | null; suppressed?: boolean })[];
  firstLabel: string;
  minGroup?: number;
  compact?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full text-left text-[13px]", !compact && "min-w-[560px]")}>
        <thead className="bg-surface/60 text-muted">
          <tr>
            <th className="px-4 py-2 font-semibold">{firstLabel}</th>
            <th className="px-4 py-2 text-right font-semibold">Candidaturas</th>
            <th className="px-4 py-2 text-right font-semibold">Aprovação</th>
            <th className="px-4 py-2 text-right font-semibold">Contratação</th>
            {!compact && <th className="w-28 px-4 py-2 font-semibold">Composição</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {groups.map((g) => {
            const label = g.name ?? g.value ?? "—";
            return (
              <tr key={label}>
                <td className="px-4 py-2.5 text-ink">
                  <span className="block font-medium">{label}</span>
                  {g.exam_date && <span className="block text-xs text-muted">Prova em {formatDate(g.exam_date)}</span>}
                </td>
                <td className="tabular px-4 py-2.5 text-right">{formatNumber(g.total)}</td>
                {g.suppressed ? (
                  <td colSpan={2} className="px-4 py-2.5 text-right text-xs text-muted">
                    Menos de {minGroup} candidaturas: taxa não exibida
                  </td>
                ) : (
                  <>
                    <td className="tabular px-4 py-2.5 text-right">{formatRate(g.rates.approval_rate)}</td>
                    <td className="tabular px-4 py-2.5 text-right">{formatRate(g.rates.hiring_rate)}</td>
                  </>
                )}
                {!compact && (
                  <td className="px-4 py-2.5">
                    <CompositionBar byOutcome={g.by_outcome} label={label} />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LossBreakdown({ data }: { data: Dashboard }) {
  const [agencyId, setAgencyId] = useState("");
  const lossStatuses = data.statuses.filter((s) => s.outcome === "rejected" || s.outcome === "withdrawn");
  const counts = new Map<number | null, number>();
  for (const row of data.agency_status) {
    if (agencyId && String(row.agency_id) !== agencyId) continue;
    counts.set(row.status_id, (counts.get(row.status_id) ?? 0) + row.count);
  }
  const rows = lossStatuses
    .map((s) => ({
      key: String(s.status_id),
      label: (
        <>
          {s.label} <span className="text-muted">({OUTCOME_LABELS[s.outcome]})</span>
        </>
      ),
      value: counts.get(s.status_id) ?? 0,
      color: OUTCOME_COLORS[s.outcome],
    }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);

  return (
    <div className="flex flex-col gap-4">
      <Select
        aria-label="Agência"
        className="h-9 w-full max-w-xs text-[13px]"
        value={agencyId}
        onChange={(e) => setAgencyId(e.target.value)}
      >
        <option value="">Todas as agências</option>
        {data.agencies.map((a) => (
          <option key={a.agency_id} value={a.agency_id}>
            {a.name}
          </option>
        ))}
      </Select>
      <HorizontalBars
        rows={rows}
        emptyText={
          lossStatuses.length === 0
            ? "Nenhum status está classificado como reprovado ou desistência."
            : "Nenhum encerramento sem sucesso neste recorte."
        }
      />
      <p className="text-xs text-muted">
        A planilha atual não tem coluna de motivo de insucesso; o recorte usa os status classificados como reprovação ou
        desistência.
      </p>
    </div>
  );
}

export function PerformancePage() {
  const navigate = useNavigate();
  const { filters, setFilters, clear } = useFilters();
  const query = filtersToQuery({ ...filters, search: "" });
  const key = JSON.stringify(query);

  const options = useQuery({
    queryKey: ["candidate-options"],
    queryFn: () => api.get<FilterOptions>("/api/candidates/options"),
  });
  const dashboard = useQuery({
    queryKey: ["dashboard", key],
    queryFn: () => api.get<Dashboard>(withQuery("/api/performance/dashboard", query)),
    placeholderData: keepPreviousData,
  });
  const data = dashboard.data;
  const metric = (code: string) => data?.metrics.find((m) => m.code === code);

  const rateMetric = (code: string, label: string): Metric => {
    const m = metric(code);
    return {
      label,
      value: m?.value ?? null,
      format: formatRate,
      caption: m
        ? m.denominator === 0
          ? "Sem candidaturas classificadas"
          : m.low_sample
            ? `Base de ${m.denominator}: amostra pequena`
            : `${formatNumber(m.numerator)} de ${formatNumber(m.denominator)}`
        : undefined,
      captionTone: m?.low_sample && m.denominator > 0 ? "warning" : "muted",
    };
  };

  if (dashboard.isError) {
    return <Alert>{dashboard.error instanceof ApiError ? dashboard.error.message : "Não foi possível carregar o dashboard."}</Alert>;
  }

  const empty = data && data.totals.applications === 0;
  const anyRuleUnvalidated = data?.metrics.some((m) => !m.is_validated);

  return (
    <div className="flex flex-col gap-6">
      <Panel className="px-5 py-4">
        <FilterBar filters={filters} options={options.data} onChange={setFilters} onClear={clear} />
      </Panel>

      <MetricStrip
        loading={dashboard.isPending}
        metrics={[
          { label: "Candidaturas", value: data?.totals.applications ?? null, caption: data ? `${formatNumber(data.totals.candidates)} candidatos únicos` : undefined },
          { label: "Aprovados", value: data ? data.totals.by_outcome.approved : null },
          { label: "Contratados", value: data ? data.totals.by_outcome.hired : null, positive: true },
          rateMetric("approval_rate", "Taxa de aprovação"),
          rateMetric("hiring_rate", "Taxa de contratação"),
          rateMetric("rejection_rate", "Taxa de reprovação"),
        ]}
      />

      {data && !empty && (
        <div className="flex flex-col gap-3">
          {data.unmapped_statuses.length > 0 && (
            <Alert tone="info">
              {data.unmapped_statuses.length === 1 ? "1 status ainda não está classificado" : `${data.unmapped_statuses.length} status ainda não estão classificados`}{" "}
              ({data.unmapped_statuses.map((s) => s.label).join(", ")}), somando {formatNumber(data.totals.by_outcome.unmapped)} candidaturas fora das
              taxas.{" "}
              <button className="font-semibold underline" onClick={() => navigate("/administracao/catalogos")}>
                Classificar status
              </button>
            </Alert>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              rateMetric("withdrawal_rate", "Taxa de desistência"),
              { label: "Em andamento", value: data.totals.by_outcome.in_progress, caption: "Candidaturas ainda em processo" },
              { label: "Tempo médio de contratação", value: data.time_to_hire_days, caption: "Regra de cálculo pendente de definição" },
            ].map((m) => (
              <div key={m.label} className="rounded-[var(--radius-panel)] border border-line bg-white px-5 py-3.5">
                <p className="text-[13px] text-muted">{m.label}</p>
                <p className="tabular mt-1 text-xl font-semibold text-ink">
                  {m.value == null ? "—" : "format" in m && m.format ? m.format(m.value) : formatNumber(m.value)}
                </p>
                {m.caption && <p className="mt-0.5 text-xs text-muted">{m.caption}</p>}
              </div>
            ))}
          </div>
          {anyRuleUnvalidated && (
            <p className="text-xs text-muted">
              As fórmulas das taxas são provisórias até a validação da área de negócio. Elas podem ser ajustadas em
              Administração, em Status e catálogos.
            </p>
          )}
        </div>
      )}

      {dashboard.isPending ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64 w-full rounded-[var(--radius-panel)]" />
          ))}
        </div>
      ) : empty ? (
        <Panel>
          <EmptyState
            icon={FileSpreadsheet}
            title="Nenhuma candidatura neste recorte"
            description="Importe a planilha de uma turma ou ajuste os filtros para ver os indicadores."
            action={<Button onClick={() => navigate("/administracao/importacoes")}>Importar planilha</Button>}
          />
        </Panel>
      ) : data ? (
        <div className={cn("flex flex-col gap-6 transition-opacity", dashboard.isFetching && "opacity-70")}>
          <Panel>
            <PanelHeader
              title="Ranking de agências"
              description="Volumes absolutos ao lado das taxas, para não comparar agências só pelo tamanho. Clique no título de uma coluna para ordenar."
              actions={<OutcomeLegend />}
            />
            <AgencyRanking data={data} />
          </Panel>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel>
              <PanelHeader
                title="Funil de recrutamento"
                description="Candidaturas que chegaram a cada etapa, com a conversão sobre a etapa anterior."
              />
              <div className="p-5">
                {data.funnel_configured ? (
                  <FunnelChart steps={data.funnel.map((f) => ({ label: f.label, count: f.count }))} />
                ) : (
                  <EmptyState
                    icon={ListChecks}
                    className="py-6"
                    title="Etapas ainda não associadas aos status"
                    description="Associe cada status a uma etapa do funil em Administração para montar este gráfico."
                    action={
                      <Button variant="secondary" size="sm" onClick={() => navigate("/administracao/catalogos")}>
                        Configurar etapas
                      </Button>
                    }
                  />
                )}
              </div>
            </Panel>

            <Panel>
              <PanelHeader title="Distribuição por status" description="Status como vieram da planilha, com a classificação de cada um." />
              <div className="p-5">
                <HorizontalBars
                  total={data.totals.applications}
                  rows={data.statuses.map((s) => ({
                    key: String(s.status_id),
                    label: (
                      <>
                        {s.label} <span className="text-muted">({OUTCOME_LABELS[s.outcome]})</span>
                      </>
                    ),
                    value: s.count,
                    color: OUTCOME_COLORS[s.outcome],
                  }))}
                />
              </div>
            </Panel>
          </div>

          <Panel>
            <PanelHeader
              title="Evolução mensal"
              description="Candidaturas por mês de cadastro no site, separadas pelo resultado atual. Passe o mouse para ver os números."
              actions={<OutcomeLegend />}
            />
            <div className="p-5">
              <StackedColumns
                periods={data.timeline.map((t) => ({ key: t.period, label: monthLabel(t.period), byOutcome: t.by_outcome }))}
              />
            </div>
            {data.timeline.length > 0 && (
              <details className="border-t border-line px-5 py-3 text-[13px]">
                <summary className="cursor-pointer font-medium text-ink">Ver tabela com taxas por mês</summary>
                <div className="mt-3">
                  <GroupTable
                    firstLabel="Mês"
                    groups={data.timeline.map((t) => ({ ...t, name: monthLabel(t.period) }))}
                  />
                </div>
              </details>
            )}
          </Panel>

          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <Panel>
              <PanelHeader title="Encerramentos sem sucesso" description="Status de reprovação e desistência, no total ou por agência." />
              <div className="p-5">
                <LossBreakdown data={data} />
              </div>
            </Panel>
            <Panel>
              <PanelHeader title="Turmas" description="Resultado de cada turma importada." />
              <GroupTable firstLabel="Turma" groups={data.cohorts} />
            </Panel>
          </div>

          <Panel>
            <PanelHeader
              title="Análise de perfil"
              description="Leitura descritiva de características da planilha versus resultado. Não é usada para decidir contratações."
            />
            <div className="grid gap-6 p-5 2xl:grid-cols-3">
              {data.profile.map((dimension) => (
                <div key={dimension.key} className="min-w-0">
                  <h3 className="mb-2 text-sm font-semibold">{dimension.label}</h3>
                  <div className="rounded-[var(--radius-control)] border border-line">
                    <GroupTable firstLabel={dimension.label} groups={dimension.groups} minGroup={data.profile_min_group} />
                  </div>
                </div>
              ))}
            </div>
            <p className="px-5 pb-5 text-xs text-muted">
              Grupos com menos de {data.profile_min_group} candidaturas não têm taxas exibidas. Escolaridade, faixa de renda
              e experiência não constam do modelo atual da planilha.
            </p>
          </Panel>
        </div>
      ) : (
        <Panel>
          <EmptyState icon={BarChart3} title="Carregando indicadores" />
        </Panel>
      )}
      {data && (
        <Badge tone="neutral" className="self-start">
          {formatNumber(data.totals.classified)} de {formatNumber(data.totals.applications)} candidaturas classificadas
        </Badge>
      )}
    </div>
  );
}
