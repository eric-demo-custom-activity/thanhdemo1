/*
 * Current mapping summary (debugging and preparation for the Save step).
 * Lists only configured targets, in template order.
 */

import { listMappingTargets, MAPPING_MODES } from '../domain/mappingTargets.js';

export class MappingSummary {
  #container;

  /** @param {{ container: HTMLElement }} options */
  constructor({ container }) {
    this.#container = container;
  }

  /**
   * @param {{ template: object|null, mappings: Record<string, { mode: string, value: string }> }} options
   */
  render({ template, mappings }) {
    if (!template) {
      this.#placeholder('Select a template to see its mapping.');
      return;
    }

    const targets = listMappingTargets(template);
    const configured = targets.filter((target) => mappings[target.key]);

    if (configured.length === 0) {
      this.#placeholder('No mappings configured yet.');
      return;
    }

    const list = document.createElement('ul');
    list.className = 'summary-list';
    list.setAttribute('aria-label', 'Configured mappings');

    for (const target of configured) {
      list.append(this.#item(target.key, mappings[target.key]));
    }

    const footer = document.createElement('p');
    footer.className = 'summary-count';
    footer.textContent = `${configured.length} of ${targets.length} targets configured`;

    this.#container.replaceChildren(list, footer);
  }

  #item(targetKey, mapping) {
    const item = document.createElement('li');
    item.className = 'summary-list__item';

    const key = document.createElement('code');
    key.className = 'summary-list__key';
    key.textContent = targetKey;

    const arrow = document.createElement('span');
    arrow.className = 'summary-list__arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '\u2192';

    const value = document.createElement('span');
    value.className = 'summary-list__value';
    if (mapping.mode === MAPPING_MODES.STATIC) {
      value.textContent = `"${mapping.value}"`;
      value.append(this.#tag('static'));
    } else {
      value.textContent = mapping.value || '(no field selected)';
      value.append(this.#tag('field'));
    }

    item.append(key, arrow, value);
    return item;
  }

  #tag(text) {
    const tag = document.createElement('span');
    tag.className = 'summary-list__mode';
    tag.textContent = text;
    return tag;
  }

  #placeholder(message) {
    const text = document.createElement('p');
    text.className = 'placeholder placeholder--compact';
    text.textContent = message;
    this.#container.replaceChildren(text);
  }
}
