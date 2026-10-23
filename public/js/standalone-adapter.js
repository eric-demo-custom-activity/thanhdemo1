/*
 * Standalone development adapter.
 *
 * Lets the UI run outside Journey Builder. It mimics the PostmongerClient
 * interface so app.js treats both identically.
 *
 * Standalone mode is used only when the page is opened with ?standalone=true or
 * when it is not embedded in an iframe. It is never used as a fallback inside a
 * real Journey Builder session.
 *
 * Discovery in standalone mode uses the SAME code path as production:
 * requestInteraction answers with an interaction whose triggers[0].metaData
 * carries the fixture's eventDefinitionKey and field list. The normalizer
 * therefore reads the same structure in both modes.
 *
 * Fixture: public/fixtures/entry-schema.fixture.json (never loaded in real mode).
 */

export const STANDALONE_FIXTURE_URL = 'fixtures/entry-schema.fixture.json';
const FIXTURE_STORAGE_KEY = 'standalone.activityFixture';

const log = (message) => console.info(`[Standalone] ${message}`);

/**
 * Sample activity definition used on first load, shaped like the payload
 * Journey Builder sends through initActivity for a freshly added activity.
 *
 * @returns {object}
 */
export function createSampleActivity() {
  return {
    key: 'sample-custom-activity',
    name: 'Notification Hub Custom Activity',
    metaData: {
      isConfigured: false,
    },
    arguments: {
      execute: {
        inArguments: [],
        url: 'https://example.invalid/journey/execute',
        timeout: 60000,
        retryCount: 3,
        retryDelay: 4000,
        concurrentRequests: 10,
        useJwt: false,
      },
    },
  };
}

/**
 * Validates the fixture shape. Returns a list of problems (empty when valid).
 *
 * @param {unknown} fixture
 * @returns {string[]}
 */
export function validateFixture(fixture) {
  const problems = [];
  if (!fixture || typeof fixture !== 'object') {
    return ['fixture must be an object'];
  }
  if (typeof fixture.eventDefinitionKey !== 'string' || fixture.eventDefinitionKey.trim() === '') {
    problems.push('eventDefinitionKey is required');
  }
  if (!Array.isArray(fixture.fields)) {
    problems.push('fields must be an array');
  } else if (!fixture.fields.every((field) => field && typeof field.name === 'string')) {
    problems.push('every field needs a name');
  }
  return problems;
}

/**
 * Builds an interaction object with the same shape Journey Builder uses for the
 * entry trigger: triggers[0].metaData.eventDefinitionKey, and the field list in
 * metaData.deSchema.fields.
 *
 * @param {{ eventDefinitionKey: string, fields: Array<{ name: string, label?: string, dataType?: string }> }} fixture
 * @returns {object}
 */
export function toStandaloneInteraction(fixture) {
  return {
    id: 'standalone-interaction',
    name: 'Standalone Development Journey',
    triggers: [
      {
        key: 'TRIGGER',
        name: 'TRIGGER',
        type: 'EmailAudience',
        metaData: {
          eventDefinitionKey: fixture.eventDefinitionKey,
          deSchema: {
            fieldCount: fixture.fields.length,
            fields: fixture.fields.map((field, index) => ({
              name: field.name,
              label: field.label,
              type: field.dataType,
              ordinal: index,
              isNullable: true,
              isPrimaryKey: false,
            })),
          },
        },
      },
    ],
  };
}

export class StandaloneAdapter {
  #handlers = new Map();
  #storage;
  #activity;
  #initialized = false;
  #fixtureLoader;
  /** @type {Promise<object|null>|null} */
  #fixturePromise = null;

  /**
   * @param {object} [options]
   * @param {Storage|null} [options.storage] - injectable for tests (default localStorage)
   * @param {() => Promise<object>} [options.fixtureLoader] - injectable for tests (default: fetch)
   */
  constructor({ storage = globalThis.localStorage ?? null, fixtureLoader = defaultFixtureLoader } = {}) {
    this.#storage = storage;
    this.#fixtureLoader = fixtureLoader;
    this.#activity = this.#loadFixture() ?? createSampleActivity();
  }

  /** @returns {boolean} */
  get isStandalone() {
    return true;
  }

  /** @returns {this} */
  initialize() {
    if (this.#initialized) return this;
    this.#initialized = true;

    log('Standalone Development Mode active');
    log(`Supplying activity fixture (${this.#activity.metaData?.isConfigured ? 'saved' : 'new'})`);

    queueMicrotask(() => {
      this.#dispatch('initActivity', this.#activity);
    });

    return this;
  }

  /** @param {(activity: object) => void} callback */
  onInitActivity(callback) {
    this.#on('initActivity', callback);
    return this;
  }

  /** @param {() => void} callback */
  onClickedNext(callback) {
    this.#on('clickedNext', callback);
    return this;
  }

  /** @param {() => void} callback */
  onClickedBack(callback) {
    this.#on('clickedBack', callback);
    return this;
  }

  /** @param {(step: number, nextStep: number|null) => void} callback */
  onGotoStep(callback) {
    this.#on('gotoStep', callback);
    return this;
  }

  /** @param {(interaction: object|null) => void} callback */
  onRequestedInteraction(callback) {
    this.#on('requestedInteraction', callback);
    return this;
  }

  /**
   * Persists the updated activity as the reload fixture and logs it.
   * @param {object} activity
   */
  updateActivity(activity) {
    log('updateActivity payload:');
    console.info(JSON.stringify(activity, null, 2));

    if (this.#storage) {
      try {
        this.#storage.setItem(FIXTURE_STORAGE_KEY, JSON.stringify(activity));
        log('Activity fixture saved to localStorage');
      } catch {
        log('Could not persist the fixture (storage unavailable).');
      }
    }
  }

  /** @param {object} configuration */
  updateButton(configuration) {
    log(`updateButton: ${JSON.stringify(configuration)}`);
  }

  /** Simulates advancing to the next Journey Builder step. */
  nextStep() {
    log('nextStep (simulated)');
  }

  /** Simulates going back to the previous step. */
  previousStep() {
    log('previousStep (simulated)');
  }

  /** Answers with an interaction built from the fixture. */
  requestInteraction() {
    queueMicrotask(async () => {
      const fixture = await this.#fixture();
      if (!fixture) {
        this.#dispatch('requestedInteraction', null);
        return;
      }
      this.#dispatch('requestedInteraction', toStandaloneInteraction(fixture));
    });
  }

  /** Clears the persisted fixture so the next load starts from a new activity. */
  resetFixture() {
    if (this.#storage) {
      this.#storage.removeItem(FIXTURE_STORAGE_KEY);
      log('Activity fixture cleared');
    }
    this.#activity = createSampleActivity();
  }

  /** @returns {object} the activity fixture currently in use */
  getFixture() {
    return this.#activity;
  }

  destroy() {
    this.#initialized = false;
    this.#handlers.clear();
    this.#fixturePromise = null;
  }

  /**
   * Loads the entry-schema fixture once. An invalid fixture produces no
   * interaction, which surfaces as a recoverable error instead of invented data.
   */
  #fixture() {
    if (!this.#fixturePromise) {
      this.#fixturePromise = Promise.resolve()
        .then(() => this.#fixtureLoader())
        .then((fixture) => {
          const problems = validateFixture(fixture);
          if (problems.length > 0) {
            log(`Entry-schema fixture rejected: ${problems.join('; ')}`);
            return null;
          }
          log(`Entry-schema fixture loaded (${fixture.fields.length} fields)`);
          return fixture;
        })
        .catch((error) => {
          log(`Entry-schema fixture could not be loaded: ${error.message}`);
          return null;
        });
    }
    return this.#fixturePromise;
  }

  #loadFixture() {
    if (!this.#storage) return null;
    try {
      const raw = this.#storage.getItem(FIXTURE_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  #on(event, callback) {
    if (typeof callback !== 'function') return;
    let set = this.#handlers.get(event);
    if (!set) {
      set = new Set();
      this.#handlers.set(event, set);
    }
    set.add(callback);
  }

  #dispatch(event, ...args) {
    const set = this.#handlers.get(event);
    if (!set) return;
    for (const callback of set) {
      callback(...args);
    }
  }
}

async function defaultFixtureLoader() {
  const response = await fetch(STANDALONE_FIXTURE_URL, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}
