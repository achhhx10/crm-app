import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { LoginPage } from './pages/LoginPage';
import { ToastProvider } from './components/ui/toast';
import { ErrorBoundary } from './components/ErrorBoundary';

const PAGE_CHUNK_RELOAD_KEY = 'crm_page_chunk_reload';
const PAGE_CHUNK_RELOAD_TTL = 30_000;

function lazyRetry(
  load: () => Promise<{ default: React.ComponentType<any> }>,
): React.LazyExoticComponent<React.ComponentType<any>> {
  return React.lazy(async () => {
    try {
      return await load();
    } catch {
      await new Promise(resolve => setTimeout(resolve, 1000));
      try {
        return await load();
      } catch (secondError) {
        const stamped = Number(sessionStorage.getItem(PAGE_CHUNK_RELOAD_KEY) || 0);
        if (!stamped || Date.now() - stamped > PAGE_CHUNK_RELOAD_TTL) {
          sessionStorage.setItem(PAGE_CHUNK_RELOAD_KEY, String(Date.now()));
          window.location.reload();
          await new Promise(() => {});
        }
        throw secondError;
      }
    }
  });
}

const DashboardPage = lazyRetry(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const PipelinePage = lazyRetry(() => import('./pages/PipelinePage').then(m => ({ default: m.PipelinePage })));
const ContactsPage = lazyRetry(() => import('./pages/ContactsPage').then(m => ({ default: m.ContactsPage })));
const PhoningPage = lazyRetry(() => import('./pages/PhoningPage').then(m => ({ default: m.PhoningPage })));
const ContactDetailPage = lazyRetry(() => import('./pages/ContactDetailPage').then(m => ({ default: m.ContactDetailPage })));
const CallsPage = lazyRetry(() => import('./pages/CallsPage').then(m => ({ default: m.CallsPage })));
const FollowUpsPage = lazyRetry(() => import('./pages/FollowUpsPage').then(m => ({ default: m.FollowUpsPage })));
const DealsPage = lazyRetry(() => import('./pages/DealsPage').then(m => ({ default: m.DealsPage })));
const ReferralsPage = lazyRetry(() => import('./pages/ReferralsPage').then(m => ({ default: m.ReferralsPage })));
const ImportPage = lazyRetry(() => import('./pages/ImportPage').then(m => ({ default: m.ImportPage })));
const UsersPage = lazyRetry(() => import('./pages/UsersPage').then(m => ({ default: m.UsersPage })));
const SettingsPage = lazyRetry(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));

const loadingFallback = (
  <div className="flex items-center justify-center h-64">
    <div className="animate-pulse text-muted-foreground">Chargement...</div>
  </div>
);

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('crm_token');
  if (!token) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const user = JSON.parse(localStorage.getItem('crm_user') || '{}');
  if (user.role !== 'admin') return <Navigate to="/" replace />;
  return <PrivateRoute>{children}</PrivateRoute>;
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <ErrorBoundary>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/"
              element={
                <PrivateRoute>
                  <Suspense fallback={loadingFallback}>
                    <DashboardPage />
                  </Suspense>
                </PrivateRoute>
              }
            />
            <Route
              path="/pipeline"
              element={
                <PrivateRoute>
                  <Suspense fallback={loadingFallback}>
                    <PipelinePage />
                  </Suspense>
                </PrivateRoute>
              }
            />
            <Route
              path="/contacts"
              element={
                <PrivateRoute>
                  <Suspense fallback={loadingFallback}>
                    <ContactsPage />
                  </Suspense>
                </PrivateRoute>
              }
            />
            <Route
              path="/phoning"
              element={
                <PrivateRoute>
                  <Suspense fallback={loadingFallback}>
                    <PhoningPage />
                  </Suspense>
                </PrivateRoute>
              }
            />
            <Route
              path="/contacts/:id"
              element={
                <PrivateRoute>
                  <Suspense fallback={loadingFallback}>
                    <ContactDetailPage />
                  </Suspense>
                </PrivateRoute>
              }
            />
            <Route
              path="/deals"
              element={
                <PrivateRoute>
                  <Suspense fallback={loadingFallback}>
                    <DealsPage />
                  </Suspense>
                </PrivateRoute>
              }
            />
            <Route
              path="/calls"
              element={
                <PrivateRoute>
                  <Suspense fallback={loadingFallback}>
                    <CallsPage />
                  </Suspense>
                </PrivateRoute>
              }
            />
            <Route
              path="/followups"
              element={
                <PrivateRoute>
                  <Suspense fallback={loadingFallback}>
                    <FollowUpsPage />
                  </Suspense>
                </PrivateRoute>
              }
            />
            <Route
              path="/referrals"
              element={
                <PrivateRoute>
                  <Suspense fallback={loadingFallback}>
                    <ReferralsPage />
                  </Suspense>
                </PrivateRoute>
              }
            />
            <Route
              path="/import"
              element={
                <AdminRoute>
                  <Suspense fallback={loadingFallback}>
                    <ImportPage />
                  </Suspense>
                </AdminRoute>
              }
            />
            <Route
              path="/users"
              element={
                <AdminRoute>
                  <Suspense fallback={loadingFallback}>
                    <UsersPage />
                  </Suspense>
                </AdminRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <PrivateRoute>
                  <Suspense fallback={loadingFallback}>
                    <SettingsPage />
                  </Suspense>
                </PrivateRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ErrorBoundary>
      </ToastProvider>
    </BrowserRouter>
  );
}
