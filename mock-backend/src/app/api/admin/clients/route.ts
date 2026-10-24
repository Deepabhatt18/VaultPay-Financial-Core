import bcrypt from 'bcryptjs';
import { newId, read, transact } from '@/lib/db';
import { handle, HttpError, json, readJson, requireApiUser } from '@/lib/http';
import { adminOverview } from '@/lib/invoices';
import { createClientSchema } from '@/lib/validation';

export const runtime = 'nodejs';

export const GET = handle(async () => {
  await requireApiUser('ADMIN');
  return json({ clients: adminOverview().clients });
});

export const POST = handle(async (req: Request) => {
  await requireApiUser('ADMIN');
  const input = createClientSchema.parse(await readJson(req));
  const passwordHash = await bcrypt.hash(input.password, 12);

  const exists = read((d) => d.users.some((u) => u.email === input.email));
  if (exists) throw new HttpError(409, 'A user with this email already exists.');

  const user = await transact((d) => {
    if (d.users.some((u) => u.email === input.email)) throw new HttpError(409, 'A user with this email already exists.');
    const u = {
      id: newId('usr'),
      name: input.name,
      email: input.email,
      company: input.company,
      role: 'CLIENT' as const,
      passwordHash,
      createdAt: new Date().toISOString(),
    };
    d.users.push(u);
    return u;
  });
  return json({ id: user.id, name: user.name, company: user.company, email: user.email }, 201);
});
