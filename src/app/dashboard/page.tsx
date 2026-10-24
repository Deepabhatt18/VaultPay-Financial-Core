import type { Metadata } from 'next';
import AppHeader from '@/components/AppHeader';
import InvoiceTable from '@/components/InvoiceTable';
import { formatUSD } from '@/lib/money';
import { redirect } from 'next/navigation';
import { getInvoices, requireUser } from '@/lib/api';

export const metadata: Metadata = { title: 'My invoices' };
export const dynamic = 'force-dynamic';

export default async function ClientDashboard() {
  const user = await requireUser();
  if (user.role === 'ADMIN') redirect('/admin/dashboard');

  const invoices = await getInvoices(); // the backend only returns this client's own invoices
  const outstanding = invoices.filter((i) => i.status !== 'PAID');
  const outstandingTotal = outstanding.reduce((s, i) => s + i.totalCents, 0);
  const paidTotal = invoices.filter((i) => i.status === 'PAID').reduce((s, i) => s + i.totalCents, 0);

  return (
    <>
      <AppHeader user={user} />
      <main className="container">
        <div className="page-head">
          <div>
            <h1>Billing</h1>
            <div className="muted">{user.company}</div>
          </div>
        </div>

        <div className="grid stats">
          <div className="card stat">
            <div className="label">Outstanding</div>
            <div className="value">{formatUSD(outstandingTotal)}</div>
            <div className="sub">{outstanding.length} unpaid invoice(s)</div>
          </div>
          <div className="card stat">
            <div className="label">Paid to date</div>
            <div className="value">{formatUSD(paidTotal)}</div>
            <div className="sub">{invoices.length - outstanding.length} paid invoice(s)</div>
          </div>
        </div>

        <section className="card">
          <h2>Outstanding invoices</h2>
          <InvoiceTable invoices={outstanding} />
        </section>
        <section className="card">
          <h2>Billing history</h2>
          <InvoiceTable invoices={invoices} />
        </section>
      </main>
    </>
  );
}
