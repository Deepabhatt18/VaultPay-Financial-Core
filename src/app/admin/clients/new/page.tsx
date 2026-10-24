import type { Metadata } from 'next';
import AppHeader from '@/components/AppHeader';
import { requireUser } from '@/lib/api';
import CreateClientForm from './CreateClientForm';

export const metadata: Metadata = { title: 'New client' };
export const dynamic = 'force-dynamic';

export default async function NewClientPage() {
  const user = await requireUser('ADMIN');
  return (
    <>
      <AppHeader user={user} />
      <main className="container" style={{ maxWidth: 560 }}>
        <div className="page-head">
          <div>
            <h1>New client account</h1>
            <div className="muted">Creates a portal login with the Client role.</div>
          </div>
        </div>
        <CreateClientForm />
      </main>
    </>
  );
}
