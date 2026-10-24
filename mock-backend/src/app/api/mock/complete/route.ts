import { handle, HttpError, json, readJson, requireApiUser } from '@/lib/http';
import { getPayableInvoiceFor } from '@/lib/invoices';
import { finalizePayment } from '@/lib/payments';
import { paymentMode } from '@/lib/stripe';
import { mockCompleteSchema } from '@/lib/validation';

export const runtime = 'nodejs';

/**
 * LOCAL DEMO ONLY. Simulates "the card was charged" when no Stripe key is configured.
 * It does not exist when Stripe is configured, nor in a production build without ALLOW_MOCK_PAYMENTS.
 */
export const POST = handle(async (req: Request) => {
  if (paymentMode() !== 'mock') throw new HttpError(404, 'Not found.');
  const user = await requireApiUser('CLIENT');
  const { invoiceId, sessionId } = mockCompleteSchema.parse(await readJson(req));

  const inv = getPayableInvoiceFor(user, invoiceId);
  if (!inv || !inv.checkout || inv.checkout.sessionId !== sessionId) throw new HttpError(404, 'Invoice not found.');
  if (inv.status === 'PAID') throw new HttpError(409, 'This invoice has already been paid.');

  const result = await finalizePayment({
    invoiceId: inv.id,
    sessionId,
    paymentIntentId: `mock_pi_${sessionId.slice(-8)}`,
    amountCents: inv.totalCents,
    currency: inv.currency,
    mode: 'mock',
  });
  return json({ ok: true, newlyPaid: result.newlyPaid });
});
