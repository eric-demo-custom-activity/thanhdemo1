/*
 * Lifecycle service (server).
 *
 * Validates activity definitions for save, validate and publish, and prepares the
 * Notification Hub payload for execute. It reuses the same key and binding rules
 * as the browser, so a configuration accepted in the UI is accepted here.
 *
 * Error details name keys and codes only. Values, tokens and customer data are
 * never placed in an error.
 */

import { createHash, randomUUID } from 'node:crypto';
import { read as readEditorState } from '../../public/js/shared/editor-state-adapter.js';
import { parseFlatInArguments } from '../../public/js/shared/flat-arguments-parser.js';
import { buildRuntimeKeyMap, FIXED_RUNTIME_KEYS } from '../../public/js/shared/runtime-key-builder.js';
import { listMappingTargets, MAPPING_MODES } from '../../public/js/domain/mappingTargets.js';
import { toChannelCode } from '../../public/js/domain/channels.js';
import { buildNotificationPayload } from './notification-payload-builder.js';
import { ValidationError, TemplateNotFoundError } from '../errors.js';

const EVENT_BINDING = /^\{\{Event\.([A-Za-z0-9_-]{1,128})\."[^"\\{}\r\n\t]{1,128}"\}\}$/;

/**
 * @param {{ activity: object, templates: ReadonlyArray<object> }} input
 * @returns {{ valid: boolean, errors: Array<{ code: string, key: string|null, message: string }> }}
 */
export function validateActivityDefinition({ activity, templates }) {
  const errors = [];
  const push = (code, message, key = null) => errors.push({ code, key, message });

  if (!activity || typeof activity !== 'object' || !activity.arguments || typeof activity.arguments.execute !== 'object') {
    push('INVALID_ACTIVITY', 'The activity definition is missing its execute section.');
    return { valid: false, errors };
  }

  const state = readEditorState(activity);
  if (!state) {
    push('CONFIGURATION_MISSING', 'The activity has no saved configuration.');
    return { valid: false, errors };
  }

  const template = templates.find((candidate) => candidate.templateKey === state.templateKey);
  if (!template) {
    push('TEMPLATE_NOT_FOUND', 'The selected template does not exist.');
    return { valid: false, errors };
  }

  if (toChannelCode(state.channel) !== template.channel) {
    push('CHANNEL_MISMATCH', 'The channel does not match the selected template.');
  }

  const mappings = state.mappings ?? {};
  const eventKey = typeof state.eventDefinitionKey === 'string' ? state.eventDefinitionKey : null;
  const targets = listMappingTargets(template);
  const targetKeys = new Set(targets.map((target) => target.key));
  const usesField = Object.values(mappings).some((mapping) => mapping?.mode === MAPPING_MODES.FIELD);

  for (const key of Object.keys(mappings)) {
    if (!targetKeys.has(key)) push('UNKNOWN_TARGET', 'A mapping refers to a target the template does not define.', key);
  }

  for (const target of targets) {
    const mapping = mappings[target.key];
    if (!mapping) {
      if (target.required || target.isRouting) {
        push('REQUIRED_MAPPING_MISSING', 'A required template field is not mapped.', target.key);
      }
      continue;
    }
    if (mapping.mode === MAPPING_MODES.FIELD) {
      if (typeof mapping.value !== 'string' || mapping.value === '') {
        push('FIELD_EMPTY', 'A field mapping has no field selected.', target.key);
      }
    } else if (mapping.mode === MAPPING_MODES.STATIC) {
      if (typeof mapping.value !== 'string' || mapping.value.trim() === '') {
        push('STATIC_EMPTY', 'A static value is empty.', target.key);
      }
    } else {
      push('INVALID_MODE', 'A mapping uses an unsupported mode.', target.key);
    }
  }

  if (usesField && !eventKey) {
    push('EVENT_DEFINITION_KEY_MISSING', 'Field mappings require the entry event definition key.');
  }

  const keyMap = buildRuntimeKeyMap(template);
  if (!keyMap.ok) {
    for (const error of keyMap.errors) push(error.code, error.message, error.targetKey);
    return { valid: false, errors };
  }

  const inArguments = activity.arguments.execute.inArguments;
  if (!Array.isArray(inArguments) || inArguments.length === 0) {
    push('RUNTIME_ARGUMENTS_MISSING', 'The activity has no runtime arguments. Save the activity in the editor again.');
    return { valid: errors.length === 0, errors };
  }

  const parsed = parseFlatInArguments(inArguments);
  if (!parsed.ok) {
    for (const error of parsed.errors) push(error.code, error.message, error.key);
    return { valid: false, errors };
  }

  const expected = new Map();
  for (const target of targets) {
    const mapping = mappings[target.key];
    if (mapping) expected.set(keyMap.keys[target.key], mapping);
  }
  for (const key of FIXED_RUNTIME_KEYS) {
    if (parsed.values[key] === undefined) push('MISSING_RUNTIME_KEY', 'A fixed runtime argument is missing.', key);
  }
  if (parsed.values.templateKey !== template.templateKey) {
    push('RUNTIME_TEMPLATE_MISMATCH', 'The runtime template does not match the saved template.', 'templateKey');
  }
  for (const [key, mapping] of expected) {
    const value = parsed.values[key];
    if (value === undefined) {
      push('MISSING_RUNTIME_KEY', 'A runtime argument for a mapped field is missing.', key);
      continue;
    }
    if (mapping.mode === MAPPING_MODES.FIELD) {
      const match = EVENT_BINDING.exec(value);
      if (!match || match[1] !== eventKey) {
        push('BINDING_INVALID', 'A field binding does not use the entry event definition key.', key);
      }
    } else if (value !== mapping.value) {
      push('STATIC_VALUE_MISMATCH', 'A static runtime value does not match the saved mapping.', key);
    }
  }
  for (const key of Object.keys(parsed.values)) {
    if (!expected.has(key) && !FIXED_RUNTIME_KEYS.includes(key)) {
      push('UNKNOWN_RUNTIME_KEY', 'A runtime argument does not belong to this template.', key);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Publish adds: the activity must be marked configured and must have an execute URL.
 * @param {{ activity: object, templates: ReadonlyArray<object> }} input
 * @returns {{ valid: boolean, errors: object[] }}
 */
export function validateForPublish({ activity, templates }) {
  const result = validateActivityDefinition({ activity, templates });
  const errors = [...result.errors];
  if (activity?.metaData?.isConfigured !== true) {
    errors.push({ code: 'NOT_CONFIGURED', key: null, message: 'The activity is not marked as configured.' });
  }
  if (typeof activity?.arguments?.execute?.url !== 'string' || activity.arguments.execute.url === '') {
    errors.push({ code: 'EXECUTE_URL_MISSING', key: null, message: 'The execute endpoint is not configured.' });
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Prepares the Notification Hub payload for one execute call.
 *
 * @param {{ source: object, templates: ReadonlyArray<object> }} input - source is the verified JWT claims or the request body
 * @returns {object} the Notification Hub payload
 * @throws {ValidationError|TemplateNotFoundError}
 */
export function prepareNotification({ source, templates }) {
  const parsed = parseFlatInArguments(source?.inArguments);
  if (!parsed.ok) {
    throw new ValidationError('The runtime arguments are invalid.', parsed.errors.map(({ code, key }) => ({ code, key })));
  }

  const templateKey = parsed.values.templateKey;
  const template = templates.find((candidate) => candidate.templateKey === templateKey);
  if (!template) {
    throw new TemplateNotFoundError(templateKey);
  }
  if (parsed.values.channel !== template.channel) {
    throw new ValidationError('The runtime channel does not match the template.', [{ code: 'CHANNEL_MISMATCH', key: 'channel' }]);
  }

  const identity = [source.definitionInstanceId ?? '', source.activityId ?? '', source.contactKey ?? '', templateKey];
  const idempotencyKey = createHash('sha256').update(JSON.stringify(identity)).digest('hex');
  const correlationId = typeof source.activityId === 'string' && source.activityId !== '' ? source.activityId : randomUUID();

  const built = buildNotificationPayload({
    template,
    values: parsed.values,
    idempotencyKey,
    correlationId,
  });
  if (!built.ok) {
    throw new ValidationError('The runtime values are incomplete.', built.errors);
  }
  return built.payload;
}
