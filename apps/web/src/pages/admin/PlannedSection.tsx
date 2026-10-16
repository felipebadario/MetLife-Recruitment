import type { LucideIcon } from "lucide-react";

import { EmptyState } from "@/components/ui/EmptyState";
import { Panel, PanelHeader } from "@/components/ui/Panel";

/** Seção administrativa cuja funcionalidade entra em uma fase seguinte do plano. */
export function PlannedSection({
  icon,
  title,
  description,
  emptyTitle,
  emptyDescription,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
}) {
  return (
    <Panel>
      <PanelHeader title={title} description={description} />
      <EmptyState icon={icon} title={emptyTitle} description={emptyDescription} />
    </Panel>
  );
}
