import { NextResponse, type NextRequest } from 'next/server';

/**
 * THE SECURITY GUARD (route guard, layer 1 of 2).
 *
 * Runs before any page renders. It asks the BACKEND who the visitor is (GET /api/auth/me with the
 * visitor's cookie), so the frontend never needs the signing secret and a revoked session is
 * noticed immediately.
 *   - not signed in            -> /login
 *   - CLIENT on /admin/**       -> /403   (instant kick-out)
 * Layer 2 is requireUser() inside each server page, so a bypass of this file still shows no data.
 * The real data protection is in the backend: it filters by owner on every request.
 */

const API_URL = (process.env.API_URL || 'http://localhost:4000').replace(/\/+$/, '');
const PUBLIC_PAGES = new Set(['/login', '/403']);

type Who = { role: 'ADMIN' | 'CLIENT' } | null;

async function whoAmI(req: NextRequest): Promise<Who> {
  const cookie = req.headers.get('cookie');
  if (!cookie) return null;
  try {
    const res = await fetch(`${API_URL}/api/auth/me`, { headers: { cookie }, cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as { user?: { role?: string } };
    const role = data.user?.role;
    return role === 'ADMIN' || role === 'CLIENT' ? { role } : null;
  } catch {
    return null; // fail closed: if we cannot verify, treat as signed out
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const who = await whoAmI(req);
  const home = who?.role === 'ADMIN' ? '/admin/dashboard' : '/dashboard';

  if (PUBLIC_PAGES.has(pathname)) {
    // Signed-in users do not need the login page.
    if (who && pathname === '/login') return NextResponse.redirect(new URL(home, req.url));
    return NextResponse.next();
  }

  if (!who) {
    const url = new URL('/login', req.url);
    if (pathname !== '/') url.searchParams.set('next', pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }

  const isAdminArea = pathname === '/admin' || pathname.startsWith('/admin/');
  if (isAdminArea && who.role !== 'ADMIN') return NextResponse.redirect(new URL('/403', req.url));

  return NextResponse.next();
}

export const config = {
  // Pages only. /api/* is proxied to the backend, which authenticates every call itself.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
