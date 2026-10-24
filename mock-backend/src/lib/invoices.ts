import 'server-only';
import { read, transact, newId, type Invoice, type User } from './db';
import type { SessionUser } from './session';
import { todayISO } from './money';
import { MAX_INVOICE_CENTS } from './validation';

/** What leaves the server. Never contains hashes, Stripe session history or other users' data. */
export interface InvoiceDTO {
  id: string;
  number: string;
  clientId: string;
  clientName: string;
  clientCompany: string;
  clientEmail: string;
  items: Invoice['items'];
  totalCents: number;
  issueDate: string;
  dueDate: string;
  notes: string;
  status: 'UNPAID' | 'PAID' | 'OVERDUE';
  paidAt: string | null;
}

export function toDTO(inv: Invoice, client: Pick<User, 'name' | 'company' | 'email'> | undefined): InvoiceDTO {
  const overdue = inv.status === 'UNPAID' && inv.dueDate < todayISO();
  return {
    id: inv.id,
    number: inv.number,
    clientId: inv.clientId,
    clientName: client?.name ?? 'Unknown',
    clientCompany: client?.company ?? 'Unknown',
    clientEmail: client?.email ?? '',
    items: inv.items,
    totalCents: inv.totalCents,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    notes: inv.notes,
    status: inv.status === 'PAID' ? 'PAID' : overdue ? 'OVERDUE' : 'UNPAID',
    paidAt: inv.paidAt,
  };
}

/**
 * THE ownership gate. Every read of a single invoice by a person goes through here.
 *  - ADMIN: any invoice
 *  - CLIENT: only invoices where clientId === their own id
 * Returns null (callers answer 404, never 403) so invoice ids cannot be probed for existence.
 */
export function getInvoiceFor(user: SessionUser, invoiceId: string): Invoice | null {
  const inv = read((d) => d.invoices.find((i) => i.id === invoiceId));
  if (!inv) return null;
  if (user.role === 'ADMIN') return inv;
  return inv.clientId === user.id ? inv : null;
}

/** Only the owning client may pay. Admins cannot pay on behalf of clients. */
export function getPayableInvoiceFor(user: SessionUser, invoiceId: string): Invoice | null {
  if (user.role !== 'CLIENT') return null;
  return getInvoiceFor(user, invoiceId);
}

export function getClientOf(inv: Invoice): User | undefined {
  return read((d) => d.users.find((u) => u.id === inv.clientId));
}

export function listInvoicesFor(user: SessionUser): InvoiceDTO[] {
  return read((d) => {
    const visible = user.role === 'ADMIN' ? d.invoices : d.invoices.filter((i) => i.clientId === user.id);
    return [...visible]
      .sort((a, b) => b.issueDate.localeCompare(a.issueDate) || b.number.localeCompare(a.number))
      .map((i) => toDTO(i, d.users.find((u) => u.id === i.clientId)));
  });
}

export interface ClientSummary {
  id: string;
  name: string;
  company: string;
  email: string;
  invoiceCount: number;
  paidCents: number;
  outstandingCents: number;
}

export function adminOverview() {
  return read((d) => {
    const clients: ClientSummary[] = d.users
      .filter((u) => u.role === 'CLIENT')
      .map((u) => {
        const mine = d.invoices.filter((i) => i.clientId === u.id);
        return {
          id: u.id,
          name: u.name,
          company: u.company,
          email: u.email,
          invoiceCount: mine.length,
          paidCents: mine.filter((i) => i.status === 'PAID').reduce((s, i) => s + i.totalCents, 0),
          outstandingCents: mine.filter((i) => i.status === 'UNPAID').reduce((s, i) => s + i.totalCents, 0),
        };
      });
    const today = todayISO();
    const unpaid = d.invoices.filter((i) => i.status === 'UNPAID');
    return {
      clients,
      totalRevenueCents: d.invoices.filter((i) => i.status === 'PAID').reduce((s, i) => s + i.totalCents, 0),
      outstandingCents: unpaid.reduce((s, i) => s + i.totalCents, 0),
      overdueCents: unpaid.filter((i) => i.dueDate < today).reduce((s, i) => s + i.totalCents, 0),
      overdueCount: unpaid.filter((i) => i.dueDate < today).length,
      duplicatePayments: d.payments.filter((p) => p.status === 'DUPLICATE').length,
    };
  });
}

export interface NewInvoiceInput {
  clientId: string;
  dueDate: string;
  notes: string;
  items: { description: string; quantity: number; unitCents: number }[];
}

export async function createInvoice(adminId: string, input: NewInvoiceInput): Promise<Invoice> {
  return transact((d) => {
    const client = d.users.find((u) => u.id === input.clientId && u.role === 'CLIENT');
    if (!client) throw Object.assign(new Error('Client not found.'), { status: 404 });
    // The total is ALWAYS computed here from line items - never accepted from the browser.
    const totalCents = input.items.reduce((s, i) => s + i.quantity * i.unitCents, 0);
    if (!Number.isSafeInteger(totalCents) || totalCents < 1 || totalCents > MAX_INVOICE_CENTS) {
      throw Object.assign(new Error('Invalid invoice total.'), { status: 400 });
    }
    d.invoiceCounter += 1;
    const issueDate = todayISO();
    const inv: Invoice = {
      id: newId('inv'),
      number: `NCS-${new Date().getUTCFullYear()}-${String(d.invoiceCounter).padStart(4, '0')}`,
      clientId: client.id,
      items: input.items.map((i) => ({ description: i.description, quantity: i.quantity, unitCents: i.unitCents })),
      currency: 'usd',
      totalCents,
      issueDate,
      dueDate: input.dueDate,
      notes: input.notes,
      status: 'UNPAID',
      createdAt: new Date().toISOString(),
      createdBy: adminId,
      checkout: null,
      checkoutVersion: 0,
      sessionHistory: [],
      paidAt: null,
    };
    d.invoices.push(inv);
    return inv;
  });
}
