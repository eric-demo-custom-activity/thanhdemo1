import { describe, it, expect } from '@jest/globals';

import { buildFlatInArguments, DEFAULT_SOURCE } from '../../public/js/flat-inarguments-builder.js';
import { buildBindingExpression, BINDING_ERROR_CODES } from '../../public/js/binding-builder.js';
import { createFieldCatalog, findField } from '../../public/js/schema/field-catalog-model.js';

const template = {
  templateKey: 'fptlc.order-confirm.zns.6a12eabf',
  displayName: 'Order Confirmation ZNS',
  channel: 'ZALO',
  version: 1,
  addresses: [{ name: 'phone', required: true, type: 'phone' }],
  recipientFields: [{ name: 'customerId', required: true, type: 'string' }],
  params: [
    { name: 'customerName', required: true, type: 'string' },
    { name: 'shopName', required: false, type: 'string' },
  ],
};

const catalog = createFieldCatalog({
  eventDefinitionKey: 'ORDER_ENTRY_EVENT',
  fields: [
    { id: 'MobilePhone', name: 'MobilePhone', label: 'Mobile Phone', dataType: 'Phone', bindingPath: 'MobilePhone' },
    { id: 'CustomerId', name: 'CustomerId', label: 'Customer ID', dataType: 'Text', bindingPath: 'CustomerId' },
    { id: 'Customer Name', name: 'Customer Name', label: 'Customer name', dataType: 'Text', bindingPath: 'Customer Name' },
  ],
});

describe('buildBindingExpression (quoted syntax)', () => {
  it('uses the normalized bindingPath inside quotes', () => {
    const result = buildBindingExpression({
      mapping: { mode: 'field', value: 'Customer Name' },
      field: findField(catalog, 'Customer Name'),
      eventDefinitionKey: 'ORDER_ENTRY_EVENT',
    });

    expect(result).toEqual({ valid: true, value: '{{Event.ORDER_ENTRY_EVENT."Customer Name"}}' });
  });

  it('keeps static values unchanged', () => {
    expect(buildBindingExpression({ mapping: { mode: 'static', value: 'Long {Chau}' } })).toEqual({
      valid: true,
      value: 'Long {Chau}',
    });
  });

  it('rejects a field that is not in the catalog', () => {
    const result = buildBindingExpression({
      mapping: { mode: 'field', value: 'Gone' },
      field: null,
      eventDefinitionKey: 'K',
    });

    expect(result.error.code).toBe(BINDING_ERROR_CODES.FIELD_NOT_IN_CATALOG);
  });

  it('rejects a missing event definition key', () => {
    const result = buildBindingExpression({
      mapping: { mode: 'field', value: 'CustomerId' },
      field: findField(catalog, 'CustomerId'),
      eventDefinitionKey: null,
    });

    expect(result.error.code).toBe(BINDING_ERROR_CODES.EVENT_DEFINITION_KEY_MISSING);
  });

  it('rejects an unsafe binding path', () => {
    const unsafe = createFieldCatalog({ fields: [{ id: 'X', name: 'X', label: 'X', dataType: 'Text', bindingPath: 'X"}}' }] });

    const result = buildBindingExpression({
      mapping: { mode: 'field', value: 'X' },
      field: findField(unsafe, 'X'),
      eventDefinitionKey: 'K',
    });

    expect(result.error.code).toBe(BINDING_ERROR_CODES.UNSAFE_BINDING_PATH);
  });

  it('rejects an unsafe event definition key', () => {
    const result = buildBindingExpression({
      mapping: { mode: 'field', value: 'CustomerId' },
      field: findField(catalog, 'CustomerId'),
      eventDefinitionKey: 'KEY}}{{Event.OTHER',
    });

    expect(result.error.code).toBe(BINDING_ERROR_CODES.UNSAFE_EVENT_DEFINITION_KEY);
  });
});

describe('buildFlatInArguments', () => {
  const mappings = {
    'addresses.phone': { mode: 'field', value: 'MobilePhone' },
    customerId: { mode: 'field', value: 'CustomerId' },
    'params.customerName': { mode: 'static', value: 'Nguyen Van A' },
  };

  it('produces fixed entries followed by one object per mapped target', () => {
    const result = buildFlatInArguments({ template, mappings, fieldCatalog: catalog, eventDefinitionKey: 'ORDER_ENTRY_EVENT' });

    expect(result.ok).toBe(true);
    expect(result.inArguments).toEqual([
      { source: DEFAULT_SOURCE },
      { channel: 'ZALO' },
      { templateKey: 'fptlc.order-confirm.zns.6a12eabf' },
      { templateVersion: '1' },
      { eventDefinitionKey: 'ORDER_ENTRY_EVENT' },
      { address__phone: '{{Event.ORDER_ENTRY_EVENT."MobilePhone"}}' },
      { recipient__customerId: '{{Event.ORDER_ENTRY_EVENT."CustomerId"}}' },
      { param__customerName: 'Nguyen Van A' },
    ]);
  });

  it('never produces a nested value and always one key per object', () => {
    const { inArguments } = buildFlatInArguments({ template, mappings, fieldCatalog: catalog, eventDefinitionKey: 'K' });

    for (const entry of inArguments) {
      expect(Object.keys(entry)).toHaveLength(1);
      expect(typeof Object.values(entry)[0]).toBe('string');
    }
  });

  it('omits unmapped optional targets', () => {
    const { inArguments } = buildFlatInArguments({ template, mappings, fieldCatalog: catalog, eventDefinitionKey: 'K' });

    expect(inArguments.map((e) => Object.keys(e)[0])).not.toContain('param__shopName');
  });

  it('reports a missing event definition key when a field is mapped without one', () => {
    const result = buildFlatInArguments({ template, mappings, fieldCatalog: catalog, eventDefinitionKey: null });

    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain('EVENT_DEFINITION_KEY_MISSING');
  });

  it('is deterministic for the same input', () => {
    const a = buildFlatInArguments({ template, mappings, fieldCatalog: catalog, eventDefinitionKey: 'K' });
    const b = buildFlatInArguments({ template, mappings, fieldCatalog: catalog, eventDefinitionKey: 'K' });

    expect(a).toEqual(b);
  });
});
