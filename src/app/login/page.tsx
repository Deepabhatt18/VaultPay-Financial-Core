import type { Metadata } from 'next';
import LoginForm from './LoginForm';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const showDemo = process.env.NODE_ENV !== 'production' || process.env.SHOW_DEMO_ACCOUNTS === 'true';
  return (
    <main className="center-screen">
      <div className="card auth-card">
        <div className="brand" style={{ marginBottom: 14 }}>
          <span className="brand-mark" aria-hidden /> VaultPay
        </div>
        <h1>Sign in</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          Nexus Corporate Services secure billing portal.
        </p>
        <LoginForm next={typeof next === 'string' ? next : ''} />
        {showDemo && (
          <div className="demo-box">
            <strong>Demo accounts</strong>
            <div>
              Admin: <code>admin@nexus-corp.example</code> / <code>Admin#Vault2026</code>
            </div>
            <div>
              Client: <code>daniel@acme-industries.example</code> / <code>Client#Acme2026</code>
            </div>
            <div>
              Client: <code>priya@globex-logistics.example</code> / <code>Client#Globex2026</code>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
