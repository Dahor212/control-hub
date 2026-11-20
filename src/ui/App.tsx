import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import { AppProvider, useApp } from './AppContext';
import { ToastProvider } from './components/Toast';
import { AppShell } from './layout/AppShell';
import { EmptyState } from './components/ui';
import { can, type Capability } from '../domain/permissions';
import { DashboardPage } from './pages/DashboardPage';
import { MyControlsPage } from './pages/MyControlsPage';
import { RegisterPage } from './pages/RegisterPage';
import { ControlDetailPage } from './pages/ControlDetailPage';
import { RunDetailPage } from './pages/RunDetailPage';
import { RunsListPage } from './pages/RunsListPage';
import { FindingsPage } from './pages/FindingsPage';
import { CalendarPage } from './pages/CalendarPage';
import { ManagementPage } from './pages/ManagementPage';
import { ReportsPage } from './pages/ReportsPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { AdminPage } from './pages/AdminPage';

function Guard({ caps, children }: { caps: Capability[]; children: JSX.Element }) {
  const { session } = useApp();
  if (!caps.some((c) => can(session, c)))
    return (
      <div className="mx-auto mt-16 max-w-lg">
        <EmptyState icon={ShieldOff} title="K této části nemáte oprávnění" description="Aktivní role tuto obrazovku nezpřístupňuje. V produkčním řešení je přístup vynucen oprávněními SharePointu, nikoli jen skrytím v aplikaci." />
      </div>
    );
  return children;
}

export function App() {
  return (
    <ToastProvider>
      <AppProvider>
        <HashRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<DashboardPage />} />
              <Route path="my" element={<MyControlsPage />} />
              <Route path="controls" element={<RegisterPage />} />
              <Route path="controls/:controlId" element={<ControlDetailPage />} />
              <Route path="runs" element={<RunsListPage />} />
              <Route path="runs/:runId" element={<RunDetailPage />} />
              <Route path="findings" element={<FindingsPage />} />
              <Route path="calendar" element={<CalendarPage />} />
              <Route path="management" element={<Guard caps={['viewManagement']}><ManagementPage /></Guard>} />
              <Route path="reports" element={<Guard caps={['viewReports']}><ReportsPage /></Guard>} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="admin" element={<Guard caps={['administer', 'viewAudit']}><AdminPage /></Guard>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </HashRouter>
      </AppProvider>
    </ToastProvider>
  );
}
