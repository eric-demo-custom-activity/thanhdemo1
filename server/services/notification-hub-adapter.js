/*
 * Notification Hub adapter.
 *
 *   simulation  development only. Accepts the payload without sending it.
 *               Refused by configuration in production.
 *   http        POSTs the payload to NOTIFICATION_HUB_BASE_URL + NOTIFICATION_HUB_SEND_PATH
 *               with a bearer API key.
 *
 * The Notification Hub request contract (path, auth scheme, response body) is NOT
 * verified against a live Notification Hub. The send path is therefore required
 * configuration; nothing is guessed. Response bodies are never copied into errors.
 */

import { NotificationHubError } from '../errors.js';

/**
 * @param {object} options
 * @param {'simulation'|'http'} options.mode
 * @param {string} [options.baseUrl]
 * @param {string} [options.apiKey]
 * @param {string} [options.sendPath]
 * @param {number} [options.timeoutMs]
 * @param {typeof fetch} [options.fetchImpl] - injectable for tests
 * @returns {{ mode: string, send: (payload: object) => Promise<{ accepted: true, simulated: boolean }> }}
 */
export function createNotificationHubAdapter({
  mode,
  baseUrl = '',
  apiKey = '',
  sendPath = '',
  timeoutMs = 10000,
  fetchImpl = globalThis.fetch,
}) {
  if (mode === 'simulation') {
    return {
      mode,
      async send() {
        return { accepted: true, simulated: true };
      },
    };
  }

  if (mode !== 'http') {
    throw new Error(`Unsupported Notification Hub mode: ${mode}`);
  }

  return {
    mode,
    async send(payload) {
      let response;
      try {
        response = await fetchImpl(`${baseUrl}${sendPath}`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        throw new NotificationHubError('Notification Hub could not be reached.');
      }

      if (!response.ok) {
        throw new NotificationHubError(`Notification Hub responded with HTTP ${response.status}.`);
      }
      return { accepted: true, simulated: false };
    },
  };
}
