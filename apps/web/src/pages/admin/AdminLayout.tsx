import { NavLink, Outlet } from "react-router";

import { cn } from "@/lib/utils";

const TABS = [
  { to: "usuarios", label: "Usuários" },
  { to: "catalogos", label: "Status e catálogos" },
  { to: "integracoes", label: "Integrações" },
  { to: "auditoria", label: "Auditoria" },
];

export function AdminLayout() {
  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Seções da administração" className="-mx-1 overflow-x-auto">
        <ul className="flex min-w-max gap-1 border-b border-line px-1">
          {TABS.map((tab) => (
            <li key={tab.to}>
              <NavLink
                to={tab.to}
                className={({ isActive }) =>
                  cn(
                    "-mb-px flex h-10 items-center border-b-2 px-3 text-sm font-medium transition-colors",
                    isActive
                      ? "border-brand-500 text-brand-600"
                      : "border-transparent text-muted hover:text-ink",
                  )
                }
              >
                {tab.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <Outlet />
    </div>
  );
}
