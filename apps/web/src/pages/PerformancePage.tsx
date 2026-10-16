import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { BarChart3, FileSpreadsheet, Presentation, Search, X } from "lucide-react";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router";

import { CompositionBar, HorizontalBars, OutcomeLegend, StackedColumns } from "@/components/charts/charts";
import { FilterBar } from "@/components/filters/FilterBar";
import {
  RankingTable,
  agencyRows,
  monthLabel,
  outcomeBars,
  representativeRows,
  statusBars,
} from "@/components/performance/indicators";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Field";
import { MetricStrip, type Metric } from "@/components/ui/MetricStrip";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Skeleton } from "@/components/ui/Skeleton";
import { api, ApiError, withQuery } from "@/lib/api";
import { filtersToQuery, useFilters } from "@/lib/filters";
import { OUTCOME_COLORS, OUTCOME_LABELS, formatRate } from "@/lib/outcomes";
import type { Dashboard, FilterOptions, GroupStats } from "@/lib/types";
import type { Filters } from "@/lib/filters";
import { cn, formatDate, formatNumber } from "@/lib/utils";

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

const PAGE_ROWS = 15;

function AgencySelect({
  data,
  value,
  onChange,
  label = "Agência",
}: {
  data: Dashboard;
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  return (
    <Select aria-label={label} className="h-9 w-full max-w-xs text-[13px]" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Todas as agências</option>
      {data.agencies.map((a) => (
        <option key={a.agency_id} value={a.agency_id}>
          {a.name}
        </option>
      ))}
    </Select>
  );
}

function RepresentativePanel({ data, onSelect }: { data: Dashboard; onSelect: (patch: Partial<Filters>) => void }) {
  const [agencyId, setAgencyId] = useState("");
  const [term, setTerm] = useState("");
  const [showAll, setShowAll] = useState(false);
  const all = representativeRows(data, agencyId ? Number(agencyId) : null).filter(
    (r) => !term || r.name.toLowerCase().includes(term.toLowerCase()),
  );
  const rows = showAll ? all : all.slice(0, PAGE_ROWS);

  return (
    <Panel>
      <PanelHeader
        title="Desempenho por representante"
        description="Resultado de cada sub-representante dentro da sua agência. Clique em uma linha para ver o dashboard só daquele representante."
        actions={<OutcomeLegend />}
      />
      <div className="flex flex-wrap items-center gap-2 px-5 pt-4">
        <AgencySelect data={data} value={agencyId} onChange={setAgencyId} />
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Buscar representante"
            aria-label="Buscar representante"
            className="h-9 pl-9 text-[13px]"
          />
        </div>
        <span className="text-[13px] text-muted">{all.length === 1 ? "1 representante" : `${formatNumber(all.length)} representantes`}</span>
      </div>
      <div className="mt-3">
        <RankingTable
          rows={rows}
          firstLabel="Representante"
          showAgency
          minSample={data.min_sample_size}
          onSelect={(r) => onSelect({ sub_representative: [r.name], agency_id: [String(r.key.split(":")[0])] })}
          selectLabel={(r) => `Ver o dashboard de ${r.name}`}
        />
      </div>
      {all.length > PAGE_ROWS && (
        <div className="border-t border-line px-5 py-2.5">
          <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Mostrar menos" : `Mostrar todos (${formatNumber(all.length)})`}
          </Button>
        </div>
      )}
    </Panel>
  );
}

/** Resultado por classificação e por status, no total ou de uma agência específica. */
function ScopedBreakdown({ data, onClassify }: { data: Dashboard; onClassify: () => void }) {
  const [agencyId, setAgencyId] = useState("");
  const agency = data.agencies.find((a) => String(a.agency_id) === agencyId);
  const byOutcome = agency ? agency.by_outcome : data.totals.by_outcome;
  const total = agency ? agency.total : data.totals.applications;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-medium text-ink">Ver resultado de:</span>
        <AgencySelect data={data} value={agencyId} onChange={setAgencyId} label="Agência dos gráficos de resultado" />
        {agency && <span className="text-[13px] text-muted">{formatNumber(agency.total)} candidaturas</span>}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Resultado por classificação"
            description={agency ? `Candidaturas da agência ${agency.name} por classificação.` : "Candidaturas de todas as agências por classificação."}
          />
          <div className="p-5">
            <HorizontalBars total={total} rows={outcomeBars(byOutcome)} />
            {byOutcome.unmapped > 0 && (
              <p className="mt-3 text-xs text-muted">
                Há status sem classificação.{" "}
                <button type="button" className="font-medium text-brand-600 hover:underline" onClick={onClassify}>
                  Classificar status
                </button>
              </p>
            )}
          </div>
        </Panel>
        <Panel>
          <PanelHeader
            title="Distribuição por status VGCF"
            description={agency ? `Status das candidaturas da agência ${agency.name}.` : "Status como vieram da planilha, com a classificação de cada um."}
          />
          <div className="p-5">
            <HorizontalBars total={total} rows={statusBars(data, { agencyId: agency?.agency_id })} />
          </div>
        </Panel>
      </div>
    </div>
  );
}

export function PerformancePage() {
  const navigate = useNavigate();
  const location = useLocation();
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
        <FilterBar
          filters={filters}
          options={options.data}
          onChange={setFilters}
          onClear={clear}
          actions={
            <Button size="sm" onClick={() => navigate(`/performance/apresentacao${location.search}`)} disabled={!data || empty}>
              <Presentation className="size-4" aria-hidden />
              Exportar apresentação
            </Button>
          }
        />
      </Panel>

      {(filters.agency_id.length === 1 || filters.sub_representative.length === 1) && (
        <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-panel)] border border-brand-200 bg-brand-50 px-5 py-3 text-[13px] text-brand-800">
          <span>
            Visão individual:{" "}
            <strong>
              {[
                filters.agency_id.length === 1 &&
                  (options.data?.agencies.find((a) => String(a.id) === filters.agency_id[0])?.name ?? "agência"),
                filters.sub_representative.length === 1 && filters.sub_representative[0],
              ]
                .filter(Boolean)
                .join(" · ")}
            </strong>
            . Todos os indicadores abaixo consideram só este recorte.
          </span>
          <Button
            variant="secondary"
            size="sm"
            className="ml-auto"
            onClick={() => setFilters({ agency_id: [], sub_representative: [] })}
          >
            <X className="size-3.5" aria-hidden />
            Voltar à visão geral
          </Button>
        </div>
      )}

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
              description="Volume por classificação ao lado das taxas, para não comparar agências só pelo tamanho. Clique no título de uma coluna para ordenar, ou em uma agência para ver só ela."
              actions={<OutcomeLegend />}
            />
            <RankingTable
              rows={agencyRows(data)}
              firstLabel="Agência"
              minSample={data.min_sample_size}
              onSelect={(r) => setFilters({ agency_id: [r.key], sub_representative: [] })}
              selectLabel={(r) => `Ver o dashboard da agência ${r.name}`}
            />
          </Panel>

          <ScopedBreakdown data={data} onClassify={() => navigate("/administracao/catalogos")} />

          <RepresentativePanel data={data} onSelect={setFilters} />

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
