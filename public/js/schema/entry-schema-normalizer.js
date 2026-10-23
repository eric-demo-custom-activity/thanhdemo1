/*
 * Entry-schema normalizer.
 *
 * The ONLY module that knows the shape of Journey Builder metadata. It accepts
 * raw payloads and returns plain results with the normalized field model.
 * It never throws because of one malformed entry.
 *
 * Shapes read (see README section 9.11):
 *   requestedInteraction payload
 *     {
 *       triggers: [
 *         { metaData: { eventDefinitionKey, ... optional field list ... } }
 *       ]
 *     }
 *   Only triggers[0].metaData is read. The official Salesforce sample
 *   (sfmc-example-jb-custom-activity, sampleInteraction.js) confirms the
 *   eventDefinitionKey location. It does NOT contain a Data Extension field
 *   list in triggers[0].metaData, so the catalog stays empty for that shape
 *   and the result is recoverable (SCHEMA_NOT_AVAILABLE), never invented.
 *   Optional field list locations accepted when present:
 *     metaData.schema           [{ key, type, ... }]
 *     metaData.deSchema.fields  [{ name, type, ordinal?, ... }]
 *
 * Field name extraction:
 *   - name when present, else the last segment of a key such as
 *     "Event.<eventDefinitionKey>.<FieldName>".
 *
 * Result shapes:
 *   { valid, eventDefinitionKey, fields, warnings, error }
 *   error.code: SCHEMA_NOT_AVAILABLE | INVALID_EVENT_DEFINITION |
 *               EVENT_DEFINITION_KEY_MISSING | EVENT_DEFINITION_KEY_INVALID
 */

import { normalizeFieldType, FIELD_TYPES } from './field-type-normalizer.js';
import { createFieldModel, SOURCE_TYPES } from './field-catalog-model.js';

export const SCHEMA_ERROR_CODES = Object.freeze({
  SCHEMA_NOT_AVAILABLE: 'SCHEMA_NOT_AVAILABLE',
  INVALID_EVENT_DEFINITION: 'INVALID_EVENT_DEFINITION',
  EVENT_DEFINITION_KEY_MISSING: 'EVENT_DEFINITION_KEY_MISSING',
  EVENT_DEFINITION_KEY_INVALID: 'EVENT_DEFINITION_KEY_INVALID',
});

export const SCHEMA_WARNING_CODES = Object.freeze({
  FIELD_SKIPPED: 'FIELD_SKIPPED',
  DUPLICATE_FIELD: 'DUPLICATE_FIELD',
  UNKNOWN_FIELD_TYPE: 'UNKNOWN_FIELD_TYPE',
});

/** Event definition keys are alphanumeric with underscores or hyphens (e.g. DEAudience-<guid>). */
const SAFE_EVENT_DEFINITION_KEY = /^[A-Za-z0-9_-]+$/;
const SAFE_FIELD_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_FIELDS = 500;

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Reads the entry trigger of an interaction (triggers[0].metaData).
 * Returns the event definition key and the optional field list found in that
 * metadata. Nothing outside triggers[0].metaData is read.
 *
 * @param {unknown} payload - the requestedInteraction payload
 * @returns {{ valid: true, eventDefinitionKey: string, embeddedFieldList: Array<unknown>|null, error: null }
 *   | { valid: false, eventDefinitionKey: null, embeddedFieldList: null, error: { code: string, message: string } }}
 */
export function normalizeInteraction(payload) {
  if (!isPlainObject(payload) || !Array.isArray(payload.triggers) || payload.triggers.length === 0) {
    return invalid(SCHEMA_ERROR_CODES.INVALID_EVENT_DEFINITION, 'Journey Builder did not return an interaction with triggers.');
  }

  const trigger = payload.triggers[0];
  const metaData = isPlainObject(trigger) ? trigger.metaData : undefined;
  if (!isPlainObject(metaData)) {
    return invalid(SCHEMA_ERROR_CODES.INVALID_EVENT_DEFINITION, 'The entry trigger has no metadata.');
  }

  const key = metaData.eventDefinitionKey;
  if (key === undefined || key === null || (typeof key === 'string' && key.trim() === '')) {
    return invalid(SCHEMA_ERROR_CODES.EVENT_DEFINITION_KEY_MISSING, 'Journey Builder did not return an event definition key.');
  }
  if (typeof key !== 'string' || !SAFE_EVENT_DEFINITION_KEY.test(key)) {
    return invalid(SCHEMA_ERROR_CODES.EVENT_DEFINITION_KEY_INVALID, 'The event definition key has an unsupported format.');
  }

  return {
    valid: true,
    eventDefinitionKey: key,
    embeddedFieldList: pickEmbeddedFieldList(metaData),
    error: null,
  };
}


/**
 * Normalizes a raw field list into the field catalog model.
 *
 * - Skips malformed entries and records a FIELD_SKIPPED warning.
 * - Removes duplicates (first occurrence wins) with a DUPLICATE_FIELD warning.
 * - Keeps the source order. Sorts by ordinal only when every field has one.
 * - Never mutates the input.
 *
 * @param {unknown} rawFieldList
 * @param {string} eventDefinitionKey
 * @returns {{ valid: boolean, eventDefinitionKey: string, fields: object[], warnings: object[], error: object|null }}
 */
export function normalizeFieldList(rawFieldList, eventDefinitionKey) {
  if (!Array.isArray(rawFieldList) || rawFieldList.length === 0) {
    return unavailable(eventDefinitionKey, 'Journey Builder did not return an entry-field schema.');
  }

  const warnings = [];
  const seen = new Set();
  const fields = [];

  rawFieldList.slice(0, MAX_FIELDS).forEach((raw, index) => {
    const normalized = normalizeField(raw);
    if (!normalized) {
      warnings.push({ code: SCHEMA_WARNING_CODES.FIELD_SKIPPED, index, message: `Field at position ${index} was skipped because it is malformed.` });
      return;
    }
    if (seen.has(normalized.id)) {
      warnings.push({ code: SCHEMA_WARNING_CODES.DUPLICATE_FIELD, index, message: `Duplicate field "${normalized.id}" was ignored.` });
      return;
    }
    seen.add(normalized.id);
    fields.push(normalized);
    if (normalized.dataType === FIELD_TYPES.UNKNOWN) {
      warnings.push({ code: SCHEMA_WARNING_CODES.UNKNOWN_FIELD_TYPE, index, message: `Field "${normalized.id}" has an unknown data type.` });
    }
  });

  if (fields.length === 0) {
    return unavailable(eventDefinitionKey, 'Journey Builder returned no usable entry fields.');
  }

  if (fields.every((field) => Number.isInteger(field.ordinal))) {
    fields.sort((a, b) => a.ordinal - b.ordinal);
  }

  return { valid: true, eventDefinitionKey, fields, warnings, error: null };
}

/**
 * Converts one raw field entry. Returns null when the entry has no usable name.
 *
 * @param {unknown} raw
 * @returns {object|null}
 */
export function normalizeField(raw) {
  if (!isPlainObject(raw)) return null;

  const name = resolveFieldName(raw);
  if (!name || !SAFE_FIELD_NAME.test(name)) return null;

  const label = typeof raw.label === 'string' && raw.label.trim() !== '' ? raw.label.trim() : humanize(name);

  return createFieldModel({
    id: name,
    name,
    label,
    dataType: normalizeFieldType(raw.type ?? raw.dataType),
    source: SOURCE_TYPES.ENTRY_EVENT,
    bindingPath: name,
    nullable: typeof raw.isNullable === 'boolean' ? raw.isNullable : undefined,
    length: Number.isInteger(raw.length) && raw.length >= 0 ? raw.length : undefined,
    precision: Number.isInteger(raw.precision) && raw.precision >= 0 ? raw.precision : undefined,
    scale: Number.isInteger(raw.scale) && raw.scale >= 0 ? raw.scale : undefined,
    ordinal: Number.isInteger(raw.ordinal) && raw.ordinal >= 0 ? raw.ordinal : undefined,
    isPrimaryKey: typeof raw.isPrimaryKey === 'boolean' ? raw.isPrimaryKey : undefined,
  });
}

/**
 * Produces a structural description of a payload: property names and types only.
 * Values are never included, so the output is safe to log in debug mode.
 *
 * @param {unknown} value
 * @param {number} [depth=2]
 * @returns {string}
 */
export function describeStructure(value, depth = 2) {
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    if (value.length === 0) return 'array(0)';
    if (depth <= 0) return `array(${value.length})`;
    return `array(${value.length})[${describeStructure(value[0], depth - 1)}]`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).slice(0, 30);
    if (depth <= 0) return '{...}';
    return `{${keys.map((key) => `${key}:${describeStructure(value[key], depth - 1)}`).join(',')}}`;
  }
  return typeof value;
}

function pickEmbeddedFieldList(payload) {
  if (Array.isArray(payload.schema)) return payload.schema;
  if (isPlainObject(payload.deSchema) && Array.isArray(payload.deSchema.fields)) return payload.deSchema.fields;
  return null;
}

function resolveFieldName(raw) {
  if (typeof raw.name === 'string' && raw.name.trim() !== '') {
    return raw.name.trim();
  }
  if (typeof raw.key === 'string') {
    const segment = raw.key.slice(raw.key.lastIndexOf('.') + 1).trim();
    return segment === '' ? null : segment;
  }
  return null;
}

/** "CustomerId" -> "Customer Id", "order_amount" -> "order amount". */
function humanize(name) {
  return name
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .trim();
}

function invalid(code, message) {
  return { valid: false, eventDefinitionKey: null, embeddedFieldList: null, error: { code, message } };
}

function unavailable(eventDefinitionKey, message) {
  return {
    valid: false,
    eventDefinitionKey,
    fields: [],
    warnings: [],
    error: { code: SCHEMA_ERROR_CODES.SCHEMA_NOT_AVAILABLE, message },
  };
}
