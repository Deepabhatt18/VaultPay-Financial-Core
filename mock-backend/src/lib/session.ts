import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SignJWT, jwtVerify } from 'jose';
import { getAuthSecret, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from './secret';
import { read, type User, type Role } from './db';

export type SessionUser = Pick<User, 'id' | 'name' | 'email' | 'company' | 'role'>;

export async function createSessionToken(user: User): Promise<string> {
  return new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getAuthSecret());
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_MAX_AGE_SECONDS,
};

/**
 * Resolves the current user from the signed cookie AND re-reads them from the database.
 * The role in the token is never trusted for authorisation in handlers - a deleted user
 * or a demoted admin loses access immediately.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getAuthSecret(), { algorithms: ['HS256'] });
    const id = payload.sub;
    if (!id) return null;
    const user = read((d) => d.users.find((u) => u.id === id));
    if (!user) return null;
    return { id: user.id, name: user.name, email: user.email, company: user.company, role: user.role };
  } catch {
    return null;
  }
}

/** For server components / layouts: kicks the visitor out instead of rendering. */
export async function requireUser(role?: Role): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (role && user.role !== role) redirect('/403');
  return user;
}
