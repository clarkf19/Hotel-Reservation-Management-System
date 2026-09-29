import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../lib/errors.js';
import { currentTrace, runWithTrace } from '../lib/trace.js';

/** Runs each request inside a trace context and attaches the UML execution trace to JSON responses. */
export function traceContext(req, res, next) {
  runWithTrace(() => {
    const json = res.json.bind(res);
    res.json = (body) => {
      const t = currentTrace();
      if (t && body && typeof body === 'object' && !Array.isArray(body)) body = { ...body, trace: t };
      return json(body);
    };
    next();
  });
}

/** Validate req.body / req.query with a zod schema; replaces them with the parsed values. */
export function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req[source]);
    if (!parsed.success) return next(parsed.error);
    if (source === 'query') req.validatedQuery = parsed.data;
    else req[source] = parsed.data;
    next();
  };
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `No API route for ${req.method} ${req.path}` } });
}

/** Central error handler: consistent JSON errors, never a stack trace (security). */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err instanceof ZodError) {
    const issues = err.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: issues[0]?.message ? `${issues[0].field ? issues[0].field + ': ' : ''}${issues[0].message}` : 'Invalid input.', details: issues } });
  }
  if (err instanceof AppError) {
    const body = { error: { code: err.code, message: err.message, details: err.details } };
    const t = currentTrace();
    if (t) body.trace = t;
    return res.status(err.status).json(body);
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return res.status(409).json({ error: { code: 'DUPLICATE', message: 'A record with these details already exists.' } });
    if (err.code === 'P2025') return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Record not found.' } });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Request body is not valid JSON.' } });
  }
  console.error('[error]', req.method, req.path, err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on our side. Please try again.' } });
}
