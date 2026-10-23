/*
 * Activity loader.
 *
 * Transfers the activity definition delivered by Journey Builder
 * (initActivity) into ActivityState:
 *
 *   - NEW activity            no saved configurationArguments -> empty mappings,
 *                             first template preselected, isConfigured stays false
 *   - RESTORED activity       saved configurationArguments -> template and
 *                             mappings restored, isConfigured restored
 *   - MISSING_TEMPLATE        saved templateKey is not in the catalog -> no
 *                             automatic replacement, no mapping restore
 *   - MALFORMED               saved configuration is unusable -> recoverable error
 *
 * The original activity object is preserved by reference in state and is
 * never mutated here. Unknown Journey Builder properties are therefore never
 * discarded: the saver merges into a clone of this same object.
 */

import { listMappingTargets, MAPPING_MODES } from './domain/mappingTargets.js';
import { toChannelCode } from './domain/channels.js';
import * as editorState from './shared/editor-state-adapter.js';

export const ACTIVITY_LOAD_STATUS = Object.freeze({
  NEW: 'new',
  RESTORED: 'restored',
  MISSING_TEMPLATE: 'missing-template',
  MALFORMED: 'malformed',
});

/**
 * @typedef {{ code: string, message: string, targetKey?: string, templateKey?: string }} LoadNotice
 * @typedef {{ status: string, warnings: LoadNotice[], errors: LoadNotice[] }} LoadResult
 */

/**
 * Reads the editor configuration from an activity definition.
 *
 * Configuration lives under arguments.execute.configurationArguments so it is
 * stored inside the Journey Builder activity definition, separated from the
 * resolved runtime inArguments.
 *
 * @param {object|null} activity
 * @returns {object|null}
 */
export function extractConfiguration(activity) {
  return editorState.read(activity);
}

/**
 * Hydrates ActivityState from the activity definition and the loaded template
 * catalog. Safe to call with any shape of activity: malformed input produces
 * a recoverable error, never a crash.
 *
 * @param {object} input
 * @param {import('./state/activityState.js').ActivityState} input.state
 * @param {object|null} input.activity - from initActivity
 * @param {ReadonlyArray<object>} input.templates - from GET /api/templates
 * @returns {LoadResult}
 */
export function loadActivityIntoState({ state, activity, templates }) {
  const warnings = [];
  const errors = [];

  state.setOriginalActivityDefinition(activity ?? null);
  state.setMissingTemplateKey(null);
  state.setActivityLoadError(null);

  const isConfigured = activity?.metaData?.isConfigured === true;
  state.setConfigured(isConfigured);

  const configuration = extractConfiguration(activity);

  if (!configuration) {
    resetSelection(state);
    return { status: ACTIVITY_LOAD_STATUS.NEW, warnings, errors };
  }

  if (!isUsableConfiguration(configuration)) {
    errors.push({
      code: 'MALFORMED_CONFIGURATION',
      message: 'The saved activity configuration is malformed. The activity was treated as new.',
    });
    resetSelection(state);
    return { status: ACTIVITY_LOAD_STATUS.MALFORMED, warnings, errors };
  }

  const template = templates.find((candidate) => candidate.templateKey === configuration.templateKey) ?? null;

  if (!template) {
    warnings.push({
      code: 'MISSING_TEMPLATE',
      templateKey: configuration.templateKey,
      message: `The saved template "${configuration.templateKey}" no longer exists. Choose a replacement template.`,
    });
    state.setSelectedChannel(toChannelCode(configuration.channel));
    state.setMissingTemplateKey(configuration.templateKey);
    return { status: ACTIVITY_LOAD_STATUS.MISSING_TEMPLATE, warnings, errors };
  }

  const savedChannel = toChannelCode(configuration.channel);
  if (savedChannel !== null && savedChannel !== template.channel) {
    warnings.push({
      code: 'CHANNEL_MISMATCH',
      templateKey: template.templateKey,
      message: 'The saved channel does not match the saved template. The template channel was used.',
    });
  }
  state.setSelectedChannel(template.channel);
  state.setSavedEventDefinitionKey(
    typeof configuration.eventDefinitionKey === 'string' ? configuration.eventDefinitionKey : null
  );
  state.restoreSelectedTemplate(template.templateKey);

  const restored = restoreMappings(state, template, configuration.mappings, warnings);

  if (restored) {
    state.setConfigured(isConfigured);
  }

  return { status: ACTIVITY_LOAD_STATUS.RESTORED, warnings, errors };
}

/**
 * Restores saved mappings into state, skipping entries that are malformed,
 * use an unsupported mode, or point at a target the restored template does
 * not define. Skipped entries become warnings so nothing is lost silently.
 *
 * @param {import('./state/activityState.js').ActivityState} state
 * @param {object} template
 * @param {unknown} mappings
 * @param {LoadNotice[]} warnings
 * @returns {boolean} true when the configuration was usable
 */
function restoreMappings(state, template, mappings, warnings) {
  if (mappings === undefined || mappings === null) {
    return true;
  }
  if (typeof mappings !== 'object' || Array.isArray(mappings)) {
    warnings.push({ code: 'MALFORMED_MAPPINGS', message: 'The saved mappings are malformed and were not restored.' });
    return false;
  }

  const knownTargets = new Set(listMappingTargets(template).map((target) => target.key));
  const clean = {};

  for (const [targetKey, mapping] of Object.entries(mappings)) {
    if (!mapping || typeof mapping !== 'object') {
      warnings.push({
        code: 'SKIPPED_MAPPING',
        targetKey,
        message: `The saved mapping for "${targetKey}" is malformed and was skipped.`,
      });
      continue;
    }
    if (!Object.values(MAPPING_MODES).includes(mapping.mode) || typeof mapping.value !== 'string') {
      warnings.push({
        code: 'UNSUPPORTED_MODE',
        targetKey,
        message: `The saved mapping for "${targetKey}" uses an unsupported mode and was skipped.`,
      });
      continue;
    }
    if (!knownTargets.has(targetKey)) {
      warnings.push({
        code: 'UNKNOWN_TARGET',
        targetKey,
        message: `The saved mapping for "${targetKey}" is not a target of the restored template and was skipped.`,
      });
      continue;
    }
    clean[targetKey] = { mode: mapping.mode, value: mapping.value };
  }

  state.restoreMappings(clean);
  return true;
}

function isUsableConfiguration(configuration) {
  return (
    typeof configuration === 'object' &&
    !Array.isArray(configuration) &&
    typeof configuration.templateKey === 'string' &&
    configuration.templateKey.length > 0
  );
}

/**
 * New activities start without a channel or template. The designer chooses
 * both; nothing is preselected.
 */
function resetSelection(state) {
  state.setSelectedChannel(null);
}