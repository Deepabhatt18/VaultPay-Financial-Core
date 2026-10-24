import { handle, json, requireApiUser } from '@/lib/http';
import { adminOverview } from '@/lib/invoices';

export const runtime = 'nodejs';

/** ADMIN only: totals + per-client summary for the master dashboard. */
export const GET = handle(async () => {
  await requireApiUser('ADMIN');
  return json(adminOverview());
});
