import { BarChart3, FileUp, Settings2, UsersRound, type LucideIcon } from "lucide-react";

import type { Permission } from "@/lib/types";

export interface NavItem {
  to: string;
  label: string;
  description: string;
  icon: LucideIcon;
  permission: Permission;
}

export const NAV_ITEMS: NavItem[] = [
  {
    to: "/candidatos",
    label: "Candidatos",
    description: "Candidatos e candidaturas das agências",
    icon: UsersRound,
    permission: "candidates.view",
  },
  {
    to: "/performance",
    label: "Performance",
    description: "Indicadores e comparação entre agências",
    icon: BarChart3,
    permission: "performance.view",
  },
  {
    to: "/importacao",
    label: "Importação",
    description: "Envio das planilhas de turma e histórico de importações",
    icon: FileUp,
    permission: "imports.manage",
  },
  {
    to: "/administracao",
    label: "Administração",
    description: "Usuários, status, integrações e auditoria",
    icon: Settings2,
    permission: "users.manage",
  },
];
