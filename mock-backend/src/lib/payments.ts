import 'server-only';
import { randomUUID } from 'node:crypto';
import type Stripe from 'stripe';
import { read, transact, newId, type Invoice, type Payment } from './db';
import { getPayableInvoiceFor } from './invoices';
import type { SessionUser } from './session';
import { appUrl, getStripe, paymentMode } from './stripe';
import { HttpError } from './http';
import { renderReceiptPdf } from './pdf';
import { escapeHtml, sendMail } from './mailer';
import { formatUSD } from './money';

/* ------------------------------------------------------------------ *
 * Per-invoice mutex. Two requests for the same invoice (double click,
 * two tabs) run one after another, so the second one finds the first
 * one's Checkout Session and REUSES it instead of creating another.
 * ------------------------------------------------------------------ */
const g = globalThis as unknown as { __vpLocks?: Map<string, Promise<unknown>> };
const locks = (g.__vpLocks ??= new Map<string, Promise<unknown>>());

async function withInvoiceLock<T>(invoiceId: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(invoiceId) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.catch(() => undefined);
  locks.set(invoiceId, tail);
  try {
    return await run;
  } finally {
    if (locks.get(invoiceId) === tail) locks.delete(invoiceId);
  }
}

const freshInvoice = (id: string): Invoice => {
  const inv = read((d) => d.invoices.find((i) => i.id === id));
  if (!inv) throw new HttpError(404, 'Invoice not found.');
  return inv;
};

/* ------------------------------------------------------------------ *
 * Start checkout
 * ------------------------------------------------------------------ */
export async function startCheckout(user: SessionUser, invoiceId: string): Promise<{ url: string }> {
  // Ownership + role gate. Unknown id and "someone else's invoice" are indistinguishable (404).
  if (!getPayableInvoiceFor(user, invoiceId)) throw new HttpError(404, 'Invoice not found.');

  const mode = paymentMode();
  if (mode === 'disabled') throw new HttpError(503, 'Online payments are not configured. Please contact billing.');

  return withInvoiceLock(invoiceId, async () => {
    const inv = freshInvoice(invoiceId);
    if (inv.status === 'PAID') throw new HttpError(409, 'This invoice has already been paid.');

    // 1) Reuse an existing, still-open session - this is what makes double-submits harmless.
    if (inv.checkout) {
      if (mode === 'mock') return { url: inv.checkout.url };
      const existing = await getStripe().checkout.sessions.retrieve(inv.checkout.sessionId);
      if (existing.status === 'open' && existing.url) return { url: existing.url };
      if (existing.status === 'complete' && existing.payment_status === 'paid') {
        await finalizeFromStripeSession(existing);
        throw new HttpError(409, 'This invoice has already been paid.');
      }
      // expired -> fall through and create a new one
    }

    const version = inv.checkoutVersion + 1;
    let sessionId: string;
    let url: string;

    if (mode === 'mock') {
      sessionId = `mock_cs_${randomUUID()}`;
      url = `/pay/mock?invoice=${encodeURIComponent(inv.id)}&session=${encodeURIComponent(sessionId)}`;
    } else {
      // The amount comes from OUR database, never from the browser.
      const session = await getStripe().checkout.sessions.create(
        {
          mode: 'payment',
          payment_method_types: ['card'],
          client_reference_id: inv.id,
          customer_email: user.email,
          metadata: { invoiceId: inv.id, invoiceNumber: inv.number },
          payment_intent_data: { metadata: { invoiceId: inv.id, invoiceNumber: inv.number }, description: `Invoice ${inv.number}` },
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: inv.currency,
                unit_amount: inv.totalCents,
                product_data: { name: `Invoice ${inv.number}`, description: 'Nexus Corporate Services' },
              },
            },
          ],
          success_url: `${appUrl()}/invoices/${encodeURIComponent(inv.id)}?checkout=success`,
          cancel_url: `${appUrl()}/invoices/${encodeURIComponent(inv.id)}?checkout=cancelled`,
        },
        // Stripe-side guard: the same invoice+version can only ever produce ONE session,
        // even across several server instances.
        { idempotencyKey: `vaultpay:${inv.id}:v${version}` },
      );
      if (!session.url) throw new HttpError(502, 'Could not start checkout. Please try again.');
      sessionId = session.id;
      url = session.url;
    }

    await transact((d) => {
      const target = d.invoices.find((i) => i.id === inv.id);
      if (!target) throw new Error('invoice vanished');
      target.checkoutVersion = version;
      target.checkout = { sessionId, url, version, createdAt: new Date().toISOString() };
      if (!target.sessionHistory.includes(sessionId)) target.sessionHistory.push(sessionId);
    });
    return { url };
  });
}

/* ------------------------------------------------------------------ *
 * Mark paid. The ONLY function that can ever set status = PAID.
 * ------------------------------------------------------------------ */
export interface FinalizeInput {
  invoiceId: string;
  sessionId: string;
  paymentIntentId: string | null;
  amountCents: number;
  currency: string;
  mode: 'stripe' | 'mock';
  eventId?: string;
}

export interface FinalizeResult {
  newlyPaid: boolean;
  duplicate: boolean;
  paymentId: string | null;
}

export async function finalizePayment(input: FinalizeInput): Promise<FinalizeResult> {
  const result = await transact<FinalizeResult>((d) => {
    if (input.eventId) {
      if (d.processedEvents.includes(input.eventId)) return { newlyPaid: false, duplicate: false, paymentId: null };
      d.processedEvents.push(input.eventId);
      if (d.processedEvents.length > 5000) d.processedEvents.splice(0, d.processedEvents.length - 5000);
    }

    const inv = d.invoices.find((i) => i.id === input.invoiceId);
    if (!inv) throw new Error(`Payment for unknown invoice ${input.invoiceId}`);
    if (!inv.sessionHistory.includes(input.sessionId)) {
      throw new Error(`Session ${input.sessionId} was never issued for invoice ${inv.number}`);
    }
    // Integrity check: what was charged must equal what we billed. Otherwise do NOT mark paid.
    if (input.amountCents !== inv.totalCents || input.currency.toLowerCase() !== inv.currency) {
      throw new Error(
        `AMOUNT MISMATCH on ${inv.number}: charged ${input.amountCents} ${input.currency}, expected ${inv.totalCents} ${inv.currency}`,
      );
    }

    const already = d.payments.find((p) => p.sessionId === input.sessionId);
    if (already) return { newlyPaid: false, duplicate: false, paymentId: already.id };

    const now = new Date().toISOString();
    const payment: Payment = {
      id: newId('pay'),
      invoiceId: inv.id,
      sessionId: input.sessionId,
      paymentIntentId: input.paymentIntentId,
      amountCents: input.amountCents,
      currency: input.currency.toLowerCase(),
      paidAt: now,
      status: 'SUCCEEDED',
      receiptEmail: 'PENDING',
      mode: input.mode,
    };

    if (inv.status === 'PAID') {
      // A second, different session was paid (e.g. two tabs). Record it for a manual refund.
      payment.status = 'DUPLICATE';
      payment.receiptEmail = 'FAILED';
      d.payments.push(payment);
      console.error(`[payments] DUPLICATE PAYMENT on ${inv.number} (session ${input.sessionId}) - refund required.`);
      return { newlyPaid: false, duplicate: true, paymentId: payment.id };
    }

    inv.status = 'PAID';
    inv.paidAt = now;
    d.payments.push(payment);
    return { newlyPaid: true, duplicate: false, paymentId: payment.id };
  });

  if (result.newlyPaid && result.paymentId) {
    // Never let an email problem undo a successful payment.
    await sendReceipt(result.paymentId).catch((e) => console.error('[receipt] failed:', e));
  }
  return result;
}

export async function finalizeFromStripeSession(
  session: Stripe.Checkout.Session,
  eventId?: string,
): Promise<FinalizeResult | null> {
  if (session.payment_status !== 'paid') return null;
  const invoiceId = session.metadata?.invoiceId ?? session.client_reference_id;
  if (!invoiceId || session.metadata?.invoiceId !== session.client_reference_id) {
    throw new Error(`Checkout session ${session.id} has inconsistent invoice references`);
  }
  if (session.amount_total == null || !session.currency) throw new Error(`Session ${session.id} is missing amount data`);
  return finalizePayment({
    invoiceId,
    sessionId: session.id,
    paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null,
    amountCents: session.amount_total,
    currency: session.currency,
    mode: 'stripe',
    eventId,
  });
}

/* ------------------------------------------------------------------ *
 * Verify (called by the success page; reads the truth from Stripe)
 * ------------------------------------------------------------------ */
export async function verifyCheckout(user: SessionUser, invoiceId: string): Promise<{ status: 'PAID' | 'UNPAID' }> {
  if (!getPayableInvoiceFor(user, invoiceId)) throw new HttpError(404, 'Invoice not found.');
  const inv = freshInvoice(invoiceId);
  if (inv.status === 'PAID') return { status: 'PAID' };
  if (paymentMode() === 'stripe' && inv.checkout) {
    const session = await getStripe().checkout.sessions.retrieve(inv.checkout.sessionId);
    // Trust Stripe's answer, not the browser's query string.
    await finalizeFromStripeSession(session);
  }
  return { status: freshInvoice(invoiceId).status };
}

/* ------------------------------------------------------------------ *
 * Receipt email (PDF attached)
 * ------------------------------------------------------------------ */
export async function sendReceipt(paymentId: string): Promise<void> {
  const ctx = read((d) => {
    const payment = d.payments.find((p) => p.id === paymentId);
    const invoice = payment && d.invoices.find((i) => i.id === payment.invoiceId);
    const client = invoice && d.users.find((u) => u.id === invoice.clientId);
    return payment && invoice && client ? { payment, invoice, client } : null;
  });
  if (!ctx) throw new Error('receipt context not found');

  let outcome: Payment['receiptEmail'] = 'SENT';
  try {
    const pdf = await renderReceiptPdf(ctx.invoice, ctx.client, ctx.payment);
    const amount = formatUSD(ctx.payment.amountCents);
    await sendMail({
      to: ctx.client.email,
      subject: `Payment receipt - Invoice ${ctx.invoice.number} (${amount})`,
      text: `Hello ${ctx.client.name},\n\nWe have received your payment of ${amount} for invoice ${ctx.invoice.number}. Your receipt is attached as a PDF.\n\nThank you,\nNexus Corporate Services`,
      html: `<p>Hello ${escapeHtml(ctx.client.name)},</p><p>We have received your payment of <strong>${escapeHtml(amount)}</strong> for invoice <strong>${escapeHtml(ctx.invoice.number)}</strong>. Your receipt is attached as a PDF.</p><p>Thank you,<br/>Nexus Corporate Services</p>`,
      attachments: [{ filename: `receipt-${ctx.invoice.number}.pdf`, content: pdf, contentType: 'application/pdf' }],
    });
  } catch (e) {
    outcome = 'FAILED';
    console.error('[receipt] email failed:', e);
  }
  await transact((d) => {
    const p = d.payments.find((x) => x.id === paymentId);
    if (p) p.receiptEmail = outcome;
  });
}
