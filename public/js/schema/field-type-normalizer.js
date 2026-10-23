/*
 * Field-type normalization.
 *
 * Maps the source data type reported by Journey Builder onto the stable internal
 * type system. Matching is case-insensitive. Unknown values become "Unknown"
 * instead of rejecting the whole schema.
 *
 * Alias sources:
 *   - "Text", "EmailAddress", "Number", "Decimal", "Date", "Boolean" appear in the
 *     community-documented requestDataSources payload example (see README).
 *   - "string", "phone", "integer", "datetime" are the aliases listed in the
 *     project specification. They are accepted, but they are not verified
 *     against a live Journey Builder payload yet.
 */

export const FIELD_TYPES = Object.freeze({
  TEXT: 'Text',
  PHONE: 'Phone',
  EMAIL: 'Email',
  NUMBER: 'Number',
  DECIMAL: 'Decimal',
  INTEGER: 'Integer',
  DATE: 'Date',
  DATE_TIME: 'DateTime',
  BOOLEAN: 'Boolean',
  UNKNOWN: 'Unknown',
});

const ALIASES = new Map([
  ['text', FIELD_TYPES.TEXT],
  ['string', FIELD_TYPES.TEXT],
  ['phone', FIELD_TYPES.PHONE],
  ['emailaddress', FIELD_TYPES.EMAIL],
  ['email', FIELD_TYPES.EMAIL],
  ['number', FIELD_TYPES.NUMBER],
  ['decimal', FIELD_TYPES.DECIMAL],
  ['integer', FIELD_TYPES.INTEGER],
  ['int', FIELD_TYPES.INTEGER],
  ['date', FIELD_TYPES.DATE],
  ['datetime', FIELD_TYPES.DATE_TIME],
  ['boolean', FIELD_TYPES.BOOLEAN],
]);

/**
 * @param {unknown} rawType
 * @returns {string} one of FIELD_TYPES
 */
export function normalizeFieldType(rawType) {
  if (typeof rawType !== 'string') return FIELD_TYPES.UNKNOWN;
  return ALIASES.get(rawType.trim().toLowerCase()) ?? FIELD_TYPES.UNKNOWN;
}
