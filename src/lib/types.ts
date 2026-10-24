/** Shapes returned by the backend API (see README "API contract"). Amounts are integer cents. */
export type Role = 'ADMIN' | 'CLIENT';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  company: string;
  role: Role;
}

export interface InvoiceItem {
  description: string;
  quantity: number;
  unitCents: number;
}

export interface InvoiceDTO {
  id: string;
  number: string;
  clientId: string;
  clientName: string;
  clientCompany: string;
  clientEmail: string;
  items: InvoiceItem[];
  totalCents: number;
  issueDate: string;
  dueDate: string;
  notes: string;
  status: 'UNPAID' | 'PAID' | 'OVERDUE';
  paidAt: string | null;
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

export interface AdminOverview {
  clients: ClientSummary[];
  totalRevenueCents: number;
  outstandingCents: number;
  overdueCents: number;
  overdueCount: number;
  duplicatePayments: number;
}
