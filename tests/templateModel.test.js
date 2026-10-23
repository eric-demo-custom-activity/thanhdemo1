import { describe, it, expect } from '@jest/globals';

import {
  createTemplateModel,
  findTemplateProblems,
  SUPPORTED_CHANNELS,
  toChannelCode,
} from '../server/models/templateModel.js';

const validRaw = {
  templateKey: 'k.sms.1',
  displayName: 'SMS',
  channel: 'sms',
  addresses: [{ name: 'phone' }],
  params: [{ name: 'shopName' }],
};

describe('templateModel', () => {
  it('supports exactly the four channel codes', () => {
    expect([...SUPPORTED_CHANNELS]).toEqual(['SMS', 'CHATAPP', 'ZALO', 'BRC_ZALO']);
  });

  it('normalizes display names to channel codes', () => {
    expect(toChannelCode('SMS')).toBe('SMS');
    expect(toChannelCode('ChatApp')).toBe('CHATAPP');
    expect(toChannelCode('Zalo')).toBe('ZALO');
    expect(toChannelCode('BRC Zalo')).toBe('BRC_ZALO');
    expect(toChannelCode('brc_zalo')).toBe('BRC_ZALO');
    expect(toChannelCode('email')).toBeNull();
  });

  it('stores the normalized channel code in the model', () => {
    expect(createTemplateModel({ ...validRaw, channel: 'BRC Zalo' }).channel).toBe('BRC_ZALO');
  });

  it('accepts a valid template', () => {
    expect(findTemplateProblems(validRaw)).toEqual([]);
  });

  it.each(['templateKey', 'displayName'])('reports missing %s', (field) => {
    const raw = { ...validRaw, [field]: '' };
    expect(findTemplateProblems(raw).join(' ')).toMatch(new RegExp(`${field} is required`));
  });

  it('rejects unsupported channels', () => {
    expect(findTemplateProblems({ ...validRaw, channel: 'fax' })).toHaveLength(1);
  });

  it('requires addresses and params to be arrays', () => {
    const problems = findTemplateProblems({ ...validRaw, addresses: 'phone', params: undefined });
    expect(problems).toEqual(
      expect.arrayContaining(['addresses must be an array', 'params must be an array'])
    );
  });

  it('requires every address and param to have a name', () => {
    const problems = findTemplateProblems({ ...validRaw, params: [{ type: 'string' }] });
    expect(problems).toContain('every param needs a non-empty name');
  });

  it('rejects non-object input', () => {
    expect(findTemplateProblems(null)).toEqual(['template must be an object']);
    expect(findTemplateProblems([])).toEqual(['template must be an object']);
  });

  it('creates a frozen model with defaults applied', () => {
    const model = createTemplateModel(validRaw);

    expect(model.version).toBe(1);
    expect(model.recipientFields).toEqual([]);
    expect(Object.isFrozen(model)).toBe(true);
    expect(Object.isFrozen(model.params)).toBe(true);
  });
});
