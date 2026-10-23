/*
 * Validated runtime configuration.
 *
 * loadConfig(env) is pure: it reads only the environment object it is given and
 * throws ConfigurationError when the configuration cannot be used safely.
 *
 * Modes are explicit. The mode is NODE_ENV only; the hostname never decides it.
 *   development  local work: JWT may be disabled, simulation adapter allowed
 *   production   public deployment: HTTPS required, JWT required, real adapter required
 *   test         automated tests: behaves like development
 */

import { ConfigurationError } from './errors.js';

export const SERVICE_NAME = 'salesforce-custom-activity';

const MIN_SECRET_LENGTH = 32;
const NODE_ENVS = Object.freeze(['development', 'production', 'test']);
const LOG_LEVELS = Object.freeze(['error', 'warn', 'info', 'debug']);
const NOTIFICATION_HUB_MODES = Object.freeze(['simulation', 'http']);

/**
 * @param {Record<string, string|undefined>} [env]
 * @returns {Readonly<object>} the validated configuration
 * @throws {ConfigurationError}
 */
export function loadConfig(env = process.env) {
  const problems = [];
  const nodeEnv = env.NODE_ENV ?? 'development';
  if (!NODE_ENVS.includes(nodeEnv)) {
    throw new ConfigurationError(`NODE_ENV must be one of: ${NODE_ENVS.join(', ')}.`);
  }
  const isProduction = nodeEnv === 'production';

  const port = parsePort(env.PORT, problems);
  const publicBaseUrl = resolvePublicBaseUrl(env.PUBLIC_BASE_URL, port, isProduction, problems);
  const requireJwt = resolveBoolean(env.SFMC_REQUIRE_JWT, isProduction, 'SFMC_REQUIRE_JWT', problems);
  if (isProduction && requireJwt === false) {
    problems.push('SFMC_REQUIRE_JWT must be true in production.');
  }

  const jwtSecret = env.SFMC_JWT_SECRET ?? '';
  if (requireJwt && jwtSecret.length < MIN_SECRET_LENGTH) {
    problems.push(`SFMC_JWT_SECRET is required (at least ${MIN_SECRET_LENGTH} characters) when JWT verification is enabled.`);
  }
  const clockSkewSeconds = parseIntegerRange(env.SFMC_JWT_CLOCK_SKEW_SECONDS, 60, 0, 600, 'SFMC_JWT_CLOCK_SKEW_SECONDS', problems);

  const notificationHub = resolveNotificationHub(env, isProduction, problems);

  const logLevel = env.LOG_LEVEL ?? 'info';
  if (!LOG_LEVELS.includes(logLevel)) {
    problems.push(`LOG_LEVEL must be one of: ${LOG_LEVELS.join(', ')}.`);
  }

  const trustProxy = resolveTrustProxy(env.TRUST_PROXY, problems);

  if (problems.length > 0) {
    throw new ConfigurationError('The configuration is invalid.', problems.map((message) => ({ message })));
  }

  return Object.freeze({
    serviceName: SERVICE_NAME,
    env: nodeEnv,
    isProduction,
    isDevelopment: !isProduction,
    port,
    publicBaseUrl,
    requireJwt,
    jwtSecret,
    jwtClockSkewSeconds: clockSkewSeconds,
    notificationHub,
    logLevel,
    trustProxy,
  });
}

/**
 * Returns a value safe to log: the length and a fixed marker, never the content.
 * @param {string} value
 * @returns {string}
 */
export function maskSecret(value) {
  if (!value) return '(not set)';
  return `(set, ${value.length} characters)`;
}

function parsePort(raw, problems) {
  if (raw === undefined || raw === '') return 3000;
  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || String(port) !== String(raw).trim()) {
    problems.push('PORT must be an integer between 1 and 65535.');
    return 3000;
  }
  return port;
}

function resolvePublicBaseUrl(raw, port, isProduction, problems) {
  if (raw === undefined || raw === '') {
    if (isProduction) {
      problems.push('PUBLIC_BASE_URL is required in production and must be the public HTTPS root of this service.');
      return '';
    }
    return `http://localhost:${port}`;
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    problems.push('PUBLIC_BASE_URL must be an absolute URL.');
    return '';
  }

  if (isProduction) {
    if (url.protocol !== 'https:') {
      problems.push('PUBLIC_BASE_URL must use https in production.');
    }
    if (['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(url.hostname)) {
      problems.push('PUBLIC_BASE_URL must not point to localhost in production.');
    }
  }
  if (url.search || url.hash) {
    problems.push('PUBLIC_BASE_URL must not contain a query string or fragment.');
  }
  return url.origin + url.pathname.replace(/\/+$/, '');
}

function resolveNotificationHub(env, isProduction, problems) {
  const mode = env.NOTIFICATION_HUB_MODE ?? (isProduction ? '' : 'simulation');
  if (!NOTIFICATION_HUB_MODES.includes(mode)) {
    problems.push(`NOTIFICATION_HUB_MODE must be one of: ${NOTIFICATION_HUB_MODES.join(', ')}.`);
    return { mode: 'simulation', baseUrl: '', apiKey: '', sendPath: '', timeoutMs: 10000 };
  }
  if (isProduction && mode === 'simulation') {
    problems.push('NOTIFICATION_HUB_MODE=simulation is forbidden in production.');
  }

  const timeoutMs = parseIntegerRange(env.NOTIFICATION_HUB_TIMEOUT_MS, 10000, 1000, 60000, 'NOTIFICATION_HUB_TIMEOUT_MS', problems);
  const baseUrl = (env.NOTIFICATION_HUB_BASE_URL ?? '').replace(/\/+$/, '');
  const apiKey = env.NOTIFICATION_HUB_API_KEY ?? '';
  const sendPath = env.NOTIFICATION_HUB_SEND_PATH ?? '';

  if (mode === 'http') {
    if (!baseUrl) problems.push('NOTIFICATION_HUB_BASE_URL is required when NOTIFICATION_HUB_MODE=http.');
    if (!apiKey) problems.push('NOTIFICATION_HUB_API_KEY is required when NOTIFICATION_HUB_MODE=http.');
    if (!sendPath.startsWith('/')) {
      problems.push('NOTIFICATION_HUB_SEND_PATH is required when NOTIFICATION_HUB_MODE=http and must start with "/".');
    }
    if (baseUrl) {
      try {
        const url = new URL(baseUrl);
        if (isProduction && url.protocol !== 'https:') {
          problems.push('NOTIFICATION_HUB_BASE_URL must use https in production.');
        }
      } catch {
        problems.push('NOTIFICATION_HUB_BASE_URL must be an absolute URL.');
      }
    }
  }

  return { mode, baseUrl, apiKey, sendPath, timeoutMs };
}

function resolveBoolean(raw, fallback, name, problems) {
  if (raw === undefined || raw === '') return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  problems.push(`${name} must be "true" or "false".`);
  return fallback;
}

function resolveTrustProxy(raw, problems) {
  if (raw === undefined || raw === '' || raw === 'false') return false;
  if (raw === 'true') return true;
  const hops = Number.parseInt(raw, 10);
  if (Number.isInteger(hops) && hops >= 1 && String(hops) === raw) return hops;
  problems.push('TRUST_PROXY must be "false", "true" or a positive integer hop count.');
  return false;
}

function parseIntegerRange(raw, fallback, min, max, name, problems) {
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < min || value > max) {
    problems.push(`${name} must be an integer between ${min} and ${max}.`);
    return fallback;
  }
  return value;
}
