import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';

import {
  normalizeInteraction,
  normalizeFieldList,
  normalizeField,
  describeStructure,
  SCHEMA_ERROR_CODES,
  SCHEMA_WARNING_CODES,
} from '../../public/js/schema/entry-schema-normalizer.js';

const officialSample = JSON.parse(
  readFileSync(new URL('./fixtures/requested-interaction.official-sample.json', import.meta.url), 'utf8')
);

const interactionWith = (metaData) => ({ triggers: [{ key: 'TRIGGER', metaData }] });

const rawField = (overrides = {}) => ({
  name: 'MobilePhone',
  type: 'Phone',
  ordinal: 2,
  isNullable: true,
  length: 20,
  isPrimaryKey: false,
  ...overrides,
});

describe('normalizeInteraction (triggers[0].metaData only)', () => {
  it('extracts eventDefinitionKey from the official sample structure', () => {
    const result = normalizeInteraction(officialSample);

    expect(result.valid).toBe(true);
    expect(result.eventDefinitionKey).toBe('DEAudience-00000000-0000-0000-0000-000000000000');
    expect(result.embeddedFieldList).toBeNull();
  });

  it('reads the key from triggers[0] only, not from later triggers', () => {
    const result = normalizeInteraction({
      triggers: [
        { metaData: { eventDefinitionKey: 'ENTRY_KEY' } },
        { metaData: { eventDefinitionKey: 'OTHER_KEY' } },
      ],
    });

    expect(result.eventDefinitionKey).toBe('ENTRY_KEY');
  });

  it('returns the field list found in triggers[0].metaData.deSchema.fields', () => {
    const result = normalizeInteraction(
      interactionWith({ eventDefinitionKey: 'ORDER_ENTRY_EVENT', deSchema: { fields: [rawField()] } })
    );

    expect(result.embeddedFieldList).toHaveLength(1);
  });

  it('returns the field list found in triggers[0].metaData.schema', () => {
    const result = normalizeInteraction(
      interactionWith({ eventDefinitionKey: 'K', schema: [{ key: 'Event.K.CustomerId', type: 'Text' }] })
    );

    expect(result.embeddedFieldList).toEqual([{ key: 'Event.K.CustomerId', type: 'Text' }]);
  });

  it('does not read fields from anywhere outside triggers[0].metaData', () => {
    const result = normalizeInteraction({
      triggers: [{ metaData: { eventDefinitionKey: 'K' } }],
      activities: [{ schema: { fields: [rawField()] } }],
      deSchema: { fields: [rawField()] },
    });

    expect(result.embeddedFieldList).toBeNull();
  });

  it('returns EVENT_DEFINITION_KEY_MISSING when the key is absent from metadata', () => {
    const result = normalizeInteraction(interactionWith({ title: 'Data Extension' }));

    expect(result.valid).toBe(false);
    expect(result.error.code).toBe(SCHEMA_ERROR_CODES.EVENT_DEFINITION_KEY_MISSING);
  });

  it('does not invent a key from other metadata properties', () => {
    const result = normalizeInteraction(interactionWith({ sourceInteractionId: 'X', eventDefinitionId: 'Y' }));

    expect(result.eventDefinitionKey).toBeNull();
  });

  it('returns EVENT_DEFINITION_KEY_INVALID for unsafe key characters', () => {
    const result = normalizeInteraction(interactionWith({ eventDefinitionKey: 'KEY }} evil' }));

    expect(result.error.code).toBe(SCHEMA_ERROR_CODES.EVENT_DEFINITION_KEY_INVALID);
  });

  it.each([
    ['null payload', null],
    ['string payload', 'text'],
    ['no triggers', { name: 'journey' }],
    ['empty triggers', { triggers: [] }],
    ['trigger without metaData', { triggers: [{ key: 'TRIGGER' }] }],
  ])('returns INVALID_EVENT_DEFINITION for %s', (_label, payload) => {
    const result = normalizeInteraction(payload);

    expect(result.valid).toBe(false);
    expect(result.error.code).toBe(SCHEMA_ERROR_CODES.INVALID_EVENT_DEFINITION);
  });
});

describe('normalizeField', () => {
  it('produces the normalized field model', () => {
    const field = normalizeField(rawField());

    expect(field).toMatchObject({
      id: 'MobilePhone',
      name: 'MobilePhone',
      label: 'Mobile Phone',
      dataType: 'Phone',
      source: 'entryEvent',
      bindingPath: 'MobilePhone',
      nullable: true,
      length: 20,
      ordinal: 2,
      isPrimaryKey: false,
    });
  });

  it('derives the name from the last segment of a key', () => {
    expect(normalizeField({ key: 'Event.ORDER_ENTRY_EVENT.CustomerId', type: 'Text' }).id).toBe('CustomerId');
  });

  it('humanizes a missing label and keeps a supplied one', () => {
    expect(normalizeField(rawField({ name: 'MobilePhone' })).label).toBe('Mobile Phone');
    expect(normalizeField(rawField({ label: '  Mobile  ' })).label).toBe('Mobile');
  });

  it('returns null for entries without a usable name', () => {
    expect(normalizeField(null)).toBeNull();
    expect(normalizeField('MobilePhone')).toBeNull();
    expect(normalizeField({ type: 'Text' })).toBeNull();
    expect(normalizeField({ name: '1bad' })).toBeNull();
    expect(normalizeField({ name: 'has space' })).toBeNull();
  });
});

describe('normalizeFieldList', () => {
  it('returns SCHEMA_NOT_AVAILABLE for an empty or non-array list', () => {
    expect(normalizeFieldList([], 'K').error.code).toBe(SCHEMA_ERROR_CODES.SCHEMA_NOT_AVAILABLE);
    expect(normalizeFieldList(undefined, 'K').error.code).toBe(SCHEMA_ERROR_CODES.SCHEMA_NOT_AVAILABLE);
  });

  it('skips a malformed field and records a warning', () => {
    const result = normalizeFieldList([rawField(), { type: 'Text' }, rawField({ name: 'ShopName', type: 'Text' })], 'K');

    expect(result.fields.map((f) => f.id)).toEqual(['MobilePhone', 'ShopName']);
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: SCHEMA_WARNING_CODES.FIELD_SKIPPED, index: 1 }));
  });

  it('removes duplicate fields (first occurrence wins) with a warning', () => {
    const result = normalizeFieldList([rawField({ type: 'Phone' }), rawField({ type: 'Text' })], 'K');

    expect(result.fields).toHaveLength(1);
    expect(result.fields[0].dataType).toBe('Phone');
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: SCHEMA_WARNING_CODES.DUPLICATE_FIELD }));
  });

  it('preserves source order when no ordinal is provided', () => {
    const result = normalizeFieldList(
      [{ name: 'Zeta', type: 'Text' }, { name: 'Alpha', type: 'Text' }, { name: 'Mid', type: 'Text' }],
      'K'
    );

    expect(result.fields.map((f) => f.id)).toEqual(['Zeta', 'Alpha', 'Mid']);
  });

  it('sorts by ordinal only when every field has one', () => {
    const result = normalizeFieldList(
      [
        { name: 'Second', type: 'Text', ordinal: 1 },
        { name: 'First', type: 'Text', ordinal: 0 },
      ],
      'K'
    );

    expect(result.fields.map((f) => f.id)).toEqual(['First', 'Second']);
  });

  it('maps an unknown type to Unknown with a warning, without rejecting the schema', () => {
    const result = normalizeFieldList([{ name: 'Mystery', type: 'Locale' }], 'K');

    expect(result.valid).toBe(true);
    expect(result.fields[0].dataType).toBe('Unknown');
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: SCHEMA_WARNING_CODES.UNKNOWN_FIELD_TYPE }));
  });

  it('does not mutate the raw input', () => {
    const raw = [rawField(), { key: 'Event.K.Other', type: 'Text' }];
    const snapshot = JSON.parse(JSON.stringify(raw));

    normalizeFieldList(raw, 'K');

    expect(raw).toEqual(snapshot);
  });
});

describe('describeStructure (development logging)', () => {
  it('describes property names and types, never values', () => {
    const description = describeStructure({ eventDefinitionKey: 'SECRET-KEY', schema: [{ key: 'Event.X.Email', type: 'Text' }] });

    expect(description).toContain('eventDefinitionKey:string');
    expect(description).toContain('schema:array(1)');
    expect(description).not.toContain('SECRET-KEY');
    expect(description).not.toContain('Email');
  });
});
