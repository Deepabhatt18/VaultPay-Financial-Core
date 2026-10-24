import type Stripe from 'stripe';
import { finalizeFromStripeSession } from '@/lib/payments';
import { getStripe } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The authoritative "payment succeeded" signal.
 * Nobody can call this successfully without Stripe's signing secret, so a user cannot
 * mark their own invoice as paid by crafting a request.
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !process.env.STRIPE_SECRET_KEY) {
    return Response.json({ error: 'Webhook not configured.' }, { status: 503 });
  }
  const signature = req.headers.get('stripe-signature');
  if (!signature) return Response.json({ error: 'Missing signature.' }, { status: 400 });

  const rawBody = await req.text(); // must be the exact raw payload for signature verification
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    return Response.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  try {
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      await finalizeFromStripeSession(event.data.object as Stripe.Checkout.Session, event.id);
    }
    return Response.json({ received: true });
  } catch (err) {
    console.error('[webhook] processing failed:', err);
    // 500 makes Stripe retry later and keeps the failure visible in the Stripe dashboard.
    return Response.json({ error: 'Processing failed.' }, { status: 500 });
  }
}
