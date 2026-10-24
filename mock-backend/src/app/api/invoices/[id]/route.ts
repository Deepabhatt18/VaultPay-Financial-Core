import { handle, HttpError, json, requireApiUser } from '@/lib/http';
import { getClientOf, getInvoiceFor, toDTO } from '@/lib/invoices';
import { idParam } from '@/lib/validation';

export const runtime = 'nodejs';

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser();
  const id = idParam.safeParse((await ctx.params).id);
  const inv = id.success ? getInvoiceFor(user, id.data) : null;
  if (!inv) throw new HttpError(404, 'Invoice not found.');
  return json({ invoice: toDTO(inv, getClientOf(inv)) });
});
