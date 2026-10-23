/*
 * Entry-schema provider.
 *
 * Discovery is one Postmonger round trip:
 *
 *   requestInteraction  ->  requestedInteraction
 *
 * The interaction's triggers[0].metaData supplies the event definition key and,
 * when present, the Data Extension field list. Nothing else is read.
 *
 * Listeners are registered exactly once, in the constructor, which must run
 * before bridge.initialize(). Concurrent calls to discover() share one in-flight
 * promise, so the Retry button can never start a second request.
 *
 * Response deadline:
 *   The request waits at most `responseTimeoutMs`. This detects an unanswered
 *   request. It is not an initialization timeout. A timed-out request yields
 *   SCHEMA_NOT_AVAILABLE and is recoverable through Retry. Late responses are ignored.
 */

import {
  normalizeInteraction,
  normalizeFieldList,
  describeStructure,
  SCHEMA_ERROR_CODES,
} from './entry-schema-normalizer.js';

export const DISCOVERY_RESPONSE_TIMEOUT_MS = 8000;

export const DISCOVERY_SOURCE = Object.freeze({
  INTERACTION_TRIGGER_METADATA: 'interactionTriggerMetadata',
  NONE: 'none',
});

const REQUEST_EVENT = 'requestInteraction';
const RESPONSE_EVENT = 'requestedInteraction';

/**
 * @typedef {{
 *   valid: boolean,
 *   eventDefinitionKey: string|null,
 *   fields: object[],
 *   warnings: object[],
 *   error: { code: string, message: string } | null,
 *   source: string
 * }} DiscoveryResult
 */

export class EntrySchemaProvider {
  #bridge;
  #timeoutMs;
  #debug;
  #logger;
  /** @type {{ resolve: Function, timer: ReturnType<typeof setTimeout> } | null} */
  #waiter = null;
  /** @type {Promise<DiscoveryResult>|null} */
  #inFlight = null;

  /**
   * @param {object} options
   * @param {object} options.bridge - PostmongerClient or StandaloneAdapter
   * @param {number} [options.responseTimeoutMs]
   * @param {boolean} [options.debug] - development-only structural logging
   * @param {{ info: Function, warn: Function }} [options.logger]
   */
  constructor({ bridge, responseTimeoutMs = DISCOVERY_RESPONSE_TIMEOUT_MS, debug = false, logger = console }) {
    if (!bridge) {
      throw new Error('EntrySchemaProvider requires a bridge.');
    }
    this.#bridge = bridge;
    this.#timeoutMs = responseTimeoutMs;
    this.#debug = debug;
    this.#logger = logger;

    bridge.onRequestedInteraction((payload) => this.#deliver(payload));
  }

  /** @returns {boolean} true while a discovery run is in progress */
  isDiscovering() {
    return this.#inFlight !== null;
  }

  /**
   * Runs discovery. Concurrent calls share the same in-flight promise.
   *
   * @returns {Promise<DiscoveryResult>}
   */
  discover() {
    if (this.#inFlight) return this.#inFlight;

    this.#inFlight = this.#run().finally(() => {
      this.#inFlight = null;
    });
    return this.#inFlight;
  }

  async #run() {
    const response = await this.#request();
    this.#debugShape(response);

    if (response.failure) {
      return this.#result(failure(null, SCHEMA_ERROR_CODES.SCHEMA_NOT_AVAILABLE, response.failure));
    }

    const interaction = normalizeInteraction(response.payload);
    if (!interaction.valid) {
      return this.#result(failure(null, interaction.error.code, interaction.error.message));
    }

    const key = interaction.eventDefinitionKey;

    if (!interaction.embeddedFieldList) {
      return this.#result(
        failure(
          key,
          SCHEMA_ERROR_CODES.SCHEMA_NOT_AVAILABLE,
          'Journey Builder did not include Data Extension fields in the entry trigger metadata.'
        )
      );
    }

    const fields = normalizeFieldList(interaction.embeddedFieldList, key);
    return this.#result({
      ...fields,
      source: fields.valid ? DISCOVERY_SOURCE.INTERACTION_TRIGGER_METADATA : DISCOVERY_SOURCE.NONE,
    });
  }

  /**
   * Sends requestInteraction and waits for requestedInteraction or the deadline.
   *
   * @returns {Promise<{ payload: unknown, failure: string|null }>}
   */
  #request() {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.#waiter = null;
        resolve({ payload: null, failure: 'Journey Builder did not answer the request in time.' });
      }, this.#timeoutMs);

      this.#waiter = { resolve, timer };

      try {
        this.#bridge.requestInteraction();
      } catch (error) {
        clearTimeout(timer);
        this.#waiter = null;
        resolve({ payload: null, failure: `The request could not be sent: ${error.message}` });
      }
    });
  }

  #deliver(payload) {
    const waiter = this.#waiter;
    if (!waiter) {
      this.#logger.info?.(`[EntrySchema] Ignored unsolicited response: ${RESPONSE_EVENT}`);
      return;
    }
    this.#waiter = null;
    clearTimeout(waiter.timer);
    waiter.resolve({ payload, failure: null });
  }

  #result(result) {
    const normalized = {
      valid: result.valid === true,
      eventDefinitionKey: result.eventDefinitionKey ?? null,
      fields: result.fields ?? [],
      warnings: result.warnings ?? [],
      error: result.error ?? null,
      source: result.source ?? DISCOVERY_SOURCE.NONE,
    };

    if (this.#debug) {
      this.#logger.info(
        `[EntrySchema] Normalized: eventDefinitionKey=${normalized.eventDefinitionKey ?? 'none'} fieldCount=${normalized.fields.length} warnings=${normalized.warnings.length} source=${normalized.source}`
      );
    }
    return normalized;
  }

  #debugShape(response) {
    if (!this.#debug) return;
    const shape = response.failure ? `no response (${response.failure})` : describeStructure(response.payload, 3);
    this.#logger.info(`[EntrySchema] Interaction response structure: ${shape}`);
  }
}

function failure(eventDefinitionKey, code, message) {
  return {
    valid: false,
    eventDefinitionKey,
    fields: [],
    warnings: [],
    error: { code, message },
  };
}
