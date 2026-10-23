import { describe, it, expect, beforeAll, jest } from '@jest/globals';
import request from 'supertest';

import { createApp } from '../server/app.js';
import { createContainer } from '../server/container.js';
import { loadConfig } from '../server/config.js';
import { TemplateController } from '../server/controllers/templateController.js';

const createMockResponse = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe('GET /api/templates', () => {
  let app;

  beforeAll(async () => {
    const config = loadConfig({ NODE_ENV: 'development' });
    app = createApp({ container: await createContainer({ config }), config });
  });

  it('returns 200 with an items array of channel-coded templates', async () => {
    const res = await request(app).get('/api/templates');

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(8);
    expect(res.body.items[0]).toMatchObject({
      templateKey: expect.any(String),
      displayName: expect.any(String),
      channel: expect.any(String),
      addresses: expect.any(Array),
      params: expect.any(Array),
    });
  });

  it('filters by channel when the query parameter is given', async () => {
    const res = await request(app).get('/api/templates?channel=Zalo');

    expect(res.status).toBe(200);
    expect(res.body.items.every((item) => item.channel === 'ZALO')).toBe(true);
  });

  it('returns 400 for an unsupported channel', async () => {
    const res = await request(app).get('/api/templates?channel=email');

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Unsupported channel/);
  });
});

describe('TemplateController.getTemplates', () => {
  it('responds 200 with { items } from the service', async () => {
    const items = [{ templateKey: 'x' }];
    const controller = new TemplateController({
      templateService: { getTemplates: jest.fn(async () => items) },
    });
    const res = createMockResponse();

    await controller.getTemplates({ query: {} }, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ items });
  });

  it('responds 500 with a generic message when the service fails', async () => {
    const controller = new TemplateController({
      templateService: {
        getTemplates: jest.fn(async () => {
          throw new Error('internal detail');
        }),
      },
    });
    const res = createMockResponse();

    await controller.getTemplates({ query: {} }, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Unable to load templates' });
  });
});
