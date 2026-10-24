/**
 * Shared by the Edge middleware and the Node runtime, so it must not import Node-only modules.
 * In production a strong AUTH_SECRET is mandatory (fail closed).
 */
const DEV_FALLBACK = 'dev-only-insecure-secret-change-me-please-0123456789';

export function getAuthSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('AUTH_SECRET must be set to at least 32 characters in production.');
    }
    return new TextEncoder().encode(DEV_FALLBACK);
  }
  return new TextEncoder().encode(secret);
}

export const SESSION_COOKIE = 'vp_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8; // 8 hours
