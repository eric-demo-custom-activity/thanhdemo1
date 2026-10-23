import { describe, it, expect, jest } from '@jest/globals';

import { TemplateService } from '../server/services/templateService.js';
import { TemplateRepository } from '../server/repositories/templateRepository.js';

describe('TemplateService', () => {
  it('returns templates from the repository', async () => {
    const fakeTemplates = [{ templateKey: 'a', displayName: 'A', channel: 'sms' }];
    const templateRepository = { getAll: jest.fn(async () => fakeTemplates) };
    const service = new TemplateService({ templateRepository });

    const result = await service.getTemplates();

    expect(result).toBe(fakeTemplates);
    expect(templateRepository.getAll).toHaveBeenCalledTimes(1);
  });

  it('returns the real catalog through the real repository', async () => {
    const templateRepository = new TemplateRepository({
      dataPath: new URL('../server/data/templates.json', import.meta.url),
    });
    const service = new TemplateService({ templateRepository });

    const result = await service.getTemplates();

    expect(result.length).toBeGreaterThanOrEqual(4);
    expect(result[0]).toHaveProperty('templateKey');
  });

  it('propagates repository errors', async () => {
    const templateRepository = { getAll: jest.fn(async () => { throw new Error('boom'); }) };
    const service = new TemplateService({ templateRepository });

    await expect(service.getTemplates()).rejects.toThrow('boom');
  });
});
