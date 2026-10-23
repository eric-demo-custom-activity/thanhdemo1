/*
 * Mapping row (one template target).
 *
 * Shows the target name, Required/Optional badge, a status pill, a source
 * selector (Journey entry field | Static value) and the matching control.
 * Field options come from the normalized field catalog only. Reports changes
 * upward; never reads or writes application state itself.
 *
 * Stale mapping: a saved field that is absent from the current catalog keeps
 * its previous name in the UI, the select is reset to "no field", and a
 * replacement must be chosen. Clearing the row removes the mapping.
 */

import { MAPPING_MODES } from '../domain/mappingTargets.js';

export const ROW_STATUS = Object.freeze({
  MAPPED: 'mapped',
  INCOMPLETE: 'incomplete',
  MISSING: 'missing',
  OPTIONAL: 'optional',
});

let rowSequence = 0;

const STATUS_LABEL = Object.freeze({
  [ROW_STATUS.MAPPED]: 'Mapped',
  [ROW_STATUS.INCOMPLETE]: 'Incomplete',
  [ROW_STATUS.MISSING]: 'Missing',
  [ROW_STATUS.OPTIONAL]: '',
});

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** "Mobile Phone — MobilePhone — Phone" */
export function describeFieldOption(field) {
  return `${field.label} \u2014 ${field.name} \u2014 ${field.dataType}`;
}

export class MappingRow {
  #target;
  #onChange;
  #id;
  #element;
  #statusPill;
  #modeInputs = new Map();
  #fieldRadio;
  #fieldHint;
  #fieldWrap;
  #fieldSearch;
  #fieldSelect;
  #fields = [];
  #filter = '';
  #staleBlock;
  #staleValue;
  #clearButton;
  #staticWrap;
  #staticInput;
  #errorText;
  #warningText;

  /**
   * @param {object} options
   * @param {{ key: string, name: string, required: boolean, type: string|null, isRouting: boolean }} options.target
   * @param {(targetKey: string, mapping: { mode: string, value: string }|null) => void} options.onChange
   */
  constructor({ target, onChange }) {
    this.#target = target;
    this.#onChange = onChange;
    this.#id = `mapping-row-${++rowSequence}`;
    this.#element = this.#build();
    this.setStatus(ROW_STATUS.MISSING);
  }

  get element() {
    return this.#element;
  }

  get targetKey() {
    return this.#target.key;
  }

  /**
   * Replaces the field options. The current selection is kept when it still exists.
   * @param {ReadonlyArray<{ id: string, name: string, label: string, dataType: string }>} fields
   */
  setFieldOptions(fields) {
    this.#fields = fields;
    this.#rebuildOptions();
  }

  /**
   * Syncs the controls with the mapping from state. Only assigns values that
   * differ, so a focused text input is not overwritten while the user types.
   *
   * @param {{ mode: string, value: string }|null} mapping
   * @param {{ fieldsEnabled: boolean, stale: boolean }} context
   */
  update(mapping, { fieldsEnabled, stale }) {
    const mode = mapping?.mode ?? null;

    for (const [value, input] of this.#modeInputs) {
      input.checked = value === mode;
    }
    this.#fieldRadio.disabled = !fieldsEnabled;
    this.#fieldHint.hidden = fieldsEnabled;
    this.#clearButton.hidden = mapping === null;

    this.#fieldWrap.hidden = mode !== MAPPING_MODES.FIELD;
    this.#staticWrap.hidden = mode !== MAPPING_MODES.STATIC;

    if (mode === MAPPING_MODES.FIELD) {
      const showStale = stale && mapping.value !== '';
      this.#staleBlock.hidden = !showStale;
      this.#staleValue.textContent = showStale ? mapping.value : '';

      const expected = showStale ? '' : mapping.value;
      if (this.#fieldSelect.value !== expected) {
        this.#fieldSelect.value = expected;
      }
      this.#fieldSearch.disabled = !fieldsEnabled;
      this.#fieldSelect.disabled = !fieldsEnabled;
    } else {
      this.#staleBlock.hidden = true;
    }

    if (mode === MAPPING_MODES.STATIC && this.#staticInput.value !== mapping.value) {
      this.#staticInput.value = mapping.value;
    }
  }

  /** @param {'mapped'|'incomplete'|'missing'|'optional'} status */
  setStatus(status) {
    this.#statusPill.className = `status-pill status-pill--${status}`;
    this.#statusPill.textContent = STATUS_LABEL[status];
    this.#statusPill.hidden = status === ROW_STATUS.OPTIONAL;
    this.#element.dataset.status = status;
  }

  /** @param {string|null} message */
  setError(message) {
    this.#errorText.textContent = message ?? '';
    this.#errorText.hidden = !message;
    const invalid = message ? 'true' : 'false';
    this.#fieldSelect.setAttribute('aria-invalid', invalid);
    this.#staticInput.setAttribute('aria-invalid', invalid);
  }

  /** @param {string|null} message */
  setWarning(message) {
    this.#warningText.textContent = message ?? '';
    this.#warningText.hidden = !message;
  }

  #build() {
    const { key, name, required, type } = this.#target;
    const row = element('li', 'mapping-row');
    row.dataset.targetKey = key;

    // Header: name, required badge, type, status
    const header = element('div', 'mapping-row__header');
    const label = element('span', 'mapping-row__name', name);
    const requiredBadge = element(
      'span',
      `badge ${required ? 'badge--required' : 'badge--optional'}`,
      required ? 'Required' : 'Optional'
    );
    header.append(label, requiredBadge);
    if (type) {
      header.append(element('span', 'mapping-row__type', type));
    }
    this.#statusPill = element('span', 'status-pill');
    header.append(this.#statusPill);

    this.#clearButton = element('button', 'button button--text', 'Clear mapping');
    this.#clearButton.type = 'button';
    this.#clearButton.hidden = true;
    this.#clearButton.addEventListener('click', () => this.#onChange(key, null));
    header.append(this.#clearButton);
    row.append(header);

    // Source selector
    const fieldset = element('fieldset', 'mode-group');
    fieldset.append(element('legend', 'mode-group__legend', 'Source'));
    fieldset.append(
      this.#modeOption(MAPPING_MODES.FIELD, 'Journey entry field'),
      this.#modeOption(MAPPING_MODES.STATIC, 'Static value')
    );
    row.append(fieldset);

    this.#fieldHint = element('p', 'mapping-row__hint', 'Field mappings need the Journey entry schema. Static values are still available.');
    row.append(this.#fieldHint);

    // Field search + dropdown + stale notice + clear
    this.#fieldWrap = element('div', 'mapping-row__control');
    this.#fieldWrap.hidden = true;

    const searchLabel = element('label', 'mapping-row__control-label', 'Search fields');
    this.#fieldSearch = element('input', 'field__control');
    this.#fieldSearch.type = 'search';
    this.#fieldSearch.id = `${this.#id}-search`;
    this.#fieldSearch.placeholder = 'Filter by label or name';
    this.#fieldSearch.autocomplete = 'off';
    this.#fieldSearch.setAttribute('aria-label', `Search Journey entry fields for ${name}`);
    searchLabel.htmlFor = this.#fieldSearch.id;
    this.#fieldSearch.addEventListener('input', () => {
      this.#filter = this.#fieldSearch.value.trim().toLowerCase();
      this.#rebuildOptions();
    });

    const fieldLabel = element('label', 'mapping-row__control-label', 'Field');
    this.#fieldSelect = element('select', 'field__control');
    this.#fieldSelect.id = `${this.#id}-field`;
    fieldLabel.htmlFor = this.#fieldSelect.id;
    this.#fieldSelect.addEventListener('change', () => {
      this.#onChange(key, { mode: MAPPING_MODES.FIELD, value: this.#fieldSelect.value });
    });

    this.#staleBlock = element('div', 'mapping-row__stale');
    this.#staleBlock.hidden = true;
    this.#staleBlock.setAttribute('role', 'alert');
    this.#staleValue = element('span', 'mapping-row__stale-value');
    const staleText = element('p', 'mapping-row__stale-text');
    staleText.append(
      document.createTextNode('Previously mapped field: '),
      this.#staleValue,
      document.createElement('br'),
      document.createTextNode('Status: field no longer exists in the Journey entry schema.')
    );
    const chooseButton = element('button', 'button button--secondary button--small', 'Choose replacement field');
    chooseButton.type = 'button';
    chooseButton.addEventListener('click', () => this.#fieldSelect.focus());
    this.#staleBlock.append(staleText, chooseButton);

    this.#fieldWrap.append(searchLabel, this.#fieldSearch, fieldLabel, this.#fieldSelect, this.#staleBlock);
    row.append(this.#fieldWrap);

    // Static value textbox
    this.#staticWrap = element('div', 'mapping-row__control');
    this.#staticWrap.hidden = true;
    const staticLabel = element('label', 'mapping-row__control-label', 'Value');
    this.#staticInput = element('input', 'field__control');
    this.#staticInput.type = 'text';
    this.#staticInput.id = `${this.#id}-static`;
    this.#staticInput.placeholder = 'Enter a fixed value';
    this.#staticInput.autocomplete = 'off';
    staticLabel.htmlFor = this.#staticInput.id;
    this.#staticInput.addEventListener('input', () => {
      this.#onChange(key, { mode: MAPPING_MODES.STATIC, value: this.#staticInput.value });
    });
    this.#staticWrap.append(staticLabel, this.#staticInput);
    row.append(this.#staticWrap);

    this.#errorText = element('p', 'mapping-row__error');
    this.#errorText.hidden = true;
    this.#errorText.id = `${this.#id}-error`;
    row.append(this.#errorText);

    this.#warningText = element('p', 'mapping-row__warning');
    this.#warningText.hidden = true;
    row.append(this.#warningText);

    this.#element = row;
    return row;
  }

  #modeOption(mode, text) {
    const label = element('label', 'mode-option');
    const input = element('input');
    input.type = 'radio';
    input.name = `${this.#id}-mode`;
    input.value = mode;
    input.addEventListener('change', () => {
      if (input.checked) {
        // Switching source clears the previous value on purpose.
        this.#onChange(this.#target.key, { mode, value: '' });
      }
    });
    if (mode === MAPPING_MODES.FIELD) {
      this.#fieldRadio = input;
    }
    this.#modeInputs.set(mode, input);
    label.append(input, element('span', null, text));
    return label;
  }

  /** Rebuilds the select options, applying the search filter and keeping the current selection. */
  #rebuildOptions() {
    const selected = this.#fieldSelect.value;
    const placeholder = element('option', null, 'Select an entry field');
    placeholder.value = '';

    const visible = this.#fields.filter((field) => {
      if (field.id === selected) return true;
      if (this.#filter === '') return true;
      return (
        field.label.toLowerCase().includes(this.#filter) || field.name.toLowerCase().includes(this.#filter)
      );
    });

    const options = visible.map((field) => {
      const option = element('option', null, describeFieldOption(field));
      option.value = field.id;
      return option;
    });

    this.#fieldSelect.replaceChildren(placeholder, ...options);
    this.#fieldSelect.value = visible.some((field) => field.id === selected) ? selected : '';
  }
}
