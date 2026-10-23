/*
 * Mapping section: one card-body with a group per template target kind
 * (Addresses, Recipient Fields, Template Parameters).
 *
 * Rows are rebuilt only when the template changes. Catalog and mapping updates
 * are applied in place, so typing in a textbox keeps focus.
 */

import { listMappingTargets, TARGET_GROUPS } from '../domain/mappingTargets.js';
import { MappingRow, ROW_STATUS } from './mappingRow.js';

export class MappingSection {
  #container;
  #onChange;
  /** @type {Map<string, { row: MappingRow, target: object }>} */
  #rows = new Map();
  #fieldsRef = null;

  /**
   * @param {object} options
   * @param {HTMLElement} options.container
   * @param {(targetKey: string, mapping: object|null) => void} options.onChange
   */
  constructor({ container, onChange }) {
    this.#container = container;
    this.#onChange = onChange;
  }

  /**
   * Rebuilds all rows for the template. Call update() afterwards.
   *
   * @param {{ template: object|null }} options
   */
  render({ template }) {
    this.#rows.clear();
    this.#fieldsRef = null;

    if (!template) {
      this.showPlaceholder('Select a template to see its mapping targets.');
      return;
    }

    const targets = listMappingTargets(template);
    const groups = TARGET_GROUPS.map((group) => {
      const groupTargets = targets.filter((target) => target.groupId === group.id);
      return this.#buildGroup(group, groupTargets);
    });

    this.#container.replaceChildren(...groups);
  }

  /**
   * Applies catalog, mappings and per-target messages to the rendered rows.
   *
   * @param {object} options
   * @param {Record<string, { mode: string, value: string }>} options.mappings
   * @param {Record<string, string>} options.errorsByTarget
   * @param {Record<string, string>} options.warningsByTarget
   * @param {Set<string>} options.staleTargets
   * @param {ReadonlyArray<object>} options.fields - normalized catalog fields
   * @param {boolean} options.fieldsEnabled
   */
  update({ mappings, errorsByTarget, warningsByTarget, staleTargets, fields, fieldsEnabled }) {
    if (fields !== this.#fieldsRef) {
      for (const { row } of this.#rows.values()) {
        row.setFieldOptions(fields);
      }
      this.#fieldsRef = fields;
    }

    for (const [key, { row, target }] of this.#rows) {
      const mapping = mappings[key] ?? null;
      const error = errorsByTarget[key] ?? null;
      const stale = staleTargets.has(key);

      row.update(mapping, { fieldsEnabled, stale });
      row.setStatus(statusFor(target, mapping, error, stale));
      row.setError(mapping ? error : null);
      row.setWarning(mapping ? warningsByTarget[key] ?? null : null);
    }
  }

  /** @param {string} message */
  showPlaceholder(message) {
    this.#rows.clear();
    this.#fieldsRef = null;
    const text = document.createElement('p');
    text.className = 'placeholder';
    text.textContent = message;
    this.#container.replaceChildren(text);
  }

  #buildGroup(group, targets) {
    const section = document.createElement('section');
    section.className = 'mapping-group';

    const headingId = `mapping-group-${group.id}`;
    section.setAttribute('aria-labelledby', headingId);

    const heading = document.createElement('h3');
    heading.id = headingId;
    heading.className = 'mapping-group__title';
    heading.textContent = `${group.title} (${targets.length})`;
    section.append(heading);

    if (targets.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'placeholder placeholder--compact';
      empty.textContent = group.emptyText;
      section.append(empty);
      return section;
    }

    const list = document.createElement('ul');
    list.className = 'mapping-list';
    list.setAttribute('aria-labelledby', headingId);

    for (const target of targets) {
      const row = new MappingRow({
        target,
        onChange: (targetKey, mapping) => this.#onChange(targetKey, mapping),
      });
      this.#rows.set(target.key, { row, target });
      list.append(row.element);
    }

    section.append(list);
    return section;
  }
}

/**
 * @returns {'mapped'|'incomplete'|'missing'|'optional'}
 */
function statusFor(target, mapping, error, stale) {
  if (!mapping) {
    return target.required || target.isRouting ? ROW_STATUS.MISSING : ROW_STATUS.OPTIONAL;
  }
  return error || stale ? ROW_STATUS.INCOMPLETE : ROW_STATUS.MAPPED;
}
