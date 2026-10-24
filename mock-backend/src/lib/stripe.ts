import 'server-only';
import Stripe from 'stripe';

export type PaymentMode = 'stripe' | 'mock' | 'disabled';

/**
 * - stripe:   STRIPE_SECRET_KEY present (real Stripe, test or live keys).
 * - mock:     no key AND (not production OR ALLOW_MOCK_PAYMENTS=true). Local demo only.
 * - disabled: no key in production -> checkout refuses (fail closed, never fake a payment).
 */
export function paymentMode(): PaymentMode {
  if (process.env.STRIPE_SECRET_KEY) return 'stripe';
  if (process.env.NODE_ENV !== 'production' || process.env.ALLOW_MOCK_PAYMENTS === 'true') return 'mock';
  return 'disabled';
}

const g = globalThis as unknown as { __vpStripe?: Stripe };

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('Stripe is not configured.');
  return (g.__vpStripe ??= new Stripe(key, { maxNetworkRetries: 2, timeout: 20_000 }));
}

export function appUrl(): string {
  return (process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
}
