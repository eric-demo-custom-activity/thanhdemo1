/*
 * Custom Activity UI entry point.
 *
 * Journey Builder lifecycle:
 *   1. create the bridge (real Postmonger session, or the standalone adapter
 *      in standalone mode) and the entry-schema provider, BEFORE initialize()
 *   2. load templates and wait for initActivity (promises, no arbitrary timeouts)
 *   3. hydrate ActivityState (channel, template, mappings, event key)
 *   4. discover the Journey entry schema
 *   5. render from state; Next/Done is enabled only when the channel, the
 *      template and every required mapping are valid and no discovery is running
 *   6. on Next/Done: validate, build inArguments, updateActivity, nextStep
 *
 * Channel flow:
 *   channel chosen -> templates of that channel shown -> one template is selected
 *   automatically, several are offered -> fields auto-matched by name.
 *   A channel change that would clear mappings asks first; Cancel restores the
 *   previous channel.
 *
 * Embedded in Journey Builder, the page never falls back to the standalone
 * fixture. If the SDK is missing, the schema status shows an error instead.
 */

import { TemplateApi, TemplateApiError } from './services/templateApi.js';
import { ActivityState, LOAD_STATUS, SCHEMA_STATUS } from './state/activityState.js';
import { validateMappings, getStaleErrors } from './domain/mappingValidator.js';
import { validateSelection } from './domain/selectionValidator.js';
import { planChannelChange, planTemplateAfterChannelChange } from './domain/channelSelection.js';
import { channelLabel } from './domain/channels.js';
import { MAPPING_MODES } from './domain/mappingTargets.js';
import { suggestFieldMappings } from './domain/fieldMatching.js';
import { PostmongerClient } from './postmonger-client.js';
import { StandaloneAdapter } from './standalone-adapter.js';
import { EntrySchemaProvider } from './schema/entry-schema-provider.js';
import { loadActivityIntoState, ACTIVITY_LOAD_STATUS } from './activity-loader.js';
import { buildUpdatedActivity } from './activity-saver.js';
import { ChannelSelector } from './ui/channelSelector.js';
import { TemplateDropdown } from './ui/templateDropdown.js';
import { TemplateDetails } from './ui/templateDetails.js';
import { MappingSection } from './ui/mappingSection.js';
import { MappingSummary } from './ui/mappingSummary.js';
import { ValidationPanel } from './ui/validationPanel.js';
import { TemplateChangeDialog } from './ui/templateChangeDialog.js';
import { SchemaStatusPanel } from './ui/schemaStatusPanel.js';

const log = (tag, message) => console.info(`[${tag}] ${message}`);

const QUERY = new URLSearchParams(window.location.search);

/**
 * Standalone mode: explicit ?standalone=true, or the page is not embedded in an
 * iframe. Journey Builder always embeds the activity, so a top-level page can
 * never be a real session.
 */
const EMBEDDED_IN_IFRAME = window.self !== window.top;
const STANDALONE = QUERY.get('standalone') === 'true' || !EMBEDDED_IN_IFRAME;

/** Development-only structural logging of the schema responses (?debugSchema=true). */
const DEBUG_SCHEMA = QUERY.get('debugSchema') === 'true';

function requireElement(id) {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing required element #${id}`);
  }
  return element;
}

/**
 * @returns {{ bridge: PostmongerClient|StandaloneAdapter|null, failure: string|null }}
 */
function createBridge() {
  if (STANDALONE) {
    return { bridge: new StandaloneAdapter(), failure: null };
  }
  try {
    return { bridge: new PostmongerClient(), failure: null };
  } catch (error) {
    console.error(`[Postmonger] ${error.message}`);
    return { bridge: null, failure: error.message };
  }
}

function bootstrap() {
  const state = new ActivityState();
  const templateApi = new TemplateApi();
  const { bridge, failure: bridgeFailure } = createBridge();

  // Created before bridge.initialize(): the provider registers its response listener in its constructor.
  const provider = bridge ? new EntrySchemaProvider({ bridge, debug: DEBUG_SCHEMA }) : null;

  const channelSelector = new ChannelSelector({
    select: requireElement('channel-select'),
    onChange: (channelCode) => requestChannelChange(channelCode),
  });
  const channelDialog = new TemplateChangeDialog({
    dialog: requireElement('channel-change-dialog'),
    cancelButton: requireElement('channel-change-cancel'),
    continueButton: requireElement('channel-change-continue'),
  });
  const dropdown = new TemplateDropdown({
    select: requireElement('template-select'),
    status: requireElement('template-status'),
    onChange: (templateKey) => requestTemplateChange(templateKey),
    onRetry: () => loadTemplates(),
  });
  const schemaPanel = new SchemaStatusPanel({
    container: requireElement('schema-status'),
    onRetry: () => discoverSchema(),
  });
  const details = new TemplateDetails({ container: requireElement('template-details') });
  const mappingSection = new MappingSection({
    container: requireElement('mapping-targets'),
    onChange: (targetKey, mapping) => handleMappingChange(targetKey, mapping),
  });
  const summary = new MappingSummary({ container: requireElement('mapping-summary') });
  const validation = new ValidationPanel({ container: requireElement('validation-panel') });
  const templateDialog = new TemplateChangeDialog({
    dialog: requireElement('template-change-dialog'),
    cancelButton: requireElement('template-change-cancel'),
    continueButton: requireElement('template-change-continue'),
  });

  const activityStatusRegion = requireElement('activity-status');
  const standaloneBar = requireElement('standalone-bar');
  const standaloneOutput = requireElement('standalone-output');

  // Render bookkeeping: avoid rebuilding DOM that did not change.
  let renderedTemplateList = null;
  let renderedTemplate = null;
  let lastValidationSignature = null;
  let lastButtonState = null;

  // Lifecycle bookkeeping.
  let bridgeReady = false;
  let resolveActivity = null;
  let loadResult = null;
  let lastStep = null;
  let hasStepInfo = false;
  let saving = false;
  // Automatic name matching runs for new activities and after a user template selection.
  let autoMatchPending = false;
  let entrySourceChanged = false;

  function renderFromState() {
    const readiness = computeSaveReadiness();
    renderSchemaPanel();
    channelSelector.setSelected(state.getSelectedChannel());

    const loadStatus = state.getLoadStatus();
    if (loadStatus !== LOAD_STATUS.READY) {
      renderNotReady(loadStatus);
      renderActivityStatus();
      updateButtons(readiness);
      return;
    }

    renderTemplateDropdown();

    const selected = state.getSelectedTemplate();
    if (!selected) {
      renderedTemplate = null;
      details.showPlaceholder('Select a template to see its details.');
      mappingSection.showPlaceholder('Select a template to see its mapping targets.');
      summary.render({ template: null, mappings: {} });
      validation.render(readiness.validation);
      renderActivityStatus();
      updateButtons(readiness);
      return;
    }

    dropdown.setSelected(selected.templateKey);

    if (selected !== renderedTemplate) {
      details.render(selected);
      mappingSection.render({ template: selected });
      renderedTemplate = selected;
      log('TemplateUI', `Rendered: ${selected.displayName}`);
    }

    const catalog = state.getFieldCatalog();
    const mappings = state.getMappings();
    const fieldsEnabled = state.getSchemaStatus() === SCHEMA_STATUS.READY && catalog.fields.length > 0;
    const staleTargets = new Set(getStaleErrors(readiness.validation).map((item) => item.targetKey));

    mappingSection.update({
      mappings,
      errorsByTarget: indexErrors(readiness.validation),
      warningsByTarget: indexWarnings(readiness.validation),
      staleTargets,
      fields: catalog.fields,
      fieldsEnabled,
    });
    summary.render({ template: selected, mappings });
    validation.render(readiness.validation);
    logValidation(readiness.validation);

    renderActivityStatus();
    updateButtons(readiness);
  }

  /** Shows the templates of the selected channel. Nothing is shown until a channel is chosen. */
  function renderTemplateDropdown() {
    const channel = state.getSelectedChannel();
    if (!channel) {
      renderedTemplateList = null;
      dropdown.showDisabled('Select a channel first');
      return;
    }

    const templates = state.getTemplatesForChannel();
    if (templates.length === 0) {
      renderedTemplateList = null;
      dropdown.showEmpty();
      return;
    }

    const signature = `${channel}|${templates.map((t) => t.templateKey).join(',')}`;
    if (signature !== renderedTemplateList) {
      dropdown.renderOptions(templates);
      renderedTemplateList = signature;
    }
  }

  function renderNotReady(status) {
    renderedTemplateList = null;
    renderedTemplate = null;
    lastValidationSignature = null;

    const loading = status === LOAD_STATUS.LOADING || status === LOAD_STATUS.IDLE;

    if (status === LOAD_STATUS.ERROR) {
      dropdown.showError();
    } else if (status === LOAD_STATUS.EMPTY) {
      dropdown.showEmpty();
    } else {
      dropdown.showLoading();
    }

    details.showPlaceholder(loading ? 'Loading template details...' : 'No template details to show.');
    mappingSection.showPlaceholder(loading ? 'Loading mapping targets...' : 'No mapping targets to show.');
    summary.render({ template: null, mappings: {} });
    validation.showPlaceholder(loading ? 'Validation runs once a channel and template are selected.' : 'No template to validate.');
  }

  /** Renders the Journey entry schema status. Raw metadata is never shown. */
  function renderSchemaPanel() {
    schemaPanel.render({
      status: state.getSchemaStatus(),
      eventDefinitionKey: state.getEventDefinitionKey(),
      fieldCount: state.getAvailableFields().length,
      warningCount: state.getSchemaWarnings().length,
      error: state.getSchemaError(),
      staleCount: state.getMissingMappedFields().length,
      standalone: bridge?.isStandalone === true,
    });
  }

  /** Renders load warnings and errors (missing template, malformed config, ...). */
  function renderActivityStatus() {
    const notices = [];
    if (loadResult) {
      notices.push(...loadResult.warnings, ...loadResult.errors);
    }
    if (bridgeFailure) {
      notices.push({
        code: 'BRIDGE_UNAVAILABLE',
        message: 'Journey Builder connection is unavailable. Templates load, but the activity cannot be saved.',
        kind: 'error',
      });
    }
    if (state.getMissingTemplateKey() && state.getSelectedTemplate()) {
      notices.push({
        code: 'REPLACEMENT_SELECTED',
        message: `Replacement template selected: ${state.getSelectedTemplate().displayName}.`,
        kind: 'info',
      });
    }
    if (entrySourceChanged) {
      notices.push({
        code: 'ENTRY_SOURCE_CHANGED',
        message: 'The Journey entry source changed since this activity was saved. Review the field mappings.',
        kind: 'warning',
      });
    }

    if (notices.length === 0) {
      activityStatusRegion.replaceChildren();
      activityStatusRegion.hidden = true;
      return;
    }

    const list = document.createElement('ul');
    list.className = 'notice-list';
    for (const notice of notices) {
      const item = document.createElement('li');
      item.className = `notice notice--${notice.kind ?? (notice.code === 'MISSING_TEMPLATE' ? 'warning' : 'error')}`;
      item.textContent = notice.message;
      list.append(item);
    }

    activityStatusRegion.replaceChildren(list);
    activityStatusRegion.hidden = false;
  }

  // -------------------------------------------------------------------------
  // Channel selection
  // -------------------------------------------------------------------------

  /** The designer picked a channel. Confirms before clearing mappings. */
  async function requestChannelChange(requestedChannel) {
    const current = state.getSelectedChannel();
    const hasMappings = Object.keys(state.getMappings()).length > 0;
    const plan = planChannelChange({ currentChannel: current, requestedChannel, hasMappings });

    if (plan.action === 'noop') return;

    if (plan.action === 'confirm') {
      const confirmed = await channelDialog.requestConfirmation();
      if (!confirmed) {
        channelSelector.setSelected(current);
        log('Channel', `Change cancelled; kept ${channelLabel(current) || 'no channel'}`);
        return;
      }
    }

    applyChannel(requestedChannel, { clearedMappings: hasMappings });
  }

  /**
   * Applies a channel: clears the template and mappings, then selects a template
   * automatically when the channel has exactly one.
   */
  function applyChannel(channelCode, { clearedMappings = false } = {}) {
    log('Channel', `Selected: ${channelLabel(channelCode)}`);
    if (clearedMappings) {
      log('Mapping', 'Cleared: channel changed');
    }

    state.clearTemplateSelection();
    state.setSelectedChannel(channelCode);
    state.setMissingTemplateKey(null);

    const next = planTemplateAfterChannelChange(state.getTemplates(), channelCode);
    if (next.action === 'autoSelect') {
      const template = state.getTemplates().find((t) => t.templateKey === next.templateKey);
      log('TemplateUI', `Auto-selected the only template for ${channelLabel(channelCode)}: ${template.displayName}`);
      selectTemplate(next.templateKey);
    } else if (next.action === 'empty') {
      log('TemplateUI', `No templates for ${channelLabel(channelCode)}`);
    }
  }

  // -------------------------------------------------------------------------
  // Template selection
  // -------------------------------------------------------------------------

  /** User picked a template in the dropdown. */
  async function requestTemplateChange(templateKey) {
    const current = state.getSelectedTemplate();
    if (current && current.templateKey === templateKey) return;

    const hasMappings = Object.keys(state.getMappings()).length > 0;
    if (hasMappings) {
      const confirmed = await templateDialog.requestConfirmation();
      if (!confirmed) {
        if (current) dropdown.setSelected(current.templateKey);
        log('TemplateUI', 'Template change cancelled');
        return;
      }
    }

    selectTemplate(templateKey, { clearedMappings: hasMappings });
  }

  function selectTemplate(templateKey, { clearedMappings = false } = {}) {
    const candidate = state.getTemplates().find((template) => template.templateKey === templateKey);
    if (!candidate) {
      console.error(`[TemplateUI] Unknown templateKey: ${templateKey}`);
      return;
    }

    // Logged before the state change: subscribers render synchronously inside setSelectedTemplate().
    log('TemplateUI', `Selected: ${candidate.displayName}`);
    if (clearedMappings) {
      log('Mapping', 'Cleared: template changed');
    }
    state.setSelectedTemplate(templateKey);
    state.setMissingTemplateKey(null);
    autoMatchPending = true;
    applyAutoMatching();
  }

  /**
   * Preselects Data Extension fields whose names match the template targets.
   * Only targets without a mapping are touched. Runs once per template selection,
   * as soon as the entry schema is ready. Restored activities are not re-matched.
   */
  function applyAutoMatching() {
    if (!autoMatchPending || state.getSchemaStatus() !== SCHEMA_STATUS.READY) return;
    const template = state.getSelectedTemplate();
    if (!template) return;

    autoMatchPending = false;
    const suggestions = suggestFieldMappings({
      template,
      fields: state.getAvailableFields(),
      mappings: state.getMappings(),
    });
    const entries = Object.entries(suggestions);

    if (entries.length === 0) {
      log('Mapping', 'No automatic field matches; choose fields manually');
      return;
    }

    state.restoreMappings(suggestions);
    for (const [targetKey, mapping] of entries) {
      log('Mapping', `Auto-matched: ${targetKey} => ${mapping.value}`);
    }
  }

  /** A mapping row reported a change (mapping === null means the row was cleared). */
  function handleMappingChange(targetKey, mapping) {
    if (mapping === null) {
      state.removeMapping(targetKey);
      log('Mapping', `Field Removed: ${targetKey}`);
      return;
    }

    state.setMapping(targetKey, mapping);
    log('Mapping', `Field Updated: ${targetKey} => ${describeMapping(mapping)}`);
  }

  async function loadTemplates() {
    state.setLoadStatus(LOAD_STATUS.LOADING);

    // Only the request is guarded. Errors thrown while rendering must not be
    // reported as "Unable to load templates".
    let templates;
    try {
      templates = await templateApi.getTemplates();
    } catch (error) {
      const kind = error instanceof TemplateApiError ? error.kind : 'unknown';
      console.error(`[TemplateUI] Failed to load templates (${kind}): ${error.message}`);
      state.setLoadStatus(LOAD_STATUS.ERROR, error.message);
      return;
    }

    state.setTemplates(templates);
    log('TemplateUI', `Loaded ${templates.length} templates`);

    if (templates.length === 0) {
      state.setLoadStatus(LOAD_STATUS.EMPTY);
      return;
    }

    state.setLoadStatus(LOAD_STATUS.READY);
  }

  // -------------------------------------------------------------------------
  // Journey Builder lifecycle
  // -------------------------------------------------------------------------

  /** initActivity arrived from Journey Builder (or the standalone fixture). */
  function handleInitActivity(activity) {
    log('ActivityLoad', 'Activity definition received');
    resolveActivity?.(activity ?? {});
  }

  function handleGotoStep(step, nextStep) {
    state.setCurrentStep(typeof step === 'number' ? step : 0);
    lastStep = nextStep ?? null;
    hasStepInfo = true;
    renderFromState();
  }

  function handleBack() {
    bridge.previousStep();
  }

  /** Next / Done clicked in Journey Builder. */
  function handleNext() {
    if (saving) return;
    saving = true;
    try {
      const readiness = computeSaveReadiness();

      if (!readiness.ready) {
        log('ActivitySave', `Save blocked: ${readiness.validation.errors.length} validation error(s)`);
        renderFromState();
        focusFirstInvalid(readiness.validation);
        return;
      }

      const result = buildUpdatedActivity({
        state,
        activity: state.getOriginalActivityDefinition(),
        eventDefinitionKey: state.getEventDefinitionKey(),
      });

      if (!result.ok) {
        log('ActivitySave', `Save blocked: ${result.errors.length} validation error(s)`);
        renderFromState();
        focusFirstInvalid({ errors: result.errors });
        return;
      }

      log('ActivitySave', 'Configuration validated');
      bridge.updateActivity(result.activity);
      log('ActivitySave', 'Activity definition updated');
      if (bridge.isStandalone) {
        renderStandaloneOutput(result.activity);
      }
      bridge.nextStep();
    } finally {
      saving = false;
    }
  }

  /** Discovers the entry schema. Concurrent calls (including Retry) share one request. */
  async function discoverSchema() {
    if (!provider) {
      state.setSchemaFailure({
        code: 'POSTMONGER_UNAVAILABLE',
        message: 'The Journey Builder connection is unavailable, so entry fields cannot be read.',
      });
      return;
    }

    state.setSchemaStatus(SCHEMA_STATUS.LOADING);
    const result = await provider.discover();
    state.setEntrySchemaResult(result);

    const savedKey = state.getSavedEventDefinitionKey();
    entrySourceChanged = Boolean(savedKey && result.eventDefinitionKey && savedKey !== result.eventDefinitionKey);
    if (entrySourceChanged) {
      console.warn('[EntrySchema] The entry source differs from the saved activity configuration.');
    }

    applyAutoMatching();

    if (result.valid) {
      log('EntrySchema', `Discovery finished: ${result.fields.length} field(s), ${result.warnings.length} warning(s)`);
    } else {
      console.warn(`[EntrySchema] Discovery unavailable: ${result.error?.code ?? 'UNKNOWN'}`);
    }
  }

  /**
   * Channel, template and mapping validation, merged. Mapping rules run only once
   * a template exists; selection rules always run.
   */
  function computeSaveReadiness() {
    const template = state.getSelectedTemplate();
    const selection = validateSelection({ channel: state.getSelectedChannel(), template });
    const mapping = template
      ? validateMappings({
          template,
          mappings: state.getMappings(),
          fieldCatalog: state.getFieldCatalog(),
          eventDefinitionKey: state.getEventDefinitionKey(),
        })
      : { valid: true, errors: [], warnings: [] };

    const validation = {
      valid: selection.valid && mapping.valid,
      errors: [...selection.errors, ...mapping.errors],
      warnings: mapping.warnings,
    };
    const schemaLoading = state.getSchemaStatus() === SCHEMA_STATUS.LOADING;
    return {
      validation,
      ready: validation.valid && !schemaLoading && state.isInitialized(),
    };
  }

  /** Keeps the Journey Builder Next button in sync. Only calls the bridge when the state changes. */
  function updateButtons(readiness = computeSaveReadiness()) {
    if (!bridgeReady) return;

    const enabled = state.isInitialized() && readiness.ready;
    const label = hasStepInfo && lastStep === null ? 'Done' : 'Next';
    const next = `${enabled}|${label}`;
    if (next === lastButtonState) return;
    lastButtonState = next;

    bridge.updateButton({ button: 'next', enabled, label });
  }

  /** Scrolls to and focuses the first invalid mapping row. */
  function focusFirstInvalid(result) {
    const first = result.errors.find((item) => item.targetKey);
    if (!first) return;
    const row = document.querySelector(`[data-target-key="${CSS.escape(first.targetKey)}"]`);
    if (!row) return;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const control = row.querySelector('select, input[type="text"]');
    if (control) control.focus({ preventScroll: true });
  }

  /** Applies the loader result to the UI and logs a summary. */
  function applyLoadResult(result) {
    loadResult = result;

    if (result.status === ACTIVITY_LOAD_STATUS.RESTORED) {
      log('ActivityLoad', 'Existing configuration restored');
    } else if (result.status === ACTIVITY_LOAD_STATUS.NEW) {
      log('ActivityLoad', 'New activity detected');
    } else if (result.status === ACTIVITY_LOAD_STATUS.MISSING_TEMPLATE) {
      log('ActivityLoad', 'Saved template missing from catalog');
    } else if (result.status === ACTIVITY_LOAD_STATUS.MALFORMED) {
      log('ActivityLoad', 'Saved configuration malformed');
    }

    for (const warning of result.warnings) {
      console.warn(`[ActivityLoad] ${warning.message}`);
    }
    for (const error of result.errors) {
      console.error(`[ActivityLoad] ${error.message}`);
    }
  }

  /**
   * Coordinates template loading and initActivity, hydrates the state, then
   * discovers the entry schema.
   */
  async function initializeActivity() {
    const activityArrived = bridge
      ? new Promise((resolve) => {
          resolveActivity = resolve;
        })
      : Promise.resolve(null);

    if (bridge) {
      // Every listener is registered before initialize() triggers `ready`.
      bridge.onInitActivity(handleInitActivity);
      bridge.onClickedNext(() => handleNext());
      bridge.onClickedBack(handleBack);
      bridge.onGotoStep(handleGotoStep);

      bridge.initialize();
      bridgeReady = true;
    }

    renderStandaloneBar();
    state.setActivityStatus(LOAD_STATUS.LOADING);

    const [, activity] = await Promise.all([loadTemplates(), activityArrived]);

    const result = loadActivityIntoState({
      state,
      activity,
      templates: state.getTemplates(),
    });
    applyLoadResult(result);
    autoMatchPending = !state.isConfigured();

    state.setActivityStatus(LOAD_STATUS.READY);
    state.setInitialized(true);
    renderFromState();

    await discoverSchema();
  }

  // -------------------------------------------------------------------------
  // Standalone development helpers
  // -------------------------------------------------------------------------

  function renderStandaloneBar() {
    if (!bridge?.isStandalone) return;
    standaloneBar.hidden = false;
  }

  function renderStandaloneOutput(activity) {
    standaloneOutput.textContent = JSON.stringify(activity, null, 2);
    standaloneOutput.hidden = false;
  }

  function handleStandaloneReset() {
    bridge.resetFixture();
    window.location.reload();
  }

  if (bridge?.isStandalone) {
    requireElement('standalone-next').addEventListener('click', () => handleNext());
    requireElement('standalone-back').addEventListener('click', handleBack);
    requireElement('standalone-reset').addEventListener('click', handleStandaloneReset);
  }

  function logValidation(result) {
    const signature = result.valid ? 'valid' : result.errors.map((item) => `${item.code}:${item.targetKey}`).join('|');
    if (signature === lastValidationSignature) return;
    lastValidationSignature = signature;

    if (result.valid) {
      log('Validation', 'Valid');
      return;
    }
    const keys = result.errors.map((item) => item.targetKey ?? item.code).join(', ');
    log('Validation', `Missing: ${keys}`);
  }

  state.subscribe(renderFromState);
  showModeBanner();
  initializeActivity();
}

/** Shows a visible banner when the server runs in development mode (reported by /ready). */
function showModeBanner() {
  fetch('/ready', { cache: 'no-store' })
    .then((res) => res.json())
    .then((body) => {
      if (body?.mode === 'development') {
        requireElement('dev-banner').hidden = false;
      }
    })
    .catch(() => {
      // The banner is informational only; a failed check must not block the activity.
    });
}

/** @returns {Record<string, string>} first error message per target key */
function indexErrors(result) {
  const byTarget = {};
  for (const item of result.errors) {
    if (item.targetKey && !(item.targetKey in byTarget)) {
      byTarget[item.targetKey] = item.message;
    }
  }
  return byTarget;
}

/** @returns {Record<string, string>} first warning message per target key */
function indexWarnings(result) {
  const byTarget = {};
  for (const item of result.warnings ?? []) {
    if (item.targetKey && !(item.targetKey in byTarget)) {
      byTarget[item.targetKey] = item.message;
    }
  }
  return byTarget;
}

function describeMapping(mapping) {
  if (mapping.mode === MAPPING_MODES.STATIC) {
    return `"${mapping.value}" (static)`;
  }
  return mapping.value || '(no field selected)';
}

bootstrap();
