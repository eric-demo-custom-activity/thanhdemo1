/*
 * Test helper: builds an activity definition with stored editor state, using the
 * same adapter the application uses. Keeps fixtures aligned with the storage path.
 */

import * as editorState from '../../public/js/shared/editor-state-adapter.js';

/**
 * @param {object} configuration - editor state (channel, templateKey, mappings, ...)
 * @param {{ isConfigured?: boolean, base?: object }} [options]
 * @returns {object}
 */
export function storedActivity(configuration, { isConfigured = true, base = {} } = {}) {
  return editorState.write(
    { ...base, metaData: { ...(base.metaData ?? {}), isConfigured } },
    configuration
  );
}
