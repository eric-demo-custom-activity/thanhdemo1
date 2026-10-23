import { describe, it, expect } from '@jest/globals';

import { ActivityState, LOAD_STATUS } from '../../public/js/state/activityState.js';
import { loadActivityIntoState } from '../../public/js/activity-loader.js';
import { buildUpdatedActivity } from '../../public/js/activity-saver.js';
import { storedActivity } from '../helpers/stored-activity.js';

const template = {
  templateKey: 'fptlc.order-confirm.zns.6a12eabf',
  displayName: 'Order Confirmation ZNS',
  channel: 'ZALO',
  version: 1,
  addresses: [{ name: 'phone', required: true, type: 'phone' }],
  recipientFields: [],
  params: [],
};

function editor() {
  const state = new ActivityState();
  state.setTemplates([template]);
  state.setLoadStatus(LOAD_STATUS.READY);
  return state;
}

describe('editor state stores the event key with the configuration', () => {
  it('serializes channel, templateKey, eventDefinitionKey and mappings together', () => {
    const state = editor();
    loadActivityIntoState({ state, activity: null, templates: state.getTemplates() });
    state.setSelectedChannel('ZALO');
    state.restoreSelectedTemplate(template.templateKey);
    state.setEntrySchemaResult({
      valid: true,
      eventDefinitionKey: 'ORDER_ENTRY_EVENT',
      fields: [{ id: 'MobilePhone', name: 'MobilePhone', label: 'Mobile Phone', dataType: 'Phone', bindingPath: 'MobilePhone', source: 'entryEvent' }],
      warnings: [],
      error: null,
    });
    state.setMapping('addresses.phone', { mode: 'field', value: 'MobilePhone' });

    expect(state.getSerializableConfiguration()).toEqual({
      channel: 'ZALO',
      templateKey: template.templateKey,
      templateVersion: 1,
      eventDefinitionKey: 'ORDER_ENTRY_EVENT',
      mappings: { 'addresses.phone': { mode: 'field', value: 'MobilePhone' } },
    });
  });

  it('restores the saved event key on reopen', () => {
    const state = editor();
    const activity = storedActivity({
      channel: 'ZALO',
      templateKey: template.templateKey,
      eventDefinitionKey: 'ORDER_ENTRY_EVENT',
      mappings: {},
    });

    loadActivityIntoState({ state, activity, templates: state.getTemplates() });

    expect(state.getSavedEventDefinitionKey()).toBe('ORDER_ENTRY_EVENT');
  });

  it('keeps the saved key null when the configuration did not store one', () => {
    const state = editor();
    const activity = storedActivity({ channel: 'ZALO', templateKey: template.templateKey, mappings: {} });

    loadActivityIntoState({ state, activity, templates: state.getTemplates() });

    expect(state.getSavedEventDefinitionKey()).toBeNull();
  });

  it('save stores the editor state under metaData and keeps lifecycle configuration untouched', () => {
    const state = editor();
    state.setSelectedChannel('ZALO');
    state.restoreSelectedTemplate(template.templateKey);
    state.setEntrySchemaResult({
      valid: true,
      eventDefinitionKey: 'K',
      fields: [{ id: 'P', name: 'P', label: 'P', dataType: 'Phone', bindingPath: 'P', source: 'entryEvent' }],
      warnings: [],
      error: null,
    });
    state.setMapping('addresses.phone', { mode: 'field', value: 'P' });
    const original = {
      key: 'a',
      metaData: { isConfigured: false },
      arguments: { execute: { url: 'https://x/execute', timeout: 20000 } },
      configurationArguments: { save: { url: 'https://x/save' } },
    };

    const result = buildUpdatedActivity({ state, activity: original, eventDefinitionKey: 'K' });

    expect(result.ok).toBe(true);
    expect(result.activity.metaData.isConfigured).toBe(true);
    expect(result.activity.metaData.customActivityConfig.templateKey).toBe(template.templateKey);
    expect(result.activity.configurationArguments).toEqual({ save: { url: 'https://x/save' } });
    expect(result.activity.arguments.execute.url).toBe('https://x/execute');
    expect(result.activity.arguments.execute).not.toHaveProperty('configurationArguments');
    expect(original.metaData).toEqual({ isConfigured: false });
  });
});
