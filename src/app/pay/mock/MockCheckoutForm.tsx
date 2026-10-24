'use client';

import { useRef, useState } from 'react';

export default function MockCheckoutForm({ invoiceId, sessionId }: { invoiceId: string; sessionId: string }) {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/mock/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId, sessionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 409) throw new Error(data.error || 'Payment failed.');
      window.location.assign(`/invoices/${encodeURIComponent(invoiceId)}?checkout=success`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed.');
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <div>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      <div className="field">
        <label>Card number</label>
        <input value="4242 4242 4242 4242" readOnly aria-readonly />
      </div>
      <button className="btn big" style={{ width: '100%' }} onClick={pay} disabled={busy} aria-busy={busy}>
        {busy ? (
          <>
            <span className="spinner" aria-hidden /> Processing…
          </>
        ) : (
          'Pay (simulated)'
        )}
      </button>
      <p style={{ textAlign: 'center' }}>
        <a href={`/invoices/${encodeURIComponent(invoiceId)}?checkout=cancelled`}>Cancel and return</a>
      </p>
    </div>
  );
}
