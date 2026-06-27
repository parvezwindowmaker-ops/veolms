import jwt from 'jsonwebtoken';
import { RequestHandler } from 'express';
import { env } from '../config/env';
import { JwtPayload } from '../types/interface';

/**
 * Best-effort auth for **public** endpoints (catalog, course pages). If a valid
 * Bearer token is present, attaches `req.user` so the handler can tailor the
 * response (e.g. unlock full content for the enrolled owner). If the token is
 * missing or invalid, the request proceeds **anonymously** (no 401) so the page
 * stays publicly accessible.
 *
 * Note: unlike auth_middleware this skips the Redis permission-version freshness
 * check, since these are read-only public reads and a slightly stale role is harmless.
 */
export const optional_auth_middleware: RequestHandler = (req, _res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next();
  }
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return next();
  }
  try {
    const decoded = jwt.verify(token, env.jwt.secret) as JwtPayload;
    if (
      decoded &&
      typeof decoded === 'object' &&
      typeof decoded.id === 'number' &&
      typeof decoded.roleName === 'string'
    ) {
      req.user = decoded;
    }
  } catch {
    // Invalid/expired token → treat as anonymous.
  }
  next();
};
