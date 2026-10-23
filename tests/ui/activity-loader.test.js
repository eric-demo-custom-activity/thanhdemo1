import { describe, it, expect } from '@jest/globals';

import { ActivityState, LOAD_STATUS } from '../../public/js/state/activityState.js';
import { loadActivityIntoState, ACTIVITY_LOAD_STATUS } from '../../public/js/activity-loader.js';
import { storedActivity } from '../helpers/stored-activity.js';

const znsTemplate = {
  templateKey: 'fptlc.order-confirm.zns.6a12eabf',
  displayName: 'Order Confirmation ZNS',
  channel: 'ZALO',
  version: 1,
  addresses: [{ name: 'phone', required: true, type: 'phone' }],
  recipientFields: [{ name: 'customerId', required: true, type: 'string' }],
  params: [{ name: 'customerName', required: true, type: 'string' }],
};
const templates = [znsTemplate];

const configuration = {
  channel: 'ZALO',
  templateKey: znsTemplate.templateKey,
  templateVersion: 1,
  eventDefinitionKey: 'ORDER_ENTRY_EVENT',
  mappings: {
    'addresses.phone': { mode: 'field', value: 'MobilePhone' },
    customerId: { mode: 'static', value: 'KH0001' },
    'params.customerName': { mode: 'field', value: 'CustomerName' },
  },
};

function editor() {
  const state = new ActivityState();
  state.setTemplates(templates);
  state.setLoadStatus(LOAD_STATUS.READY);
  return state;
}

describe('loadActivityIntoState: new activity', () => {
  it('selects neither channel nor template and keeps the original object', () => {
    const state = editor();
    const fresh = { metaData: { isConfigured: false }, arguments: { execute: {} } };

    const result = loadActivityIntoState({ state, activity: fresh, templates });

    expect(result.status).toBe(ACTIVITY_LOAD_STATUS.NEW);
    expect(state.getSelectedChannel()).toBeNull();
    expect(state.getSelectedTemplate()).toBeNull();
    expect(state.isConfigured()).toBe(false);
    expect(state.getOriginalActivityDefinition()).toBe(fresh);
  });

  it('treats a null activity as new', () => {
    const state = editor();

    expect(loadActivityIntoState({ state, activity: null, templates }).status).toBe(ACTIVITY_LOAD_STATUS.NEW);
  });
});

describe('loadActivityIntoState: restored activity', () => {
  it('restores channel, template, mappings and the saved event key', () => {
    const state = editor();
    const activity = storedActivity(configuration);

    const result = loadActivityIntoState({ state, activity, templates });

    expect(result.status).toBe(ACTIVITY_LOAD_STATUS.RESTORED);
    expect(state.getSelectedChannel()).toBe('ZALO');
    expect(state.getSelectedTemplate().templateKey).toBe(znsTemplate.templateKey);
    expect(state.getMappings()).toEqual(configuration.mappings);
    expect(state.getSavedEventDefinitionKey()).toBe('ORDER_ENTRY_EVENT');
    expect(state.isConfigured()).toBe(true);
  });

  it('does not clear restored mappings during the initial load', () => {
    const state = editor();

    loadActivityIntoState({ state, activity: storedActivity(configuration), templates });

    expect(Object.keys(state.getMappings())).toHaveLength(3);
  });

  it('skips a mapping for a target the template does not define and warns', () => {
    const state = editor();
    const activity = storedActivity({ ...configuration, mappings: { ...configuration.mappings, 'params.ghost': { mode: 'static', value: 'x' } } });

    const result = loadActivityIntoState({ state, activity, templates });

    expect(state.getMappings()).not.toHaveProperty('params.ghost');
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: 'UNKNOWN_TARGET', targetKey: 'params.ghost' }));
  });

  it('skips a mapping with an unsupported mode and warns', () => {
    const state = editor();
    const activity = storedActivity({ ...configuration, mappings: { customerId: { mode: 'json', value: '{}' } } });

    const result = loadActivityIntoState({ state, activity, templates });

    expect(state.getMappings()).toEqual({});
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: 'UNSUPPORTED_MODE' }));
  });

  it('keeps the activity object unchanged', () => {
    const state = editor();
    const activity = storedActivity(configuration, { base: { key: 'k', arguments: { execute: { url: 'https://x/y', timeout: 1 } } } });
    const snapshot = JSON.stringify(activity);

    loadActivityIntoState({ state, activity, templates });

    expect(JSON.stringify(activity)).toBe(snapshot);
  });

  it('warns and uses the template channel when the saved channel disagrees', () => {
    const state = editor();
    const activity = storedActivity({ ...configuration, channel: 'SMS' });

    const result = loadActivityIntoState({ state, activity, templates });

    expect(state.getSelectedChannel()).toBe('ZALO');
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: 'CHANNEL_MISMATCH' }));
  });
});

describe('loadActivityIntoState: missing or malformed data', () => {
  it('reports a missing template and keeps the saved channel', () => {
    const state = editor();
    const activity = storedActivity({ ...configuration, templateKey: 'gone.template' });

    const result = loadActivityIntoState({ state, activity, templates });

    expect(result.status).toBe(ACTIVITY_LOAD_STATUS.MISSING_TEMPLATE);
    expect(state.getMissingTemplateKey()).toBe('gone.template');
    expect(state.getSelectedChannel()).toBe('ZALO');
    expect(state.getSelectedTemplate()).toBeNull();
  });

  it('treats a malformed stored state as new instead of crashing', () => {
    const state = editor();
    const activity = { metaData: { isConfigured: false, customActivityConfig: 'not-an-object' } };

    const result = loadActivityIntoState({ state, activity, templates });

    expect(result.status).toBe(ACTIVITY_LOAD_STATUS.NEW);
    expect(state.getSelectedTemplate()).toBeNull();
  });
});
