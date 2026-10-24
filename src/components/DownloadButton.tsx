'use client';

import { useRef, useState } from 'react';

/** Fetches a PDF from the authenticated API and triggers a native browser download (no new tab, no public URL). */
export default function DownloadButton({
  href,
  fallbackName,
  label,
  secondary = true,
}: {
  href: string;
  fallbackName: string;
  label: string;
  secondary?: boolean;
}) {
  const lock = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    if (lock.current) return;
    lock.current = true;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(href, { credentials: 'same-origin' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Download failed (${res.status}).`);
      }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') ?? '';
      const name = /filename="?([^";]+)"?/i.exec(cd)?.[1] ?? fallbackName;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed.');
    } finally {
      lock.current = false;
      setLoading(false);
    }
  }

  return (
    <span>
      <button className={`btn ${secondary ? 'secondary' : ''}`} onClick={download} disabled={loading} aria-busy={loading}>
        {loading ? <span className="spinner" aria-hidden /> : <span aria-hidden>⬇</span>} {label}
      </button>
      {error && (
        <div className="alert error" role="alert" style={{ marginTop: 10 }}>
          {error}
        </div>
      )}
    </span>
  );
}
