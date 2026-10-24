'use client';

import { useRef, useState } from 'react';

/** Only same-site relative paths are allowed as post-login targets (prevents open redirects). */
function safeNext(next: string): string | null {
  return next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : null;
}

export default function LoginForm({ next }: { next: string }) {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Sign-in failed.');
      const n = safeNext(next);
      const allowed = n && (data.role === 'ADMIN' || !n.startsWith('/admin'));
      window.location.assign(allowed ? n : data.redirect);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <button className="btn" type="submit" disabled={busy} style={{ width: '100%' }}>
        {busy && <span className="spinner" aria-hidden />} {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
