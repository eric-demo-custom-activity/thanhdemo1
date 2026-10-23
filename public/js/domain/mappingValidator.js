/*
 * Mapping validation engine.
 *
 * Pure function: no DOM, no state access. Input in, { valid, errors, warnings } out.
 * Only errors block save. Warnings are shown to the designer.
 *
 * Template-target rules
 *   1. Required targets must be mapped                      -> REQUIRED_MISSING          (error)
 *   2. Static values cannot be empty                        -> STATIC_EMPTY              (error)
 *   3. Field mappings cannot be empty                       -> FIELD_EMPTY               (error)
 *   4. Address targets (routing) must be mapped             -> ROUTING_MISSING           (error)
 *   5. Recipient-field targets (routing) must be mapped     -> ROUTING_MISSING           (error)
 *
 * Rules 4 and 5 apply to the routing targets of the template rather than to the
 * literal names "addresses.phone" and "customerId". Hardcoded names would tie the
 * validator to one template, and an email template has no phone address.
 *
 * Field-mapping rules (Journey entry schema)
 *   - a field mapping requires eventDefinitionKey                 -> EVENT_DEFINITION_KEY_MISSING (error)
 *   - a field mapping requires a READY catalog                    -> SCHEMA_UNAVAILABLE           (error)
 *   - the mapped field must exist in the catalog (stale otherwise) -> SOURCE_FIELD_NOT_FOUND       (error)
 *   - source and target types must be compatible                  -> TYPE_INCOMPATIBLE            (error)
 *   - a conversion that needs runtime validation                  -> TYPE_CONVERSION_REQUIRED     (warning)
 *   - a source field of unknown type                              -> UNKNOWN_SOURCE_TYPE          (warning)
 *
 * Static mappings do not depend on the schema and stay valid when it is unavailable.
 *
 * Defensive checks
 *   UNKNOWN_TARGET  - a mapping exists for a key the template does not define
 *   INVALID_MODE    - a mapping has an unsupported mode
 */

import { listMappingTargets, MAPPING_MODES } from './mappingTargets.js';
import { findField } from '../schema/field-catalog-model.js';
import { FIELD_TYPES } from '../schema/field-type-normalizer.js';
import { checkTypeCompatibility, COMPATIBILITY_SEVERITY } from './typeCompatibility.js';

export const VALIDATION_CODES = Object.freeze({
  NO_TEMPLATE: 'NO_TEMPLATE',
  REQUIRED_MISSING: 'REQUIRED_MISSING',
  ROUTING_MISSING: 'ROUTING_MISSING',
  FIELD_EMPTY: 'FIELD_EMPTY',
  STATIC_EMPTY: 'STATIC_EMPTY',
  SOURCE_FIELD_NOT_FOUND: 'SOURCE_FIELD_NOT_FOUND',
  EVENT_DEFINITION_KEY_MISSING: 'EVENT_DEFINITION_KEY_MISSING',
  SCHEMA_UNAVAILABLE: 'SCHEMA_UNAVAILABLE',
  TYPE_INCOMPATIBLE: 'TYPE_INCOMPATIBLE',
  TYPE_CONVERSION_REQUIRED: 'TYPE_CONVERSION_REQUIRED',
  UNKNOWN_SOURCE_TYPE: 'UNKNOWN_SOURCE_TYPE',
  UNKNOWN_TARGET: 'UNKNOWN_TARGET',
  INVALID_MODE: 'INVALID_MODE',
});

/** "Not mapped yet" codes, shown under Missing in the validation panel. */
export const MISSING_CODES = Object.freeze(
  new Set([VALIDATION_CODES.REQUIRED_MISSING, VALIDATION_CODES.ROUTING_MISSING, VALIDATION_CODES.FIELD_EMPTY])
);

/** Codes that mean a saved field no longer exists in the Journey entry schema. */
export const STALE_CODES = Object.freeze(new Set([VALIDATION_CODES.SOURCE_FIELD_NOT_FOUND]));

const MESSAGES = Object.freeze({
  [VALIDATION_CODES.NO_TEMPLATE]: 'No template selected.',
  [VALIDATION_CODES.REQUIRED_MISSING]: 'Required field is not mapped.',
  [VALIDATION_CODES.ROUTING_MISSING]: 'Address and recipient fields must be mapped.',
  [VALIDATION_CODES.FIELD_EMPTY]: 'Choose a Journey entry field.',
  [VALIDATION_CODES.STATIC_EMPTY]: 'Static value cannot be empty.',
  [VALIDATION_CODES.SOURCE_FIELD_NOT_FOUND]: 'Previously mapped field no longer exists in the Journey entry schema.',
  [VALIDATION_CODES.EVENT_DEFINITION_KEY_MISSING]: 'The Journey entry event definition is unavailable; field mappings cannot be saved.',
  [VALIDATION_CODES.SCHEMA_UNAVAILABLE]: 'The Journey entry schema is unavailable; field mappings cannot be saved.',
  [VALIDATION_CODES.TYPE_INCOMPATIBLE]: 'The field type is not compatible with this parameter.',
  [VALIDATION_CODES.TYPE_CONVERSION_REQUIRED]: 'The field type needs runtime conversion.',
  [VALIDATION_CODES.UNKNOWN_SOURCE_TYPE]: 'The field has an unknown data type; it will be validated at runtime.',
  [VALIDATION_CODES.UNKNOWN_TARGET]: 'Mapping refers to a target the template does not define.',
  [VALIDATION_CODES.INVALID_MODE]: 'Unsupported mapping mode.',
});

/**
 * @typedef {{ code: string, targetKey: string|null, name: string|null, message: string }} ValidationIssue
 * @typedef {{ valid: boolean, errors: ValidationIssue[], warnings: ValidationIssue[] }} ValidationResult
 */

/**
 * @param {object} input
 * @param {object|null} input.template
 * @param {Record<string, { mode: string, value: string }>} input.mappings
 * @param {{ fields: ReadonlyArray<object> }|null} [input.fieldCatalog] - normalized catalog
 * @param {string|null} [input.eventDefinitionKey]
 * @returns {ValidationResult}
 */
export function validateMappings({ template, mappings = {}, fieldCatalog = null, eventDefinitionKey = null }) {
  if (!template) {
    return { valid: false, errors: [issue(VALIDATION_CODES.NO_TEMPLATE, null, null)], warnings: [] };
  }

  const targets = listMappingTargets(template);
  const targetKeys = new Set(targets.map((target) => target.key));
  const catalogReady = Boolean(fieldCatalog) && fieldCatalog.fields.length > 0;
  const errors = [];
  const warnings = [];

  for (const target of targets) {
    const mapping = mappings[target.key];

    if (!mapping) {
      if (target.required) {
        errors.push(issue(VALIDATION_CODES.REQUIRED_MISSING, target.key, target.name));
      } else if (target.isRouting) {
        errors.push(issue(VALIDATION_CODES.ROUTING_MISSING, target.key, target.name));
      }
      continue;
    }

    if (mapping.mode === MAPPING_MODES.FIELD) {
      validateFieldMapping({ target, mapping, fieldCatalog, eventDefinitionKey, catalogReady, errors, warnings });
      continue;
    }

    if (mapping.mode === MAPPING_MODES.STATIC) {
      if (typeof mapping.value !== 'string' || mapping.value.trim() === '') {
        errors.push(issue(VALIDATION_CODES.STATIC_EMPTY, target.key, target.name));
      }
      continue;
    }

    errors.push(issue(VALIDATION_CODES.INVALID_MODE, target.key, target.name));
  }

  for (const key of Object.keys(mappings)) {
    if (!targetKeys.has(key)) {
      errors.push(issue(VALIDATION_CODES.UNKNOWN_TARGET, key, key));
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateFieldMapping({ target, mapping, fieldCatalog, eventDefinitionKey, catalogReady, errors, warnings }) {
  if (!mapping.value) {
    errors.push(issue(VALIDATION_CODES.FIELD_EMPTY, target.key, target.name));
    return;
  }
  if (!eventDefinitionKey) {
    errors.push(issue(VALIDATION_CODES.EVENT_DEFINITION_KEY_MISSING, target.key, target.name));
    return;
  }
  if (!catalogReady) {
    errors.push(issue(VALIDATION_CODES.SCHEMA_UNAVAILABLE, target.key, target.name));
    return;
  }

  const field = findField(fieldCatalog, mapping.value);
  if (!field) {
    errors.push(issue(VALIDATION_CODES.SOURCE_FIELD_NOT_FOUND, target.key, target.name));
    return;
  }

  if (field.dataType === FIELD_TYPES.UNKNOWN) {
    warnings.push(issue(VALIDATION_CODES.UNKNOWN_SOURCE_TYPE, target.key, target.name));
    return;
  }

  const compatibility = checkTypeCompatibility(field.dataType, target.type);
  if (!compatibility.compatible) {
    errors.push(issue(VALIDATION_CODES.TYPE_INCOMPATIBLE, target.key, target.name, compatibility.message));
  } else if (compatibility.severity === COMPATIBILITY_SEVERITY.WARNING) {
    warnings.push(issue(VALIDATION_CODES.TYPE_CONVERSION_REQUIRED, target.key, target.name, compatibility.message));
  }
}

/**
 * Errors that mean "not mapped yet" (drives the Missing list in the panel).
 * @param {ValidationResult} result
 * @returns {ValidationIssue[]}
 */
export function getMissingErrors(result) {
  return result.errors.filter((item) => MISSING_CODES.has(item.code));
}

/**
 * Errors that mean a saved field is no longer available (stale mappings).
 * @param {ValidationResult} result
 * @returns {ValidationIssue[]}
 */
export function getStaleErrors(result) {
  return result.errors.filter((item) => STALE_CODES.has(item.code));
}

function issue(code, targetKey, name, message = null) {
  return { code, targetKey, name, message: message ?? MESSAGES[code] };
}
