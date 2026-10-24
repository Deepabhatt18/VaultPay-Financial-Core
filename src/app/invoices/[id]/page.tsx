import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import AppHeader from '@/components/AppHeader';
import CheckoutReturn from '@/components/CheckoutReturn';
import DownloadButton from '@/components/DownloadButton';
import PayButton from '@/components/PayButton';
import StatusBadge from '@/components/StatusBadge';
import { formatDate, formatDateTime, formatUSD } from '@/lib/money';
import { getInvoice, requireUser } from '@/lib/api';

export const metadata: Metadata = { title: 'Invoice' };
export const dynamic = 'force-dynamic';

export default async function InvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ checkout?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { checkout } = await searchParams;

  // Ownership is enforced by the backend: someone else's invoice is indistinguishable from a non-existent one (404).
  const dto = /^[A-Za-z0-9_-]{1,64}$/.test(id) ? await getInvoice(id) : null;
  if (!dto) notFound();

  const canPay = user.role === 'CLIENT' && dto.status !== 'PAID';
  const outcome = checkout === 'success' || checkout === 'cancelled' ? checkout : null;
  const back = user.role === 'ADMIN' ? '/admin/dashboard' : '/dashboard';

  return (
    <>
      <AppHeader user={user} />
      <main className="container">
        <p>
          <Link href={back}>← Back</Link>
        </p>

        {outcome && user.role === 'CLIENT' && <CheckoutReturn invoiceId={dto.id} outcome={outcome} alreadyPaid={dto.status === 'PAID'} />}

        <section className="card">
          <div className="invoice-head">
            <div>
              <div className="muted" style={{ fontWeight: 700, letterSpacing: '0.06em', fontSize: '0.75rem' }}>
                INVOICE
              </div>
              <h1>{dto.number}</h1>
              <StatusBadge status={dto.status} />
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="muted" style={{ fontSize: '0.8rem' }}>
                Amount {dto.status === 'PAID' ? 'paid' : 'due'}
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 800 }}>{formatUSD(dto.totalCents)}</div>
            </div>
          </div>

          <dl className="kv">
            <div>
              <dt>Billed to</dt>
              <dd>
                {dto.clientCompany}
                <div className="muted" style={{ fontWeight: 400 }}>
                  {dto.clientName} · {dto.clientEmail}
                </div>
              </dd>
            </div>
            <div>
              <dt>Issued</dt>
              <dd>{formatDate(dto.issueDate)}</dd>
            </div>
            <div>
              <dt>Due</dt>
              <dd>{formatDate(dto.dueDate)}</dd>
            </div>
            {dto.paidAt && (
              <div>
                <dt>Paid on</dt>
                <dd>{formatDateTime(dto.paidAt)}</dd>
              </div>
            )}
          </dl>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th className="num">Qty</th>
                  <th className="num">Unit price</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {dto.items.map((it, idx) => (
                  <tr key={idx}>
                    <td>{it.description}</td>
                    <td className="num">{it.quantity}</td>
                    <td className="num">{formatUSD(it.unitCents)}</td>
                    <td className="num">{formatUSD(it.quantity * it.unitCents)}</td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td colSpan={3} className="num">
                    Total
                  </td>
                  <td className="num">{formatUSD(dto.totalCents)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {dto.notes && (
            <p className="muted" style={{ marginBottom: 0 }}>
              <strong>Notes:</strong> {dto.notes}
            </p>
          )}

          <div className="actions">
            {canPay && <PayButton invoiceId={dto.id} amountLabel={formatUSD(dto.totalCents)} />}
          </div>
        </section>

        <section className="card">
          <h2>Document vault</h2>
          <div className="actions" style={{ marginTop: 0 }}>
            <DownloadButton
              href={`/api/invoices/${encodeURIComponent(dto.id)}/pdf`}
              fallbackName={`invoice-${dto.number}.pdf`}
              label="Download PDF"
              secondary={false}
            />
            {dto.status === 'PAID' && (
              <DownloadButton
                href={`/api/invoices/${encodeURIComponent(dto.id)}/receipt`}
                fallbackName={`receipt-${dto.number}.pdf`}
                label="Download receipt"
              />
            )}
          </div>
        </section>
      </main>
    </>
  );
}
