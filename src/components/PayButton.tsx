'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Idiot-proof payment button.
 *  1. `lock` is a ref: it flips synchronously on the first click, BEFORE React re-renders,
 *     so a second click in the same frame (or a frozen UI) is ignored.
 *  2. `loading` disables the button and shows a spinner immediately.
 *  3. The button stays disabled after success until the browser has navigated to Stripe.
 *  4. If the user comes back with the browser Back button (bfcache), `pageshow` re-arms it.
 *  5. The server is idempotent too: repeated calls return the SAME Checkout Session.
 */
export default function PayButton({ invoiceId, amountLabel }: { invoiceId: string; amountLabel: string }) {
  const lock = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const rearm = (e: PageTransitionEvent) => {
      if (e.persisted) {
        lock.current = false;
        setLoading(false);
      }
    };
    window.addEventListener('pageshow', rearm);
    return () => window.removeEventListener('pageshow', rearm);
  }, []);

  async function pay() {
    if (lock.current) return;
    lock.current = true;
    setLoading(true);
    setError(null);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
    try {
      const res = await fetch(`/api/invoices/${encodeURIComponent(invoiceId)}/checkout`, {
        method: 'POST',
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        window.location.reload(); // already paid elsewhere - show the truth
        return;
      }
      if (!res.ok || typeof data.url !== 'string') throw new Error(data.error || 'Could not start checkout.');
      // Same-origin mock page or Stripe-hosted checkout. Keep the button locked while the browser navigates.
      window.location.assign(data.url);
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === 'AbortError';
      setError(aborted ? 'The request timed out. You have not been charged. Please try again.' : err instanceof Error ? err.message : 'Something went wrong.');
      lock.current = false;
      setLoading(false);
    } finally {
      clearTimeout(timer);
    }
  }

  return (
    <div>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      <button className="btn big" onClick={pay} disabled={loading} aria-busy={loading}>
        {loading ? (
          <>
            <span className="spinner" aria-hidden /> Redirecting to secure checkout…
          </>
        ) : (
          <>Pay invoice · {amountLabel}</>
        )}
      </button>
      <div className="trust" style={{ marginTop: 10 }}>
        🔒 Payments are processed by Stripe. Card details never touch our servers.
      </div>
    </div>
  );
}
