import { Request, Response } from 'express';
import { Transaction, UniqueConstraintError, Op } from 'sequelize';
import { Payment } from './payment-model';
import { Course } from '../course/course-model';
import { Enrollment } from '../enrollment/enrollment-model';
import { User } from '../../control/user/user-model';
import { sequelize } from '../../../db/sequelize';
import { ApiError } from '../../../types/interface';
import { isAdminOrOwner } from '../../../middleware/role-middleware';
import { bodyId, nonNegInt } from '../../../helpers/parse-id';
import { isFreeCourse } from '../course/course-pricing';
import {
  createOrder,
  getPublishableKey,
  isPaymentConfigured,
  isWebhookConfigured,
  verifyPaymentSignature,
  verifyWebhookSignature,
} from '../../../services/payment-service';

/**
 * Grant access for a verified payment. Idempotent and safe under concurrency:
 * the payment row is locked, a second call (e.g. webhook after callback) is a
 * no-op, and the enrollment is upserted (unique userId+courseId).
 */
async function fulfillPayment(
  paymentId: number,
  razorpayPaymentId: string | null
): Promise<void> {
  await sequelize.transaction(async (t: Transaction) => {
    const payment = await Payment.findByPk(paymentId, {
      lock: t.LOCK.UPDATE,
      transaction: t,
    });
    if (!payment) return;

    if (payment.status !== 'paid') {
      payment.status = 'paid';
      if (razorpayPaymentId) payment.razorpayPaymentId = razorpayPaymentId;
      await payment.save({ transaction: t });
    }

    // The row lock serializes two fulfillments of the SAME order, but two
    // DIFFERENT orders for the same (user, course) can still race on the
    // enrollment's unique index. Run the upsert in a SAVEPOINT so a concurrent
    // insert surfaces as a UniqueConstraintError we can treat as success,
    // instead of poisoning the outer transaction.
    try {
      await sequelize.transaction({ transaction: t }, async (inner) => {
        await Enrollment.findOrCreate({
          where: { userId: payment.userId, courseId: payment.courseId },
          defaults: { userId: payment.userId, courseId: payment.courseId },
          transaction: inner,
        });
      });
    } catch (err) {
      if (!(err instanceof UniqueConstraintError)) throw err;
      // Already enrolled from a concurrent fulfillment, so the entitlement exists.
    }
  });
}

/**
 * Start a purchase: create a Razorpay order for a course (amount derived
 * server-side from the course price). Free courses enroll immediately.
 */
export const createPaymentOrder = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { courseId } = req.body ?? {};
  if (!courseId) throw new ApiError(400, 'courseId is required');
  const cid = bodyId(courseId, 'courseId');
  const userId = req.user!.id;

  const course = await Course.findByPk(cid);
  if (!course) throw new ApiError(404, 'Course not found');
  if (course.status !== 'published') {
    throw new ApiError(400, 'Cannot purchase an unpublished course');
  }
  // Owners/Admins already have full access; no purchase needed.
  if (isAdminOrOwner(req.user, course.instructorId)) {
    throw new ApiError(400, 'You already have access to this course');
  }

  const existing = await Enrollment.findOne({ where: { userId, courseId: cid } });
  if (existing) throw new ApiError(409, 'Already enrolled in this course');

  // Free course: skip the gateway and enroll directly.
  if (isFreeCourse(course.price)) {
    await Enrollment.findOrCreate({
      where: { userId, courseId: cid },
      defaults: { userId, courseId: cid },
    });
    res.status(201).json({
      data: { free: true, enrolled: true, courseId: cid },
      message: 'Enrolled in free course',
    });
    return;
  }

  // Entitlement is perpetual: if this user already paid for the course (e.g.
  // unenrolled and came back), re-grant access for free; never charge twice.
  const paid = await Payment.findOne({
    where: { userId, courseId: cid, status: 'paid' },
  });
  if (paid) {
    await Enrollment.findOrCreate({
      where: { userId, courseId: cid },
      defaults: { userId, courseId: cid },
    });
    res.status(201).json({
      data: { alreadyPurchased: true, enrolled: true, courseId: cid },
      message: 'Access restored from your earlier purchase',
    });
    return;
  }

  if (!isPaymentConfigured()) {
    throw new ApiError(503, 'Payments are not configured');
  }

  // Reuse an open order for this course at the current price instead of
  // spawning a new Razorpay order (and Payment row) on every click.
  const openOrder = await Payment.findOne({
    where: { userId, courseId: cid, status: 'created', amount: course.price },
    order: [['createdAt', 'DESC']],
  });
  if (openOrder) {
    res.status(201).json({
      data: {
        orderId: openOrder.razorpayOrderId,
        amount: openOrder.amount,
        currency: openOrder.currency,
        keyId: getPublishableKey(),
        courseId: cid,
        courseTitle: course.title,
      },
      message: 'Order created',
    });
    return;
  }

  const receipt = `rcpt_${cid}_${userId}_${Date.now().toString(36)}`.slice(0, 40);
  const order = await createOrder({
    amount: course.price, // paise, derived on the server; never sent by the client
    currency: course.currency,
    receipt,
    notes: { courseId: String(cid), userId: String(userId) },
  });

  await Payment.create({
    userId,
    courseId: cid,
    razorpayOrderId: order.id,
    amount: course.price,
    currency: course.currency,
    status: 'created',
  });

  res.status(201).json({
    data: {
      orderId: order.id,
      amount: course.price,
      currency: course.currency,
      keyId: getPublishableKey(),
      courseId: cid,
      courseTitle: course.title,
    },
    message: 'Order created',
  });
};

/**
 * Verify a checkout callback signature and, if valid, grant enrollment.
 * The amount is never read from the client: only the signature is checked,
 * and the order was created server-side at the course's price.
 */
export const verifyPayment = async (
  req: Request,
  res: Response
): Promise<void> => {
  const {
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: signature,
  } = req.body ?? {};

  // These come straight from parsed JSON, so validate they are strings (and a
  // sane length) before they reach the DB lookup or the HMAC.
  if (
    typeof orderId !== 'string' ||
    typeof paymentId !== 'string' ||
    typeof signature !== 'string' ||
    orderId.length > 64 ||
    paymentId.length > 64 ||
    signature.length > 256
  ) {
    throw new ApiError(400, 'Missing or invalid payment verification fields');
  }

  const payment = await Payment.findOne({
    where: { razorpayOrderId: orderId },
  });
  if (!payment) throw new ApiError(404, 'Payment record not found');
  if (payment.userId !== req.user!.id) {
    throw new ApiError(403, 'This payment does not belong to you');
  }

  if (!verifyPaymentSignature(orderId, paymentId, signature)) {
    // Conditional update so a bad-signature attempt can only move a still-open
    // order to `failed`; it can never regress a webhook-confirmed `paid` row.
    await Payment.update(
      { status: 'failed' },
      { where: { id: payment.id, status: 'created' } }
    );
    throw new ApiError(400, 'Payment verification failed');
  }

  await fulfillPayment(payment.id, paymentId);

  res.status(200).json({
    data: { enrolled: true, courseId: payment.courseId },
    message: 'Payment verified, you are enrolled',
  });
};

/**
 * Razorpay webhook (server-to-server source of truth). The body is the RAW
 * request bytes (see the raw parser in app.ts) so the signature can be
 * verified. Always ACK with 200 once verified so Razorpay stops retrying.
 */
export const paymentWebhook = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!isWebhookConfigured()) {
    throw new ApiError(503, 'Webhooks are not configured');
  }

  // The raw parser (app.ts) must have captured the body as a Buffer, since the HMAC
  // is computed over the exact bytes Razorpay sent. Fail loud on a
  // misconfiguration rather than silently HMAC-ing re-serialized JSON.
  if (!Buffer.isBuffer(req.body)) {
    throw new ApiError(400, 'Invalid webhook payload');
  }
  const raw: Buffer = req.body;

  const sigHeader = req.headers['x-razorpay-signature'];
  const signature = typeof sigHeader === 'string' ? sigHeader : undefined;

  if (!verifyWebhookSignature(raw, signature)) {
    throw new ApiError(400, 'Invalid webhook signature');
  }

  let event: {
    event?: string;
    payload?: {
      payment?: { entity?: { id?: string; order_id?: string } };
      order?: { entity?: { id?: string } };
    };
  };
  try {
    event = JSON.parse(raw.toString());
  } catch {
    throw new ApiError(400, 'Invalid webhook payload');
  }

  const orderId =
    event.payload?.payment?.entity?.order_id ??
    event.payload?.order?.entity?.id;
  const razorpayPaymentId = event.payload?.payment?.entity?.id ?? null;

  if (
    typeof orderId === 'string' &&
    (event.event === 'payment.captured' || event.event === 'order.paid')
  ) {
    const payment = await Payment.findOne({
      where: { razorpayOrderId: orderId },
    });
    if (payment) await fulfillPayment(payment.id, razorpayPaymentId);
  }

  // ACK even for events we don't act on, so Razorpay doesn't retry.
  res.status(200).json({ received: true });
};

/** Current user's purchase history. */
export const myPayments = async (
  req: Request,
  res: Response
): Promise<void> => {
  const payments = await Payment.findAll({
    where: { userId: req.user!.id },
    order: [['createdAt', 'DESC']],
    include: [{ model: Course, as: 'course', attributes: ['id', 'title', 'thumbnail'] }],
  });
  res.status(200).json({ data: payments, message: 'Payments fetched' });
};

/** All payments (Admin). Powers the revenue/sales view on the admin dashboard. */
export const allPayments = async (
  _req: Request,
  res: Response
): Promise<void> => {
  const payments = await Payment.findAll({
    order: [['createdAt', 'DESC']],
    include: [
      { model: Course, as: 'course', attributes: ['id', 'title'] },
      { model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email'] },
    ],
  });
  res.status(200).json({ data: payments, message: 'Payments fetched' });
};

/**
 * Expire abandoned orders (Admin / cron). Marks `created` payments older than
 * `olderThanHours` as `failed` so they stop polluting the revenue view. A late
 * webhook can still move such a row to `paid` (fulfillment only checks for
 * `paid`), so this is safe.
 */
export const cleanupPayments = async (
  req: Request,
  res: Response
): Promise<void> => {
  const hours = nonNegInt(req.body?.olderThanHours ?? 24, 'olderThanHours');
  const cutoff = new Date(Date.now() - hours * 3_600_000);
  const [expired] = await Payment.update(
    { status: 'failed' },
    { where: { status: 'created', createdAt: { [Op.lt]: cutoff } } }
  );
  res.status(200).json({ data: { expired }, message: 'Stale orders cleaned up' });
};
