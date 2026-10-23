/*
 * Automatic field matching.
 *
 * Preselects a Data Extension field for each template target whose name matches
 * a discovered field name after normalization (see nameNormalizer.js):
 * case, underscores, hyphens and spaces are ignored.
 *
 *   customerId, Customer_Id, CUSTOMERID, customer-id  are all equal
 *
 * Targets without a match stay unmapped. The designer must choose a field for
 * every required target. Existing mappings are never overwritten.
 */

import { listMappingTargets, MAPPING_MODES } from './mappingTargets.js';
import { normalizeName } from './nameNormalizer.js';

/**
 * @param {string} targetName - template target name, e.g. "customerId"
 * @param {ReadonlyArray<{ id: string, name: string }>} fields
 * @returns {{ id: string, name: string } | null}
 */
export function findMatchingField(targetName, fields) {
  const wanted = normalizeName(targetName);
  if (wanted === '') return null;
  return (
    fields.find((field) => normalizeName(field.name) === wanted || normalizeName(field.id) === wanted) ?? null
  );
}

/**
 * Suggests field mappings for template targets that have no mapping yet.
 *
 * @param {object} input
 * @param {object|null} input.template
 * @param {ReadonlyArray<{ id: string, name: string }>} input.fields
 * @param {Record<string, { mode: string, value: string }>} input.mappings - existing mappings
 * @returns {Record<string, { mode: string, value: string }>} only the new suggestions
 */
export function suggestFieldMappings({ template, fields, mappings = {} }) {
  const suggestions = {};
  if (!template || fields.length === 0) return suggestions;

  for (const target of listMappingTargets(template)) {
    if (mappings[target.key]) continue;
    const match = findMatchingField(target.name, fields);
    if (match) {
      suggestions[target.key] = { mode: MAPPING_MODES.FIELD, value: match.id };
    }
  }
  return suggestions;
}
