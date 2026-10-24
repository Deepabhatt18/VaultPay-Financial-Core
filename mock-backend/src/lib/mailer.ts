import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import nodemailer from 'nodemailer';

export interface MailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments: { filename: string; content: Buffer; contentType: string }[];
}

/**
 * Sends via SMTP when SMTP_HOST is configured. Otherwise (local dev) the email and its PDF
 * are written to .data/outbox/ so the receipt flow can be inspected without a mail server.
 */
export async function sendMail(mail: MailInput): Promise<'smtp' | 'outbox'> {
  const from = process.env.MAIL_FROM || 'Nexus Corporate Services <billing@nexus-corp.example>';
  if (process.env.SMTP_HOST) {
    const port = Number(process.env.SMTP_PORT || 587);
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
    await transport.sendMail({ from, ...mail });
    return 'smtp';
  }

  const dir = path.join(process.cwd(), '.data', 'outbox');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeTo = mail.to.replace(/[^a-zA-Z0-9@._-]/g, '_');
  fs.writeFileSync(
    path.join(dir, `${stamp}_${safeTo}.txt`),
    `From: ${from}\nTo: ${mail.to}\nSubject: ${mail.subject}\nAttachments: ${mail.attachments.map((a) => a.filename).join(', ')}\n\n${mail.text}\n`,
  );
  for (const a of mail.attachments) {
    fs.writeFileSync(path.join(dir, `${stamp}_${a.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`), a.content);
  }
  console.log(`[mail] SMTP not configured - receipt for ${mail.to} written to .data/outbox/`);
  return 'outbox';
}

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
