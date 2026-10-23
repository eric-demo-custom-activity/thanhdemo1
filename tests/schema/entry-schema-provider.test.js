import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';

import { EntrySchemaProvider, DISCOVERY_SOURCE } from '../../public/js/schema/entry-schema-provider.js';
import { SCHEMA_ERROR_CODES } from '../../public/js/schema/entry-schema-normalizer.js';

const officialSample = JSON.parse(
  readFileSync(new URL('./fixtures/requested-interaction.official-sample.json', import.meta.url), 'utf8')
);

/** Minimal bridge double: records requests, lets the test deliver responses. */
function createFakeBridge() {
  let handler = null;
  const requests = [];
  return {
    requests,
    onRequestedInteraction(callback) {
      handler = callback;
      return this;
    },
    requestInteraction() {
      requests.push('requestInteraction');
    },
    respond(payload) {
      handler?.(payload);
    },
    listenerCount() {
      return handler ? 1 : 0;
    },
  };
}

const silent = { info: () => {}, warn: () => {} };

const interactionWithFields = (key, fields) => ({
  triggers: [{ key: 'TRIGGER', metaData: { eventDefinitionKey: key, deSchema: { fields } } }],
});

const fields = [
  { name: 'CustomerId', type: 'Text', ordinal: 0 },
  { name: 'MobilePhone', type: 'Phone', ordinal: 1 },
];

describe('EntrySchemaProvider', () => {
  it('registers the interaction listener in the constructor, before any request', () => {
    const bridge = createFakeBridge();

    new EntrySchemaProvider({ bridge, logger: silent });

    expect(bridge.listenerCount()).toBe(1);
    expect(bridge.requests).toEqual([]);
  });

  it('resolves fields from triggers[0].metaData with a single request', async () => {
    const bridge = createFakeBridge();
    const provider = new EntrySchemaProvider({ bridge, logger: silent });

    const pending = provider.discover();
    bridge.respond(interactionWithFields('ORDER_ENTRY_EVENT', fields));
    const result = await pending;

    expect(result.valid).toBe(true);
    expect(result.source).toBe(DISCOVERY_SOURCE.INTERACTION_TRIGGER_METADATA);
    expect(result.eventDefinitionKey).toBe('ORDER_ENTRY_EVENT');
    expect(result.fields.map((f) => f.id)).toEqual(['CustomerId', 'MobilePhone']);
    expect(bridge.requests).toEqual(['requestInteraction']);
  });

  it('returns SCHEMA_NOT_AVAILABLE and keeps the key when the official sample has no field list', async () => {
    const bridge = createFakeBridge();
    const provider = new EntrySchemaProvider({ bridge, logger: silent });

    const pending = provider.discover();
    bridge.respond(officialSample);
    const result = await pending;

    expect(result.valid).toBe(false);
    expect(result.eventDefinitionKey).toBe('DEAudience-00000000-0000-0000-0000-000000000000');
    expect(result.error.code).toBe(SCHEMA_ERROR_CODES.SCHEMA_NOT_AVAILABLE);
    expect(result.fields).toEqual([]);
  });

  it('handles a malformed interaction response', async () => {
    const bridge = createFakeBridge();
    const provider = new EntrySchemaProvider({ bridge, logger: silent });

    const pending = provider.discover();
    bridge.respond('not an interaction');
    const result = await pending;

    expect(result.error.code).toBe(SCHEMA_ERROR_CODES.INVALID_EVENT_DEFINITION);
  });

  it('stops with EVENT_DEFINITION_KEY_MISSING when metadata has no key', async () => {
    const bridge = createFakeBridge();
    const provider = new EntrySchemaProvider({ bridge, logger: silent });

    const pending = provider.discover();
    bridge.respond({ triggers: [{ metaData: { title: 'no key' } }] });

    expect((await pending).error.code).toBe(SCHEMA_ERROR_CODES.EVENT_DEFINITION_KEY_MISSING);
  });

  it('shares one in-flight promise across concurrent calls', async () => {
    const bridge = createFakeBridge();
    const provider = new EntrySchemaProvider({ bridge, logger: silent });

    const first = provider.discover();
    const second = provider.discover();

    expect(first).toBe(second);
    expect(bridge.requests).toEqual(['requestInteraction']);

    bridge.respond(interactionWithFields('K', fields));
    await first;
  });

  it('supports retry after a failed discovery', async () => {
    const bridge = createFakeBridge();
    const provider = new EntrySchemaProvider({ bridge, logger: silent });

    const failed = provider.discover();
    bridge.respond(null);
    expect((await failed).valid).toBe(false);

    const retry = provider.discover();
    expect(bridge.requests).toEqual(['requestInteraction', 'requestInteraction']);
    bridge.respond(interactionWithFields('K', fields));
    expect((await retry).valid).toBe(true);
  });

  it('treats an unanswered request as SCHEMA_NOT_AVAILABLE after the deadline', async () => {
    const bridge = createFakeBridge();
    const provider = new EntrySchemaProvider({ bridge, responseTimeoutMs: 10, logger: silent });

    const result = await provider.discover();

    expect(result.valid).toBe(false);
    expect(result.error.code).toBe(SCHEMA_ERROR_CODES.SCHEMA_NOT_AVAILABLE);
    expect(provider.isDiscovering()).toBe(false);
  });

  it('ignores a late response after the deadline', async () => {
    const bridge = createFakeBridge();
    const provider = new EntrySchemaProvider({ bridge, responseTimeoutMs: 5, logger: silent });

    await provider.discover();

    expect(() => bridge.respond(interactionWithFields('K', fields))).not.toThrow();
  });

  it('ignores responses that were never requested', () => {
    const bridge = createFakeBridge();
    new EntrySchemaProvider({ bridge, logger: silent });

    expect(() => bridge.respond(interactionWithFields('K', fields))).not.toThrow();
  });

  it('requires a bridge', () => {
    expect(() => new EntrySchemaProvider({ bridge: null })).toThrow(/requires a bridge/);
  });
});
