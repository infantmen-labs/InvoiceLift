import React from 'react';
import { MintInvoice } from './pages/MintInvoice';
import { FundInvoice } from './pages/FundInvoice';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Invoices } from './pages/Invoices';
import { SignerModeProvider, useSignerMode } from './state/signerMode';
import { ToastProvider } from './components/Toast';

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
      return <div style={{padding: 24}}><h1>Error</h1><pre>{String(this.state.error)}</pre></div>;
    }
    return this.props.children;
  }
}

export default function App(){
  function SignerToggle(){
    const { mode, setMode, isAdmin } = useSignerMode();
    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span>Signer:</span>
        {isAdmin ? (
          <select value={mode} onChange={(e) => setMode(e.target.value as any)}>
            <option value="backend">Backend</option>
            <option value="wallet">Wallet</option>
          </select>
        ) : (
          <span>Wallet</span>
        )}
      </div>
    );
  }
  return (
    <ErrorBoundary>
      <ToastProvider>
        <SignerModeProvider>
          <div style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <h1>InvoiceLift</h1>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <SignerToggle />
                <WalletMultiButton />
              </div>
            </div>
            <p>Devnet PoC UI (stubs)</p>
            <MintInvoice />
            <div style={{ height: 16 }} />
            <FundInvoice />
            <Invoices />
          </div>
        </SignerModeProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
