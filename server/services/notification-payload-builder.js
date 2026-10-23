/*
 * Notification payload builder (server).
 *
 * Converts parsed flat runtime values into the Notification Hub request shape
 * (one recipient per execute call). Template-specific rules come only from the
 * template model: address types, required addresses and parameters.
 *
 * Errors name keys, never values, so no customer data reaches a log or response.
 */

import { runtimeKeyFor, FIXED_RUNTIME_KEYS } from '../../public/js/shared/runtime-key-builder.js';

/**
 * @param {object} input
 * @param {object} input.template - template model from the catalog
 * @param {Record<string, string>} input.values - parsed flat runtime values
 * @param {string} input.idempotencyKey
 * @param {string} input.correlationId
 * @param {string} [input.source]
 * @returns {{ ok: true, payload: object } | { ok: false, errors: Array<{ code: string, key: string|null, message: string }> }}
 */
export function buildNotificationPayload({ template, values, idempotencyKey, correlationId, source = 'sf-marketing-cloud' }) {
  const errors = [];
  const addresses = [];
  const recipient = {};
  const params = {};

  const expectedKeys = new Set(FIXED_RUNTIME_KEYS);

  for (const address of template.addresses ?? []) {
    const key = runtimeKeyFor('addresses', address.name);
    expectedKeys.add(key);
    if (values[key] !== undefined) {
      addresses.push({ type: address.type ?? address.name, value: values[key] });
    } else if (address.required) {
      errors.push({ code: 'REQUIRED_VALUE_MISSING', key, message: 'A required address value is missing.' });
    }
  }

  for (const field of template.recipientFields ?? []) {
    const key = runtimeKeyFor('recipientFields', field.name);
    expectedKeys.add(key);
    if (values[key] !== undefined) {
      recipient[field.name] = values[key];
    } else if (field.required) {
      errors.push({ code: 'REQUIRED_VALUE_MISSING', key, message: 'A required recipient value is missing.' });
    }
  }

  for (const param of template.params ?? []) {
    const key = runtimeKeyFor('params', param.name);
    expectedKeys.add(key);
    if (values[key] !== undefined) {
      params[param.name] = values[key];
    } else if (param.required) {
      errors.push({ code: 'REQUIRED_VALUE_MISSING', key, message: 'A required parameter value is missing.' });
    }
  }

  for (const key of Object.keys(values)) {
    if (!expectedKeys.has(key)) {
      errors.push({ code: 'UNKNOWN_RUNTIME_KEY', key, message: 'A runtime key does not belong to this template.' });
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    payload: {
      source,
      idempotencyKey,
      templateKey: template.templateKey,
      correlationId,
      recipients: [
        {
          addresses,
          ...recipient,
          params,
        },
      ],
    },
  };
}
