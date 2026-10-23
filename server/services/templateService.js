import { toChannelCode } from '../models/templateModel.js';

// Template catalog use cases. No Express types here.

export class TemplateService {
  /**
   * @param {object} deps
   * @param {import('../repositories/templateRepository.js').TemplateRepository} deps.templateRepository
   */
  constructor({ templateRepository }) {
    this.templateRepository = templateRepository;
  }

  /**
   * Returns templates, optionally filtered by channel.
   *
   * @param {object} [options]
   * @param {string} [options.channel] - display name or code (for example "Zalo" or "ZALO")
   * @returns {Promise<Array<Readonly<object>>>}
   * @throws {Error} with status 400 when the channel is not supported
   */
  async getTemplates({ channel } = {}) {
    const templates = await this.templateRepository.getAll();
    if (channel === undefined || channel === null || channel === '') {
      return templates;
    }

    const code = toChannelCode(channel);
    if (code === null) {
      const error = new Error(`Unsupported channel: ${channel}`);
      error.status = 400;
      throw error;
    }
    return templates.filter((template) => template.channel === code);
  }
}
