/*
 * Binding expression builder (browser).
 *
 * Turns one mapping into the runtime value Journey Builder resolves:
 *   field mode  -> {{Event.<eventDefinitionKey>."<FieldName>"}}   (quoted syntax, see event-binding-builder.js)
 *   static mode -> the literal value, unchanged
 *
 * Pure: no DOM, no state, no evaluation. The field must come from the
 * normalized catalog; its bindingPath is the only text used in the expression.
 */

import { MAPPING_MODES } from './domain/mappingTargets.js';
import { buildEventBinding } from './shared/event-binding-builder.js';

export const BINDING_ERROR_CODES = Object.freeze({
  MISSING_MAPPING: 'MISSING_MAPPING',
  INVALID_MODE: 'INVALID_MODE',
  EMPTY_FIELD_NAME: 'EMPTY_FIELD_NAME',
  FIELD_NOT_IN_CATALOG: 'FIELD_NOT_IN_CATALOG',
  UNSAFE_BINDING_PATH: 'UNSAFE_BINDING_PATH',
  EVENT_DEFINITION_KEY_MISSING: 'EVENT_DEFINITION_KEY_MISSING',
  UNSAFE_EVENT_DEFINITION_KEY: 'UNSAFE_EVENT_DEFINITION_KEY',
});

/**
 * @param {object} input
 * @param {{ mode: string, value: string }} input.mapping
 * @param {{ id: string, bindingPath: string }|null} [input.field] - catalog field (field mode)
 * @param {string|null} [input.eventDefinitionKey]
 * @returns {{ valid: true, value: string } | { valid: false, error: { code: string, message: string } }}
 */
export function buildBindingExpression({ mapping, field = null, eventDefinitionKey = null }) {
  if (!mapping || typeof mapping !== 'object') {
    return bindingError(BINDING_ERROR_CODES.MISSING_MAPPING, 'Mapping is missing.');
  }

  if (mapping.mode === MAPPING_MODES.STATIC) {
    if (typeof mapping.value !== 'string') {
      return bindingError(BINDING_ERROR_CODES.INVALID_MODE, 'Static value must be a string.');
    }
    return { valid: true, value: mapping.value };
  }

  if (mapping.mode !== MAPPING_MODES.FIELD) {
    return bindingError(BINDING_ERROR_CODES.INVALID_MODE, `Unsupported mapping mode: ${mapping.mode}`);
  }
  if (typeof mapping.value !== 'string' || mapping.value.trim() === '') {
    return bindingError(BINDING_ERROR_CODES.EMPTY_FIELD_NAME, 'Field name is empty.');
  }
  if (!field || field.id !== mapping.value) {
    return bindingError(BINDING_ERROR_CODES.FIELD_NOT_IN_CATALOG, 'The mapped field is not in the current entry schema.');
  }
  if (typeof eventDefinitionKey !== 'string' || eventDefinitionKey.trim() === '') {
    return bindingError(BINDING_ERROR_CODES.EVENT_DEFINITION_KEY_MISSING, 'The Journey entry event definition is unavailable.');
  }

  const binding = buildEventBinding({ eventDefinitionKey, bindingPath: field.bindingPath });
  if (!binding.valid) {
    const code =
      binding.error.code === 'EVENT_DEFINITION_KEY_INVALID'
        ? BINDING_ERROR_CODES.UNSAFE_EVENT_DEFINITION_KEY
        : BINDING_ERROR_CODES.UNSAFE_BINDING_PATH;
    return bindingError(code, binding.error.message);
  }
  return binding;
}

function bindingError(code, message) {
  return { valid: false, error: { code, message } };
}
