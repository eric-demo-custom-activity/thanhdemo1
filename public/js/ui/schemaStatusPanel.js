/*
 * Schema status panel.
 *
 * Shows the state of the Journey entry-schema discovery:
 *   loading      "Discovering Journey entry fields..."
 *   ready        "Entry data available", event definition key, field count
 *   empty        no fields found; static values remain available
 *   unavailable  schema not provided; static values remain available; Retry
 *   error        the schema could not be read; Retry
 *
 * Stale mappings are summarized here as well. The raw Journey Builder payload is
 * never displayed.
 */

import { SCHEMA_STATUS } from '../state/activityState.js';

export class SchemaStatusPanel {
  #container;
  #onRetry;

  /**
   * @param {object} options
   * @param {HTMLElement} options.container
   * @param {() => void} options.onRetry
   */
  constructor({ container, onRetry }) {
    this.#container = container;
    this.#onRetry = onRetry;
  }

  /**
   * @param {object} view
   * @param {string} view.status - one of SCHEMA_STATUS
   * @param {string|null} view.eventDefinitionKey
   * @param {number} view.fieldCount
   * @param {number} view.warningCount
   * @param {{ code: string, message: string }|null} view.error
   * @param {number} view.staleCount
   * @param {boolean} view.standalone
   */
  render(view) {
    const wrap = document.createElement('div');
    wrap.className = `schema-status schema-status--${view.status}`;
    wrap.dataset.status = view.status;

    if (view.standalone) {
      wrap.append(textElement('p', 'schema-status__badge', 'Standalone Development Mode'));
    }

    const content = contentFor(view);
    wrap.append(textElement('p', 'schema-status__title', content.title));
    if (content.detail) {
      wrap.append(textElement('p', 'schema-status__detail', content.detail));
    }

    if (view.status === SCHEMA_STATUS.READY) {
      wrap.append(this.#facts(view));
    }

    if (view.staleCount > 0) {
      wrap.append(
        textElement(
          'p',
          'schema-status__stale',
          `${view.staleCount} saved ${view.staleCount === 1 ? 'mapping references' : 'mappings reference'} fields that no longer exist.`
        )
      );
    }

    if (view.status === SCHEMA_STATUS.UNAVAILABLE || view.status === SCHEMA_STATUS.ERROR || view.status === SCHEMA_STATUS.EMPTY) {
      const retry = textElement('button', 'button button--secondary', 'Retry');
      retry.type = 'button';
      retry.addEventListener('click', () => this.#onRetry());
      wrap.append(retry);
    }

    this.#container.replaceChildren(wrap);
  }

  #facts(view) {
    const list = document.createElement('dl');
    list.className = 'schema-status__facts';
    list.append(
      factItem('Event Definition', view.eventDefinitionKey ?? 'not available'),
      factItem('Fields discovered', String(view.fieldCount))
    );
    if (view.warningCount > 0) {
      list.append(factItem('Fields needing review', String(view.warningCount)));
    }
    return list;
  }
}

function contentFor(view) {
  switch (view.status) {
    case SCHEMA_STATUS.LOADING:
      return { title: 'Discovering Journey entry fields...' };
    case SCHEMA_STATUS.READY:
      return { title: 'Entry data available' };
    case SCHEMA_STATUS.EMPTY:
      return {
        title: 'No fields were found in the Journey entry schema.',
        detail: 'Field mappings cannot be configured. Static values are still available.',
      };
    case SCHEMA_STATUS.UNAVAILABLE:
      return {
        title: 'Entry schema is unavailable.',
        detail: `Field mappings cannot be configured. Static values are still available. ${view.error?.message ?? ''}`.trim(),
      };
    case SCHEMA_STATUS.ERROR:
      return {
        title: 'Unable to read the Journey entry schema.',
        detail: view.error?.message ?? null,
      };
    default:
      return { title: 'Entry schema has not been requested yet.' };
  }
}

function factItem(term, value) {
  const item = document.createElement('div');
  item.className = 'schema-status__fact';
  const dt = textElement('dt', 'schema-status__term', term);
  const dd = textElement('dd', 'schema-status__value', value);
  item.append(dt, dd);
  return item;
}

function textElement(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}
