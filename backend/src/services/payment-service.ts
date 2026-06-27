import crypto from 'crypto';
import { env } from '../config/env';
import { ApiError } from '../types/interface';

/**
 * Razorpay integration. We talk to the Orders REST API directly (Basic auth)
 * instead of pulling in the SDK. That keeps the dependency surface small and the
 * exact request/response easy to reason about. Signature verification is done
 * with Node's crypto (HMAC-SHA256), the same algorithm Razorpay documents.
 */

const ORDERS_URL = 'https://api.razorpay.com/v1/orders';

/** Whether order creation + checkout is enabled (key id + secret present). */
export const isPaymentConfigured = (): boolean => env.razorpay.configured;

/** Whether webhook verification is enabled (a webhook secret is configured). */
export const isWebhookConfigured = (): boolean =>
  !!env.razorpay.webhookSecret;

/** The public key id the client needs to open Razorpay Checkout. */
export const getPublishableKey = (): string => env.razorpay.keyId;

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
  receipt?: string;
}

/**
 * Create a Razorpay order for `amount` (paise). The amount is always derived
 * server-side from the course price; the client value is never trusted.
 */
export async function createOrder(params: {
  amount: number;
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrder> {
  if (!env.razorpay.configured) {
    throw new ApiError(503, 'Payments are not configured');
  }

  const auth = Buffer.from(
    `${env.razorpay.keyId}:${env.razorpay.keySecret}`
  ).toString('base64');

  let response: globalThis.Response;
  try {
    response = await fetch(ORDERS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: params.amount,
        currency: params.currency,
        receipt: params.receipt,
        notes: params.notes ?? {},
      }),
      // Bound the call so a stalled gateway can't pin a request (and its DB
      // pool slot) open indefinitely.
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // Network failure or timeout reaching Razorpay.
    throw new ApiError(502, 'Could not reach the payment gateway');
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error('Razorpay order creation failed:', response.status, detail);
    throw new ApiError(502, 'Failed to create payment order');
  }

  return (await response.json()) as RazorpayOrder;
}

/** Constant-time comparison of two hex digests. Rejects non-strings safely. */
function safeEqualHex(a: unknown, b: unknown): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verify the checkout callback signature:
 *   HMAC_SHA256(order_id + "|" + payment_id, key_secret) === razorpay_signature
 */
export function verifyPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string
): boolean {
  if (!env.razorpay.keySecret || !orderId || !paymentId || !signature) {
    return false;
  }
  const expected = crypto
    .createHmac('sha256', env.razorpay.keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return safeEqualHex(expected, signature);
}

/**
 * Verify a webhook payload signature:
 *   HMAC_SHA256(raw_request_body, webhook_secret) === X-Razorpay-Signature
 * The RAW request bytes must be used, because re-serializing the parsed JSON would
 * change the bytes and break the signature.
 */
export function verifyWebhookSignature(
  rawBody: Buffer | string,
  signature: string | undefined
): boolean {
  if (!env.razorpay.webhookSecret || !signature) return false;
  const expected = crypto
    .createHmac('sha256', env.razorpay.webhookSecret)
    .update(rawBody)
    .digest('hex');
  return safeEqualHex(expected, signature);
}
