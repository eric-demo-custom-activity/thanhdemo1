/*
 * Activity UI state.
 *
 * Single source of truth for the Custom Activity screen. Components never
 * mutate state directly; they call the setters, and subscribers re-render.
 *
 * Stored data is plain and serializable: templateKey strings, { mode, value }
 * mappings, and the normalized field catalog. Raw Journey Builder metadata never
 * enters this class.
 *
 * Mapping and schema are deliberately independent:
 *   - a schema refresh never clears mappings
 *   - a mapping whose field is absent from a READY catalog is reported as stale
 *   - when the schema is not READY, mappings are kept untouched and the validator
 *     blocks save until the schema becomes available
 */

import { listMappingTargets, MAPPING_MODES } from '../domain/mappingTargets.js';
import { isSupportedChannel } from '../domain/channels.js';
import { templatesForChannel } from '../domain/channelSelection.js';
import { createFieldCatalog, findField, hasField } from '../schema/field-catalog-model.js';

export const LOAD_STATUS = Object.freeze({
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  EMPTY: 'empty',
  ERROR: 'error',
});

/** Status of entry-schema discovery. "unavailable" means no usable schema, but not a failure. */
export const SCHEMA_STATUS = Object.freeze({
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  EMPTY: 'empty',
  UNAVAILABLE: 'unavailable',
  ERROR: 'error',
});

export const STATE_EVENTS = Object.freeze({
  TEMPLATES: 'templates',
  CHANNEL: 'channel',
  SELECTION: 'selection',
  LOAD_STATUS: 'loadStatus',
  SCHEMA: 'schema',
  MAPPING: 'mapping',
  MAPPINGS: 'mappings',
  ACTIVITY: 'activity',
  ACTIVITY_STATUS: 'activityStatus',
  STEP: 'step',
  INITIALIZED: 'initialized',
  CONFIGURED: 'configured',
  ACTIVITY_LOAD_ERROR: 'activityLoadError',
});

export class ActivityState {
  #templates = [];
  #selectedTemplateKey = null;
  #selectedChannel = null;
  #loadStatus = LOAD_STATUS.IDLE;
  #loadError = null;
  /** @type {Map<string, { mode: string, value: string }>} */
  #mappings = new Map();
  #listeners = new Set();

  #originalActivityDefinition = null;
  #activityStatus = LOAD_STATUS.IDLE;
  #currentStep = 0;
  #isInitialized = false;
  #isConfigured = false;
  #activityLoadError = null;
  #missingTemplateKey = null;
  #savedEventDefinitionKey = null;

  #eventDefinitionKey = null;
  #fieldCatalog = createFieldCatalog();
  #schemaStatus = SCHEMA_STATUS.IDLE;
  #schemaWarnings = Object.freeze([]);
  #schemaError = null;

  // ---------------------------------------------------------------------------
  // Templates and selection
  // ---------------------------------------------------------------------------

  /**
   * Replaces the template catalog. Keeps the current selection only if that
   * templateKey still exists in the new list.
   *
   * @param {Array<object>} templates
   */
  setTemplates(templates) {
    this.#templates = Object.freeze([...templates]);

    if (this.#selectedTemplateKey !== null && !this.#findByKey(this.#selectedTemplateKey)) {
      this.#selectedTemplateKey = null;
      this.#mappings.clear();
    }

    this.#emit(STATE_EVENTS.TEMPLATES);
  }

  /** @returns {ReadonlyArray<object>} */
  getTemplates() {
    return this.#templates;
  }

  /**
   * Selects a template by key. Changing the template clears all mappings,
   * because mapping keys belong to the previous template.
   *
   * @param {string} templateKey
   * @throws {Error} when the key is not in the current catalog
   */
  setSelectedTemplate(templateKey) {
    if (!this.#findByKey(templateKey)) {
      throw new Error(`Unknown templateKey: ${templateKey}`);
    }
    if (this.#selectedTemplateKey === templateKey) return;

    this.#selectedTemplateKey = templateKey;
    this.#mappings.clear();
    this.#emit(STATE_EVENTS.SELECTION);
  }

  /**
   * @param {string|null} channel - channel code (SMS, CHATAPP, ZALO, BRC_ZALO), or null to clear
   * @throws {Error} on an unsupported channel code
   */
  setSelectedChannel(channel) {
    if (channel !== null && !isSupportedChannel(channel)) {
      throw new Error(`Unsupported channel: ${channel}`);
    }
    if (this.#selectedChannel === channel) return;
    this.#selectedChannel = channel;
    this.#emit(STATE_EVENTS.CHANNEL);
  }

  /** @returns {string|null} */
  getSelectedChannel() {
    return this.#selectedChannel;
  }

  /** @returns {Array<object>} templates of the selected channel (empty when no channel is selected) */
  getTemplatesForChannel() {
    return templatesForChannel(this.#templates, this.#selectedChannel);
  }

  /**
   * Clears the selected template and all mappings. Used after the designer has
   * confirmed a channel change. The channel itself is left unchanged.
   */
  clearTemplateSelection() {
    if (this.#selectedTemplateKey === null && this.#mappings.size === 0) return;
    this.#selectedTemplateKey = null;
    this.#mappings.clear();
    this.#emit(STATE_EVENTS.SELECTION);
  }

  /** @returns {object|null} */
  getSelectedTemplate() {
    return this.#findByKey(this.#selectedTemplateKey);
  }

  /**
   * Selects a template WITHOUT clearing the current mappings. Used only by the
   * load path to restore a saved configuration. User-initiated changes must go
   * through setSelectedTemplate() so the confirmation flow still applies.
   *
   * @param {string} templateKey
   * @throws {Error} when the key is not in the current catalog
   */
  restoreSelectedTemplate(templateKey) {
    if (!this.#findByKey(templateKey)) {
      throw new Error(`Unknown templateKey: ${templateKey}`);
    }
    if (this.#selectedTemplateKey === templateKey) return;
    this.#selectedTemplateKey = templateKey;
    this.#emit(STATE_EVENTS.SELECTION);
  }

  /** @param {string|null} templateKey */
  setMissingTemplateKey(templateKey) {
    this.#missingTemplateKey = templateKey ?? null;
    this.#emit(STATE_EVENTS.ACTIVITY);
  }

  /**
   * The eventDefinitionKey stored in the activity configuration when it was
   * last saved. Compared with the discovered key to detect a changed entry source.
   * @param {string|null} key
   */
  setSavedEventDefinitionKey(key) {
    this.#savedEventDefinitionKey = key ?? null;
  }

  /** @returns {string|null} */
  getSavedEventDefinitionKey() {
    return this.#savedEventDefinitionKey;
  }

  /** @returns {string|null} */
  getMissingTemplateKey() {
    return this.#missingTemplateKey;
  }

  /**
   * @param {string} status - one of LOAD_STATUS
   * @param {string|null} [errorMessage]
   */
  setLoadStatus(status, errorMessage = null) {
    this.#loadStatus = status;
    this.#loadError = status === LOAD_STATUS.ERROR ? errorMessage : null;
    this.#emit(STATE_EVENTS.LOAD_STATUS);
  }

  /** @returns {string} */
  getLoadStatus() {
    return this.#loadStatus;
  }

  /** @returns {string|null} */
  getLoadError() {
    return this.#loadError;
  }

  // ---------------------------------------------------------------------------
  // Mappings
  // ---------------------------------------------------------------------------

  /**
   * Stores (or replaces) the mapping for one target of the selected template.
   *
   * @param {string} targetKey
   * @param {{ mode: string, value: string }} mapping
   * @throws {Error} on unknown target, unsupported mode, or non-string value
   */
  setMapping(targetKey, mapping) {
    const template = this.getSelectedTemplate();
    if (!template) {
      throw new Error('Cannot set a mapping without a selected template.');
    }
    const isKnownTarget = listMappingTargets(template).some((target) => target.key === targetKey);
    if (!isKnownTarget) {
      throw new Error(`Unknown mapping target: ${targetKey}`);
    }
    if (!Object.values(MAPPING_MODES).includes(mapping?.mode)) {
      throw new Error(`Unsupported mapping mode: ${mapping?.mode}`);
    }
    if (typeof mapping.value !== 'string') {
      throw new Error('Mapping value must be a string.');
    }

    this.#mappings.set(targetKey, Object.freeze({ mode: mapping.mode, value: mapping.value }));
    this.#emit(STATE_EVENTS.MAPPING, { targetKey, mapping: this.#mappings.get(targetKey) });
  }

  /** @param {string} targetKey */
  removeMapping(targetKey) {
    if (!this.#mappings.delete(targetKey)) return;
    this.#emit(STATE_EVENTS.MAPPING, { targetKey, mapping: null });
  }

  /**
   * @returns {Readonly<Record<string, { mode: string, value: string }>>} a snapshot copy
   */
  getMappings() {
    return Object.freeze(Object.fromEntries(this.#mappings));
  }

  clearMappings() {
    if (this.#mappings.size === 0) return;
    this.#mappings.clear();
    this.#emit(STATE_EVENTS.MAPPINGS);
  }

  /**
   * Bulk-restores mappings during load. Values are assumed to be validated by
   * the loader (shape and target membership). Emits one MAPPINGS event.
   *
   * @param {Record<string, { mode: string, value: string }>} mappings
   */
  restoreMappings(mappings) {
    for (const [key, mapping] of Object.entries(mappings)) {
      this.#mappings.set(key, Object.freeze({ mode: mapping.mode, value: mapping.value }));
    }
    this.#emit(STATE_EVENTS.MAPPINGS);
  }

  /**
   * Field-mode mappings whose field is absent from a READY catalog. These are
   * stale: the saved value is kept for review, and save stays blocked.
   * While the schema is not READY nothing can be judged stale, so the list is empty.
   *
   * @returns {Array<{ targetKey: string, value: string }>}
   */
  getMissingMappedFields() {
    if (this.#schemaStatus !== SCHEMA_STATUS.READY) return [];

    return [...this.#mappings.entries()]
      .filter(([, mapping]) => mapping.mode === MAPPING_MODES.FIELD && mapping.value !== '')
      .filter(([, mapping]) => !hasField(this.#fieldCatalog, mapping.value))
      .map(([targetKey, mapping]) => ({ targetKey, value: mapping.value }));
  }

  // ---------------------------------------------------------------------------
  // Entry schema
  // ---------------------------------------------------------------------------

  /**
   * Applies one discovery result. Replaces the catalog, status, warnings and
   * error. Mappings are preserved so stale ones can be reviewed.
   *
   * @param {{ valid: boolean, eventDefinitionKey: string|null, fields: object[], warnings: object[], error: object|null }} result
   */
  setEntrySchemaResult(result) {
    const key = result.eventDefinitionKey ?? null;
    this.#eventDefinitionKey = key;

    if (result.valid && result.fields.length > 0) {
      this.#fieldCatalog = createFieldCatalog({ eventDefinitionKey: key, fields: result.fields });
      this.#schemaStatus = SCHEMA_STATUS.READY;
    } else {
      this.#fieldCatalog = createFieldCatalog({ eventDefinitionKey: key, fields: [] });
      this.#schemaStatus = statusForFailure(result.error?.code);
    }

    this.#schemaWarnings = Object.freeze([...(result.warnings ?? [])]);
    this.#schemaError = result.error ?? null;
    this.#emit(STATE_EVENTS.SCHEMA, { status: this.#schemaStatus });
  }

  /** @param {string} status - one of SCHEMA_STATUS */
  setSchemaStatus(status) {
    this.#schemaStatus = status;
    this.#emit(STATE_EVENTS.SCHEMA, { status });
  }

  /**
   * Records a failure that happens before discovery can run (for example, the
   * Journey Builder SDK is missing). Clears the catalog; mappings are kept.
   *
   * @param {{ code: string, message: string }} error
   */
  setSchemaFailure(error) {
    this.#eventDefinitionKey = null;
    this.#fieldCatalog = createFieldCatalog();
    this.#schemaWarnings = Object.freeze([]);
    this.#schemaError = error;
    this.#schemaStatus = SCHEMA_STATUS.ERROR;
    this.#emit(STATE_EVENTS.SCHEMA, { status: this.#schemaStatus });
  }

  /** @returns {string} */
  getSchemaStatus() {
    return this.#schemaStatus;
  }

  /** @returns {ReadonlyArray<object>} */
  getSchemaWarnings() {
    return this.#schemaWarnings;
  }

  /** @returns {{ code: string, message: string }|null} */
  getSchemaError() {
    return this.#schemaError;
  }

  /** @returns {string|null} the Journey entry event definition key */
  getEventDefinitionKey() {
    return this.#eventDefinitionKey;
  }

  /** @returns {Readonly<{ eventDefinitionKey: string|null, sourceType: string, fields: ReadonlyArray<object> }>} */
  getFieldCatalog() {
    return this.#fieldCatalog;
  }

  /** @returns {ReadonlyArray<object>} */
  getAvailableFields() {
    return this.#fieldCatalog.fields;
  }

  /** @param {string} fieldId @returns {object|null} */
  getFieldById(fieldId) {
    return findField(this.#fieldCatalog, fieldId);
  }

  /** @param {string} fieldId @returns {boolean} */
  hasField(fieldId) {
    return hasField(this.#fieldCatalog, fieldId);
  }

  // ---------------------------------------------------------------------------
  // Journey Builder lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Stores the activity definition from initActivity. Kept by reference and
   * never mutated; the saver clones it before merging.
   *
   * @param {object|null} activity
   */
  setOriginalActivityDefinition(activity) {
    this.#originalActivityDefinition = activity ?? null;
    this.#emit(STATE_EVENTS.ACTIVITY);
  }

  /** @returns {object|null} */
  getOriginalActivityDefinition() {
    return this.#originalActivityDefinition;
  }

  /** @param {string} status - one of LOAD_STATUS */
  setActivityStatus(status) {
    this.#activityStatus = status;
    this.#emit(STATE_EVENTS.ACTIVITY_STATUS, { status });
  }

  /** @returns {string} */
  getActivityStatus() {
    return this.#activityStatus;
  }

  /** @param {number} step */
  setCurrentStep(step) {
    if (this.#currentStep === step) return;
    this.#currentStep = step;
    this.#emit(STATE_EVENTS.STEP);
  }

  /** @returns {number} */
  getCurrentStep() {
    return this.#currentStep;
  }

  /** @param {boolean} value */
  setInitialized(value) {
    if (this.#isInitialized === value) return;
    this.#isInitialized = value;
    this.#emit(STATE_EVENTS.INITIALIZED);
  }

  /** @returns {boolean} */
  isInitialized() {
    return this.#isInitialized;
  }

  /** @param {boolean} value */
  setConfigured(value) {
    if (this.#isConfigured === value) return;
    this.#isConfigured = value;
    this.#emit(STATE_EVENTS.CONFIGURED);
  }

  /** @returns {boolean} */
  isConfigured() {
    return this.#isConfigured;
  }

  /** @param {string|null} message */
  setActivityLoadError(message) {
    this.#activityLoadError = message ?? null;
    this.#emit(STATE_EVENTS.ACTIVITY_LOAD_ERROR);
  }

  /** @returns {string|null} */
  getActivityLoadError() {
    return this.#activityLoadError;
  }

  /**
   * Initialization status of the three asynchronous inputs of the editor.
   * The editor is fully ready only when every part is "ready".
   *
   * @returns {Readonly<{ templates: { status: string }, activity: { status: string }, entrySchema: { status: string } }>}
   */
  getInitStatus() {
    return Object.freeze({
      templates: Object.freeze({ status: this.#loadStatus }),
      activity: Object.freeze({ status: this.#activityStatus }),
      entrySchema: Object.freeze({ status: this.#schemaStatus }),
    });
  }

  /** @returns {boolean} */
  isMappingEditorFullyReady() {
    return (
      this.#loadStatus === LOAD_STATUS.READY &&
      this.#activityStatus === LOAD_STATUS.READY &&
      this.#schemaStatus === SCHEMA_STATUS.READY
    );
  }

  /**
   * Serializes the editor configuration exactly as stored inside the activity
   * definition (arguments.execute.configurationArguments).
   *
   * @returns {object|null} null when no template is selected
   */
  getSerializableConfiguration() {
    const template = this.getSelectedTemplate();
    if (!template) return null;
    return {
      templateKey: template.templateKey,
      templateVersion: template.version ?? 1,
      channel: this.#selectedChannel ?? template.channel,
      eventDefinitionKey: this.#eventDefinitionKey,
      mappings: this.getMappings(),
    };
  }

  /**
   * Registers a change listener.
   *
   * @param {(event: { type: string, [key: string]: unknown }, state: ActivityState) => void} listener
   * @returns {() => void} unsubscribe function
   */
  subscribe(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #findByKey(templateKey) {
    if (templateKey === null) return null;
    return this.#templates.find((template) => template.templateKey === templateKey) ?? null;
  }

  #emit(type, detail = {}) {
    for (const listener of this.#listeners) {
      listener({ type, ...detail }, this);
    }
  }
}

/** A malformed definition is an error (recoverable with Retry); a missing schema or key is "unavailable". */
function statusForFailure(code) {
  return code === 'INVALID_EVENT_DEFINITION' ? SCHEMA_STATUS.ERROR : SCHEMA_STATUS.UNAVAILABLE;
}
