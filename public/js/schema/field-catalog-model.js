/*
 * Field catalog model.
 *
 * The only shape the rest of the application uses for available source fields.
 * Raw Journey Builder objects never leave the normalizer.
 *
 * Field model:
 *   id, name, label, dataType, source, bindingPath         (required)
 *   nullable, length, precision, scale, ordinal, isPrimaryKey  (optional)
 *
 * For entry-event fields, id === name === bindingPath. The id is the stable
 * value stored in mappings, so a renamed field is detected as a missing field.
 */

import { FIELD_TYPES } from './field-type-normalizer.js';

export const SOURCE_TYPES = Object.freeze({
  ENTRY_EVENT: 'entryEvent',
});

const OPTIONAL_KEYS = Object.freeze([
  'nullable',
  'length',
  'precision',
  'scale',
  'ordinal',
  'isPrimaryKey',
]);

/**
 * Builds a frozen normalized field. Optional properties are only present when
 * they were supplied with a valid value.
 *
 * @param {object} input
 * @returns {Readonly<object>}
 */
export function createFieldModel(input) {
  const field = {
    id: input.id,
    name: input.name,
    label: input.label,
    dataType: input.dataType ?? FIELD_TYPES.UNKNOWN,
    source: input.source ?? SOURCE_TYPES.ENTRY_EVENT,
    bindingPath: input.bindingPath ?? input.name,
  };
  for (const key of OPTIONAL_KEYS) {
    if (input[key] !== undefined) {
      field[key] = input[key];
    }
  }
  return Object.freeze(field);
}

/**
 * @param {object} input
 * @param {string|null} [input.eventDefinitionKey]
 * @param {ReadonlyArray<object>} [input.fields]
 * @param {string} [input.sourceType]
 * @returns {Readonly<{ eventDefinitionKey: string|null, sourceType: string, fields: ReadonlyArray<object> }>}
 */
export function createFieldCatalog({ eventDefinitionKey = null, fields = [], sourceType = SOURCE_TYPES.ENTRY_EVENT } = {}) {
  return Object.freeze({
    eventDefinitionKey,
    sourceType,
    fields: Object.freeze(fields.map((field) => createFieldModel(field))),
  });
}

/**
 * @param {{ fields: ReadonlyArray<object> }} catalog
 * @param {string} fieldId
 * @returns {object|null}
 */
export function findField(catalog, fieldId) {
  if (!catalog || typeof fieldId !== 'string') return null;
  return catalog.fields.find((field) => field.id === fieldId) ?? null;
}

/**
 * @param {{ fields: ReadonlyArray<object> }} catalog
 * @param {string} fieldId
 * @returns {boolean}
 */
export function hasField(catalog, fieldId) {
  return findField(catalog, fieldId) !== null;
}
