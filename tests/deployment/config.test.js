import { describe, it, expect } from '@jest/globals';

import { loadConfig, maskSecret } from '../../server/config.js';
import { ConfigurationError } from '../../server/errors.js';

const SECRET = 'x'.repeat(40);
const prodEnv = (overrides = {}) => ({
  NODE_ENV: 'production',
  PUBLIC_BASE_URL: 'https://activity.example.com',
  SFMC_REQUIRE_JWT: 'true',
  SFMC_JWT_SECRET: 'x'.repeat(40),
  NOTIFICATION_HUB_MODE: 'http',
  NOTIFICATION_HUB_BASE_URL: 'https://nh.example.com',
  NOTIFICATION_HUB_API_KEY: 'test-api-key-value',
  NOTIFICATION_HUB_SEND_PATH: '/send',
  ...overrides,
});

const messagesOf = (fn) => {
  try {
    fn();
    return [];
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigurationError);
    return error.details.map((d) => d.message);
  }
};

describe('loadConfig: development', () => {
  it('uses development defaults', () => {
    const config = loadConfig({ NODE_ENV: 'development' });

    expect(config.env).toBe('development');
    expect(config.isDevelopment).toBe(true);
    expect(config.requireJwt).toBe(false);
    expect(config.port).toBe(3000);
    expect(config.publicBaseUrl).toBe('http://localhost:3000');
    expect(config.notificationHub.mode).toBe('simulation');
  });

  it('allows JWT verification to be enabled explicitly', () => {
    const config = loadConfig({ NODE_ENV: 'development', SFMC_REQUIRE_JWT: 'true', SFMC_JWT_SECRET: SECRET });

    expect(config.requireJwt).toBe(true);
    expect(config.jwtSecret).toBe(SECRET);
  });

  it('rejects an invalid PORT', () => {
    expect(messagesOf(() => loadConfig({ PORT: 'abc' }))).toEqual(['PORT must be an integer between 1 and 65535.']);
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => loadConfig({ NODE_ENV: 'staging' })).toThrow(ConfigurationError);
  });

  it('strips a trailing slash from PUBLIC_BASE_URL', () => {
    expect(loadConfig({ PUBLIC_BASE_URL: 'https://activity.example.com/' }).publicBaseUrl).toBe('https://activity.example.com');
  });
});

describe('loadConfig: production', () => {
  it('accepts a complete production configuration', () => {
    const config = loadConfig(prodEnv());

    expect(config.isProduction).toBe(true);
    expect(config.requireJwt).toBe(true);
    expect(config.notificationHub.mode).toBe('http');
  });

  it('requires PUBLIC_BASE_URL', () => {
    expect(messagesOf(() => loadConfig(prodEnv({ PUBLIC_BASE_URL: undefined })))).toContain(
      'PUBLIC_BASE_URL is required in production and must be the public HTTPS root of this service.'
    );
  });

  it('rejects plain HTTP and localhost as the public base URL', () => {
    const messages = messagesOf(() => loadConfig(prodEnv({ PUBLIC_BASE_URL: 'http://localhost:3000' })));

    expect(messages).toContain('PUBLIC_BASE_URL must use https in production.');
    expect(messages).toContain('PUBLIC_BASE_URL must not point to localhost in production.');
  });

  it('refuses to start with JWT verification disabled', () => {
    expect(messagesOf(() => loadConfig(prodEnv({ SFMC_REQUIRE_JWT: 'false' })))).toContain(
      'SFMC_REQUIRE_JWT must be true in production.'
    );
  });

  it('requires a JWT secret of sufficient length', () => {
    const messages = messagesOf(() => loadConfig(prodEnv({ SFMC_JWT_SECRET: 'short' })));

    expect(messages.join(' ')).toMatch(/SFMC_JWT_SECRET is required/);
  });

  it('forbids the simulation Notification Hub adapter', () => {
    expect(messagesOf(() => loadConfig(prodEnv({ NOTIFICATION_HUB_MODE: 'simulation' })))).toContain(
      'NOTIFICATION_HUB_MODE=simulation is forbidden in production.'
    );
  });

  it('requires the Notification Hub base URL, API key and send path in http mode', () => {
    const messages = messagesOf(() =>
      loadConfig(prodEnv({ NOTIFICATION_HUB_BASE_URL: undefined, NOTIFICATION_HUB_API_KEY: undefined, NOTIFICATION_HUB_SEND_PATH: undefined }))
    );

    expect(messages).toEqual(
      expect.arrayContaining([
        'NOTIFICATION_HUB_BASE_URL is required when NOTIFICATION_HUB_MODE=http.',
        'NOTIFICATION_HUB_API_KEY is required when NOTIFICATION_HUB_MODE=http.',
        'NOTIFICATION_HUB_SEND_PATH is required when NOTIFICATION_HUB_MODE=http and must start with "/".',
      ])
    );
  });

  it('requires HTTPS for the Notification Hub base URL', () => {
    expect(messagesOf(() => loadConfig(prodEnv({ NOTIFICATION_HUB_BASE_URL: 'http://nh.example.com' })))).toContain(
      'NOTIFICATION_HUB_BASE_URL must use https in production.'
    );
  });

  it('does not infer production from the hostname', () => {
    const config = loadConfig({ NODE_ENV: 'development', PUBLIC_BASE_URL: 'https://activity.example.com' });

    expect(config.isProduction).toBe(false);
    expect(config.requireJwt).toBe(false);
  });
});

describe('secret masking and proxy setting', () => {
  it('never returns the secret value', () => {
    const masked = maskSecret(SECRET);

    expect(masked).not.toContain(SECRET);
    expect(maskSecret('')).toBe('(not set)');
  });

  it('accepts a numeric hop count for TRUST_PROXY and rejects garbage', () => {
    expect(loadConfig({ TRUST_PROXY: '1' }).trustProxy).toBe(1);
    expect(messagesOf(() => loadConfig({ TRUST_PROXY: 'yes' }))).toHaveLength(1);
  });
});
