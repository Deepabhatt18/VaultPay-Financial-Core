'use client';

import { useRef, useState } from 'react';
import { formatUSD, parseUSDToCents } from '@/lib/money';

interface Row {
  description: string;
  quantity: string;
  price: string;
}

export default function CreateInvoiceForm({ clients, defaultDue }: { clients: { id: string; label: string }[]; defaultDue: string }) {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientId, setClientId] = useState(clients[0]?.id ?? '');
  const [dueDate, setDueDate] = useState(defaultDue);
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<Row[]>([{ description: '', quantity: '1', price: '' }]);

  const parsed = rows.map((r) => ({
    description: r.description.trim(),
    quantity: Number(r.quantity),
    unitCents: parseUSDToCents(r.price),
  }));
  const total = parsed.reduce((s, r) => s + (Number.isInteger(r.quantity) && r.unitCents ? r.quantity * r.unitCents : 0), 0);

  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (lock.current) return;
    setError(null);

    if (!clientId) return setError('Select a client.');
    for (const [i, r] of parsed.entries()) {
      if (!r.description) return setError(`Line ${i + 1}: description is required.`);
      if (!Number.isInteger(r.quantity) || r.quantity < 1) return setError(`Line ${i + 1}: quantity must be a whole number.`);
      if (!r.unitCents) return setError(`Line ${i + 1}: enter a valid price like 1250.00.`);
    }

    lock.current = true;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, dueDate, notes, items: parsed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not create invoice.');
      window.location.assign(`/invoices/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create invoice.');
      lock.current = false;
      setBusy(false);
    }
  }

  if (clients.length === 0) return <div className="card empty">Create a client first.</div>;

  return (
    <form className="card" onSubmit={submit} noValidate>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      <div className="row">
        <div className="field">
          <label htmlFor="client">Client</label>
          <select id="client" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="due">Due date</label>
          <input id="due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
        </div>
      </div>

      <h2>Line items</h2>
      {rows.map((r, i) => (
        <div className="items-row" key={i}>
          <div>
            <label htmlFor={`d${i}`}>Description</label>
            <input id={`d${i}`} value={r.description} maxLength={200} onChange={(e) => update(i, { description: e.target.value })} />
          </div>
          <div>
            <label htmlFor={`q${i}`}>Qty</label>
            <input id={`q${i}`} inputMode="numeric" value={r.quantity} onChange={(e) => update(i, { quantity: e.target.value })} />
          </div>
          <div>
            <label htmlFor={`p${i}`}>Unit price (USD)</label>
            <input id={`p${i}`} inputMode="decimal" placeholder="5000.00" value={r.price} onChange={(e) => update(i, { price: e.target.value })} />
          </div>
          <button type="button" className="btn secondary small" aria-label={`Remove line ${i + 1}`} disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}>
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="btn secondary small" onClick={() => setRows((rs) => [...rs, { description: '', quantity: '1', price: '' }])} disabled={rows.length >= 50}>
        + Add line
      </button>

      <div className="field" style={{ marginTop: 18 }}>
        <label htmlFor="notes">Notes (optional)</label>
        <textarea id="notes" rows={3} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="actions" style={{ justifyContent: 'space-between' }}>
        <div>
          <span className="muted">Total </span>
          <strong style={{ fontSize: '1.4rem' }}>{formatUSD(total)}</strong>
        </div>
        <button className="btn" type="submit" disabled={busy}>
          {busy && <span className="spinner" aria-hidden />} {busy ? 'Creating…' : 'Create invoice'}
        </button>
      </div>
    </form>
  );
}
