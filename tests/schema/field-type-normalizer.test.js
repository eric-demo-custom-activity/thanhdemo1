import { describe, it, expect } from '@jest/globals';

import { normalizeFieldType, FIELD_TYPES } from '../../public/js/schema/field-type-normalizer.js';

describe('normalizeFieldType', () => {
  it.each([
    ['Text', FIELD_TYPES.TEXT],
    ['text', FIELD_TYPES.TEXT],
    ['string', FIELD_TYPES.TEXT],
  ])('normalizes text alias %s to Text', (raw, expected) => {
    expect(normalizeFieldType(raw)).toBe(expected);
  });

  it('normalizes phone and email aliases', () => {
    expect(normalizeFieldType('Phone')).toBe(FIELD_TYPES.PHONE);
    expect(normalizeFieldType('EmailAddress')).toBe(FIELD_TYPES.EMAIL);
    expect(normalizeFieldType('email')).toBe(FIELD_TYPES.EMAIL);
  });

  it('normalizes numeric aliases to their own types', () => {
    expect(normalizeFieldType('Number')).toBe(FIELD_TYPES.NUMBER);
    expect(normalizeFieldType('Decimal')).toBe(FIELD_TYPES.DECIMAL);
    expect(normalizeFieldType('Integer')).toBe(FIELD_TYPES.INTEGER);
    expect(normalizeFieldType('int')).toBe(FIELD_TYPES.INTEGER);
  });

  it('keeps Date and DateTime distinct', () => {
    expect(normalizeFieldType('Date')).toBe(FIELD_TYPES.DATE);
    expect(normalizeFieldType('DateTime')).toBe(FIELD_TYPES.DATE_TIME);
    expect(normalizeFieldType('Date')).not.toBe(normalizeFieldType('DateTime'));
  });

  it('normalizes Boolean', () => {
    expect(normalizeFieldType('Boolean')).toBe(FIELD_TYPES.BOOLEAN);
  });

  it('matches case-insensitively', () => {
    expect(normalizeFieldType('PHONE')).toBe(FIELD_TYPES.PHONE);
    expect(normalizeFieldType('  dAtEtImE ')).toBe(FIELD_TYPES.DATE_TIME);
  });

  it('maps unknown and non-string values to Unknown', () => {
    expect(normalizeFieldType('Locale')).toBe(FIELD_TYPES.UNKNOWN);
    expect(normalizeFieldType('')).toBe(FIELD_TYPES.UNKNOWN);
    expect(normalizeFieldType(undefined)).toBe(FIELD_TYPES.UNKNOWN);
    expect(normalizeFieldType(42)).toBe(FIELD_TYPES.UNKNOWN);
    expect(normalizeFieldType({ type: 'Text' })).toBe(FIELD_TYPES.UNKNOWN);
  });
});
