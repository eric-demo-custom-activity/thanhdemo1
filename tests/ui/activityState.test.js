import { describe, it, expect, jest } from '@jest/globals';

import { ActivityState, LOAD_STATUS } from '../../public/js/state/activityState.js';

const templates = [
  { templateKey: 'a.sms.1', displayName: 'A', channel: 'sms' },
  { templateKey: 'b.zns.2', displayName: 'B', channel: 'zns' },
];

describe('ActivityState', () => {
  it('stores templates and returns them', () => {
    const state = new ActivityState();

    state.setTemplates(templates);

    expect(state.getTemplates()).toEqual(templates);
  });

  it('stores the selection by templateKey and returns the full template', () => {
    const state = new ActivityState();
    state.setTemplates(templates);

    state.setSelectedTemplate('b.zns.2');

    expect(state.getSelectedTemplate()).toBe(state.getTemplates()[1]);
  });

  it('throws when selecting an unknown templateKey', () => {
    const state = new ActivityState();
    state.setTemplates(templates);

    expect(() => state.setSelectedTemplate('missing')).toThrow(/Unknown templateKey/);
  });

  it('returns null when nothing is selected', () => {
    const state = new ActivityState();
    state.setTemplates(templates);

    expect(state.getSelectedTemplate()).toBeNull();
  });

  it('clears the selection when the selected template disappears from the catalog', () => {
    const state = new ActivityState();
    state.setTemplates(templates);
    state.setSelectedTemplate('a.sms.1');

    state.setTemplates([templates[1]]);

    expect(state.getSelectedTemplate()).toBeNull();
  });

  it('keeps the selection when the template still exists after a reload', () => {
    const state = new ActivityState();
    state.setTemplates(templates);
    state.setSelectedTemplate('b.zns.2');

    state.setTemplates([{ ...templates[1], displayName: 'B renamed' }, templates[0]]);

    expect(state.getSelectedTemplate().displayName).toBe('B renamed');
  });

  it('tracks load status and error message', () => {
    const state = new ActivityState();

    state.setLoadStatus(LOAD_STATUS.ERROR, 'boom');

    expect(state.getLoadStatus()).toBe('error');
    expect(state.getLoadError()).toBe('boom');

    state.setLoadStatus(LOAD_STATUS.READY);

    expect(state.getLoadError()).toBeNull();
  });

  it('notifies subscribers and supports unsubscribe', () => {
    const state = new ActivityState();
    const listener = jest.fn();
    const unsubscribe = state.subscribe(listener);

    state.setTemplates(templates);
    state.setSelectedTemplate('a.sms.1');
    unsubscribe();
    state.setSelectedTemplate('b.zns.2');

    expect(listener.mock.calls.map(([event]) => event.type)).toEqual(['templates', 'selection']);
  });

  it('does not notify when the same template is selected again', () => {
    const state = new ActivityState();
    state.setTemplates(templates);
    state.setSelectedTemplate('a.sms.1');
    const listener = jest.fn();
    state.subscribe(listener);

    state.setSelectedTemplate('a.sms.1');

    expect(listener).not.toHaveBeenCalled();
  });
});
