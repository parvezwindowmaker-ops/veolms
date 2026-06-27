import { ApiError } from '../../../types/interface';
import { nonNegInt } from '../../../helpers/parse-id';

/**
 * Minimum chargeable amount Razorpay accepts: 100 paise (₹1). A paid course
 * priced below this would fail order creation at the gateway with an opaque
 * error, so we reject it where the price is set instead.
 */
export const MIN_PAID_PRICE = 100;

/**
 * A course is free **only** when its price is exactly 0. Anything else (any
 * positive amount, or, defensively, a null/NaN that should never occur) is
 * treated as paid, so the free-enroll path fails closed.
 */
export const isFreeCourse = (price: number): boolean =>
  Number.isInteger(price) && price === 0;

/**
 * Validate a course price (paise): a non-negative INT4, and either 0 (free) or
 * at least the gateway minimum. Throws a 400 on invalid input.
 */
export function validateCoursePrice(value: unknown): number {
  const price = nonNegInt(value, 'price');
  if (price > 0 && price < MIN_PAID_PRICE) {
    throw new ApiError(
      400,
      `A paid course must cost at least ${MIN_PAID_PRICE} paise (₹1); use 0 for a free course`
    );
  }
  return price;
}
