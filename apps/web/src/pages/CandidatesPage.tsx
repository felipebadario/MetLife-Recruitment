import { Download, Search, SlidersHorizontal, UsersRound } from "lucide-react";

import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Field";
import { MetricStrip, type Metric } from "@/components/ui/MetricStrip";
import { Panel } from "@/components/ui/Panel";

// Indicadores da seção 5.1 do briefing. Valores chegam na Fase 2.
const METRICS: Metric[] = [
  { label: "Candidatos únicos", value: null },
  { label: "Candidaturas no período", value: null },
  { label: "Em andamento", value: null },
  { label: "Aprovadas", value: null },
  { label: "Reprovadas", value: null },
  { label: "Contratações confirmadas", value: null, positive: true },
];

const COLUMNS = ["Candidato", "CPF", "Agência", "Regional", "Data de cadastro", "Status"];

export function CandidatesPage() {
  const { can } = useAuth();

  return (
    <div className="flex flex-col gap-6">
      <MetricStrip metrics={METRICS} />

      <Panel>
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <Input
              placeholder="Buscar por nome, e-mail ou CPF"
              aria-label="Buscar candidatos"
              className="pl-9"
              disabled
            />
          </div>
          <Button variant="secondary" size="md" disabled>
            <SlidersHorizontal className="size-4" aria-hidden />
            Filtros
          </Button>
          {can("candidates.export") && (
            <Button variant="secondary" size="md" className="ml-auto" disabled>
              <Download className="size-4" aria-hidden />
              Exportar Excel
            </Button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead className="bg-surface/60 text-muted">
              <tr>
                {COLUMNS.map((column) => (
                  <th key={column} scope="col" className="px-5 py-2.5 font-semibold">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
          </table>
        </div>
        <EmptyState
          icon={UsersRound}
          title="Nenhum candidato na base ainda"
          description="Os candidatos aparecem aqui depois da primeira importação de planilhas das agências. A base de demonstração será carregada na próxima etapa."
        />
      </Panel>
    </div>
  );
}
