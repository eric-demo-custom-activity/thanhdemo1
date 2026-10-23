/*
 * Activity saver (browser).
 *
 * Builds the activity definition sent back to Journey Builder through updateActivity.
 *
 * Processing order:
 *   1. validate the selection (channel and template required)
 *   2. validate the mapping (errors block save, warnings do not)
 *   3. build the flat inArguments (flat-inarguments-builder.js)
 *   4. store the editor state through editor-state-adapter.js
 *   5. merge inArguments, editor state and metaData.isConfigured into a clone
 *
 * Every other activity property (url, timeout, retryCount, lifecycle
 * configurationArguments, ...) is preserved. The original object is never mutated.
 */

import { validateMappings } from './domain/mappingValidator.js';
import { validateSelection } from './domain/selectionValidator.js';
import { buildFlatInArguments } from './flat-inarguments-builder.js';
import * as editorState from './shared/editor-state-adapter.js';

export const SAVE_ERROR_CODES = Object.freeze({
  NO_TEMPLATE: 'NO_TEMPLATE',
  CHANNEL_MISSING: 'CHANNEL_MISSING',
  EVENT_DEFINITION_KEY_MISSING: 'EVENT_DEFINITION_KEY_MISSING',
  IN_ARGUMENTS_BUILD_FAILED: 'IN_ARGUMENTS_BUILD_FAILED',
});

/**
 * @param {object} input
 * @param {import('./state/activityState.js').ActivityState} input.state
 * @param {object|null} input.activity - the original activity definition
 * @param {string|null} [input.eventDefinitionKey]
 * @returns {{ ok: true, activity: object, inArguments: object[], configuration: object, warnings: object[] }
 *   | { ok: false, activity: null, errors: object[], warnings: object[] }}
 */
export function buildUpdatedActivity({ state, activity, eventDefinitionKey = state.getEventDefinitionKey() }) {
  const template = state.getSelectedTemplate();
  const channel = state.getSelectedChannel();
  const mappings = state.getMappings();
  const fieldCatalog = state.getFieldCatalog();

  const selection = validateSelection({ channel, template });
  if (!selection.valid) {
    return { ok: false, activity: null, errors: selection.errors, warnings: [] };
  }

  const validation = validateMappings({ template, mappings, fieldCatalog, eventDefinitionKey });
  if (!validation.valid) {
    return { ok: false, activity: null, errors: validation.errors, warnings: validation.warnings };
  }

  const built = buildFlatInArguments({ template, mappings, fieldCatalog, eventDefinitionKey });
  if (!built.ok) {
    return { ok: false, activity: null, errors: built.errors, warnings: validation.warnings };
  }

  const configuration = state.getSerializableConfiguration();
  const execute = { ...(activity?.arguments?.execute ?? {}), inArguments: built.inArguments };
  const withArguments = {
    ...(activity ?? {}),
    arguments: { ...(activity?.arguments ?? {}), execute },
  };
  const updated = editorState.write(
    { ...withArguments, metaData: { ...(withArguments.metaData ?? {}), isConfigured: true } },
    configuration
  );

  return {
    ok: true,
    activity: updated,
    inArguments: built.inArguments,
    configuration,
    warnings: validation.warnings,
  };
}
