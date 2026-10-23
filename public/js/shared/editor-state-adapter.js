/*
 * Editor-state adapter (shared).
 *
 * The ONLY module that knows where editor state is stored in the activity
 * definition. Storage path: metaData.customActivityConfig.
 *
 * Why metaData: the activity-level configurationArguments object is reserved for
 * lifecycle endpoint definitions (save, validate, publish, stop). Overwriting it
 * would break the activity. Storage under metaData is documented as UNVERIFIED
 * until the live round-trip gate (save, close, reopen) passes.
 *
 * All functions are pure: they never mutate their input.
 */

export const EDITOR_STATE_KEY = 'customActivityConfig';

/**
 * @param {object|null} activity
 * @returns {object|null} the stored editor state, or null when none is stored or it is malformed
 */
export function read(activity) {
  const state = activity?.metaData?.[EDITOR_STATE_KEY];
  if (state === null || typeof state !== 'object' || Array.isArray(state)) return null;
  if (typeof state.templateKey !== 'string' || typeof state.channel !== 'string') return null;
  if (state.mappings !== undefined && (state.mappings === null || typeof state.mappings !== 'object' || Array.isArray(state.mappings))) {
    return null;
  }
  return state;
}

/**
 * Returns a copy of the activity with the editor state stored. Every other
 * property is preserved.
 *
 * @param {object} activity
 * @param {object} editorState
 * @returns {object}
 */
export function write(activity, editorState) {
  const copy = cloneJson(activity ?? {});
  copy.metaData = { ...(copy.metaData ?? {}), [EDITOR_STATE_KEY]: cloneJson(editorState) };
  return copy;
}

/**
 * @param {object|null} activity
 * @returns {boolean}
 */
export function hasConfiguration(activity) {
  return read(activity) !== null;
}

/**
 * Returns a copy of the activity without the editor state.
 *
 * @param {object} activity
 * @returns {object}
 */
export function remove(activity) {
  const copy = cloneJson(activity ?? {});
  if (copy.metaData) {
    delete copy.metaData[EDITOR_STATE_KEY];
  }
  return copy;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}
