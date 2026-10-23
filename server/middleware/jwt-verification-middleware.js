/*
 * JWT verification middleware for Journey Builder lifecycle routes.
 *
 * When verification is required, the token is read from the body field "jwt" or
 * from an "Authorization: Bearer" header. The verified claims are exposed as
 * req.journeyClaims. Authentication failures return HTTP 401.
 *
 * When verification is not required (development only, configured explicitly),
 * the middleware passes the request through and req.journeyClaims is null.
 *
 * The token field name is UNVERIFIED against live Journey Builder traffic; see
 * README "Live Journey Builder gates".
 */

import { verifyHs256 } from '../security/jwt.js';
import { AuthenticationError } from '../errors.js';

/**
 * @param {object} options
 * @param {boolean} options.required
 * @param {string} [options.secret]
 * @param {number} [options.clockSkewSeconds]
 * @returns {import('express').RequestHandler}
 */
export function createJwtVerificationMiddleware({ required, secret = '', clockSkewSeconds = 60 }) {
  return function jwtVerification(req, res, next) {
    if (!required) {
      req.journeyClaims = null;
      return next();
    }

    try {
      const token = extractToken(req);
      req.journeyClaims = verifyHs256(token, { secret, clockSkewSeconds });
      return next();
    } catch (error) {
      if (error instanceof AuthenticationError) {
        return next(error);
      }
      return next(new AuthenticationError());
    }
  };
}

function extractToken(req) {
  const header = req.headers?.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim();
  }
  if (req.body && typeof req.body.jwt === 'string') {
    return req.body.jwt;
  }
  throw new AuthenticationError('A JWT is required.');
}
