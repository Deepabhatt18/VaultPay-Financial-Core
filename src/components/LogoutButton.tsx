'use client';

import { useRef, useState } from 'react';

export default function LogoutButton() {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);

  async function logout() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      window.location.assign('/login');
    }
  }

  return (
    <button className="btn secondary small" onClick={logout} disabled={busy}>
      {busy ? <span className="spinner" aria-hidden /> : null}
      Sign out
    </button>
  );
}
