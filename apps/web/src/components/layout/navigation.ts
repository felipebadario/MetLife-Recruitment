import { BarChart3, Settings2, UsersRound, type LucideIcon } from "lucide-react";

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
    to: "/administracao",
    label: "Administração",
    description: "Usuários, importações e configurações",
    icon: Settings2,
    permission: "users.manage",
  },
];
