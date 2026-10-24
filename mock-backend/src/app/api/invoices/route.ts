import { handle, json, requireApiUser } from '@/lib/http';
import { listInvoicesFor } from '@/lib/invoices';

export const runtime = 'nodejs';

/** Admin: all invoices. Client: ONLY their own (filtered in the data layer, not in the UI). */
export const GET = handle(async () => {
  const user = await requireApiUser();
  return json({ invoices: listInvoicesFor(user) });
});
