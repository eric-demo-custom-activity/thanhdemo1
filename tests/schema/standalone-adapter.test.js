import { describe, it, expect, jest } from '@jest/globals';

import {
  StandaloneAdapter,
  validateFixture,
  toStandaloneInteraction,
  STANDALONE_FIXTURE_URL,
} from '../../public/js/standalone-adapter.js';
import { EntrySchemaProvider } from '../../public/js/schema/entry-schema-provider.js';

const fixture = {
  eventDefinitionKey: 'LOCAL_ORDER_ENTRY',
  fields: [
    { name: 'CustomerId', label: 'Customer ID', dataType: 'Text' },
    { name: 'MobilePhone', label: 'Mobile Phone', dataType: 'Phone' },
    { name: 'OrderAmount', label: 'Order Amount', dataType: 'Decimal' },
  ],
};

const silent = { info: () => {}, warn: () => {} };

const memoryStorage = () => {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    size: () => data.size,
  };
};

describe('standalone fixture handling', () => {
  it('validates the fixture shape', () => {
    expect(validateFixture(fixture)).toEqual([]);
    expect(validateFixture(null)).toEqual(['fixture must be an object']);
    expect(validateFixture({ fields: [] })).toContain('eventDefinitionKey is required');
    expect(validateFixture({ eventDefinitionKey: 'K', fields: [{}] })).toContain('every field needs a name');
  });

  it('builds an interaction whose triggers[0].metaData matches the production structure', () => {
    const interaction = toStandaloneInteraction(fixture);
    const metaData = interaction.triggers[0].metaData;

    expect(metaData.eventDefinitionKey).toBe('LOCAL_ORDER_ENTRY');
    expect(metaData.deSchema.fields.map((f) => f.name)).toEqual(['CustomerId', 'MobilePhone', 'OrderAmount']);
  });

  it('points at the development fixture location', () => {
    expect(STANDALONE_FIXTURE_URL).toBe('fixtures/entry-schema.fixture.json');
  });
});

describe('standalone adapter discovery', () => {
  it('answers requestInteraction through the production provider code path', async () => {
    const fixtureLoader = jest.fn(async () => fixture);
    const adapter = new StandaloneAdapter({ storage: memoryStorage(), fixtureLoader });
    const provider = new EntrySchemaProvider({ bridge: adapter, logger: silent });

    const result = await provider.discover();

    expect(result.valid).toBe(true);
    expect(result.eventDefinitionKey).toBe('LOCAL_ORDER_ENTRY');
    expect(result.fields.map((f) => f.id)).toEqual(['CustomerId', 'MobilePhone', 'OrderAmount']);
    expect(fixtureLoader).toHaveBeenCalled();
  });

  it('does not load the fixture until a request arrives', () => {
    const fixtureLoader = jest.fn(async () => fixture);
    const adapter = new StandaloneAdapter({ storage: null, fixtureLoader });

    adapter.initialize();

    expect(fixtureLoader).not.toHaveBeenCalled();
    expect(adapter.isStandalone).toBe(true);
  });

  it('reports a missing key when the fixture is invalid instead of inventing one', async () => {
    const adapter = new StandaloneAdapter({ storage: null, fixtureLoader: async () => ({ fields: [] }) });
    const provider = new EntrySchemaProvider({ bridge: adapter, logger: silent });

    const result = await provider.discover();

    expect(result.valid).toBe(false);
    expect(result.error.code).toBe('INVALID_EVENT_DEFINITION');
  });

  it('persists the updated activity and clears it on reset', () => {
    const storage = memoryStorage();
    const adapter = new StandaloneAdapter({ storage, fixtureLoader: async () => fixture });

    adapter.updateActivity({ metaData: { isConfigured: true } });
    expect(storage.size()).toBe(1);

    adapter.resetFixture();
    expect(storage.size()).toBe(0);
  });
});
