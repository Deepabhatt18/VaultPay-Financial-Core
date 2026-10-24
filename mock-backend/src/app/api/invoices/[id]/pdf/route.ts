import { handle, HttpError, requireApiUser } from '@/lib/http';
import { getClientOf, getInvoiceFor } from '@/lib/invoices';
import { renderInvoicePdf } from '@/lib/pdf';
import { idParam } from '@/lib/validation';

export const runtime = 'nodejs';

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser();
  const id = idParam.safeParse((await ctx.params).id);
  const inv = id.success ? getInvoiceFor(user, id.data) : null;
  const client = inv ? getClientOf(inv) : undefined;
  if (!inv || !client) throw new HttpError(404, 'Invoice not found.');

  const pdf = await renderInvoicePdf(inv, client);
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="invoice-${inv.number}.pdf"`,
      'Content-Length': String(pdf.length),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
