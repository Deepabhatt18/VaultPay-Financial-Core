import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(200),
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD').refine((v) => {
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}, 'is not a real date');

export const MAX_INVOICE_CENTS = 99_999_999; // Stripe card payments cap at $999,999.99

export const createInvoiceSchema = z
  .object({
    clientId: z.string().min(1).max(100),
    dueDate: isoDate,
    notes: z.string().trim().max(1000).default(''),
    items: z
      .array(
        z.object({
          description: z.string().trim().min(1, 'is required').max(200),
          quantity: z.number().int().min(1).max(100_000),
          unitCents: z.number().int().min(1).max(MAX_INVOICE_CENTS),
        }),
      )
      .min(1, 'add at least one line item')
      .max(50),
  })
  .refine((v) => v.items.reduce((s, i) => s + i.quantity * i.unitCents, 0) <= MAX_INVOICE_CENTS, {
    message: 'invoice total exceeds $999,999.99',
    path: ['items'],
  });

export const createClientSchema = z.object({
  name: z.string().trim().min(2).max(100),
  company: z.string().trim().min(2).max(150),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z
    .string()
    .min(12, 'must be at least 12 characters')
    .max(200)
    .refine((v) => /[a-z]/.test(v) && /[A-Z]/.test(v) && /\d/.test(v), 'needs upper, lower case and a digit'),
});

export const idParam = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);

export const mockCompleteSchema = z.object({
  invoiceId: idParam,
  sessionId: z.string().min(1).max(200),
});
