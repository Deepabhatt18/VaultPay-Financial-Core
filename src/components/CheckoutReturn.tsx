'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Shown when Stripe sends the customer back to the invoice page.
 * The query string is NEVER trusted: on `success` we ask our server, which asks Stripe, what really happened.
 * (The signed webhook is the primary path; this makes the UI correct even before the webhook arrives.)
 */
export default function CheckoutReturn({
  invoiceId,
  outcome,
  alreadyPaid,
}: {
  invoiceId: string;
  outcome: 'success' | 'cancelled';
  alreadyPaid: boolean;
}) {
  const router = useRouter();
  const started = useRef(false);
  const [state, setState] = useState<'checking' | 'paid' | 'pending' | 'error' | 'cancelled'>(
    outcome === 'cancelled' ? 'cancelled' : alreadyPaid ? 'paid' : 'checking',
  );

  useEffect(() => {
    if (outcome !== 'success' || alreadyPaid || started.current) return;
    started.current = true;
    let cancelled = false;
    (async () => {
      for (let attempt = 0; attempt < 6 && !cancelled; attempt++) {
        try {
          const res = await fetch(`/api/invoices/${encodeURIComponent(invoiceId)}/verify`, { method: 'POST' });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.status === 'PAID') {
            setState('paid');
            router.refresh();
            return;
          }
        } catch {
          /* retry */
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      if (!cancelled) setState('pending');
    })();
    return () => {
      cancelled = true;
    };
  }, [invoiceId, outcome, alreadyPaid, router]);

  if (state === 'checking')
    return (
      <div className="alert info" role="status">
        <span className="spinner" aria-hidden /> Confirming your payment with Stripe…
      </div>
    );
  if (state === 'paid')
    return (
      <div className="alert success" role="status">
        ✅ Payment received. A PDF receipt has been emailed to you.
      </div>
    );
  if (state === 'pending')
    return (
      <div className="alert info" role="status">
        Your payment is still being confirmed. Refresh in a minute - you will not be charged twice.
      </div>
    );
  if (state === 'cancelled')
    return (
      <div className="alert info" role="status">
        Checkout was cancelled. You have not been charged.
      </div>
    );
  return null;
}
