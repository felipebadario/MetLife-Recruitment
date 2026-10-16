import { Cable } from "lucide-react";
import { Navigate, Outlet, createBrowserRouter, createHashRouter, type RouteObject } from "react-router";

import { AuthProvider, useAuth } from "@/auth/AuthProvider";
import { FullScreenLoader, RequireAuth, RequirePermission } from "@/auth/guards";
import { AppShell, type RouteHandle } from "@/components/layout/AppShell";
import { PREVIEW } from "@/lib/preview";
import { CandidatesPage } from "@/pages/CandidatesPage";
import { ImportsPage } from "@/pages/ImportsPage";
import { NotFoundPage } from "@/pages/ForbiddenPage";
import { LoginPage } from "@/pages/LoginPage";
import { PerformancePage } from "@/pages/PerformancePage";
import { PresentationPage } from "@/pages/PresentationPage";
import { AdminLayout } from "@/pages/admin/AdminLayout";
import { AuditPage } from "@/pages/admin/AuditPage";
import { CatalogsPage } from "@/pages/admin/CatalogsPage";
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
        // Apresentação para exportar em PDF: tela cheia, sem o menu lateral.
        path: "/performance/apresentacao",
        element: (
          <RequireAuth>
            <RequirePermission permission="performance.view">
              <PresentationPage />
            </RequirePermission>
          </RequireAuth>
        ),
      },
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
            path: "importacao",
            handle: handle("Importação"),
            element: (
              <RequirePermission permission="imports.manage">
                <ImportsPage />
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
              // Endereço antigo da importação, que agora tem menu próprio.
              { path: "importacoes", element: <Navigate to="/importacao" replace /> },
              { path: "catalogos", element: <CatalogsPage /> },
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
