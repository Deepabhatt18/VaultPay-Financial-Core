import type { Metadata } from 'next';
import Link from 'next/link';
import AppHeader from '@/components/AppHeader';
import InvoiceTable from '@/components/InvoiceTable';
import { formatUSD } from '@/lib/money';
import { getAdminOverview, getInvoices, requireUser } from '@/lib/api';

export const metadata: Metadata = { title: 'Admin dashboard' };
export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  const user = await requireUser('ADMIN'); // layer 2: even if the middleware were bypassed, a CLIENT is sent to /403 and the backend refuses the data
  const [overview, invoices] = await Promise.all([getAdminOverview(), getInvoices()]);

  return (
    <>
      <AppHeader user={user} />
      <main className="container">
        <div className="page-head">
          <div>
            <h1>Master dashboard</h1>
            <div className="muted">All clients and invoices</div>
          </div>
          <Link className="btn" href="/admin/invoices/new">
            + Create invoice
          </Link>
        </div>

        {overview.duplicatePayments > 0 && (
          <div className="alert error" role="alert">
            {overview.duplicatePayments} duplicate payment(s) detected and need a manual refund in Stripe.
          </div>
        )}

        <div className="grid stats">
          <div className="card stat">
            <div className="label">Total revenue</div>
            <div className="value">{formatUSD(overview.totalRevenueCents)}</div>
            <div className="sub">Collected via paid invoices</div>
          </div>
          <div className="card stat">
            <div className="label">Outstanding</div>
            <div className="value">{formatUSD(overview.outstandingCents)}</div>
            <div className="sub">Awaiting payment</div>
          </div>
          <div className="card stat">
            <div className="label">Overdue</div>
            <div className="value">{formatUSD(overview.overdueCents)}</div>
            <div className="sub">{overview.overdueCount} invoice(s) past due</div>
          </div>
          <div className="card stat">
            <div className="label">Clients</div>
            <div className="value">{overview.clients.length}</div>
            <div className="sub">Active accounts</div>
          </div>
        </div>

        <section className="card">
          <h2>Clients</h2>
          {overview.clients.length === 0 ? (
            <div className="empty">No clients yet.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Contact</th>
                    <th className="num">Invoices</th>
                    <th className="num">Paid</th>
                    <th className="num">Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.clients.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <strong>{c.company}</strong>
                      </td>
                      <td>
                        {c.name} <span className="muted">· {c.email}</span>
                      </td>
                      <td className="num">{c.invoiceCount}</td>
                      <td className="num">{formatUSD(c.paidCents)}</td>
                      <td className="num">{formatUSD(c.outstandingCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card">
          <h2>All invoices</h2>
          <InvoiceTable invoices={invoices} showClient />
        </section>
      </main>
    </>
  );
}
