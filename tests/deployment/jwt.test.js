import { describe, it, expect, jest } from '@jest/globals';
import { createHmac } from 'node:crypto';

import { verifyHs256 } from '../../server/security/jwt.js';
import { createJwtVerificationMiddleware } from '../../server/middleware/jwt-verification-middleware.js';
import { AuthenticationError } from '../../server/errors.js';

const SECRET = 'a'.repeat(40);
const NOW = 1_700_000_000;

const b64url = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');

function sign(payload, { secret = SECRET, header = { alg: 'HS256', typ: 'JWT' } } = {}) {
  const h = b64url(header);
  const p = b64url(payload);
  const s = createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${s}`;
}

const reasonOf = (fn) => {
  try {
    fn();
    return null;
  } catch (error) {
    expect(error).toBeInstanceOf(AuthenticationError);
    return error.message;
  }
};

describe('verifyHs256', () => {
  it('accepts a correctly signed token and returns its claims', () => {
    const token = sign({ sub: 'activity', iat: NOW, exp: NOW + 60 });

    expect(verifyHs256(token, { secret: SECRET, nowSeconds: NOW })).toMatchObject({ sub: 'activity' });
  });

  it('rejects an invalid signature', () => {
    const token = sign({ sub: 'x' }, { secret: 'b'.repeat(40) });

    expect(reasonOf(() => verifyHs256(token, { secret: SECRET, nowSeconds: NOW }))).toBe('The JWT signature is invalid.');
  });

  it('rejects a malformed token', () => {
    expect(reasonOf(() => verifyHs256('not-a-jwt', { secret: SECRET }))).toBe('The JWT is malformed.');
    expect(reasonOf(() => verifyHs256('a.b', { secret: SECRET }))).toBe('The JWT is malformed.');
  });

  it('rejects a missing token', () => {
    expect(reasonOf(() => verifyHs256('', { secret: SECRET }))).toBe('A JWT is required.');
  });

  it('rejects alg none even when a signature segment is present', () => {
    const token = `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({ sub: 'x' })}.`;

    expect(reasonOf(() => verifyHs256(token, { secret: SECRET }))).toBe('The JWT is malformed.');
  });

  it('rejects an unsupported algorithm', () => {
    const token = sign({ sub: 'x' }, { header: { alg: 'HS512', typ: 'JWT' } });

    expect(reasonOf(() => verifyHs256(token, { secret: SECRET, nowSeconds: NOW }))).toBe('The JWT algorithm is not allowed.');
  });

  it('rejects an expired token beyond the clock skew', () => {
    const token = sign({ exp: NOW - 120 });

    expect(reasonOf(() => verifyHs256(token, { secret: SECRET, nowSeconds: NOW, clockSkewSeconds: 60 }))).toBe(
      'The JWT has expired.'
    );
  });

  it('tolerates an expiry within the clock skew', () => {
    const token = sign({ exp: NOW - 30 });

    expect(() => verifyHs256(token, { secret: SECRET, nowSeconds: NOW, clockSkewSeconds: 60 })).not.toThrow();
  });

  it('rejects a token that is not yet valid', () => {
    const token = sign({ nbf: NOW + 300 });

    expect(reasonOf(() => verifyHs256(token, { secret: SECRET, nowSeconds: NOW, clockSkewSeconds: 60 }))).toBe(
      'The JWT is not yet valid.'
    );
  });

  it('rejects an issue time in the future', () => {
    const token = sign({ iat: NOW + 600 });

    expect(reasonOf(() => verifyHs256(token, { secret: SECRET, nowSeconds: NOW, clockSkewSeconds: 60 }))).toBe(
      'The JWT issue time is in the future.'
    );
  });

  it('does not decode a payload that was not verified', () => {
    const token = sign({ sub: 'x' });
    const tampered = `${token.split('.')[0]}.${b64url({ sub: 'admin' })}.${token.split('.')[2]}`;

    expect(reasonOf(() => verifyHs256(tampered, { secret: SECRET }))).toBe('The JWT signature is invalid.');
  });
});

describe('createJwtVerificationMiddleware', () => {
  const run = (middleware, req) => {
    const next = jest.fn();
    middleware(req, {}, next);
    return next;
  };

  it('passes through with null claims when verification is disabled', () => {
    const middleware = createJwtVerificationMiddleware({ required: false });
    const req = { headers: {}, body: {} };

    const next = run(middleware, req);

    expect(next).toHaveBeenCalledWith();
    expect(req.journeyClaims).toBeNull();
  });

  it('exposes verified claims from body.jwt', () => {
    const middleware = createJwtVerificationMiddleware({ required: true, secret: SECRET, clockSkewSeconds: 60 });
    const req = { headers: {}, body: { jwt: sign({ inArguments: [{ source: 'x' }] }) } };

    const next = run(middleware, req);

    expect(next).toHaveBeenCalledWith();
    expect(req.journeyClaims.inArguments).toEqual([{ source: 'x' }]);
  });

  it('accepts a bearer token from the Authorization header', () => {
    const middleware = createJwtVerificationMiddleware({ required: true, secret: SECRET });
    const req = { headers: { authorization: `Bearer ${sign({ sub: 'x' })}` }, body: {} };

    const next = run(middleware, req);

    expect(next).toHaveBeenCalledWith();
  });

  it('returns an authentication error when the token is missing', () => {
    const middleware = createJwtVerificationMiddleware({ required: true, secret: SECRET });

    const next = run(middleware, { headers: {}, body: {} });

    expect(next.mock.calls[0][0]).toBeInstanceOf(AuthenticationError);
  });

  it('returns an authentication error for an invalid token', () => {
    const middleware = createJwtVerificationMiddleware({ required: true, secret: SECRET });

    const next = run(middleware, { headers: {}, body: { jwt: sign({ sub: 'x' }, { secret: 'c'.repeat(40) }) } });

    expect(next.mock.calls[0][0]).toBeInstanceOf(AuthenticationError);
  });
});
