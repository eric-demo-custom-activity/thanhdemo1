import { readFile } from 'node:fs/promises';

import { createTemplateModel, findTemplateProblems, TemplateValidationError } from '../models/templateModel.js';
import { logger } from '../logger.js';

/**
 * Data access for the template catalog.
 *
 * MVP: reads the fake JSON data source (server/data/templates.json).
 * Later: replace the body of load() with a NotificationHubClient call.
 * Callers only depend on getAll(), so nothing above this layer changes.
 *
 * Contains no business logic.
 */
export class TemplateRepository {
  #dataPath;
  #templates = null;

  /**
   * @param {object} options
   * @param {string|URL} options.dataPath - path to the JSON data source
   */
  constructor({ dataPath }) {
    this.#dataPath = dataPath;
  }

  /**
   * Reads, parses and validates the data source. Throws on any problem so the
   * application fails fast at startup instead of serving broken data.
   *
   * @returns {Promise<Array<Readonly<object>>>}
   */
  async load() {
    const raw = await readFile(this.#dataPath, 'utf8');

    if (raw.trim().length === 0) {
      throw new TemplateValidationError(`Template data file is empty: ${this.#dataPath}`);
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new TemplateValidationError(`Template data file is not valid JSON: ${this.#dataPath}`, [error.message]);
    }

    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.items)) {
      throw new TemplateValidationError('Template data file must contain an "items" array', []);
    }

    const problems = [];
    const seenKeys = new Set();

    parsed.items.forEach((item, index) => {
      const itemProblems = findTemplateProblems(item);
      if (itemProblems.length > 0) {
        problems.push(`items[${index}]: ${itemProblems.join('; ')}`);
        return;
      }

      if (seenKeys.has(item.templateKey)) {
        problems.push(`items[${index}]: duplicate templateKey "${item.templateKey}"`);
      }
      seenKeys.add(item.templateKey);
    });

    if (problems.length > 0) {
      throw new TemplateValidationError('Template data is invalid', problems);
    }

    this.#templates = Object.freeze(parsed.items.map(createTemplateModel));
    logger.info(`Template catalog loaded: ${this.#templates.length} template(s) from ${this.#dataPath}`);

    return this.#templates;
  }

  /**
   * Returns all template models. Loads the data source on first use if
   * load() has not been called yet.
   *
   * @returns {Promise<Array<Readonly<object>>>}
   */
  async getAll() {
    if (this.#templates === null) {
      await this.load();
    }
    return this.#templates;
  }
}
