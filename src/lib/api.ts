import 'server-only';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import type { AdminOverview, InvoiceDTO, Role, SessionUser } from './types';

/**
 * Server-side API client (used by Server Components only).
 * It forwards the browser's session cookie to the backend, so the BACKEND decides what this user may see.
 * The frontend never holds secrets and never trusts itself for authorisation.
 */
export const API_URL = (process.env.API_URL || 'http://localhost:4000').replace(/\/+$/, '');

async function call(path: string): Promise<Response> {
  const cookie = (await cookies()).toString();
  try {
    return await fetch(`${API_URL}${path}`, { headers: { cookie }, cache: 'no-store' });
  } catch {
    throw new Error(`Cannot reach the backend at ${API_URL}. Is it running?`);
  }
}

/** Maps auth failures to the right screen; anything else is a real error. */
async function json<T>(res: Response): Promise<T> {
  if (res.status === 401) redirect('/login');
  if (res.status === 403) redirect('/403');
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error(`Backend error (${res.status})`);
  return (await res.json()) as T;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const res = await call('/api/auth/me');
  if (!res.ok) return null;
  return ((await res.json()) as { user: SessionUser }).user;
}

/** Route guard for pages: not signed in -> /login, wrong role -> /403. */
export async function requireUser(role?: Role): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (role && user.role !== role) redirect('/403');
  return user;
}

export async function getInvoices(): Promise<InvoiceDTO[]> {
  return (await json<{ invoices: InvoiceDTO[] }>(await call('/api/invoices'))).invoices;
}

/** Returns null when the invoice does not exist OR is not the caller's (backend answers 404 for both). */
export async function getInvoice(id: string): Promise<InvoiceDTO | null> {
  const res = await call(`/api/invoices/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  return (await json<{ invoice: InvoiceDTO }>(res)).invoice;
}

export async function getAdminOverview(): Promise<AdminOverview> {
  return json<AdminOverview>(await call('/api/admin/overview'));
}
