/*
 * Activity definition (config.json) builder.
 *
 * Every URL is derived from PUBLIC_BASE_URL. Nothing is duplicated in static files.
 * The format follows the official sample (sfmc-example-jb-custom-activity):
 *   - schema entries are one key per object, with dataType / direction / access
 *   - lifecycle endpoints live under configurationArguments (save, validate, publish, stop)
 *   - execute lives under arguments.execute
 *
 * Dynamic per-template runtime keys (address__*, recipient__*, param__*) cannot be
 * declared statically because they depend on the selected template. Only the fixed
 * keys are declared here. The dynamic keys need the live schema-acceptance gate.
 */

export const FIXED_SCHEMA_KEYS = Object.freeze([
  'source',
  'channel',
  'templateKey',
  'templateVersion',
  'eventDefinitionKey',
]);

export const LIFECYCLE_PATHS = Object.freeze({
  save: '/journey/save',
  validate: '/journey/validate',
  publish: '/journey/publish',
  stop: '/journey/stop',
  execute: '/journey/execute',
});

/**
 * @param {{ publicBaseUrl: string, requireJwt: boolean }} config
 * @returns {object} the activity definition served at GET /config.json
 */
export function buildActivityConfig({ publicBaseUrl, requireJwt }) {
  const url = (path) => `${publicBaseUrl}${path}`;
  const lifecycle = (path) => ({ url: url(path), useJwt: requireJwt });

  return {
    workflowApiVersion: '1.1',
    metaData: {
      icon: url('/assets/icon.svg'),
      category: 'message',
      isConfigured: false,
    },
    type: 'REST',
    lang: {
      'en-US': {
        name: 'Notification Hub',
        description: 'Send a notification through Notification Hub.',
      },
    },
    arguments: {
      execute: {
        inArguments: [],
        outArguments: [],
        url: url(LIFECYCLE_PATHS.execute),
        verb: 'POST',
        useJwt: requireJwt,
        timeout: 20000,
        retryCount: 2,
        retryDelay: 1000,
        concurrentRequests: 6,
      },
    },
    configurationArguments: {
      save: lifecycle(LIFECYCLE_PATHS.save),
      validate: lifecycle(LIFECYCLE_PATHS.validate),
      publish: lifecycle(LIFECYCLE_PATHS.publish),
      stop: lifecycle(LIFECYCLE_PATHS.stop),
    },
    wizardSteps: [{ label: 'Configure notification', key: 'step1' }],
    userInterfaces: {
      configModal: {
        fullscreen: true,
      },
    },
    schema: {
      arguments: {
        execute: {
          inArguments: [
            { source: { dataType: 'Text', direction: 'in', access: 'visible' } },
            { channel: { dataType: 'Text', direction: 'in', access: 'visible' } },
            { templateKey: { dataType: 'Text', direction: 'in', access: 'visible' } },
            { templateVersion: { dataType: 'Text', direction: 'in', access: 'visible' } },
            { eventDefinitionKey: { dataType: 'Text', direction: 'in', access: 'visible' } },
          ],
          outArguments: [],
        },
      },
    },
  };
}
