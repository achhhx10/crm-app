import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { LoginPage } from './pages/LoginPage';
import { ToastProvider } from './components/ui/toast';
import { ErrorBoundary } from './components/ErrorBoundary';

const DashboardPage = React.lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const PipelinePage = React.lazy(() => import('./pages/PipelinePage').then(m => ({ default: m.PipelinePage })));
const ContactsPage = React.lazy(() => import('./pages/ContactsPage').then(m => ({ default: m.ContactsPage })));
const ContactDetailPage = React.lazy(() => import('./pages/ContactDetailPage').then(m => ({ default: m.ContactDetailPage })));
const CallsPage = React.lazy(() => import('./pages/CallsPage').then(m => ({ default: m.CallsPage })));
const DealsPage = React.lazy(() => import('./pages/DealsPage').then(m => ({ default: m.DealsPage })));
const ReferralsPage = React.lazy(() => import('./pages/ReferralsPage').then(m => ({ default: m.ReferralsPage })));
const ImportPage = React.lazy(() => import('./pages/ImportPage').then(m => ({ default: m.ImportPage })));
const UsersPage = React.lazy(() => import('./pages/UsersPage').then(m => ({ default: m.UsersPage })));

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
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ErrorBoundary>
      </ToastProvider>
    </BrowserRouter>
  );
}
