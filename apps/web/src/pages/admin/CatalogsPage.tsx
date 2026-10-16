import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ListChecks, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Field";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { Skeleton } from "@/components/ui/Skeleton";
import { api, ApiError } from "@/lib/api";
import { OUTCOME_COLORS, OUTCOME_LABELS, OUTCOME_ORDER } from "@/lib/outcomes";
import type { CatalogStatus, FunnelStage, MetricDefinition, Outcome } from "@/lib/types";
import { formatNumber } from "@/lib/utils";

const CLASSIFIABLE: Outcome[] = OUTCOME_ORDER.filter((o) => o !== "unmapped");

function useRefreshAll() {
  const queryClient = useQueryClient();
  return () => {
    for (const key of ["catalog", "dashboard", "candidates", "candidates-summary", "candidate-options"]) {
      void queryClient.invalidateQueries({ queryKey: [key] });
    }
  };
}

function errorText(error: unknown) {
  return error instanceof ApiError ? error.message : "Não foi possível salvar.";
}

function StatusRow({ status, stages }: { status: CatalogStatus; stages: FunnelStage[] }) {
  const refresh = useRefreshAll();
  const [label, setLabel] = useState(status.label);
  const update = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/api/admin/statuses/${status.id}`, body),
    onSuccess: refresh,
  });

  return (
    <tr className="align-top">
      <td className="px-5 py-3">
        <p className="font-semibold text-ink">{status.raw_values.join(", ") || status.code}</p>
        <p className="tabular text-xs text-muted">{formatNumber(status.applications)} candidaturas</p>
      </td>
      <td className="px-5 py-3">
        <Input
          aria-label={`Nome de exibição de ${status.code}`}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => label.trim() && label !== status.label && update.mutate({ label })}
          className="h-9 min-w-40 text-[13px]"
        />
      </td>
      <td className="px-5 py-3">
        <div className="flex items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: OUTCOME_COLORS[status.outcome] }} aria-hidden />
          <Select
            aria-label={`Classificação de ${status.code}`}
            value={status.outcome}
            onChange={(e) => update.mutate({ outcome: e.target.value })}
            className="h-9 min-w-44 text-[13px]"
          >
            {status.outcome === "unmapped" && <option value="unmapped">Escolha a classificação…</option>}
            {CLASSIFIABLE.map((o) => (
              <option key={o} value={o}>
                {OUTCOME_LABELS[o]}
              </option>
            ))}
          </Select>
        </div>
      </td>
      <td className="px-5 py-3">
        <Select
          aria-label={`Etapa do funil de ${status.code}`}
          value={status.funnel_stage_id ?? ""}
          onChange={(e) =>
            update.mutate(e.target.value ? { funnel_stage_id: Number(e.target.value) } : { clear_funnel_stage: true })
          }
          className="h-9 min-w-44 text-[13px]"
        >
          <option value="">Fora do funil</option>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
        {update.error && <p className="mt-1 text-xs text-danger-600">{errorText(update.error)}</p>}
      </td>
    </tr>
  );
}

function StagesEditor({ stages }: { stages: FunnelStage[] }) {
  const refresh = useRefreshAll();
  const [label, setLabel] = useState("");
  const create = useMutation({
    mutationFn: () => api.post("/api/admin/funnel-stages", { label }),
    onSuccess: () => {
      setLabel("");
      refresh();
    },
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      api.patch(`/api/admin/funnel-stages/${id}`, body),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/api/admin/funnel-stages/${id}`),
    onSuccess: refresh,
  });

  function move(index: number, direction: -1 | 1) {
    const other = stages[index + direction];
    const current = stages[index];
    if (!other) return;
    update.mutate({ id: current.id, body: { position: other.position } });
    update.mutate({ id: other.id, body: { position: current.position } });
  }

  return (
    <Panel>
      <PanelHeader
        title="Etapas do funil"
        description="Ordem em que as candidaturas avançam. Cada status acima pode ser associado a uma etapa."
      />
      <ol className="divide-y divide-line">
        {stages.map((stage, index) => (
          <li key={stage.id} className="flex items-center gap-3 px-5 py-2.5">
            <span className="tabular w-6 text-[13px] text-muted">{index + 1}.</span>
            <Input
              aria-label={`Nome da etapa ${index + 1}`}
              defaultValue={stage.label}
              onBlur={(e) => e.target.value.trim() && e.target.value !== stage.label && update.mutate({ id: stage.id, body: { label: e.target.value } })}
              className="h-9 max-w-xs text-[13px]"
            />
            {stage.is_provisional && <Badge tone="warning">Ilustrativa</Badge>}
            <div className="ml-auto flex gap-1">
              <Button variant="ghost" size="sm" aria-label="Mover para cima" disabled={index === 0} onClick={() => move(index, -1)}>
                <ArrowUp className="size-4" />
              </Button>
              <Button variant="ghost" size="sm" aria-label="Mover para baixo" disabled={index === stages.length - 1} onClick={() => move(index, 1)}>
                <ArrowDown className="size-4" />
              </Button>
              <Button variant="ghost" size="sm" aria-label={`Excluir etapa ${stage.label}`} onClick={() => remove.mutate(stage.id)}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          </li>
        ))}
      </ol>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (label.trim()) create.mutate();
        }}
        className="flex items-center gap-2 border-t border-line px-5 py-3"
      >
        <Input
          aria-label="Nova etapa"
          placeholder="Nome da nova etapa"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="h-9 max-w-xs text-[13px]"
        />
        <Button size="sm" type="submit" loading={create.isPending} disabled={!label.trim()}>
          <Plus className="size-4" aria-hidden />
          Adicionar etapa
        </Button>
      </form>
      {(create.error || update.error || remove.error) && (
        <div className="px-5 pb-4">
          <Alert>{errorText(create.error ?? update.error ?? remove.error)}</Alert>
        </div>
      )}
    </Panel>
  );
}

function OutcomeChecks({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Outcome[];
  onChange: (next: Outcome[]) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-xs font-semibold text-muted">{label}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {CLASSIFIABLE.map((o) => (
          <label key={o} className="flex items-center gap-1.5 text-[13px] text-ink">
            <input
              type="checkbox"
              className="size-4 accent-brand-500"
              checked={value.includes(o)}
              onChange={(e) => onChange(e.target.checked ? [...value, o] : value.filter((v) => v !== o))}
            />
            {OUTCOME_LABELS[o]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function MetricEditor({ metric }: { metric: MetricDefinition }) {
  const refresh = useRefreshAll();
  const [num, setNum] = useState(metric.numerator_outcomes);
  const [den, setDen] = useState(metric.denominator_outcomes);
  const [min, setMin] = useState(String(metric.min_sample_size));
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/api/admin/metrics/${metric.code}`, body),
    onSuccess: refresh,
  });
  const dirty =
    JSON.stringify([...num].sort()) !== JSON.stringify([...metric.numerator_outcomes].sort()) ||
    JSON.stringify([...den].sort()) !== JSON.stringify([...metric.denominator_outcomes].sort()) ||
    Number(min) !== metric.min_sample_size;

  return (
    <li className="flex flex-col gap-3 px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">{metric.label}</h3>
        {metric.is_validated ? <Badge tone="positive">Validada</Badge> : <Badge tone="warning">Provisória</Badge>}
      </div>
      <OutcomeChecks label="Conta no numerador" value={num} onChange={setNum} />
      <OutcomeChecks label="Base de cálculo (denominador)" value={den} onChange={setDen} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
          Amostra mínima
          <Input type="number" min={1} value={min} onChange={(e) => setMin(e.target.value)} className="h-9 w-28 text-[13px]" />
        </label>
        <Button
          size="sm"
          variant="secondary"
          disabled={!dirty || den.length === 0}
          loading={save.isPending}
          onClick={() => save.mutate({ numerator_outcomes: num, denominator_outcomes: den, min_sample_size: Number(min) })}
        >
          Salvar fórmula
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => save.mutate({ is_validated: !metric.is_validated })}
        >
          {metric.is_validated ? "Marcar como provisória" : "Marcar como validada"}
        </Button>
      </div>
      {save.error && <Alert>{errorText(save.error)}</Alert>}
    </li>
  );
}

export function CatalogsPage() {
  const statuses = useQuery({
    queryKey: ["catalog", "statuses"],
    queryFn: () => api.get<CatalogStatus[]>("/api/admin/statuses"),
  });
  const stages = useQuery({
    queryKey: ["catalog", "stages"],
    queryFn: () => api.get<FunnelStage[]>("/api/admin/funnel-stages"),
  });
  const metrics = useQuery({
    queryKey: ["catalog", "metrics"],
    queryFn: () => api.get<MetricDefinition[]>("/api/admin/metrics"),
  });
  const unmapped = statuses.data?.filter((s) => s.outcome === "unmapped").length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <Panel>
        <PanelHeader
          title="Classificação dos status"
          description="Cada código que vem da planilha precisa de uma classificação para entrar nas taxas. O sistema não presume o significado dos códigos."
        />
        {unmapped > 0 && (
          <div className="px-5 pt-4">
            <Alert tone="info">
              {unmapped === 1 ? "1 status aguarda classificação." : `${unmapped} status aguardam classificação.`} As
              alterações valem na hora para todo o histórico.
            </Alert>
          </div>
        )}
        {statuses.isPending || stages.isPending ? (
          <div className="flex flex-col gap-2.5 p-5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : statuses.isError ? (
          <div className="p-5">
            <Alert>{errorText(statuses.error)}</Alert>
          </div>
        ) : statuses.data.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="Nenhum status recebido ainda"
            description="Os status aparecem aqui automaticamente na primeira importação de planilha."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-[13px]">
              <thead className="bg-surface/60 text-muted">
                <tr>
                  <th className="px-5 py-2.5 font-semibold">Código na planilha</th>
                  <th className="px-5 py-2.5 font-semibold">Nome de exibição</th>
                  <th className="px-5 py-2.5 font-semibold">Classificação</th>
                  <th className="px-5 py-2.5 font-semibold">Etapa do funil</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {statuses.data.map((status) => (
                  <StatusRow key={status.id} status={status} stages={stages.data ?? []} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        {stages.data && <StagesEditor stages={stages.data} />}
        <Panel>
          <PanelHeader
            title="Fórmulas dos indicadores"
            description="Quais classificações entram em cada taxa. Ficam marcadas como provisórias até a validação da área de negócio."
          />
          {metrics.data ? (
            <ul className="divide-y divide-line">
              {metrics.data.map((m) => (
                <MetricEditor key={`${m.code}-${m.numerator_outcomes.join()}-${m.denominator_outcomes.join()}-${m.min_sample_size}`} metric={m} />
              ))}
            </ul>
          ) : (
            <Skeleton className="m-5 h-40" />
          )}
        </Panel>
      </div>
    </div>
  );
}
