// Composition root. The only place where concrete implementations are wired together.

import { loadConfig } from './config.js';
import { TemplateRepository } from './repositories/templateRepository.js';
import { TemplateService } from './services/templateService.js';
import { createNotificationHubAdapter } from './services/notification-hub-adapter.js';
import { TemplateController } from './controllers/templateController.js';
import { JourneyController } from './controllers/journey.controller.js';

export const DEFAULT_TEMPLATES_DATA_PATH = new URL('./data/templates.json', import.meta.url);

/**
 * Builds the dependency graph. Async because the template catalog is loaded and
 * validated here; invalid data throws and stops startup.
 *
 * @param {object} [options]
 * @param {object} [options.config] - validated configuration (defaults to a development configuration)
 * @param {string|URL} [options.templatesDataPath]
 * @param {typeof fetch} [options.fetchImpl] - injectable for tests
 * @returns {Promise<object>}
 */
export async function createContainer({
  config = loadConfig({ NODE_ENV: 'test' }),
  templatesDataPath = DEFAULT_TEMPLATES_DATA_PATH,
  fetchImpl,
} = {}) {
  const templateRepository = new TemplateRepository({ dataPath: templatesDataPath });
  await templateRepository.load();

  const templateService = new TemplateService({ templateRepository });
  const notificationHub = createNotificationHubAdapter({ ...config.notificationHub, fetchImpl });

  return {
    config,
    templateRepository,
    templateService,
    notificationHub,
    templateController: new TemplateController({ templateService }),
    journeyController: new JourneyController({ templateService, notificationHub }),
  };
}
