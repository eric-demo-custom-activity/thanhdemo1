import { describe, it, expect, jest } from '@jest/globals';

import { TemplateApi, TemplateApiError } from '../../public/js/services/templateApi.js';

const sampleItems = [
  {
    templateKey: 'fptlc.order-confirm.zns.6a12eabf',
    displayName: 'Order Confirmation ZNS',
    channel: 'zns',
    version: 1,
    addresses: [{ name: 'phone', required: true }],
    params: [{ name: 'customerName', required: true }],
  },
];

const jsonResponse = (body, { ok = true, status = 200 } = {}) => ({
  ok,
  status,
  json: async () => body,
});

describe('TemplateApi.getTemplates', () => {
  it('requests /api/templates and returns the items array', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse({ items: sampleItems }));
    const api = new TemplateApi({ fetchImpl });

    const result = await api.getTemplates();

    expect(result).toEqual(sampleItems);
    expect(fetchImpl).toHaveBeenCalledWith('/api/templates', expect.objectContaining({ method: 'GET' }));
  });

  it('returns an empty array when the catalog is empty', async () => {
    const api = new TemplateApi({ fetchImpl: async () => jsonResponse({ items: [] }) });

    await expect(api.getTemplates()).resolves.toEqual([]);
  });

  it('throws a network error kind when fetch rejects', async () => {
    const api = new TemplateApi({
      fetchImpl: async () => {
        throw new TypeError('Failed to fetch');
      },
    });

    const error = await api.getTemplates().catch((e) => e);

    expect(error).toBeInstanceOf(TemplateApiError);
    expect(error.kind).toBe('network');
  });

  it('throws an http error kind for non-2xx responses', async () => {
    const api = new TemplateApi({ fetchImpl: async () => jsonResponse({}, { ok: false, status: 500 }) });

    const error = await api.getTemplates().catch((e) => e);

    expect(error.kind).toBe('http');
    expect(error.status).toBe(500);
  });

  it('throws an unexpected error kind when the body is not JSON', async () => {
    const api = new TemplateApi({
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected token <');
        },
      }),
    });

    const error = await api.getTemplates().catch((e) => e);

    expect(error.kind).toBe('unexpected');
  });

  it.each([
    ['missing items', {}],
    ['items is not an array', { items: 'nope' }],
    ['item missing templateKey', { items: [{ displayName: 'x', channel: 'sms', addresses: [], params: [] }] }],
    ['null body', null],
  ])('throws an unexpected error kind when %s', async (_label, body) => {
    const api = new TemplateApi({ fetchImpl: async () => jsonResponse(body) });

    const error = await api.getTemplates().catch((e) => e);

    expect(error.kind).toBe('unexpected');
  });
});
