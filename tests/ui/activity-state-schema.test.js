import { describe, it, expect } from '@jest/globals';

import { ActivityState, LOAD_STATUS, SCHEMA_STATUS } from '../../public/js/state/activityState.js';

const template = {
  templateKey: 'fptlc.order-confirm.zns.6a12eabf',
  displayName: 'Order Confirmation ZNS',
  channel: 'zns',
  version: 1,
  addresses: [{ name: 'phone', required: true, type: 'phone' }],
  recipientFields: [{ name: 'customerId', required: true, type: 'string' }],
  params: [
    { name: 'customerName', required: true, type: 'string' },
    { name: 'shopName', required: false, type: 'string' },
  ],
};

const okResult = (fields, key = 'ORDER_ENTRY_EVENT', warnings = []) => ({
  valid: true,
  eventDefinitionKey: key,
  fields: fields.map((id) => ({ id, name: id, label: id, dataType: 'Text', source: 'entryEvent', bindingPath: id })),
  warnings,
  error: null,
});

const failedResult = (code, key = null) => ({
  valid: false,
  eventDefinitionKey: key,
  fields: [],
  warnings: [],
  error: { code, message: 'message' },
});

function readyState() {
  const state = new ActivityState();
  state.setTemplates([template]);
  state.setLoadStatus(LOAD_STATUS.READY);
  state.restoreSelectedTemplate(template.templateKey);
  state.setEntrySchemaResult(okResult(['CustomerId', 'CustomerName', 'MobilePhone']));
  return state;
}

describe('ActivityState entry schema', () => {
  it('stores the normalized catalog and finds fields by stable id', () => {
    const state = readyState();

    expect(state.getSchemaStatus()).toBe(SCHEMA_STATUS.READY);
    expect(state.getEventDefinitionKey()).toBe('ORDER_ENTRY_EVENT');
    expect(state.getAvailableFields().map((f) => f.id)).toEqual(['CustomerId', 'CustomerName', 'MobilePhone']);
    expect(state.getFieldById('MobilePhone')).toMatchObject({ id: 'MobilePhone', bindingPath: 'MobilePhone' });
    expect(state.getFieldById('Missing')).toBeNull();
    expect(state.hasField('CustomerId')).toBe(true);
    expect(state.hasField('Nope')).toBe(false);
  });

  it('identifies saved fields that are missing from a ready catalog', () => {
    const state = readyState();
    state.setMapping('addresses.phone', { mode: 'field', value: 'OldPhone' });
    state.setMapping('params.customerName', { mode: 'field', value: 'CustomerName' });

    expect(state.getMissingMappedFields()).toEqual([{ targetKey: 'addresses.phone', value: 'OldPhone' }]);
  });

  it('reports no stale fields while the schema is not ready', () => {
    const state = readyState();
    state.setMapping('addresses.phone', { mode: 'field', value: 'OldPhone' });
    state.setEntrySchemaResult(failedResult('SCHEMA_NOT_AVAILABLE', 'ORDER_ENTRY_EVENT'));

    expect(state.getMissingMappedFields()).toEqual([]);
  });

  it('preserves mappings during a schema refresh', () => {
    const state = readyState();
    state.setMapping('params.customerName', { mode: 'field', value: 'CustomerName' });
    state.setMapping('params.shopName', { mode: 'static', value: 'Long Chau' });

    state.setEntrySchemaResult(okResult(['CustomerId', 'MobilePhone']));

    expect(state.getMappings()).toEqual({
      'params.customerName': { mode: 'field', value: 'CustomerName' },
      'params.shopName': { mode: 'static', value: 'Long Chau' },
    });
  });

  it('marks a mapping stale after refresh and clears the stale state after replacement', () => {
    const state = readyState();
    state.setMapping('params.customerName', { mode: 'field', value: 'CustomerName' });

    state.setEntrySchemaResult(okResult(['CustomerId', 'MobilePhone']));
    expect(state.getMissingMappedFields()).toEqual([{ targetKey: 'params.customerName', value: 'CustomerName' }]);

    state.setMapping('params.customerName', { mode: 'field', value: 'MobilePhone' });
    expect(state.getMissingMappedFields()).toEqual([]);
  });

  it('clears a stale mapping when the user removes it', () => {
    const state = readyState();
    state.setMapping('params.customerName', { mode: 'field', value: 'CustomerName' });
    state.setEntrySchemaResult(okResult(['CustomerId']));

    state.removeMapping('params.customerName');

    expect(state.getMissingMappedFields()).toEqual([]);
    expect(state.getMappings()).toEqual({});
  });

  it('maps an unavailable schema to the unavailable status with an empty catalog', () => {
    const state = readyState();

    state.setEntrySchemaResult(failedResult('SCHEMA_NOT_AVAILABLE', 'ORDER_ENTRY_EVENT'));

    expect(state.getSchemaStatus()).toBe(SCHEMA_STATUS.UNAVAILABLE);
    expect(state.getAvailableFields()).toEqual([]);
    expect(state.getSchemaError().code).toBe('SCHEMA_NOT_AVAILABLE');
  });

  it('maps a malformed definition to the error status', () => {
    const state = readyState();

    state.setEntrySchemaResult(failedResult('INVALID_EVENT_DEFINITION'));

    expect(state.getSchemaStatus()).toBe(SCHEMA_STATUS.ERROR);
    expect(state.getEventDefinitionKey()).toBeNull();
  });

  it('stores warnings from a successful discovery', () => {
    const state = new ActivityState();
    state.setEntrySchemaResult(okResult(['A'], 'K', [{ code: 'DUPLICATE_FIELD', index: 3, message: 'dup' }]));

    expect(state.getSchemaWarnings()).toHaveLength(1);
  });

  it('records a pre-discovery failure without a catalog', () => {
    const state = readyState();

    state.setSchemaFailure({ code: 'POSTMONGER_UNAVAILABLE', message: 'SDK missing' });

    expect(state.getSchemaStatus()).toBe(SCHEMA_STATUS.ERROR);
    expect(state.getAvailableFields()).toEqual([]);
    expect(state.getSchemaError().code).toBe('POSTMONGER_UNAVAILABLE');
  });

  it('exposes the three initialization parts and their combined readiness', () => {
    const state = readyState();
    state.setActivityStatus(LOAD_STATUS.READY);

    expect(state.getInitStatus()).toEqual({
      templates: { status: 'ready' },
      activity: { status: 'ready' },
      entrySchema: { status: 'ready' },
    });
    expect(state.isMappingEditorFullyReady()).toBe(true);

    state.setSchemaStatus(SCHEMA_STATUS.LOADING);
    expect(state.isMappingEditorFullyReady()).toBe(false);
  });

  it('returns frozen snapshots for catalog and mappings', () => {
    const state = readyState();
    state.setMapping('params.customerName', { mode: 'field', value: 'CustomerName' });

    expect(Object.isFrozen(state.getFieldCatalog())).toBe(true);
    expect(Object.isFrozen(state.getMappings())).toBe(true);
  });
});
