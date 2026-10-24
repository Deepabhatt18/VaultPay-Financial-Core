import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getInvoice, requireUser } from '@/lib/api';
import { formatUSD } from '@/lib/money';
import MockCheckoutForm from './MockCheckoutForm';

export const metadata: Metadata = { title: 'Simulated checkout' };
export const dynamic = 'force-dynamic';

/** LOCAL DEMO ONLY - stands in for Stripe Checkout when the backend runs without a STRIPE_SECRET_KEY. */
export default async function MockCheckout({ searchParams }: { searchParams: Promise<{ invoice?: string; session?: string }> }) {
  const user = await requireUser('CLIENT');
  const { invoice, session } = await searchParams;
  void user;
  const inv = invoice && session && /^[A-Za-z0-9_-]{1,64}$/.test(invoice) ? await getInvoice(invoice) : null;
  if (!inv || inv.status === 'PAID') notFound(); // the backend re-validates the session when the payment completes

  return (
    <main className="center-screen">
      <div className="card auth-card">
        <div className="alert info">Simulated checkout (demo mode). No real card is charged. Run the backend with STRIPE_SECRET_KEY to use real Stripe Checkout.</div>
        <h1>Pay {formatUSD(inv.totalCents)}</h1>
        <p className="muted">Invoice {inv.number}</p>
        <MockCheckoutForm invoiceId={inv.id} sessionId={session!} />
      </div>
    </main>
  );
}
