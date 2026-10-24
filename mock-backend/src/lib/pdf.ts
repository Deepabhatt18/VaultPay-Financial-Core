import 'server-only';
import PDFDocument from 'pdfkit';
import type { Invoice, Payment, User } from './db';
import { formatDate, formatDateTime, formatUSD } from './money';

const NAVY = '#0f2a4a';
const GREY = '#5b6675';
const LINE = '#d9dee5';
const GREEN = '#15803d';

const clean = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

function build(title: string, draw: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margin: 50,
      info: { Title: title, Author: 'Nexus Corporate Services', Producer: 'VaultPay Financial Core' },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      draw(doc);
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

function header(doc: PDFKit.PDFDocument, label: string, number: string) {
  doc.rect(0, 0, doc.page.width, 96).fill(NAVY);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(20).text('Nexus Corporate Services', 50, 32);
  doc.font('Helvetica').fontSize(10).fillColor('#b8c7dc').text('New York, NY, USA', 50, 58);
  doc.font('Helvetica-Bold').fontSize(22).fillColor('#ffffff').text(label, 300, 28, { width: 262, align: 'right' });
  doc.font('Helvetica').fontSize(11).fillColor('#b8c7dc').text(number, 300, 58, { width: 262, align: 'right' });
  doc.fillColor('#000000');
  doc.y = 126;
}

function kv(doc: PDFKit.PDFDocument, x: number, y: number, k: string, v: string, width = 240) {
  doc.font('Helvetica').fontSize(8.5).fillColor(GREY).text(k.toUpperCase(), x, y, { width });
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#111827').text(clean(v), x, y + 12, { width });
}

function billTo(doc: PDFKit.PDFDocument, client: Pick<User, 'name' | 'company' | 'email'>, y: number) {
  kv(doc, 50, y, 'Billed to', `${client.company}`);
  doc.font('Helvetica').fontSize(10).fillColor(GREY).text(clean(`${client.name} - ${client.email}`), 50, y + 28, { width: 240 });
}

export function renderInvoicePdf(inv: Invoice, client: User): Promise<Buffer> {
  return build(`Invoice ${inv.number}`, (doc) => {
    header(doc, 'INVOICE', inv.number);
    const top = 126;
    billTo(doc, client, top);
    kv(doc, 330, top, 'Issue date', formatDate(inv.issueDate), 110);
    kv(doc, 450, top, 'Due date', formatDate(inv.dueDate), 112);
    kv(doc, 330, top + 46, 'Status', inv.status === 'PAID' ? 'PAID' : 'PAYMENT DUE', 110);
    kv(doc, 450, top + 46, 'Amount due', inv.status === 'PAID' ? formatUSD(0) : formatUSD(inv.totalCents), 112);

    // table header
    let y = top + 110;
    doc.rect(50, y, 512, 24).fill('#eef2f7');
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9);
    doc.text('DESCRIPTION', 58, y + 8, { width: 270 });
    doc.text('QTY', 335, y + 8, { width: 40, align: 'right' });
    doc.text('UNIT PRICE', 385, y + 8, { width: 80, align: 'right' });
    doc.text('AMOUNT', 475, y + 8, { width: 80, align: 'right' });
    y += 32;

    doc.font('Helvetica').fontSize(10).fillColor('#111827');
    for (const it of inv.items) {
      const descHeight = doc.heightOfString(clean(it.description), { width: 270 });
      const rowH = Math.max(descHeight, 14) + 12;
      if (y + rowH > 640) {
        doc.addPage();
        y = 60;
      }
      doc.font('Helvetica').fontSize(10).fillColor('#111827');
      doc.text(clean(it.description), 58, y, { width: 270 });
      doc.text(String(it.quantity), 335, y, { width: 40, align: 'right' });
      doc.text(formatUSD(it.unitCents), 385, y, { width: 80, align: 'right' });
      doc.text(formatUSD(it.quantity * it.unitCents), 475, y, { width: 80, align: 'right' });
      y += rowH;
      doc.moveTo(50, y - 5).lineTo(562, y - 5).strokeColor(LINE).lineWidth(0.5).stroke();
    }

    if (y > 600) {
      doc.addPage();
      y = 60;
    }
    y += 10;
    doc.font('Helvetica').fontSize(10).fillColor(GREY).text('Subtotal', 385, y, { width: 80, align: 'right' });
    doc.fillColor('#111827').text(formatUSD(inv.totalCents), 475, y, { width: 80, align: 'right' });
    y += 22;
    doc.rect(375, y - 6, 187, 32).fill(NAVY);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11).text('TOTAL (USD)', 385, y + 3, { width: 80 });
    doc.fontSize(13).text(formatUSD(inv.totalCents), 465, y + 2, { width: 90, align: 'right' });

    if (inv.status === 'PAID') {
      doc.save();
      doc.rotate(-18, { origin: [150, y + 20] });
      doc.roundedRect(70, y - 5, 160, 46, 6).lineWidth(3).strokeColor(GREEN).stroke();
      doc.font('Helvetica-Bold').fontSize(30).fillColor(GREEN).text('PAID', 70, y + 2, { width: 160, align: 'center' });
      doc.restore();
    }

    if (inv.notes) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor(GREY).text('NOTES', 50, y + 60);
      doc.font('Helvetica').fontSize(10).fillColor('#111827').text(clean(inv.notes), 50, y + 74, { width: 300 });
    }

    doc.font('Helvetica').fontSize(8.5).fillColor(GREY).text(
      'Pay securely online by card in the Nexus client portal. Questions? Contact billing at Nexus Corporate Services.',
      50,
      doc.page.height - 70,
      { width: 512, align: 'center' },
    );
  });
}

export function renderReceiptPdf(inv: Invoice, client: User, payment: Payment): Promise<Buffer> {
  return build(`Receipt for ${inv.number}`, (doc) => {
    header(doc, 'PAYMENT RECEIPT', inv.number);
    const top = 126;
    billTo(doc, client, top);
    kv(doc, 330, top, 'Payment date', formatDateTime(payment.paidAt), 232);
    kv(doc, 330, top + 46, 'Payment reference', payment.paymentIntentId || payment.sessionId, 232);

    let y = top + 120;
    doc.rect(50, y, 512, 84).fill('#f0fdf4').strokeColor('#bbf7d0').lineWidth(1).stroke();
    doc.font('Helvetica-Bold').fontSize(11).fillColor(GREEN).text('PAYMENT RECEIVED - THANK YOU', 66, y + 14);
    doc.font('Helvetica-Bold').fontSize(26).fillColor('#111827').text(formatUSD(payment.amountCents), 66, y + 36);
    doc.font('Helvetica').fontSize(10).fillColor(GREY).text(`Paid in full for invoice ${inv.number}`, 300, y + 46, { width: 250, align: 'right' });

    y += 112;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(GREY).text('SERVICES', 50, y);
    y += 18;
    doc.font('Helvetica').fontSize(10).fillColor('#111827');
    for (const it of inv.items) {
      if (y > 660) {
        doc.addPage();
        y = 60;
      }
      doc.text(`${clean(it.description)}  (x${it.quantity})`, 50, y, { width: 400 });
      doc.text(formatUSD(it.quantity * it.unitCents), 460, y, { width: 100, align: 'right' });
      y += doc.heightOfString(clean(it.description), { width: 400 }) + 8;
    }
    doc.font('Helvetica').fontSize(8.5).fillColor(GREY).text(
      'This receipt was generated automatically by VaultPay Financial Core. Keep it for your records.',
      50,
      doc.page.height - 70,
      { width: 512, align: 'center' },
    );
  });
}
