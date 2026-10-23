import { describe, it, expect } from '@jest/globals';

import { runtimeKeyFor, buildRuntimeKeyMap, RuntimeKeyError, FIXED_RUNTIME_KEYS } from '../../public/js/shared/runtime-key-builder.js';
import { buildEventBinding, BINDING_CODES } from '../../public/js/shared/event-binding-builder.js';
import { parseFlatInArguments } from '../../public/js/shared/flat-arguments-parser.js';
import * as editorState from '../../public/js/shared/editor-state-adapter.js';

describe('runtimeKeyFor', () => {
  it('produces deterministic flat keys per group', () => {
    expect(runtimeKeyFor('addresses', 'phone')).toBe('address__phone');
    expect(runtimeKeyFor('recipientFields', 'customerId')).toBe('recipient__customerId');
    expect(runtimeKeyFor('params', 'customerName')).toBe('param__customerName');
  });

  it.each([
    ['contains a separator', 'a__b'],
    ['ends with an underscore', 'name_'],
    ['starts with a digit', '1name'],
    ['contains punctuation', 'name.x'],
    ['contains a space', 'customer name'],
  ])('rejects an unsafe target name that %s', (_label, name) => {
    expect(() => runtimeKeyFor('params', name)).toThrow(RuntimeKeyError);
  });

  it('rejects an unknown group', () => {
    expect(() => runtimeKeyFor('nested', 'x')).toThrow(/Unknown target group/);
  });

  it('never generates a fixed key', () => {
    expect(FIXED_RUNTIME_KEYS).toContain('channel');
    expect(runtimeKeyFor('params', 'channel')).not.toBe('channel');
  });
});

describe('buildRuntimeKeyMap', () => {
  it('maps every target of a template and reports no duplicates', () => {
    const template = {
      addresses: [{ name: 'phone' }],
      recipientFields: [{ name: 'customerId' }],
      params: [{ name: 'customerName' }],
    };

    const result = buildRuntimeKeyMap(template);

    expect(result.ok).toBe(true);
    expect(result.keys).toEqual({
      'addresses.phone': 'address__phone',
      customerId: 'recipient__customerId',
      'params.customerName': 'param__customerName',
    });
  });

  it('reports an unsafe name without throwing', () => {
    const result = buildRuntimeKeyMap({ params: [{ name: 'bad name' }] });

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatchObject({ code: 'UNSAFE_TARGET_NAME', targetKey: 'params.bad name' });
  });
});

describe('buildEventBinding (quoted syntax)', () => {
  it('produces the quoted Event binding', () => {
    expect(buildEventBinding({ eventDefinitionKey: 'ORDER_ENTRY_EVENT', bindingPath: 'CustomerId' })).toEqual({
      valid: true,
      value: '{{Event.ORDER_ENTRY_EVENT."CustomerId"}}',
    });
  });

  it('accepts spaces, underscores and punctuation in the field name', () => {
    expect(buildEventBinding({ eventDefinitionKey: 'K', bindingPath: 'Customer Name (primary)' }).value).toBe(
      '{{Event.K."Customer Name (primary)"}}'
    );
  });

  it('accepts a hyphenated event definition key', () => {
    expect(buildEventBinding({ eventDefinitionKey: 'DEAudience-eabac269', bindingPath: 'Email' }).value).toBe(
      '{{Event.DEAudience-eabac269."Email"}}'
    );
  });

  it.each([
    ['a double quote', 'Name"x'],
    ['a backslash', 'Name\\x'],
    ['a brace', 'Name}}'],
    ['a line break', 'Name\nx'],
    ['a tab', 'Name\tx'],
  ])('rejects a binding path containing %s', (_label, bindingPath) => {
    const result = buildEventBinding({ eventDefinitionKey: 'K', bindingPath });

    expect(result.valid).toBe(false);
    expect(result.error.code).toBe(BINDING_CODES.BINDING_PATH_INVALID);
  });

  it('rejects an empty binding path', () => {
    expect(buildEventBinding({ eventDefinitionKey: 'K', bindingPath: '   ' }).error.code).toBe(BINDING_CODES.BINDING_PATH_EMPTY);
  });

  it.each([
    ['a space', 'KEY 1'],
    ['a dot', 'KEY.1'],
    ['a brace', 'KEY}}'],
    ['an empty string', ''],
  ])('rejects an event key containing %s', (_label, key) => {
    expect(buildEventBinding({ eventDefinitionKey: key, bindingPath: 'x' }).error.code).toBe(
      BINDING_CODES.EVENT_DEFINITION_KEY_INVALID
    );
  });
});

describe('parseFlatInArguments', () => {
  it('parses one-key objects with string values', () => {
    expect(parseFlatInArguments([{ source: 'sf' }, { address__phone: '{{Event.K."P"}}' }])).toEqual({
      ok: true,
      values: { source: 'sf', address__phone: '{{Event.K."P"}}' },
    });
  });

  it('rejects a nested value', () => {
    const result = parseFlatInArguments([{ addresses: { phone: 'x' } }]);

    expect(result.ok).toBe(false);
    expect(result.errors[0].code).toBe('IN_ARGUMENT_VALUE_NOT_STRING');
  });

  it('rejects an object with more than one key', () => {
    expect(parseFlatInArguments([{ a: '1', b: '2' }]).errors[0].code).toBe('IN_ARGUMENT_NOT_SINGLE_KEY');
  });

  it('rejects duplicate keys', () => {
    expect(parseFlatInArguments([{ source: '1' }, { source: '2' }]).errors[0].code).toBe('IN_ARGUMENT_DUPLICATE');
  });

  it('rejects an unsafe key name', () => {
    expect(parseFlatInArguments([{ 'bad key': 'x' }]).errors[0].code).toBe('IN_ARGUMENT_KEY_INVALID');
  });

  it('rejects a non-array input', () => {
    expect(parseFlatInArguments({ source: 'x' }).errors[0].code).toBe('IN_ARGUMENTS_NOT_ARRAY');
  });
});

describe('editor-state adapter', () => {
  const state = {
    channel: 'ZALO',
    templateKey: 'fptlc.order-confirm.zns.6a12eabf',
    templateVersion: 1,
    eventDefinitionKey: 'ORDER_ENTRY_EVENT',
    mappings: { customerId: { mode: 'field', value: 'CustomerId' } },
  };

  it('writes the state under metaData without changing other properties', () => {
    const activity = {
      key: 'activity',
      arguments: { execute: { url: 'https://x/execute', timeout: 20000, configurationArguments: { save: { url: 'y' } } } },
      metaData: { isConfigured: false, icon: 'i.svg' },
    };

    const written = editorState.write(activity, state);

    expect(written.metaData).toEqual({ isConfigured: false, icon: 'i.svg', customActivityConfig: state });
    expect(written.arguments).toEqual(activity.arguments);
    expect(written.key).toBe('activity');
  });

  it('never mutates its input', () => {
    const activity = { metaData: {} };
    editorState.write(activity, state);

    expect(activity).toEqual({ metaData: {} });
  });

  it('reads back exactly what was written', () => {
    const written = editorState.write({}, state);

    expect(editorState.read(written)).toEqual(state);
    expect(editorState.hasConfiguration(written)).toBe(true);
  });

  it('returns null for a missing or malformed state', () => {
    expect(editorState.read({})).toBeNull();
    expect(editorState.read({ metaData: { customActivityConfig: 'text' } })).toBeNull();
    expect(editorState.read({ metaData: { customActivityConfig: { templateKey: 'x' } } })).toBeNull();
    expect(editorState.read({ metaData: { customActivityConfig: { channel: 'ZALO', templateKey: 'x', mappings: [] } } })).toBeNull();
  });

  it('removes only the editor state', () => {
    const removed = editorState.remove(editorState.write({ metaData: { isConfigured: true } }, state));

    expect(removed.metaData).toEqual({ isConfigured: true });
  });
});
