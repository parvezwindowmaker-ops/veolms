import { rateLimit } from 'express-rate-limit';

/**
 * Rate limiters (in-memory store). The app is small/single-instance for the
 * challenge; for horizontal scaling swap in a shared store (e.g. rate-limit-redis
 * backed by the existing ioredis client) so counts are shared across instances.
 * `app.set('trust proxy', 1)` (in app.ts) makes the client IP correct behind one
 * reverse proxy (Render/Railway/etc.).
 */
const common = {
  standardHeaders: 'draft-7' as const,
  legacyHeaders: false,
};

/** Sensitive money endpoints: order creation + verification. */
export const paymentLimiter = rateLimit({
  ...common,
  windowMs: 60_000, // 1 minute
  limit: 30,
  message: { message: 'Too many payment requests. Please try again shortly.' },
});

/** Public, unauthenticated (HMAC-gated) webhook; backstop before the HMAC check. */
export const webhookLimiter = rateLimit({
  ...common,
  windowMs: 60_000,
  limit: 120,
  message: { message: 'Too many requests.' },
});

/** Auth endpoints (login): slow down credential brute-forcing. */
export const authLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60_000, // 15 minutes
  limit: 50,
  message: { message: 'Too many attempts. Please try again later.' },
});
