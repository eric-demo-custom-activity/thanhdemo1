import { describe, it, expect } from '@jest/globals';

import { suggestFieldMappings, findMatchingField } from '../../public/js/domain/fieldMatching.js';

const template = {
  templateKey: 'fptlc.order-confirm.zns.6a12eabf',
  displayName: 'Order Confirmation ZNS',
  channel: 'zns',
  version: 1,
  addresses: [{ name: 'phone', required: true, type: 'phone' }],
  recipientFields: [{ name: 'customerId', required: true, type: 'string' }],
  params: [
    { name: 'customerName', required: true, type: 'string' },
    { name: 'purchaseDate', required: true, type: 'date' },
    { name: 'shortOrderCode', required: true, type: 'string' },
  ],
};

const fields = [
  { id: 'CustomerId', name: 'CustomerId' },
  { id: 'CustomerName', name: 'CustomerName' },
  { id: 'PurchaseDate', name: 'PurchaseDate' },
  { id: 'MobilePhone', name: 'MobilePhone' },
];

describe('findMatchingField', () => {
  it('matches case-insensitively on the field name', () => {
    expect(findMatchingField('customerId', fields)?.id).toBe('CustomerId');
    expect(findMatchingField('customerName', fields)?.id).toBe('CustomerName');
    expect(findMatchingField('purchaseDate', fields)?.id).toBe('PurchaseDate');
  });

  it('returns null when no field name matches', () => {
    expect(findMatchingField('shortOrderCode', fields)).toBeNull();
  });

  it('does not match partial names', () => {
    expect(findMatchingField('customer', fields)).toBeNull();
  });

  it('returns null for an empty target name', () => {
    expect(findMatchingField('', fields)).toBeNull();
  });
});

describe('suggestFieldMappings', () => {
  it('preselects every matching target as a field mapping', () => {
    const suggestions = suggestFieldMappings({ template, fields, mappings: {} });

    expect(suggestions).toEqual({
      customerId: { mode: 'field', value: 'CustomerId' },
      'params.customerName': { mode: 'field', value: 'CustomerName' },
      'params.purchaseDate': { mode: 'field', value: 'PurchaseDate' },
    });
  });

  it('leaves targets without a match unmapped', () => {
    const suggestions = suggestFieldMappings({ template, fields, mappings: {} });

    expect(suggestions['params.shortOrderCode']).toBeUndefined();
    expect(suggestions['addresses.phone']).toBeUndefined();
  });

  it('never overwrites an existing mapping', () => {
    const suggestions = suggestFieldMappings({
      template,
      fields,
      mappings: { customerId: { mode: 'static', value: 'KH0001' } },
    });

    expect(suggestions.customerId).toBeUndefined();
  });

  it('returns nothing when the schema has no fields', () => {
    expect(suggestFieldMappings({ template, fields: [], mappings: {} })).toEqual({});
  });

  it('returns nothing without a template', () => {
    expect(suggestFieldMappings({ template: null, fields, mappings: {} })).toEqual({});
  });
});
