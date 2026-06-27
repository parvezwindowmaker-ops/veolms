import { ErrorRequestHandler, RequestHandler } from 'express';
import { MulterError } from 'multer';
import {
  ValidationError,
  UniqueConstraintError,
  ForeignKeyConstraintError,
} from 'sequelize';
import { ApiError } from '../types/interface';

/** 404 handler for unmatched routes. */
export const notFoundHandler: RequestHandler = (req, res) => {
  res
    .status(404)
    .json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
};

/** Centralized error handler that maps known error types to HTTP responses. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({ message: err.message });
    return;
  }

  if (err instanceof MulterError) {
    // e.g. file too large, or a file under an unexpected field name.
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    res.status(status).json({ message: `Upload error: ${err.message}` });
    return;
  }

  if (err instanceof UniqueConstraintError) {
    res
      .status(409)
      .json({ message: 'A record with these details already exists' });
    return;
  }

  if (err instanceof ValidationError) {
    const message =
      err.errors.map((e) => e.message).join(', ') || 'Validation error';
    res.status(400).json({ message });
    return;
  }

  if (err instanceof ForeignKeyConstraintError) {
    res
      .status(409)
      .json({ message: 'Operation violates a reference constraint' });
    return;
  }

  console.error('Unhandled error:', err);
  res.status(500).json({ message: 'Server error' });
};
