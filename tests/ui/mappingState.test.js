import { describe, it, expect, jest } from '@jest/globals';

import { ActivityState } from '../../public/js/state/activityState.js';

const templates = [
  {
    templateKey: 'zns.1',
    displayName: 'Order Confirmation ZNS',
    channel: 'zns',
    addresses: [{ name: 'phone', required: true }],
    recipientFields: [{ name: 'customerId', required: true }],
    params: [{ name: 'customerName', required: true }],
  },
  {
    templateKey: 'email.1',
    displayName: 'Password Reset Email',
    channel: 'email',
    addresses: [{ name: 'email', required: true }],
    recipientFields: [],
    params: [],
  },
];

const withSelection = (key = 'zns.1') => {
  const state = new ActivityState();
  state.setTemplates(templates);
  state.setSelectedTemplate(key);
  return state;
};

describe('ActivityState mappings', () => {
  it('stores a mapping for a template target and returns it in a snapshot', () => {
    const state = withSelection();

    state.setMapping('params.customerName', { mode: 'field', value: 'CustomerName' });

    expect(state.getMappings()).toEqual({
      'params.customerName': { mode: 'field', value: 'CustomerName' },
    });
  });

  it('returns a snapshot that cannot be mutated from outside', () => {
    const state = withSelection();
    state.setMapping('customerId', { mode: 'field', value: 'CustomerId' });

    const snapshot = state.getMappings();

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(() => {
      snapshot.customerId = { mode: 'field', value: 'Hacked' };
    }).toThrow();
    expect(state.getMappings().customerId.value).toBe('CustomerId');
  });

  it('replaces an existing mapping for the same target', () => {
    const state = withSelection();
    state.setMapping('customerId', { mode: 'field', value: 'CustomerId' });

    state.setMapping('customerId', { mode: 'static', value: 'fixed' });

    expect(state.getMappings().customerId).toEqual({ mode: 'static', value: 'fixed' });
  });

  it('removes one mapping and emits a mapping event with a null mapping', () => {
    const state = withSelection();
    state.setMapping('customerId', { mode: 'field', value: 'CustomerId' });
    const listener = jest.fn();
    state.subscribe(listener);

    state.removeMapping('customerId');

    expect(state.getMappings()).toEqual({});
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'mapping', targetKey: 'customerId', mapping: null }),
      state
    );
  });

  it('clears all mappings when the template changes', () => {
    const state = withSelection('zns.1');
    state.setMapping('customerId', { mode: 'field', value: 'CustomerId' });

    state.setSelectedTemplate('email.1');

    expect(state.getMappings()).toEqual({});
  });

  it('clears all mappings explicitly', () => {
    const state = withSelection();
    state.setMapping('customerId', { mode: 'field', value: 'CustomerId' });

    state.clearMappings();

    expect(state.getMappings()).toEqual({});
  });

  it('rejects a target key the selected template does not define', () => {
    const state = withSelection('zns.1');

    expect(() => state.setMapping('params.unknown', { mode: 'field', value: 'x' })).toThrow(/Unknown mapping target/);
  });

  it('rejects a mapping when no template is selected', () => {
    const state = new ActivityState();
    state.setTemplates(templates);

    expect(() => state.setMapping('customerId', { mode: 'field', value: 'x' })).toThrow(/without a selected template/);
  });

  it('rejects an unsupported mode and a non-string value', () => {
    const state = withSelection();

    expect(() => state.setMapping('customerId', { mode: 'json', value: 'x' })).toThrow(/Unsupported mapping mode/);
    expect(() => state.setMapping('customerId', { mode: 'static', value: 42 })).toThrow(/must be a string/);
  });

  it('clears the selection and all mappings when a reload removes the selected template', () => {
    const state = withSelection('zns.1');
    state.setMapping('customerId', { mode: 'field', value: 'CustomerId' });

    state.setTemplates([templates[1]]);

    expect(state.getSelectedTemplate()).toBeNull();
    expect(state.getMappings()).toEqual({});
  });
});
