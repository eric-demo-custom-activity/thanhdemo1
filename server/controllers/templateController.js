import { logger } from '../logger.js';

/**
 * HTTP adapter for the template catalog.
 * Handles query parsing, status codes, response shape and error mapping only.
 */
export class TemplateController {
  /**
   * @param {object} deps
   * @param {import('../services/templateService.js').TemplateService} deps.templateService
   */
  constructor({ templateService }) {
    this.templateService = templateService;
  }

  /**
   * GET /api/templates[?channel=<name>]
   * Responds 200 with { items: [...] }, 400 for an unsupported channel, or 500.
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  getTemplates = async (req, res) => {
    const channel = req.query?.channel;
    logger.info(`API request received: GET /api/templates${channel ? `?channel=${channel}` : ''}`);

    try {
      const items = await this.templateService.getTemplates({ channel });
      return res.status(200).json({ items });
    } catch (error) {
      if (error.status === 400) {
        return res.status(400).json({ message: error.message });
      }
      logger.error('Failed to load templates', error);
      return res.status(500).json({ message: 'Unable to load templates' });
    }
  };
}
