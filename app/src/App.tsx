import React from 'react';
import { Routes, Route, Outlet } from 'react-router-dom';
import { MintInvoice } from './pages/MintInvoice';
import { FundInvoice } from './pages/FundInvoice';
import { Invoices } from './pages/Invoices';
import { Portfolio } from './pages/Portfolio';
import { Marketplace } from './pages/Marketplace';
import { Admin } from './pages/Admin';
import { SignerModeProvider } from './state/signerMode';
import { ToastProvider } from './components/Toast';
import { MainLayout } from './components/layout/MainLayout';
import { Landing } from './pages/Landing';
import { WaitListPage } from './pages/WaitListPage';
import { DocsPage } from './pages/DocsPage';
import { DevnetGuardProvider } from './state/devnetGuard';

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: any}> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      const message = this.state.error && (this.state.error.stack || String(this.state.error));
      return (
        <div className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
          <div className="max-w-lg rounded-xl border border-red-500/40 bg-red-950/40 p-6 shadow-lg">
            <h1 className="text-lg font-semibold text-red-200 mb-2">Unexpected error</h1>
            <p className="mb-2 text-sm text-red-100">The UI crashed. Refresh the page or check the console for details.</p>
            <pre className="mt-2 max-h-64 overflow-auto rounded bg-black/60 p-3 text-xs text-red-200">
              {message}
            </pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App(){
  return (
    <ErrorBoundary>
      <ToastProvider>
        <SignerModeProvider>
          <DevnetGuardProvider>
          <Routes>
            {/* Public landing page */}
            <Route path="/" element={<WaitListPage />} />

            <Route path="/try-demo" element={<Landing />} />

            <Route path="/docs" element={<DocsPage />} />

            {/* App routes wrapped in MainLayout */}
            <Route
              element={(
                <MainLayout>
                  <Outlet />
                </MainLayout>
              )}
            >
              <Route path="/invoices" element={<Invoices />} />
              <Route path="/invoice/:id" element={<Invoices />} />
              <Route path="/marketplace" element={<Marketplace />} />
              <Route path="/portfolio" element={<Portfolio />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/mint" element={<MintInvoice />} />
              <Route path="/fund" element={<FundInvoice />} />
            </Route>
          </Routes>
          </DevnetGuardProvider>
        </SignerModeProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
