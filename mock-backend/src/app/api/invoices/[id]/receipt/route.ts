import { read } from '@/lib/db';
import { handle, HttpError, requireApiUser } from '@/lib/http';
import { getClientOf, getInvoiceFor } from '@/lib/invoices';
import { renderReceiptPdf } from '@/lib/pdf';
import { idParam } from '@/lib/validation';

export const runtime = 'nodejs';

export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser();
  const id = idParam.safeParse((await ctx.params).id);
  const inv = id.success ? getInvoiceFor(user, id.data) : null;
  const client = inv ? getClientOf(inv) : undefined;
  if (!inv || !client) throw new HttpError(404, 'Invoice not found.');
  if (inv.status !== 'PAID') throw new HttpError(409, 'No receipt yet - this invoice has not been paid.');

  const payment = read((d) => d.payments.find((p) => p.invoiceId === inv.id && p.status === 'SUCCEEDED'));
  if (!payment) throw new HttpError(404, 'Receipt not found.');

  const pdf = await renderReceiptPdf(inv, client, payment);
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="receipt-${inv.number}.pdf"`,
      'Content-Length': String(pdf.length),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
