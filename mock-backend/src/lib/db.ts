import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';

/**
 * A deliberately small, dependency-free persistence layer (JSON file).
 *  - every write goes through `transact`, which is serialised (one at a time) and atomic
 *    (the mutation runs on a copy; the copy only replaces live data if the callback succeeds);
 *  - the file is written to a temp file and renamed, so a crash never leaves half a file.
 * This is single-process by design. For multi-instance production, swap this module for
 * Postgres (the rest of the app only talks to the functions exported here and in invoices.ts).
 */

export type Role = 'ADMIN' | 'CLIENT';

export interface User {
  id: string;
  name: string;
  email: string;
  company: string;
  role: Role;
  passwordHash: string;
  createdAt: string;
}

export interface LineItem {
  description: string;
  quantity: number;
  unitCents: number;
}

export interface CheckoutSession {
  sessionId: string;
  url: string;
  version: number;
  createdAt: string;
}

export interface Invoice {
  id: string;
  number: string;
  clientId: string;
  items: LineItem[];
  currency: 'usd';
  totalCents: number;
  issueDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  notes: string;
  status: 'UNPAID' | 'PAID';
  createdAt: string;
  createdBy: string;
  checkout: CheckoutSession | null;
  /** Number of Checkout Sessions ever created; part of the Stripe idempotency key. */
  checkoutVersion: number;
  /** Every session id we have ever issued for this invoice (so a late payment on an old tab is still recognised). */
  sessionHistory: string[];
  paidAt: string | null;
}

export interface Payment {
  id: string;
  invoiceId: string;
  sessionId: string;
  paymentIntentId: string | null;
  amountCents: number;
  currency: string;
  paidAt: string;
  /** DUPLICATE = the invoice was already paid by another session; needs a manual refund. */
  status: 'SUCCEEDED' | 'DUPLICATE';
  receiptEmail: 'PENDING' | 'SENT' | 'FAILED';
  mode: 'stripe' | 'mock';
}

export interface Data {
  users: User[];
  invoices: Invoice[];
  payments: Payment[];
  processedEvents: string[];
  invoiceCounter: number;
}

const DATA_FILE = process.env.DATA_FILE || path.join(process.cwd(), '.data', 'db.json');

const g = globalThis as unknown as { __vaultpay?: Data; __vaultpayChain?: Promise<unknown> };

function seedAllowed(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.SEED_DEMO_DATA === 'true';
}

export function buildSeedData(): Data {
  const now = new Date();
  const iso = (offsetDays: number) => new Date(now.getTime() + offsetDays * 86400000).toISOString().slice(0, 10);
  const hash = (pw: string) => bcrypt.hashSync(pw, 10);

  const admin: User = {
    id: 'usr_admin',
    name: 'Evelyn Croft',
    email: 'admin@nexus-corp.example',
    company: 'Nexus Corporate Services',
    role: 'ADMIN',
    passwordHash: hash('Admin#Vault2026'),
    createdAt: now.toISOString(),
  };
  const acme: User = {
    id: 'usr_acme',
    name: 'Daniel Rivera',
    email: 'daniel@acme-industries.example',
    company: 'Acme Industries',
    role: 'CLIENT',
    passwordHash: hash('Client#Acme2026'),
    createdAt: now.toISOString(),
  };
  const globex: User = {
    id: 'usr_globex',
    name: 'Priya Natarajan',
    email: 'priya@globex-logistics.example',
    company: 'Globex Logistics',
    role: 'CLIENT',
    passwordHash: hash('Client#Globex2026'),
    createdAt: now.toISOString(),
  };

  const mk = (
    n: number,
    clientId: string,
    items: LineItem[],
    issueOffset: number,
    dueOffset: number,
    status: 'UNPAID' | 'PAID',
    notes = '',
  ): Invoice => ({
    id: `inv_${randomUUID()}`,
    number: `NCS-${now.getUTCFullYear()}-${String(n).padStart(4, '0')}`,
    clientId,
    items,
    currency: 'usd',
    totalCents: items.reduce((s, i) => s + i.quantity * i.unitCents, 0),
    issueDate: iso(issueOffset),
    dueDate: iso(dueOffset),
    notes,
    status,
    createdAt: now.toISOString(),
    createdBy: admin.id,
    checkout: null,
    checkoutVersion: 0,
    sessionHistory: [],
    paidAt: status === 'PAID' ? new Date(now.getTime() + (issueOffset + 5) * 86400000).toISOString() : null,
  });

  const invoices: Invoice[] = [
    mk(1, acme.id, [
      { description: 'Strategic advisory retainer - Q3', quantity: 1, unitCents: 1_800_000 },
      { description: 'Regulatory compliance review', quantity: 12, unitCents: 25_000 },
    ], -50, -20, 'PAID', 'Thank you for your business.'),
    mk(2, acme.id, [
      { description: 'M&A due diligence support', quantity: 40, unitCents: 45_000 },
    ], -10, 20, 'UNPAID', 'Net 30. Wire or card accepted.'),
    mk(3, acme.id, [
      { description: 'Operational efficiency audit', quantity: 1, unitCents: 750_000 },
    ], -40, -10, 'UNPAID', 'Overdue - please remit promptly.'),
    mk(4, globex.id, [
      { description: 'Supply-chain risk assessment', quantity: 1, unitCents: 2_400_000 },
      { description: 'Executive workshop (2 days)', quantity: 2, unitCents: 350_000 },
    ], -5, 25, 'UNPAID'),
    mk(5, globex.id, [
      { description: 'Annual advisory subscription', quantity: 1, unitCents: 5_000_000 },
    ], -70, -40, 'PAID'),
  ];

  const payments: Payment[] = invoices
    .filter((i) => i.status === 'PAID')
    .map((i) => ({
      id: `pay_${randomUUID()}`,
      invoiceId: i.id,
      sessionId: `seed_${i.number}`,
      paymentIntentId: null,
      amountCents: i.totalCents,
      currency: 'usd',
      paidAt: i.paidAt as string,
      status: 'SUCCEEDED' as const,
      receiptEmail: 'SENT' as const,
      mode: 'mock' as const,
    }));

  return { users: [admin, acme, globex], invoices, payments, processedEvents: [], invoiceCounter: 5 };
}

function emptyData(): Data {
  return { users: [], invoices: [], payments: [], processedEvents: [], invoiceCounter: 0 };
}

function persist(data: Data): void {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, DATA_FILE);
}

function load(): Data {
  if (g.__vaultpay) return g.__vaultpay;
  let data: Data;
  if (fs.existsSync(DATA_FILE)) {
    data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) as Data;
  } else if (seedAllowed()) {
    data = buildSeedData();
    persist(data);
  } else {
    data = emptyData();
    persist(data);
  }
  g.__vaultpay = data;
  return data;
}

/** Read-only access. Do not mutate what you get back. */
export function read<T>(fn: (data: Readonly<Data>) => T): T {
  return fn(load());
}

/** Serialised, atomic write transaction. Throwing inside `fn` rolls everything back. */
export function transact<T>(fn: (data: Data) => T): Promise<T> {
  const prev = g.__vaultpayChain ?? Promise.resolve();
  const run = prev.then(() => {
    const working = structuredClone(load());
    const result = fn(working);
    persist(working);
    g.__vaultpay = working;
    return result;
  });
  g.__vaultpayChain = run.catch(() => undefined);
  return run;
}

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

/** Used by scripts/reset-data.mjs and tests. */
export function resetToSeed(): void {
  const data = buildSeedData();
  persist(data);
  g.__vaultpay = data;
}
