import { handle, json, readJson, requireApiUser } from '@/lib/http';
import { createInvoice } from '@/lib/invoices';
import { createInvoiceSchema } from '@/lib/validation';

export const runtime = 'nodejs';

export const POST = handle(async (req: Request) => {
  const admin = await requireApiUser('ADMIN'); // second guard, after the middleware
  const input = createInvoiceSchema.parse(await readJson(req));
  try {
    const inv = await createInvoice(admin.id, input);
    return json({ id: inv.id, number: inv.number, totalCents: inv.totalCents }, 201);
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status) return json({ error: (e as Error).message }, status);
    throw e;
  }
});
