import { handle, HttpError, json, requireApiUser } from '@/lib/http';
import { verifyCheckout } from '@/lib/payments';
import { idParam } from '@/lib/validation';

export const runtime = 'nodejs';

/** Called after returning from Stripe. Asks Stripe (server to server) what really happened. */
export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser('CLIENT');
  const id = idParam.safeParse((await ctx.params).id);
  if (!id.success) throw new HttpError(404, 'Invoice not found.');
  return json(await verifyCheckout(user, id.data));
});
