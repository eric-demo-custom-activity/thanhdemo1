/*
 * Template metadata panel.
 *
 * Renders the identifying fields of one template. Every value comes from the
 * template object passed in; nothing is hardcoded.
 */

import { channelLabel } from '../domain/channels.js';

const FIELDS = Object.freeze([
  { label: 'Display Name', read: (template) => template.displayName, modifier: '' },
  { label: 'Template Key', read: (template) => template.templateKey, modifier: 'mono' },
  { label: 'Channel', read: (template) => channelLabel(template.channel), modifier: 'channel' },
  { label: 'Version', read: (template) => String(template.version ?? 1), modifier: '' },
]);

export class TemplateDetails {
  #container;

  /** @param {{ container: HTMLElement }} options */
  constructor({ container }) {
    this.#container = container;
  }

  /** @param {object|null} template */
  render(template) {
    if (!template) {
      this.showPlaceholder('Select a template to see its details.');
      return;
    }

    const list = document.createElement('dl');
    list.className = 'details-list';

    for (const field of FIELDS) {
      const item = document.createElement('div');
      item.className = 'details-list__item';

      const term = document.createElement('dt');
      term.className = 'details-list__term';
      term.textContent = field.label;

      const value = document.createElement('dd');
      value.className = ['details-list__value', field.modifier && `details-list__value--${field.modifier}`]
        .filter(Boolean)
        .join(' ');
      value.textContent = field.read(template);

      item.append(term, value);
      list.append(item);
    }

    this.#container.replaceChildren(list);
  }

  /** @param {string} message */
  showPlaceholder(message) {
    const text = document.createElement('p');
    text.className = 'placeholder';
    text.textContent = message;
    this.#container.replaceChildren(text);
  }
}
