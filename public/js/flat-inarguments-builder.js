/*
 * Flat inArguments builder (browser).
 *
 * Produces the flat runtime payload Journey Builder stores in
 * arguments.execute.inArguments: one object per argument, one key per object,
 * string values only. Nested objects are never produced.
 *
 *   [
 *     { "source": "sf-marketing-cloud" },
 *     { "channel": "SMS" },
 *     { "templateKey": "vac.service-change-notice.sms.988dfeff" },
 *     { "templateVersion": "1" },
 *     { "eventDefinitionKey": "ORDER_ENTRY_EVENT" },
 *     { "address__phone": "{{Event.ORDER_ENTRY_EVENT.\"MobilePhone\"}}" },
 *     { "recipient__customerId": "{{Event.ORDER_ENTRY_EVENT.\"CustomerId\"}}" },
 *     { "param__customerName": "Long Chau Pharmacy" }
 *   ]
 *
 * Unmapped optional targets are omitted. Required targets are validated before
 * this builder runs; a missing required target is still reported here as an error.
 */

import { listMappingTargets, MAPPING_MODES } from './domain/mappingTargets.js';
import { findField } from './schema/field-catalog-model.js';
import { buildRuntimeKeyMap, FIXED_RUNTIME_KEYS } from './shared/runtime-key-builder.js';
import { buildBindingExpression } from './binding-builder.js';

export const DEFAULT_SOURCE = 'sf-marketing-cloud';

/**
 * @param {object} input
 * @param {object} input.template
 * @param {Record<string, { mode: string, value: string }>} input.mappings
 * @param {{ fields: ReadonlyArray<object> }} input.fieldCatalog
 * @param {string} input.eventDefinitionKey
 * @param {string} [input.source]
 * @returns {{ ok: true, inArguments: Array<Record<string, string>>, errors: [] } | { ok: false, inArguments: null, errors: Array<{ code: string, message: string, targetKey?: string }> }}
 */
export function buildFlatInArguments({ template, mappings = {}, fieldCatalog, eventDefinitionKey = null, source = DEFAULT_SOURCE }) {
  const keyMap = buildRuntimeKeyMap(template);
  if (!keyMap.ok) {
    return { ok: false, inArguments: null, errors: keyMap.errors };
  }

  const errors = [];
  const fixed = [
    { source },
    { channel: String(template.channel) },
    { templateKey: String(template.templateKey) },
    { templateVersion: String(template.version ?? 1) },
  ];
  if (!eventDefinitionKey) {
    errors.push({ code: 'EVENT_DEFINITION_KEY_MISSING', message: 'The Journey entry event definition is unavailable.' });
  } else {
    fixed.push({ eventDefinitionKey: String(eventDefinitionKey) });
  }

  const generated = [];
  for (const target of listMappingTargets(template)) {
    const mapping = mappings[target.key];
    if (!mapping) continue;

    const field = mapping.mode === MAPPING_MODES.FIELD ? findField(fieldCatalog, mapping.value) : null;
    const result = buildBindingExpression({ mapping, field, eventDefinitionKey });
    if (!result.valid) {
      errors.push({ targetKey: target.key, code: result.error.code, message: result.error.message });
      continue;
    }
    generated.push({ [keyMap.keys[target.key]]: result.value });
  }

  if (errors.length > 0) {
    return { ok: false, inArguments: null, errors };
  }
  return { ok: true, inArguments: [...fixed, ...generated], errors: [] };
}

export { FIXED_RUNTIME_KEYS };
