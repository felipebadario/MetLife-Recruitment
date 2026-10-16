import { NavLink } from "react-router";

import { useAuth } from "@/auth/AuthProvider";
import { cn } from "@/lib/utils";

import { BrandMark } from "./BrandMark";
import { NAV_ITEMS } from "./navigation";

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { can } = useAuth();
  const items = NAV_ITEMS.filter((item) => can(item.permission));

  return (
    <aside className="flex h-full w-64 flex-col border-r border-line bg-white">
      <div className="flex h-16 items-center px-5">
        <BrandMark />
      </div>
      <nav aria-label="Navegação principal" className="flex-1 px-3 pt-4">
        <ul className="flex flex-col gap-1">
          {items.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    "group relative flex h-10 items-center gap-3 rounded-[var(--radius-control)] px-3 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-brand-50 text-brand-600"
                      : "text-body hover:bg-surface hover:text-ink",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cn(
                        "absolute top-2 bottom-2 -left-3 w-1 rounded-r-full bg-brand-500 transition-opacity",
                        isActive ? "opacity-100" : "opacity-0",
                      )}
                      aria-hidden
                    />
                    <Icon
                      className={cn("size-[18px]", isActive ? "text-brand-500" : "text-muted group-hover:text-body")}
                      aria-hidden
                    />
                    {label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <p className="px-5 py-4 text-xs text-muted">Uso interno da equipe de recrutamento</p>
    </aside>
  );
}
