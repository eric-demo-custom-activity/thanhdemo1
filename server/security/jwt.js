/*
 * HS256 JWT verification with no third-party dependency.
 *
 * Rules:
 *   - the token must have three segments
 *   - the header must declare alg "HS256" (rejects "none" and every other algorithm)
 *   - the signature is verified before any claim is trusted
 *   - the signature comparison is constant-time
 *   - exp, nbf and iat are checked with a bounded clock skew
 *
 * Errors carry a reason code, never the token or the secret.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { AuthenticationError } from '../errors.js';

const SEGMENT = /^[A-Za-z0-9_-]+$/;

/**
 * @param {string} token
 * @param {object} options
 * @param {string} options.secret
 * @param {number} [options.clockSkewSeconds=60]
 * @param {number} [options.nowSeconds] - injectable for tests
 * @returns {Record<string, unknown>} the verified claims
 * @throws {AuthenticationError}
 */
export function verifyHs256(token, { secret, clockSkewSeconds = 60, nowSeconds = Math.floor(Date.now() / 1000) }) {
  if (typeof token !== 'string' || token.length === 0) {
    throw new AuthenticationError('A JWT is required.');
  }

  const parts = token.split('.');
  if (parts.length !== 3 || !parts.every((part) => SEGMENT.test(part))) {
    throw new AuthenticationError('The JWT is malformed.');
  }
  const [headerSegment, payloadSegment, signatureSegment] = parts;

  const header = decodeJson(headerSegment);
  if (header === null) {
    throw new AuthenticationError('The JWT header is malformed.');
  }
  if (header.alg !== 'HS256') {
    throw new AuthenticationError('The JWT algorithm is not allowed.');
  }

  const expected = createHmac('sha256', secret).update(`${headerSegment}.${payloadSegment}`).digest();
  const actual = Buffer.from(signatureSegment, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new AuthenticationError('The JWT signature is invalid.');
  }

  const claims = decodeJson(payloadSegment);
  if (claims === null || typeof claims !== 'object' || Array.isArray(claims)) {
    throw new AuthenticationError('The JWT payload is malformed.');
  }

  const skew = clockSkewSeconds;
  if (claims.exp !== undefined) {
    if (!Number.isFinite(claims.exp) || nowSeconds > claims.exp + skew) {
      throw new AuthenticationError('The JWT has expired.');
    }
  }
  if (claims.nbf !== undefined) {
    if (!Number.isFinite(claims.nbf) || nowSeconds + skew < claims.nbf) {
      throw new AuthenticationError('The JWT is not yet valid.');
    }
  }
  if (claims.iat !== undefined) {
    if (!Number.isFinite(claims.iat) || claims.iat > nowSeconds + skew) {
      throw new AuthenticationError('The JWT issue time is in the future.');
    }
  }

  return claims;
}

function decodeJson(segment) {
  try {
    const parsed = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}
