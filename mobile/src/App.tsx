import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { TabBar } from './components/TabBar';
import { getStoredUser } from './lib/api';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ContactsPage } from './pages/ContactsPage';
import { ContactDetailPage } from './pages/ContactDetailPage';
import { PipelinePage } from './pages/PipelinePage';
import { CallsPage } from './pages/CallsPage';
import { DealsPage } from './pages/DealsPage';
import { ReferralsPage } from './pages/ReferralsPage';
import { ImportPage } from './pages/ImportPage';
import { UsersPage } from './pages/UsersPage';
import { MorePage } from './pages/MorePage';

function initTheme() {
  const saved = localStorage.getItem('crm_mobile_theme');
  const dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark', dark);
}
initTheme();

function RequireAuth() {
  const token = localStorage.getItem('crm_token');
  if (!token) return <Navigate to="/login" replace />;
  return (
    <>
      <Outlet />
      <TabBar />
    </>
  );
}

function RequireAdmin() {
  const user = getStoredUser();
  if (!localStorage.getItem('crm_token')) return <Navigate to="/login" replace />;
  if (user?.role !== 'admin') return <Navigate to="/" replace />;
  return (
    <>
      <Outlet />
      <TabBar />
    </>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/contacts" element={<ContactsPage />} />
          <Route path="/contacts/:id" element={<ContactDetailPage />} />
          <Route path="/pipeline" element={<PipelinePage />} />
          <Route path="/calls" element={<CallsPage />} />
          <Route path="/deals" element={<DealsPage />} />
          <Route path="/referrals" element={<ReferralsPage />} />
          <Route path="/more" element={<MorePage />} />
        </Route>
        <Route element={<RequireAdmin />}>
          <Route path="/import" element={<ImportPage />} />
          <Route path="/users" element={<UsersPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
