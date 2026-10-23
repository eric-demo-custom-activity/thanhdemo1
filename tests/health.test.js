import { describe, it, expect } from '@jest/globals';
import request from 'supertest';

import { createApp } from '../server/app.js';
import { createContainer } from '../server/container.js';
import { loadConfig } from '../server/config.js';

describe('GET /health', () => {
  it('returns 200 with service status', async () => {
    const config = loadConfig({ NODE_ENV: 'development' });
    const app = createApp({ container: await createContainer({ config }), config });

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'salesforce-custom-activity' });
  });

  it('does not expose framework identification headers', async () => {
    const config = loadConfig({ NODE_ENV: 'development' });
    const app = createApp({ container: await createContainer({ config }), config });

    const res = await request(app).get('/health');

    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
