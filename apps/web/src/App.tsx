import { Cable, FileSpreadsheet, ListChecks } from "lucide-react";
import { Navigate, Outlet, createBrowserRouter, createHashRouter, type RouteObject } from "react-router";

import { AuthProvider, useAuth } from "@/auth/AuthProvider";
import { FullScreenLoader, RequireAuth, RequirePermission } from "@/auth/guards";
import { AppShell, type RouteHandle } from "@/components/layout/AppShell";
import { PREVIEW } from "@/lib/preview";
import { CandidatesPage } from "@/pages/CandidatesPage";
import { NotFoundPage } from "@/pages/ForbiddenPage";
import { LoginPage } from "@/pages/LoginPage";
import { PerformancePage } from "@/pages/PerformancePage";
import { AdminLayout } from "@/pages/admin/AdminLayout";
import { AuditPage } from "@/pages/admin/AuditPage";
import { PlannedSection } from "@/pages/admin/PlannedSection";
import { UsersPage } from "@/pages/admin/UsersPage";

function Root() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

/** Página inicial de acordo com o perfil. */
function HomeRedirect() {
  const { can, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  return <Navigate to={can("performance.view") ? "/performance" : "/candidatos"} replace />;
}

const handle = (title: string): RouteHandle => ({ title });

const routes: RouteObject[] = [
  {
    element: <Root />,
    children: [
      { path: "/login", element: <LoginPage /> },
      {
        element: (
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        ),
        children: [
          { index: true, element: <HomeRedirect /> },
          {
            path: "candidatos",
            handle: handle("Candidatos"),
            element: (
              <RequirePermission permission="candidates.view">
                <CandidatesPage />
              </RequirePermission>
            ),
          },
          {
            path: "performance",
            handle: handle("Performance"),
            element: (
              <RequirePermission permission="performance.view">
                <PerformancePage />
              </RequirePermission>
            ),
          },
          {
            path: "administracao",
            handle: handle("Administração"),
            element: (
              <RequirePermission permission="users.manage">
                <AdminLayout />
              </RequirePermission>
            ),
            children: [
              { index: true, element: <Navigate to="usuarios" replace /> },
              { path: "usuarios", element: <UsersPage /> },
              { path: "auditoria", element: <AuditPage /> },
              {
                path: "importacoes",
                element: (
                  <PlannedSection
                    icon={FileSpreadsheet}
                    title="Importações"
                    description="Upload das planilhas mensais e histórico de cada arquivo processado."
                    emptyTitle="Nenhuma planilha importada"
                    emptyDescription="O envio de planilhas XLSX fica disponível quando o modelo original da planilha for validado."
                  />
                ),
              },
              {
                path: "catalogos",
                element: (
                  <PlannedSection
                    icon={ListChecks}
                    title="Status e catálogos"
                    description="Como os valores da planilha são traduzidos em status, etapas do funil e motivos de insucesso."
                    emptyTitle="Nenhum status configurado"
                    emptyDescription="Os status oficiais dependem da planilha original. Até lá, nenhum status é inventado pelo sistema."
                  />
                ),
              },
              {
                path: "integracoes",
                element: (
                  <PlannedSection
                    icon={Cable}
                    title="Integrações"
                    description="Recebimento automático de planilhas pelo SharePoint, OneDrive ou Outlook."
                    emptyTitle="Nenhuma integração conectada"
                    emptyDescription="A conexão com o Microsoft 365 é configurada quando houver credenciais autorizadas."
                  />
                ),
              },
            ],
          },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
];

// A pré-visualização é servida em um endereço fixo; as rotas ficam no fragmento (#/...).
export const router = (PREVIEW ? createHashRouter : createBrowserRouter)(routes);
