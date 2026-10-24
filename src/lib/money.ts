/** All money is stored as integer cents. Floats never touch an amount. */
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function formatUSD(cents: number): string {
  return usd.format(cents / 100);
}

export function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  });
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Parses a user-typed dollar amount ("1,250.50") into integer cents without ever using floats. Returns null if invalid. */
export function parseUSDToCents(input: string): number | null {
  const s = input.trim().replace(/,/g, '').replace(/^\$/, '');
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const cents = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || 0);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}
