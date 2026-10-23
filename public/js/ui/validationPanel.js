/*
 * Validation status panel. Renders the result of validateMappings().
 *
 * Sections:
 *   - green banner when valid
 *   - "Missing mapping" (red): required or routing targets without a mapping
 *   - "Saved field no longer exists" (red): stale field mappings
 *   - "Needs attention" (red): other blocking errors
 *   - "Review" (amber): warnings that do not block save
 */

import { getMissingErrors, getStaleErrors, MISSING_CODES, STALE_CODES } from '../domain/mappingValidator.js';

export class ValidationPanel {
  #container;

  /** @param {{ container: HTMLElement }} options */
  constructor({ container }) {
    this.#container = container;
  }

  /** @param {string} message */
  showPlaceholder(message) {
    const text = document.createElement('p');
    text.className = 'placeholder placeholder--compact';
    text.textContent = message;
    this.#container.replaceChildren(text);
  }

  /**
   * @param {{ valid: boolean, errors: Array<object>, warnings?: Array<object> }} result
   */
  render(result) {
    const warnings = result.warnings ?? [];
    const banner = document.createElement('div');

    if (result.valid) {
      banner.className = 'validation validation--valid';
      banner.append(icon('\u2705'), text('Mapping valid'));
    } else {
      banner.className = 'validation validation--invalid';
      appendSection(banner, getMissingErrors(result), {
        heading: 'Missing mapping:',
        icon: '\u274C',
        listClass: 'validation__list',
        describe: (item) => item.name ?? item.targetKey,
      });
      appendSection(banner, getStaleErrors(result), {
        heading: 'Saved field no longer exists in the Journey entry schema:',
        icon: '\u274C',
        listClass: 'validation__list',
        describe: (item) => `${item.name ?? item.targetKey}`,
      });
      const others = result.errors.filter((item) => !MISSING_CODES.has(item.code) && !STALE_CODES.has(item.code));
      appendSection(banner, others, {
        heading: 'Needs attention:',
        icon: '\u26A0\uFE0F',
        listClass: 'validation__list validation__list--warning',
        describe: (item) => (item.targetKey ? `${item.targetKey}: ${item.message}` : item.message),
      });
    }

    appendSection(banner, warnings, {
      heading: 'Review (does not block save):',
      icon: '\u26A0\uFE0F',
      listClass: 'validation__list validation__list--warning',
      describe: (item) => (item.targetKey ? `${item.targetKey}: ${item.message}` : item.message),
    });

    this.#container.replaceChildren(banner);
  }
}

function appendSection(banner, items, { heading, icon: symbol, listClass, describe }) {
  if (items.length === 0) return;

  const title = document.createElement('p');
  title.className = 'validation__heading';
  if (listClass.includes('--warning')) {
    title.classList.add('validation__heading--warning');
  }
  title.append(icon(symbol), text(heading));

  const list = document.createElement('ul');
  list.className = listClass;
  for (const item of items) {
    const li = document.createElement('li');
    li.textContent = describe(item);
    list.append(li);
  }
  banner.append(title, list);
}

function icon(symbol) {
  const span = document.createElement('span');
  span.setAttribute('aria-hidden', 'true');
  span.textContent = `${symbol} `;
  return span;
}

function text(value) {
  return document.createTextNode(value);
}
