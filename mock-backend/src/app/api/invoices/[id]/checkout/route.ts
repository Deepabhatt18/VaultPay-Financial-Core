import { handle, HttpError, json, requireApiUser } from '@/lib/http';
import { startCheckout } from '@/lib/payments';
import { rateLimit } from '@/lib/rate-limit';
import { idParam } from '@/lib/validation';

export const runtime = 'nodejs';

/**
 * Creates (or re-uses) the Stripe Checkout Session for an invoice.
 * Idempotent by design: calling this 1 time or 20 times yields the SAME session, so a
 * double-click can never produce two payments. The body is ignored - amount comes from the DB.
 */
export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser('CLIENT');
  const id = idParam.safeParse((await ctx.params).id);
  if (!id.success) throw new HttpError(404, 'Invoice not found.');

  const limit = rateLimit(`checkout:${user.id}`, 30, 60_000);
  if (!limit.ok) throw new HttpError(429, 'Too many requests. Please wait a moment.');

  const { url } = await startCheckout(user, id.data);
  return json({ url });
});
