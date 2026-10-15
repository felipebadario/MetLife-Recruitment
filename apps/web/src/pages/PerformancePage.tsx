import { BarChart3, Filter, LineChart, PieChart, Trophy, UserSearch } from "lucide-react";

import { EmptyState } from "@/components/ui/EmptyState";
import { MetricStrip, type Metric } from "@/components/ui/MetricStrip";
import { Panel, PanelHeader } from "@/components/ui/Panel";

const METRICS: Metric[] = [
  { label: "Candidaturas", value: null },
  { label: "Aprovados", value: null },
  { label: "Contratados", value: null, positive: true },
  { label: "Taxa de aprovação", value: null },
  { label: "Taxa de contratação", value: null },
  { label: "Tempo médio de contratação", value: null },
];

const SECTIONS = [
  {
    icon: Trophy,
    title: "Ranking de agências",
    description: "Volumes absolutos e taxas lado a lado, com alerta de amostra pequena.",
    wide: true,
  },
  { icon: Filter, title: "Funil de recrutamento", description: "Etapas configuráveis, a partir dos status da planilha." },
  { icon: PieChart, title: "Motivos de insucesso", description: "Por motivo, por agência e ao longo do tempo." },
  { icon: LineChart, title: "Evolução mensal", description: "Candidaturas, aprovações, contratações e desistências." },
  { icon: UserSearch, title: "Análise de perfil", description: "Leitura descritiva de perfil versus resultado." },
];

export function PerformancePage() {
  return (
    <div className="flex flex-col gap-6">
      <MetricStrip metrics={METRICS} />
      <div className="grid gap-6 lg:grid-cols-2">
        {SECTIONS.map(({ icon, title, description, wide }) => (
          <Panel key={title} className={wide ? "lg:col-span-2" : undefined}>
            <PanelHeader title={title} description={description} />
            <EmptyState
              icon={icon ?? BarChart3}
              title="Sem dados para exibir"
              description="Este painel é preenchido quando houver candidaturas na base."
              className="py-10"
            />
          </Panel>
        ))}
      </div>
    </div>
  );
}
