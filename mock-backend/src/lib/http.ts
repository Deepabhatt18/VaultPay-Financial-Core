import 'server-only';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getSessionUser, type SessionUser } from './session';
import type { Role } from './db';

export function json(data: unknown, status = 200, headers?: HeadersInit) {
  return NextResponse.json(data, { status, headers });
}

export function apiError(status: number, message: string, headers?: HeadersInit) {
  return json({ error: message }, status, headers);
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Authenticates an API request. Throws HttpError(401/403) which `handle` turns into a response. */
export async function requireApiUser(role?: Role): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new HttpError(401, 'Authentication required.');
  if (role && user.role !== role) throw new HttpError(403, 'You do not have permission to perform this action.');
  return user;
}

/** Wraps a route handler so errors never leak stack traces or internals. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) return apiError(err.status, err.message);
      if (err instanceof ZodError) {
        return apiError(400, err.issues[0] ? `${err.issues[0].path.join('.') || 'input'}: ${err.issues[0].message}` : 'Invalid input.');
      }
      console.error('[api] unhandled error:', err);
      return apiError(500, 'Something went wrong. Please try again.');
    }
  };
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.');
  }
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0].trim() : req.headers.get('x-real-ip')) || 'unknown';
}
