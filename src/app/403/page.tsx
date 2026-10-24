import type { Metadata } from 'next';
import Link from 'next/link';
import { getSessionUser } from '@/lib/api';

export const metadata: Metadata = { title: '403 Unauthorized' };
export const dynamic = 'force-dynamic';

export default async function Forbidden() {
  const user = await getSessionUser();
  const home = !user ? '/login' : user.role === 'ADMIN' ? '/admin/dashboard' : '/dashboard';
  return (
    <main className="center-screen">
      <div className="card auth-card" style={{ textAlign: 'center' }}>
        <div className="big-code">403</div>
        <h1 style={{ marginTop: 8 }}>Unauthorized</h1>
        <p className="muted">You do not have permission to view this page. This attempt has been blocked.</p>
        <Link className="btn" href={home}>
          {user ? 'Back to my dashboard' : 'Go to sign in'}
        </Link>
      </div>
    </main>
  );
}
