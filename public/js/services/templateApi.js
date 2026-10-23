/*
 * Template API client.
 *
 * Talks only to the middleware. It does not know whether templates come from
 * a fake JSON file or from Notification Hub later; the response contract stays
 * the same, so this file does not change when the data source changes.
 *
 * Loading state is owned by the caller (see state/activityState.js). This client
 * reports exactly one of three outcomes: a template array, a network failure,
 * or an unexpected response.
 */

export const TEMPLATES_ENDPOINT = '/api/templates';

export const TEMPLATE_API_ERROR_KIND = Object.freeze({
  NETWORK: 'network',
  HTTP: 'http',
  UNEXPECTED: 'unexpected',
});

export class TemplateApiError extends Error {
  /**
   * @param {string} kind - one of TEMPLATE_API_ERROR_KIND
   * @param {string} message - safe, user-facing summary
   * @param {{ status?: number, cause?: unknown }} [options]
   */
  constructor(kind, message, { status = null, cause } = {}) {
    super(message, { cause });
    this.name = 'TemplateApiError';
    this.kind = kind;
    this.status = status;
  }
}

/**
 * Minimal shape check so the UI never renders a malformed template.
 * Optional arrays (recipientFields) are tolerated when missing.
 *
 * @param {unknown} item
 * @returns {boolean}
 */
function isTemplateLike(item) {
  return (
    item !== null &&
    typeof item === 'object' &&
    typeof item.templateKey === 'string' &&
    typeof item.displayName === 'string' &&
    typeof item.channel === 'string' &&
    Array.isArray(item.addresses) &&
    Array.isArray(item.params)
  );
}

export class TemplateApi {
  #fetch;
  #endpoint;

  /**
   * @param {object} [options]
   * @param {typeof fetch} [options.fetchImpl] - injectable for tests
   * @param {string} [options.endpoint]
   */
  constructor({ fetchImpl = (...args) => globalThis.fetch(...args), endpoint = TEMPLATES_ENDPOINT } = {}) {
    this.#fetch = fetchImpl;
    this.#endpoint = endpoint;
  }

  /**
   * Fetches GET /api/templates and returns the items array.
   *
   * @returns {Promise<Array<object>>}
   * @throws {TemplateApiError}
   */
  async getTemplates() {
    let response;
    try {
      response = await this.#fetch(this.#endpoint, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
    } catch (cause) {
      throw new TemplateApiError(TEMPLATE_API_ERROR_KIND.NETWORK, 'Network error while loading templates.', { cause });
    }

    if (!response.ok) {
      throw new TemplateApiError(
        TEMPLATE_API_ERROR_KIND.HTTP,
        `Server responded with status ${response.status}.`,
        { status: response.status }
      );
    }

    let body;
    try {
      body = await response.json();
    } catch (cause) {
      throw new TemplateApiError(TEMPLATE_API_ERROR_KIND.UNEXPECTED, 'Response body is not valid JSON.', { cause });
    }

    if (!body || !Array.isArray(body.items) || !body.items.every(isTemplateLike)) {
      throw new TemplateApiError(TEMPLATE_API_ERROR_KIND.UNEXPECTED, 'Response does not match the template contract.');
    }

    return body.items;
  }
}
