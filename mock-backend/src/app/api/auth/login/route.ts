import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { read } from '@/lib/db';
import { apiError, clientIp, handle, readJson } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';
import { SESSION_COOKIE } from '@/lib/secret';
import { createSessionToken, sessionCookieOptions } from '@/lib/session';
import { loginSchema } from '@/lib/validation';

export const runtime = 'nodejs';

// Compared against when the email is unknown, so response time does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);
const WINDOW = 15 * 60 * 1000;

export const POST = handle(async (req: Request) => {
  const body = loginSchema.safeParse(await readJson(req));
  if (!body.success) return apiError(400, 'Enter a valid email and password.');
  const { email, password } = body.data;

  const ip = rateLimit(`login:ip:${clientIp(req)}`, 40, WINDOW);
  const acct = rateLimit(`login:acct:${email}`, 8, WINDOW);
  if (!ip.ok || !acct.ok) {
    const retry = Math.max(ip.retryAfterSec, acct.retryAfterSec);
    return apiError(429, `Too many attempts. Try again in ${Math.ceil(retry / 60)} minute(s).`, { 'Retry-After': String(retry) });
  }

  const user = read((d) => d.users.find((u) => u.email === email));
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) return apiError(401, 'Invalid email or password.');

  const res = NextResponse.json({
    ok: true,
    role: user.role,
    redirect: user.role === 'ADMIN' ? '/admin/dashboard' : '/dashboard',
  });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(user), sessionCookieOptions);
  return res;
});
