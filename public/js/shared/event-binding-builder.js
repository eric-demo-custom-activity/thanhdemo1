/*
 * Event binding builder (shared).
 *
 * Quoted Event binding syntax, as used in the official Salesforce sample
 * (sfmc-example-jb-custom-activity, sampleInteraction.js: "{{Event.<key>.\"Email\"}}"):
 *
 *   {{Event.<eventDefinitionKey>."<FieldName>"}}
 *
 * Inputs must be normalized metadata. Arbitrary text is never placed inside an
 * expression: quotes, braces, backslashes and line breaks are rejected, so no
 * escaping is needed and an expression cannot be closed early.
 *
 * Live Journey Builder confirmation of this syntax is a mandatory gate.
 */

const SAFE_EVENT_DEFINITION_KEY = /^[A-Za-z0-9_-]{1,128}$/;
/** Field names may contain spaces (quoted syntax), but never quotes, braces, backslashes or line breaks. */
const SAFE_BINDING_PATH = /^[^"\\{}\r\n\t]{1,128}$/;

export const BINDING_CODES = Object.freeze({
  EVENT_DEFINITION_KEY_INVALID: 'EVENT_DEFINITION_KEY_INVALID',
  BINDING_PATH_INVALID: 'BINDING_PATH_INVALID',
  BINDING_PATH_EMPTY: 'BINDING_PATH_EMPTY',
});

/**
 * @param {object} input
 * @param {string} input.eventDefinitionKey
 * @param {string} input.bindingPath - field name as declared by the entry Data Extension
 * @returns {{ valid: true, value: string } | { valid: false, error: { code: string, message: string } }}
 */
export function buildEventBinding({ eventDefinitionKey, bindingPath }) {
  if (typeof eventDefinitionKey !== 'string' || !SAFE_EVENT_DEFINITION_KEY.test(eventDefinitionKey)) {
    return fail(BINDING_CODES.EVENT_DEFINITION_KEY_INVALID, 'The event definition key has an unsupported format.');
  }
  if (typeof bindingPath !== 'string' || bindingPath.trim() === '') {
    return fail(BINDING_CODES.BINDING_PATH_EMPTY, 'The binding path is empty.');
  }
  if (!SAFE_BINDING_PATH.test(bindingPath)) {
    return fail(BINDING_CODES.BINDING_PATH_INVALID, 'The binding path contains characters that are not allowed.');
  }
  return { valid: true, value: `{{Event.${eventDefinitionKey}."${bindingPath}"}}` };
}

function fail(code, message) {
  return { valid: false, error: { code, message } };
}
