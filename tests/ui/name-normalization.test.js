import { describe, it, expect } from '@jest/globals';

import { normalizeName } from '../../public/js/domain/nameNormalizer.js';
import { findMatchingField, suggestFieldMappings } from '../../public/js/domain/fieldMatching.js';

const fields = [
  { id: 'CustomerId', name: 'CustomerId' },
  { id: 'CustomerName', name: 'CustomerName' },
  { id: 'PurchaseDate', name: 'PurchaseDate' },
];

const template = {
  templateKey: 'fptlc.order-confirm.zns.6a12eabf',
  displayName: 'Order Confirmation ZNS',
  channel: 'ZALO',
  version: 1,
  addresses: [],
  recipientFields: [{ name: 'customerId', required: true, type: 'string' }],
  params: [
    { name: 'customerName', required: true, type: 'string' },
    { name: 'purchaseDate', required: true, type: 'date' },
    { name: 'amount', required: true, type: 'number' },
  ],
};

describe('normalizeName', () => {
  it('treats customerId, Customer_Id, CUSTOMERID and customer-id as equal', () => {
    const variants = ['customerId', 'Customer_Id', 'CUSTOMERID', 'customer-id', 'customer id'];
    for (const value of variants) {
      expect(normalizeName(value)).toBe('customerid');
    }
  });

  it('returns an empty string for non-string input', () => {
    expect(normalizeName(undefined)).toBe('');
    expect(normalizeName(42)).toBe('');
  });
});

describe('automatic field matching with normalized names', () => {
  it('matches customerId to CustomerId regardless of case or separators', () => {
    expect(findMatchingField('customerId', fields)?.id).toBe('CustomerId');
    expect(findMatchingField('CUSTOMER_ID', fields)?.id).toBe('CustomerId');
    expect(findMatchingField('customer-id', fields)?.id).toBe('CustomerId');
  });

  it('does not match a different name', () => {
    expect(findMatchingField('amount', fields)).toBeNull();
    expect(findMatchingField('customer', fields)).toBeNull();
  });

  it('preselects every matching template target and leaves the rest empty', () => {
    expect(suggestFieldMappings({ template, fields, mappings: {} })).toEqual({
      customerId: { mode: 'field', value: 'CustomerId' },
      'params.customerName': { mode: 'field', value: 'CustomerName' },
      'params.purchaseDate': { mode: 'field', value: 'PurchaseDate' },
    });
  });

  it('keeps the user choice for a target that is already mapped', () => {
    const suggestions = suggestFieldMappings({
      template,
      fields,
      mappings: { customerId: { mode: 'field', value: 'PurchaseDate' } },
    });

    expect(suggestions.customerId).toBeUndefined();
  });
});
