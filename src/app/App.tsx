import React from 'react';
import { createBrowserRouter, RouterProvider, Navigate, Outlet } from 'react-router';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './components/auth-context';
import { ThemeProvider } from './components/theme-context';
import { AuthPage } from './components/auth-page';
import { PricingPage } from './components/pricing-page';
import { AdminDashboard } from './components/admin-dashboard';
import { CanvasApp } from './components/canvas-app';
import { Layout } from './components/layout';
import { CheckoutSuccess } from './components/checkout-success';
import { ForgotPassword } from './components/forgot-password';
import { ResetPassword } from './components/reset-password';
import { VerifyEmail } from './components/verify-email';
import { BillingPage } from './components/billing-page';
import { BuyCreditsPage } from './components/buy-credits-page';
import { Loader2 } from 'lucide-react';

function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50">
      <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
    </div>
  );
}

function ProtectedRoute() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function AdminOnly() {
  const { user, loading, isAdmin } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <Outlet />;
}

function NonAdminOnly() {
  const { user, loading, isAdmin } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (isAdmin) return <Navigate to="/admin" replace />;
  return <Outlet />;
}

function PublicOnly() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (user) return <Navigate to="/" replace />;
  return <Outlet />;
}

function Root() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Outlet />
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </ThemeProvider>
  );
}

const router = createBrowserRouter([
  {
    path: '/',
    Component: Root,
    children: [
      // Public routes (redirect to home if logged in)
      {
        Component: PublicOnly,
        children: [
          { path: 'login', Component: AuthPage },
          { path: 'signup', Component: AuthPage },
          { path: 'forgot-password', Component: ForgotPassword },
          { path: 'reset-password', Component: ResetPassword },
          { path: 'verify-email', Component: VerifyEmail },
        ],
      },
      // Protected routes
      {
        Component: ProtectedRoute,
        children: [
          {
            Component: Layout,
            children: [
              {
                Component: NonAdminOnly,
                children: [
                  { index: true, Component: CanvasApp },
                  { path: 'pricing', Component: PricingPage },
                  { path: 'buy-credits', Component: BuyCreditsPage },
                  { path: 'billing', Component: BillingPage },
                  { path: 'checkout/success', Component: CheckoutSuccess },
                ],
              },
              {
                Component: AdminOnly,
                children: [
                  { path: 'admin', Component: AdminDashboard },
                ],
              },
            ],
          },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}