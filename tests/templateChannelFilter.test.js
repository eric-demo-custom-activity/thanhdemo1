import { describe, it, expect } from '@jest/globals';

import { TemplateRepository } from '../server/repositories/templateRepository.js';
import { TemplateService } from '../server/services/templateService.js';

const service = () =>
  new TemplateService({
    templateRepository: new TemplateRepository({
      dataPath: new URL('../server/data/templates.json', import.meta.url),
    }),
  });

describe('template channel filter (server)', () => {
  it('returns every template when no channel is given', async () => {
    const all = await service().getTemplates({});

    expect(all).toHaveLength(8);
    expect(new Set(all.map((t) => t.channel))).toEqual(new Set(['SMS', 'CHATAPP', 'ZALO', 'BRC_ZALO']));
  });

  it('filters by display name and by code', async () => {
    const byName = await service().getTemplates({ channel: 'Zalo' });
    const byCode = await service().getTemplates({ channel: 'ZALO' });

    expect(byName.map((t) => t.templateKey)).toEqual(['fptlc.order-confirm.zns.6a12eabf', 'vac.appointment.zns']);
    expect(byCode).toEqual(byName);
  });

  it('returns the BRC Zalo templates for "BRC Zalo"', async () => {
    const brc = await service().getTemplates({ channel: 'BRC Zalo' });

    expect(brc.map((t) => t.templateKey)).toEqual(['brc.account.created.zalo', 'brc.account.warning.zalo']);
  });

  it('rejects an unsupported channel with status 400', async () => {
    await expect(service().getTemplates({ channel: 'email' })).rejects.toMatchObject({ status: 400 });
  });
});
