/**
 * Application errors. Every error that reaches the client carries a stable
 * machine-readable `code` and a human message; stack traces are never sent.
 */
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, details) => new AppError(400, 'VALIDATION_ERROR', message, details);
export const unauthorized = (message = 'Please sign in to continue.', code = 'UNAUTHENTICATED') =>
  new AppError(401, code, message);
export const forbidden = (message = 'You do not have permission to perform this action.') =>
  new AppError(403, 'FORBIDDEN', message);
export const notFound = (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found.`);
export const conflict = (code, message, details) => new AppError(409, code, message, details);
export const unprocessable = (code, message, details) => new AppError(422, code, message, details);
export const paymentFailed = (message, details) => new AppError(402, 'PAYMENT_FAILED', message, details);
