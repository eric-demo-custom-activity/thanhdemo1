import { describe, it, expect } from '@jest/globals';

import { validateMappings, getStaleErrors, VALIDATION_CODES } from '../../public/js/domain/mappingValidator.js';
import { checkTypeCompatibility, COMPATIBILITY_SEVERITY } from '../../public/js/domain/typeCompatibility.js';
import { createFieldCatalog } from '../../public/js/schema/field-catalog-model.js';

const template = {
  templateKey: 'tpl.1',
  displayName: 'Order',
  channel: 'zns',
  version: 1,
  addresses: [{ name: 'phone', required: true, type: 'phone' }],
  recipientFields: [{ name: 'customerId', required: true, type: 'string' }],
  params: [
    { name: 'amount', required: true, type: 'number' },
    { name: 'purchaseDate', required: false, type: 'date' },
    { name: 'resetLink', required: false, type: 'url' },
  ],
};

const catalog = createFieldCatalog({
  eventDefinitionKey: 'ORDER_ENTRY_EVENT',
  fields: [
    { id: 'CustomerId', name: 'CustomerId', label: 'Customer ID', dataType: 'Text', bindingPath: 'CustomerId' },
    { id: 'MobilePhone', name: 'MobilePhone', label: 'Mobile Phone', dataType: 'Phone', bindingPath: 'MobilePhone' },
    { id: 'PlainText', name: 'PlainText', label: 'Plain text', dataType: 'Text', bindingPath: 'PlainText' },
    { id: 'OrderAmount', name: 'OrderAmount', label: 'Order Amount', dataType: 'Decimal', bindingPath: 'OrderAmount' },
    { id: 'PurchaseDate', name: 'PurchaseDate', label: 'Purchase Date', dataType: 'Date', bindingPath: 'PurchaseDate' },
    { id: 'PurchaseDateTime', name: 'PurchaseDateTime', label: 'Purchase time', dataType: 'DateTime', bindingPath: 'PurchaseDateTime' },
    { id: 'IsPaid', name: 'IsPaid', label: 'Is paid', dataType: 'Boolean', bindingPath: 'IsPaid' },
    { id: 'Mystery', name: 'Mystery', label: 'Mystery', dataType: 'Unknown', bindingPath: 'Mystery' },
  ],
});

const base = (overrides = {}) => ({
  'addresses.phone': { mode: 'field', value: 'MobilePhone' },
  customerId: { mode: 'field', value: 'CustomerId' },
  'params.amount': { mode: 'field', value: 'OrderAmount' },
  ...overrides,
});

const run = (mappings, fieldCatalog = catalog, eventDefinitionKey = 'ORDER_ENTRY_EVENT') =>
  validateMappings({ template, mappings, fieldCatalog, eventDefinitionKey });

describe('mapping validation with the entry schema', () => {
  it('passes a valid field mapping', () => {
    const result = run(base());

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('reports a missing source field as stale (SOURCE_FIELD_NOT_FOUND)', () => {
    const result = run(base({ 'params.amount': { mode: 'field', value: 'OrderAmountOld' } }));

    expect(result.valid).toBe(false);
    expect(getStaleErrors(result)).toEqual([expect.objectContaining({ code: VALIDATION_CODES.SOURCE_FIELD_NOT_FOUND, targetKey: 'params.amount' })]);
  });

  it('accepts compatible types', () => {
    const result = run({
      'addresses.phone': { mode: 'field', value: 'MobilePhone' },
      customerId: { mode: 'field', value: 'CustomerId' },
      'params.amount': { mode: 'field', value: 'OrderAmount' },
      'params.purchaseDate': { mode: 'field', value: 'PurchaseDate' },
    });

    expect(result.valid).toBe(true);
  });

  it('keeps a warning-level conversion from blocking save', () => {
    const result = run(base({ 'addresses.phone': { mode: 'field', value: 'PlainText' } }));

    expect(result.valid).toBe(true);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: VALIDATION_CODES.TYPE_CONVERSION_REQUIRED, targetKey: 'addresses.phone' })
    );
  });

  it('blocks save for an incompatible type', () => {
    const result = run(base({ 'params.amount': { mode: 'field', value: 'PurchaseDate' } }));

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: VALIDATION_CODES.TYPE_INCOMPATIBLE, targetKey: 'params.amount' })
    );
  });

  it('warns for unknown source types without blocking save', () => {
    const result = run(base({ 'params.purchaseDate': { mode: 'field', value: 'Mystery' } }));

    expect(result.valid).toBe(true);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: VALIDATION_CODES.UNKNOWN_SOURCE_TYPE, targetKey: 'params.purchaseDate' })
    );
  });

  it('requires the event definition key for field mappings', () => {
    const result = run(base(), catalog, null);

    expect(result.valid).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain(VALIDATION_CODES.EVENT_DEFINITION_KEY_MISSING);
  });

  it('blocks field mappings while the catalog is empty', () => {
    const result = run(base(), createFieldCatalog({ eventDefinitionKey: 'ORDER_ENTRY_EVENT', fields: [] }));

    expect(result.errors.map((e) => e.code)).toContain(VALIDATION_CODES.SCHEMA_UNAVAILABLE);
  });

  it('keeps static mappings valid without a schema', () => {
    const result = run(
      {
        'addresses.phone': { mode: 'static', value: '0961234567' },
        customerId: { mode: 'static', value: 'KH0001' },
        'params.amount': { mode: 'static', value: '250000' },
      },
      createFieldCatalog({ fields: [] }),
      null
    );

    expect(result.valid).toBe(true);
  });

  it('treats a template url target as a string target', () => {
    const result = validateMappings({
      template,
      mappings: base({ 'params.resetLink': { mode: 'field', value: 'PlainText' } }),
      fieldCatalog: catalog,
      eventDefinitionKey: 'ORDER_ENTRY_EVENT',
    });

    expect(result.errors.find((e) => e.targetKey === 'params.resetLink')).toBeUndefined();
  });
});

describe('checkTypeCompatibility', () => {
  it.each([
    ['Text', 'string'],
    ['Phone', 'phone'],
    ['Email', 'email'],
    ['Integer', 'number'],
    ['Integer', 'decimal'],
    ['Number', 'number'],
    ['Number', 'decimal'],
    ['Decimal', 'number'],
    ['Decimal', 'decimal'],
    ['Date', 'date'],
    ['DateTime', 'datetime'],
    ['Boolean', 'boolean'],
    ['Phone', 'string'],
    ['Boolean', 'string'],
  ])('%s -> %s is compatible', (source, target) => {
    expect(checkTypeCompatibility(source, target).compatible).toBe(true);
  });

  it.each([
    ['Text', 'phone', COMPATIBILITY_SEVERITY.WARNING],
    ['Text', 'email', COMPATIBILITY_SEVERITY.WARNING],
    ['DateTime', 'date', COMPATIBILITY_SEVERITY.WARNING],
  ])('%s -> %s is compatible with a %s', (source, target, severity) => {
    expect(checkTypeCompatibility(source, target).severity).toBe(severity);
  });

  it.each([
    ['Date', 'number'],
    ['Boolean', 'date'],
    ['Email', 'decimal'],
    ['Phone', 'date'],
    ['Text', 'number'],
  ])('%s -> %s is incompatible', (source, target) => {
    const result = checkTypeCompatibility(source, target);
    expect(result.compatible).toBe(false);
    expect(result.severity).toBe(COMPATIBILITY_SEVERITY.ERROR);
  });

  it('treats an Unknown source as compatible with a warning', () => {
    expect(checkTypeCompatibility('Unknown', 'number')).toMatchObject({
      compatible: true,
      severity: COMPATIBILITY_SEVERITY.WARNING,
    });
  });
});
