/*
 * Flat inArguments parser (shared; the server validates and reads runtime input with it).
 *
 * Expected input: an array of single-key objects with string values:
 *   [ { "source": "sf-marketing-cloud" }, { "address__phone": "..." }, ... ]
 *
 * Rejected: nested values, multi-key objects, non-string values, duplicate keys,
 * unsafe key names, and values that are not strings.
 */

const SAFE_KEY = /^[A-Za-z][A-Za-z0-9_]{0,127}$/;

/**
 * @param {unknown} inArguments
 * @returns {{ ok: true, values: Record<string, string> } | { ok: false, errors: Array<{ code: string, key: string|null, message: string }> }}
 */
export function parseFlatInArguments(inArguments) {
  if (!Array.isArray(inArguments)) {
    return { ok: false, errors: [{ code: 'IN_ARGUMENTS_NOT_ARRAY', key: null, message: 'inArguments must be an array.' }] };
  }

  const values = {};
  const errors = [];

  inArguments.forEach((entry, index) => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push({ code: 'IN_ARGUMENT_NOT_OBJECT', key: null, message: `Entry ${index} must be an object.` });
      return;
    }
    const keys = Object.keys(entry);
    if (keys.length !== 1) {
      errors.push({ code: 'IN_ARGUMENT_NOT_SINGLE_KEY', key: null, message: `Entry ${index} must contain exactly one key.` });
      return;
    }
    const [key] = keys;
    if (!SAFE_KEY.test(key)) {
      errors.push({ code: 'IN_ARGUMENT_KEY_INVALID', key, message: `Key "${key}" is not a valid runtime key.` });
      return;
    }
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      errors.push({ code: 'IN_ARGUMENT_DUPLICATE', key, message: `Key "${key}" appears more than once.` });
      return;
    }
    if (typeof entry[key] !== 'string') {
      errors.push({ code: 'IN_ARGUMENT_VALUE_NOT_STRING', key, message: `Value of "${key}" must be a string.` });
      return;
    }
    values[key] = entry[key];
  });

  return errors.length > 0 ? { ok: false, errors } : { ok: true, values };
}
