import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { TemplateRepository } from '../server/repositories/templateRepository.js';
import { TemplateValidationError } from '../server/models/templateModel.js';

const validTemplate = {
  templateKey: 'test.sms.00000001',
  displayName: 'Test SMS',
  channel: 'sms',
  version: 1,
  addresses: [{ name: 'phone', required: true, type: 'phone' }],
  recipientFields: [{ name: 'customerId', required: true, type: 'string' }],
  params: [{ name: 'shopName', required: true, type: 'string' }],
};

describe('TemplateRepository', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'template-repo-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  const writeData = async (content) => {
    const file = path.join(tmpDir, 'templates.json');
    await writeFile(file, content, 'utf8');
    return file;
  };

  it('returns template models from the real templates.json', async () => {
    const repo = new TemplateRepository({
      dataPath: new URL('../server/data/templates.json', import.meta.url),
    });

    const templates = await repo.getAll();

    expect(templates.length).toBeGreaterThanOrEqual(4);
    const channels = templates.map((t) => t.channel);
    expect(channels).toEqual(expect.arrayContaining(['SMS', 'CHATAPP', 'ZALO', 'BRC_ZALO']));
    expect(Object.isFrozen(templates[0])).toBe(true);
  });

  it('returns an empty array when items is empty', async () => {
    const file = await writeData('{"items": []}');
    const repo = new TemplateRepository({ dataPath: file });

    await expect(repo.getAll()).resolves.toEqual([]);
  });

  it('throws a clear error for a zero-byte data file', async () => {
    const file = await writeData('');
    const repo = new TemplateRepository({ dataPath: file });

    await expect(repo.load()).rejects.toThrow(/empty/);
  });

  it('throws for invalid JSON', async () => {
    const file = await writeData('{"items": [');
    const repo = new TemplateRepository({ dataPath: file });

    await expect(repo.load()).rejects.toBeInstanceOf(TemplateValidationError);
  });

  it('throws when the top-level items array is missing', async () => {
    const file = await writeData('{"templates": []}');
    const repo = new TemplateRepository({ dataPath: file });

    await expect(repo.load()).rejects.toThrow(/"items" array/);
  });

  it('throws with the list of problems for invalid template entries', async () => {
    const broken = { ...validTemplate, templateKey: '', channel: 'fax' };
    const file = await writeData(JSON.stringify({ items: [broken] }));
    const repo = new TemplateRepository({ dataPath: file });

    const error = await repo.load().catch((e) => e);

    expect(error).toBeInstanceOf(TemplateValidationError);
    expect(error.problems.join(' ')).toMatch(/templateKey is required/);
    expect(error.problems.join(' ')).toMatch(/channel must be one of/);
  });

  it('throws on duplicate templateKey values', async () => {
    const file = await writeData(JSON.stringify({ items: [validTemplate, validTemplate] }));
    const repo = new TemplateRepository({ dataPath: file });

    const error = await repo.load().catch((e) => e);

    expect(error.problems.join(' ')).toMatch(/duplicate templateKey/);
  });
});
