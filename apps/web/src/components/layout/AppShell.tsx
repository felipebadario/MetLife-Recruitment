import { useQuery } from "@tanstack/react-query";
import { FlaskConical, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Outlet, useLocation, useMatches } from "react-router";

import { api } from "@/lib/api";
import { PREVIEW } from "@/lib/preview";
import type { AppMeta } from "@/lib/types";

import { Sidebar } from "./Sidebar";
import { UserMenu } from "./UserMenu";

export interface RouteHandle {
  title?: string;
}

function usePageTitle(): string {
  const matches = useMatches();
  for (let i = matches.length - 1; i >= 0; i--) {
    const title = (matches[i].handle as RouteHandle | undefined)?.title;
    if (title) return title;
  }
  return "";
}

function DemoBanner() {
  return (
    <div className="flex items-center justify-center gap-2 bg-brand-900 px-4 py-1.5 text-center text-xs font-medium text-brand-50">
      <FlaskConical className="size-3.5 shrink-0 text-green-500" aria-hidden />
      {PREVIEW
        ? "Pré-visualização sem servidor: dados fictícios, guardados apenas neste navegador."
        : "Ambiente de demonstração: todos os dados exibidos são fictícios."}
    </div>
  );
}

export function AppShell() {
  const title = usePageTitle();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const meta = useQuery({
    queryKey: ["meta"],
    queryFn: () => api.get<AppMeta>("/api/meta"),
    staleTime: Infinity,
  });

  useEffect(() => setMobileNavOpen(false), [location.pathname]);
  useEffect(() => {
    document.title = title ? `${title} | MetLife Recruitment CRM` : "MetLife Recruitment CRM";
  }, [title]);

  return (
    <div className="flex min-h-dvh flex-col">
      {meta.data?.demo_mode && <DemoBanner />}
      <div className="flex flex-1">
        <div className="sticky top-0 hidden h-dvh lg:block">
          <Sidebar />
        </div>

        {mobileNavOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button
              className="absolute inset-0 animate-fade-in bg-ink/30"
              aria-label="Fechar menu"
              onClick={() => setMobileNavOpen(false)}
            />
            <div className="relative h-full w-64 animate-fade-in">
              <Sidebar onNavigate={() => setMobileNavOpen(false)} />
              <button
                className="absolute top-4 -right-11 rounded-md bg-white p-1.5 text-ink shadow"
                aria-label="Fechar menu"
                onClick={() => setMobileNavOpen(false)}
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-white/90 px-4 backdrop-blur sm:px-6">
            <button
              className="-ml-1 rounded-md p-1.5 text-body hover:bg-surface lg:hidden"
              aria-label="Abrir menu"
              onClick={() => setMobileNavOpen(true)}
            >
              <Menu className="size-5" />
            </button>
            <h1 className="truncate text-lg font-semibold">{title}</h1>
            <div className="ml-auto">
              <UserMenu />
            </div>
          </header>
          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-[1440px]">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
