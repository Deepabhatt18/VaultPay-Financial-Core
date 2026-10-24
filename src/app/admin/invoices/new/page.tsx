import type { Metadata } from 'next';
import AppHeader from '@/components/AppHeader';
import { getAdminOverview, requireUser } from '@/lib/api';
import CreateInvoiceForm from './CreateInvoiceForm';

export const metadata: Metadata = { title: 'Create invoice' };
export const dynamic = 'force-dynamic';

export default async function NewInvoicePage() {
  const user = await requireUser('ADMIN');
  const clients = (await getAdminOverview()).clients.map((c) => ({ id: c.id, label: `${c.company} — ${c.name}` }));
  const due = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  return (
    <>
      <AppHeader user={user} />
      <main className="container" style={{ maxWidth: 820 }}>
        <div className="page-head">
          <div>
            <h1>Create invoice</h1>
            <div className="muted">The backend calculates the final total from the line items.</div>
          </div>
        </div>
        <CreateInvoiceForm clients={clients} defaultDue={due} />
      </main>
    </>
  );
}
