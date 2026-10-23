import { describe, it, expect } from '@jest/globals';
import { storedActivity } from '../helpers/stored-activity.js';

import { ActivityState, LOAD_STATUS } from '../../public/js/state/activityState.js';
import { loadActivityIntoState, ACTIVITY_LOAD_STATUS } from '../../public/js/activity-loader.js';
import {
  templatesForChannel,
  planTemplateAfterChannelChange,
  planChannelChange,
} from '../../public/js/domain/channelSelection.js';
import { validateSelection, SELECTION_CODES } from '../../public/js/domain/selectionValidator.js';
import { CHANNELS, toChannelCode, isSupportedChannel, channelLabel } from '../../public/js/domain/channels.js';

const zaloTemplates = [
  { templateKey: 'fptlc.order-confirm.zns.6a12eabf', displayName: 'Order Confirmation ZNS', channel: 'ZALO', version: 1, addresses: [{ name: 'phone', required: true, type: 'phone' }], recipientFields: [], params: [{ name: 'customerName', required: true, type: 'string' }] },
  { templateKey: 'vac.appointment.zns', displayName: 'Vaccine Appointment ZNS', channel: 'ZALO', version: 1, addresses: [], recipientFields: [], params: [] },
];
const smsTemplates = [
  { templateKey: 'vac.service-change-notice.sms.988dfeff', displayName: 'Vaccine Service Change SMS', channel: 'SMS', version: 1, addresses: [], recipientFields: [], params: [] },
  { templateKey: 'vac.reminder.sms', displayName: 'Vaccine Reminder SMS', channel: 'SMS', version: 1, addresses: [], recipientFields: [], params: [{ name: 'shopName', required: false, type: 'string' }] },
];
const singleChatTemplate = [
  { templateKey: 'chat.order.confirm', displayName: 'Order Confirmation ChatApp', channel: 'CHATAPP', version: 1, addresses: [], recipientFields: [], params: [] },
];

const catalog = [...smsTemplates, ...zaloTemplates, ...singleChatTemplate];

describe('channels', () => {
  it('exposes the four supported channels with their codes', () => {
    expect(CHANNELS.map((c) => c.code)).toEqual(['SMS', 'CHATAPP', 'ZALO', 'BRC_ZALO']);
  });

  it('resolves display names and codes to the same channel', () => {
    expect(toChannelCode('ChatApp')).toBe('CHATAPP');
    expect(toChannelCode('BRC Zalo')).toBe('BRC_ZALO');
    expect(toChannelCode('brc_zalo')).toBe('BRC_ZALO');
    expect(toChannelCode('email')).toBeNull();
    expect(isSupportedChannel('ZALO')).toBe(true);
    expect(isSupportedChannel('EMAIL')).toBe(false);
  });

  it('labels a channel code for display', () => {
    expect(channelLabel('BRC_ZALO')).toBe('BRC Zalo');
  });
});

describe('channel selected and templates filtered', () => {
  it('shows only the templates of the selected channel', () => {
    const sms = templatesForChannel(catalog, 'SMS');

    expect(sms.map((t) => t.templateKey)).toEqual(['vac.service-change-notice.sms.988dfeff', 'vac.reminder.sms']);
    expect(templatesForChannel(catalog, null)).toEqual([]);
  });

  it('state filters the catalog by the selected channel', () => {
    const state = new ActivityState();
    state.setTemplates(catalog);

    state.setSelectedChannel('ZALO');

    expect(state.getTemplatesForChannel().map((t) => t.channel)).toEqual(['ZALO', 'ZALO']);
  });

  it('rejects an unsupported channel code', () => {
    const state = new ActivityState();

    expect(() => state.setSelectedChannel('EMAIL')).toThrow(/Unsupported channel/);
  });
});

describe('single template auto selection', () => {
  it('auto-selects the only template of a channel', () => {
    expect(planTemplateAfterChannelChange(catalog, 'CHATAPP')).toEqual({
      action: 'autoSelect',
      templateKey: 'chat.order.confirm',
    });
  });

  it('lets the designer choose when several templates exist', () => {
    expect(planTemplateAfterChannelChange(catalog, 'ZALO')).toEqual({ action: 'choose' });
  });

  it('reports an empty channel', () => {
    expect(planTemplateAfterChannelChange(catalog, 'BRC_ZALO')).toEqual({ action: 'empty' });
  });
});

describe('channel change confirmation', () => {
  it('does nothing when the same channel is chosen again', () => {
    expect(planChannelChange({ currentChannel: 'SMS', requestedChannel: 'SMS', hasMappings: true })).toEqual({ action: 'noop' });
  });

  it('asks for confirmation when mappings would be cleared', () => {
    expect(planChannelChange({ currentChannel: 'SMS', requestedChannel: 'ZALO', hasMappings: true })).toEqual({ action: 'confirm' });
  });

  it('applies directly when there is nothing to lose', () => {
    expect(planChannelChange({ currentChannel: null, requestedChannel: 'ZALO', hasMappings: false })).toEqual({ action: 'apply' });
  });

  it('keeps the previous channel and mappings when the change is not confirmed', () => {
    const state = new ActivityState();
    state.setTemplates(catalog);
    state.setSelectedChannel('SMS');
    state.restoreSelectedTemplate('vac.reminder.sms');
    state.setMapping('params.shopName', { mode: 'static', value: 'Long Chau' });

    // The confirmation is declined, so no clearing and no channel change happen.
    const plan = planChannelChange({
      currentChannel: state.getSelectedChannel(),
      requestedChannel: 'ZALO',
      hasMappings: Object.keys(state.getMappings()).length > 0,
    });

    expect(plan.action).toBe('confirm');
    expect(state.getSelectedChannel()).toBe('SMS');
    expect(state.getSelectedTemplate().templateKey).toBe('vac.reminder.sms');
    expect(state.getMappings()).toEqual({ 'params.shopName': { mode: 'static', value: 'Long Chau' } });
  });

  it('clears the template and mappings but keeps the channel when the change is confirmed', () => {
    const state = new ActivityState();
    state.setTemplates(catalog);
    state.setSelectedChannel('SMS');
    state.restoreSelectedTemplate('vac.reminder.sms');
    state.setMapping('params.shopName', { mode: 'static', value: 'Long Chau' });

    state.clearTemplateSelection();
    state.setSelectedChannel('ZALO');

    expect(state.getSelectedTemplate()).toBeNull();
    expect(state.getMappings()).toEqual({});
    expect(state.getSelectedChannel()).toBe('ZALO');
  });
});

describe('channel and template validation messages', () => {
  it('requires a channel', () => {
    const result = validateSelection({ channel: null, template: smsTemplates[0] });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      expect.objectContaining({ code: SELECTION_CODES.CHANNEL_MISSING, message: 'Please select a notification channel.' }),
    ]);
  });

  it('requires a template', () => {
    const result = validateSelection({ channel: 'SMS', template: null });

    expect(result.errors).toEqual([
      expect.objectContaining({ code: SELECTION_CODES.TEMPLATE_MISSING, message: 'Please select a template.' }),
    ]);
  });

  it('rejects a template that belongs to another channel', () => {
    const result = validateSelection({ channel: 'SMS', template: zaloTemplates[0] });

    expect(result.errors.map((e) => e.code)).toEqual([SELECTION_CODES.CHANNEL_MISMATCH]);
  });

  it('passes with a channel and a matching template', () => {
    expect(validateSelection({ channel: 'SMS', template: smsTemplates[0] })).toEqual({ valid: true, errors: [], warnings: [] });
  });
});

describe('activity restored correctly', () => {
  const savedZalo = storedActivity({
    channel: 'ZALO',
    templateKey: 'fptlc.order-confirm.zns.6a12eabf',
    eventDefinitionKey: 'ORDER_ENTRY_EVENT',
    mappings: {
      'addresses.phone': { mode: 'field', value: 'MobilePhone' },
      'params.customerName': { mode: 'field', value: 'CustomerName' },
    },
  });

  it('restores the channel, the template and all mappings', () => {
    const state = new ActivityState();
    state.setTemplates(catalog);
    state.setLoadStatus(LOAD_STATUS.READY);

    const result = loadActivityIntoState({ state, activity: savedZalo, templates: catalog });

    expect(result.status).toBe(ACTIVITY_LOAD_STATUS.RESTORED);
    expect(state.getSelectedChannel()).toBe('ZALO');
    expect(state.getSelectedTemplate().templateKey).toBe('fptlc.order-confirm.zns.6a12eabf');
    expect(Object.keys(state.getMappings())).toHaveLength(2);
    expect(state.getSavedEventDefinitionKey()).toBe('ORDER_ENTRY_EVENT');
  });

  it('uses the template channel and warns when the saved channel disagrees', () => {
    const state = new ActivityState();
    state.setTemplates(catalog);
    const inconsistent = JSON.parse(JSON.stringify(savedZalo));
    inconsistent.metaData.customActivityConfig.channel = 'SMS';

    const result = loadActivityIntoState({ state, activity: inconsistent, templates: catalog });

    expect(state.getSelectedChannel()).toBe('ZALO');
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: 'CHANNEL_MISMATCH' }));
  });

  it('restores the saved channel when its template was removed from the catalog', () => {
    const state = new ActivityState();
    state.setTemplates(catalog);
    const missing = JSON.parse(JSON.stringify(savedZalo));
    missing.metaData.customActivityConfig.templateKey = 'gone.template';

    const result = loadActivityIntoState({ state, activity: missing, templates: catalog });

    expect(result.status).toBe(ACTIVITY_LOAD_STATUS.MISSING_TEMPLATE);
    expect(state.getSelectedChannel()).toBe('ZALO');
    expect(state.getSelectedTemplate()).toBeNull();
  });

  it('starts a new activity with no channel and no template', () => {
    const state = new ActivityState();
    state.setTemplates(catalog);

    loadActivityIntoState({ state, activity: { metaData: { isConfigured: false } }, templates: catalog });

    expect(state.getSelectedChannel()).toBeNull();
    expect(state.getSelectedTemplate()).toBeNull();
  });
});
