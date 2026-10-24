import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { getAuthSecret, SESSION_COOKIE } from '@/lib/secret';

/**
 * THE SECURITY GUARD (layer 1 of 3).
 *   1. this middleware   - runs before any page or API code
 *   2. page/layout guards - requireUser()/requireUser('ADMIN') on the server
 *   3. data layer         - getInvoiceFor() ownership checks on every query
 * Any single layer failing does not expose data.
 */

const PUBLIC_PAGES = new Set(['/login', '/403']);
const PUBLIC_API = new Set(['/api/auth/login', '/api/webhooks/stripe']);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith('/api/');

  // CSRF defence-in-depth (cookies are also SameSite=Lax): state-changing API calls must come from our own origin.
  // The Stripe webhook is exempt - it is authenticated by its signature instead.
  if (isApi && !SAFE_METHODS.has(req.method) && pathname !== '/api/webhooks/stripe' && !sameOrigin(req)) {
    return jsonError(403, 'Cross-origin request blocked.');
  }

  // Verify the session cookie (signature + expiry).
  let role: string | null = null;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, getAuthSecret(), { algorithms: ['HS256'] });
      role = typeof payload.role === 'string' ? payload.role : null;
    } catch {
      role = null;
    }
  }

  const isPublic = PUBLIC_PAGES.has(pathname) || PUBLIC_API.has(pathname);

  if (!role && !isPublic) {
    if (isApi) return jsonError(401, 'Authentication required.');
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    if (req.method === 'GET' && pathname !== '/') url.searchParams.set('next', pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }

  // Signed-in users do not need the login page.
  if (role && pathname === '/login') {
    const url = req.nextUrl.clone();
    url.pathname = role === 'ADMIN' ? '/admin/dashboard' : '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // RBAC: /admin/** and /api/admin/** are ADMIN only. A CLIENT is kicked out instantly.
  const isAdminArea = pathname === '/admin' || pathname.startsWith('/admin/') || pathname.startsWith('/api/admin/');
  if (isAdminArea && role !== 'ADMIN') {
    if (isApi) return jsonError(403, 'You do not have permission to perform this action.');
    const url = req.nextUrl.clone();
    url.pathname = '/403';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
