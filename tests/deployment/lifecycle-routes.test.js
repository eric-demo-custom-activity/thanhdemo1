import { describe, it, expect, beforeAll, jest } from '@jest/globals';
import request from 'supertest';
import { createHmac } from 'node:crypto';

import { createApp } from '../../server/app.js';
import { createContainer } from '../../server/container.js';
import { loadConfig } from '../../server/config.js';
import { buildFlatInArguments } from '../../public/js/flat-inarguments-builder.js';
import { createFieldCatalog } from '../../public/js/schema/field-catalog-model.js';
import * as editorState from '../../public/js/shared/editor-state-adapter.js';

const KEY = 'ORDER_ENTRY_EVENT';
const TEMPLATE_KEY = 'fptlc.order-confirm.zns.6a12eabf';

const fields = [
  { id: 'CustomerId', name: 'CustomerId', label: 'Customer ID', dataType: 'Text', bindingPath: 'CustomerId' },
  { id: 'CustomerName', name: 'CustomerName', label: 'Customer Name', dataType: 'Text', bindingPath: 'CustomerName' },
  { id: 'MobilePhone', name: 'MobilePhone', label: 'Mobile Phone', dataType: 'Phone', bindingPath: 'MobilePhone' },
  { id: 'OrderAmount', name: 'OrderAmount', label: 'Order Amount', dataType: 'Decimal', bindingPath: 'OrderAmount' },
  { id: 'PurchaseDate', name: 'PurchaseDate', label: 'Purchase Date', dataType: 'Date', bindingPath: 'PurchaseDate' },
  { id: 'EstimateDeliveryTime', name: 'EstimateDeliveryTime', label: 'Estimate', dataType: 'Text', bindingPath: 'EstimateDeliveryTime' },
  { id: 'OrderToken', name: 'OrderToken', label: 'Order Token', dataType: 'Text', bindingPath: 'OrderToken' },
];

const mappings = {
  'addresses.phone': { mode: 'field', value: 'MobilePhone' },
  customerId: { mode: 'field', value: 'CustomerId' },
  'params.customerName': { mode: 'field', value: 'CustomerName' },
  'params.customerID': { mode: 'field', value: 'CustomerId' },
  'params.shopName': { mode: 'static', value: 'Long Chau Pharmacy' },
  'params.amount': { mode: 'field', value: 'OrderAmount' },
  'params.estimateDeliveryTime': { mode: 'field', value: 'EstimateDeliveryTime' },
  'params.purchaseDate': { mode: 'field', value: 'PurchaseDate' },
  'params.shortOrderCode': { mode: 'field', value: 'OrderToken' },
  'params.token': { mode: 'field', value: 'OrderToken' },
};

/**
 * Builds an activity exactly the way the browser saver does, using the same builder.
 * This makes the test a cross-check between the UI contract and the server contract.
 */
async function buildClientActivity(container, { isConfigured = true } = {}) {
  const templates = await container.templateService.getTemplates();
  const template = templates.find((t) => t.templateKey === TEMPLATE_KEY);
  const built = buildFlatInArguments({
    template,
    mappings,
    fieldCatalog: createFieldCatalog({ eventDefinitionKey: KEY, fields }),
    eventDefinitionKey: KEY,
  });
  if (!built.ok) throw new Error(JSON.stringify(built.errors));

  const base = {
    key: 'activity-1',
    arguments: { execute: { url: 'https://activity.example.com/journey/execute', timeout: 20000, inArguments: built.inArguments } },
    metaData: { isConfigured },
  };
  return editorState.write(base, {
    channel: 'ZALO',
    templateKey: TEMPLATE_KEY,
    templateVersion: 1,
    eventDefinitionKey: KEY,
    mappings,
  });
}

const signJwt = (payload, secret) => {
  const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const s = createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${s}`;
};

describe('development mode: public endpoints and lifecycle routes', () => {
  let app;
  let container;
  let activity;
  let send;

  beforeAll(async () => {
    const config = loadConfig({ NODE_ENV: 'development' });
    container = await createContainer({ config });
    app = createApp({ container, config });
    activity = await buildClientActivity(container);
    send = jest.fn(async () => ({ accepted: true, simulated: true }));
    container.journeyController.notificationHub.send = send;
  });

  it('GET /config.json returns the activity definition with URLs from PUBLIC_BASE_URL', async () => {
    const res = await request(app).get('/config.json');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.configurationArguments.save.url).toBe('http://localhost:3000/journey/save');
    expect(res.body.type).toBe('REST');
  });

  it('GET / serves the Custom Activity UI', async () => {
    const res = await request(app).get('/');

    expect(res.status).toBe(200);
    expect(res.text).toContain('Notification Hub Custom Activity');
  });

  it('GET /health and GET /ready return 200 in development', async () => {
    expect((await request(app).get('/health')).status).toBe(200);
    const ready = await request(app).get('/ready');
    expect(ready.status).toBe(200);
    expect(ready.body.checks.templateCatalog).toBe(true);
  });

  it('save returns 200 for a valid configuration', async () => {
    const res = await request(app).post('/journey/save').send(activity);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });

  it('validate returns 200 for a valid configuration', async () => {
    expect((await request(app).post('/journey/validate').send(activity)).status).toBe(200);
  });

  it('validate returns 400 with structured errors when a required mapping is missing', async () => {
    const broken = JSON.parse(JSON.stringify(activity));
    const state = editorState.read(broken);
    delete state.mappings['addresses.phone'];
    const withoutPhone = editorState.write(broken, state);

    const res = await request(app).post('/journey/validate').send(withoutPhone);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'REQUIRED_MAPPING_MISSING' })]));
  });

  it('validate returns 400 when no configuration is saved', async () => {
    const res = await request(app).post('/journey/validate').send({ arguments: { execute: {} } });

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].code).toBe('CONFIGURATION_MISSING');
  });

  it('publish returns 200 for a configured, valid activity', async () => {
    const res = await request(app).post('/journey/publish').send(activity);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('published');
  });

  it('publish returns 400 when the activity is not marked configured', async () => {
    const notConfigured = await buildClientActivity(container, { isConfigured: false });

    const res = await request(app).post('/journey/publish').send(notConfigured);

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'NOT_CONFIGURED' })]));
  });

  it('stop returns 200 even when there is no runtime state', async () => {
    const res = await request(app).post('/journey/stop').send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, status: 'stopped' });
  });

  it('execute returns 200 and sends a flat-argument-derived payload to Notification Hub', async () => {
    const res = await request(app).post('/journey/execute').send({
      inArguments: activity.arguments.execute.inArguments,
      definitionInstanceId: 'instance-1',
      activityId: 'activity-1',
      contactKey: 'contact-1',
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, status: 'accepted' });
    const payload = send.mock.calls.at(-1)[0];
    expect(payload.templateKey).toBe(TEMPLATE_KEY);
    expect(payload.recipients[0].addresses).toEqual([{ type: 'phone', value: '{{Event.ORDER_ENTRY_EVENT."MobilePhone"}}' }]);
    expect(payload.recipients[0].params.shopName).toBe('Long Chau Pharmacy');
    expect(payload.idempotencyKey).toMatch(/^[a-f0-9]{64}$/);
  });

  it('execute returns 400 for an unknown template', async () => {
    const bad = activity.arguments.execute.inArguments.map((entry) =>
      'templateKey' in entry ? { templateKey: 'missing.template' } : entry
    );

    const res = await request(app).post('/journey/execute').send({ inArguments: bad });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('TEMPLATE_NOT_FOUND');
  });

  it('no valid lifecycle call returns 404 or 501', async () => {
    const calls = [
      request(app).post('/journey/save').send(activity),
      request(app).post('/journey/validate').send(activity),
      request(app).post('/journey/publish').send(activity),
      request(app).post('/journey/stop').send({}),
      request(app).post('/journey/execute').send({ inArguments: activity.arguments.execute.inArguments }),
    ];
    for (const res of await Promise.all(calls)) {
      expect([404, 501]).not.toContain(res.status);
    }
  });
});

describe('production mode: JWT and HTTPS enforcement', () => {
  const prodConfig = () =>
    loadConfig({
      NODE_ENV: 'production',
      PUBLIC_BASE_URL: 'https://activity.example.com',
      SFMC_REQUIRE_JWT: 'true',
      SFMC_JWT_SECRET: 'p'.repeat(40),
      NOTIFICATION_HUB_MODE: 'http',
      NOTIFICATION_HUB_BASE_URL: 'https://nh.example.com',
      NOTIFICATION_HUB_API_KEY: 'nh-key',
      NOTIFICATION_HUB_SEND_PATH: '/send',
    });

  it('rejects lifecycle calls without a token with 401', async () => {
    const config = prodConfig();
    const container = await createContainer({ config, fetchImpl: jest.fn() });
    const app = createApp({ container, config });

    const res = await request(app).post('/journey/save').send({});

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTHENTICATION_FAILED');
  });

  it('rejects a token signed with the wrong secret with 401', async () => {
    const config = prodConfig();
    const container = await createContainer({ config, fetchImpl: jest.fn() });
    const app = createApp({ container, config });

    const res = await request(app).post('/journey/stop').send({ jwt: signJwt({ x: 1 }, 'z'.repeat(40)) });

    expect(res.status).toBe(401);
  });

  it('accepts a correctly signed token and forwards execute to Notification Hub over HTTP', async () => {
    const config = prodConfig();
    const fetchImpl = jest.fn(async () => ({ ok: true, status: 200 }));
    const container = await createContainer({ config, fetchImpl });
    const app = createApp({ container, config });
    const activity = await buildClientActivity(container);

    const claims = { activity, inArguments: activity.arguments.execute.inArguments, contactKey: 'c', activityId: 'a', definitionInstanceId: 'd' };
    const res = await request(app).post('/journey/execute').send({ jwt: signJwt(claims, 'p'.repeat(40)) });

    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://nh.example.com/send');
    expect(init.headers.authorization).toBe('Bearer nh-key');
  });

  it('production /ready reports healthy when configuration is complete', async () => {
    const config = prodConfig();
    const container = await createContainer({ config, fetchImpl: jest.fn() });
    const app = createApp({ container, config });

    const res = await request(app).get('/ready');

    expect(res.status).toBe(200);
    expect(res.body.checks).toEqual({
      templateCatalog: true,
      publicBaseUrl: true,
      jwtConfigured: true,
      notificationHubConfigured: true,
    });
  });
});
