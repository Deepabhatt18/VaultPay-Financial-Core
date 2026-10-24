'use client';

import { useRef, useState } from 'react';

export default function CreateClientForm() {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    try {
      const res = await fetch('/api/admin/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: f.get('name'), company: f.get('company'), email: f.get('email'), password: f.get('password') }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not create client.');
      window.location.assign('/admin/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create client.');
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit} noValidate>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      <div className="field">
        <label htmlFor="name">Contact name</label>
        <input id="name" name="name" required />
      </div>
      <div className="field">
        <label htmlFor="company">Company</label>
        <input id="company" name="company" required />
      </div>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="off" required />
      </div>
      <div className="field">
        <label htmlFor="password">Temporary password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required />
        <div className="muted" style={{ fontSize: '0.8rem', marginTop: 4 }}>
          Min 12 characters with upper-case, lower-case and a digit.
        </div>
      </div>
      <button className="btn" type="submit" disabled={busy}>
        {busy && <span className="spinner" aria-hidden />} {busy ? 'Creating…' : 'Create client'}
      </button>
    </form>
  );
}
