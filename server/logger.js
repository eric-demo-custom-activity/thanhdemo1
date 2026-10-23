/*
 * Structured logger with levels. Never logs request bodies, tokens or secrets.
 * Silent under NODE_ENV=test unless LOG_LEVEL is set explicitly.
 */

const RANK = Object.freeze({ error: 0, warn: 1, info: 2, debug: 3 });

let threshold = RANK.info;
let silent = process.env.NODE_ENV === 'test' && process.env.LOG_LEVEL === undefined;

/**
 * @param {{ level?: string, silent?: boolean }} options
 */
export function configureLogger({ level = 'info', silent: isSilent = false } = {}) {
  threshold = RANK[level] ?? RANK.info;
  silent = isSilent;
}

const write = (level, message, error) => {
  if (silent || RANK[level] > threshold) return;
  const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${message}`;
  if (level === 'error') {
    console.error(line);
    if (error?.stack && threshold >= RANK.debug) console.error(error.stack);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
};

export const logger = Object.freeze({
  debug: (message) => write('debug', message),
  info: (message) => write('info', message),
  warn: (message) => write('warn', message),
  error: (message, error) => write('error', message, error),
});
