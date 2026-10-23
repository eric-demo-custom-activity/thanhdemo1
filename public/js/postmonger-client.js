/*
 * Postmonger client wrapper.
 *
 * The ONLY module that talks to the Postmonger SDK. Every other UI module
 * (app.js, loaders, savers) communicates with Journey Builder through this
 * wrapper, so the raw Postmonger event names and session mechanics stay in
 * one place.
 *
 * The SDK is loaded as a classic script (public/js/vendor/postmonger.js) and
 * exposes the global `Postmonger`. Tests inject a fake Postmonger constructor
 * instead, so no real Journey Builder instance is needed.
 *
 * Listeners are registered exactly once, inside initialize(), before `ready`
 * is triggered. Handlers added through the on* methods are stored in Sets, so
 * re-registering the same callback never produces duplicate handlers.
 */

const PM_EVENTS = Object.freeze({
  READY: 'ready',
  INIT_ACTIVITY: 'initActivity',
  CLICKED_NEXT: 'clickedNext',
  CLICKED_BACK: 'clickedBack',
  CLICKED_GOTO_STEP: 'clickedGotoStep',
  REQUEST_TRIGGER_EVENT_DEFINITION: 'requestTriggerEventDefinition',
  REQUESTED_TRIGGER_EVENT_DEFINITION: 'requestedTriggerEventDefinition',
  REQUEST_INTERACTION: 'requestInteraction',
  REQUESTED_INTERACTION: 'requestedInteraction',
  UPDATE_ACTIVITY: 'updateActivity',
  UPDATE_BUTTON: 'updateButton',
  NEXT_STEP: 'nextStep',
  PREVIOUS_STEP: 'previousStep',
});

const log = (message) => console.info(`[Postmonger] ${message}`);

export class PostmongerClient {
  #Postmonger;
  #session = null;
  #initialized = false;
  /** @type {Map<string, Set<Function>>} */
  #handlers = new Map();

  /**
   * @param {object} [options]
   * @param {{ Session: new () => object }} [options.Postmonger] - injectable for tests
   */
  constructor({ Postmonger = globalThis.Postmonger } = {}) {
    if (!Postmonger || typeof Postmonger.Session !== 'function') {
      throw new Error('Postmonger SDK is not available.');
    }
    this.#Postmonger = Postmonger;
  }

  /**
   * Creates the Postmonger session, registers the SDK listeners once and
   * triggers `ready`. Idempotent: calling it twice is a no-op.
   *
   * @returns {this}
   */
  initialize() {
    if (this.#initialized) return this;

    this.#session = new this.#Postmonger.Session();
    this.#registerSdkListeners();

    this.#initialized = true;
    log('Connection initialized');
    this.#session.trigger(PM_EVENTS.READY);
    return this;
  }

  /** @param {(activity: object) => void} callback */
  onInitActivity(callback) {
    this.#on(PM_EVENTS.INIT_ACTIVITY, callback);
    return this;
  }

  /** @param {() => void} callback */
  onClickedNext(callback) {
    this.#on(PM_EVENTS.CLICKED_NEXT, callback);
    return this;
  }

  /** @param {() => void} callback */
  onClickedBack(callback) {
    this.#on(PM_EVENTS.CLICKED_BACK, callback);
    return this;
  }

  /**
   * @param {(step: number, nextStep: number|null) => void} callback
   */
  onGotoStep(callback) {
    this.#on(PM_EVENTS.CLICKED_GOTO_STEP, callback);
    return this;
  }

  /**
   * Handler for the response to requestTriggerEventDefinition().
   *
   * @param {(eventDefinition: object|null) => void} callback
   */
  onRequestedTriggerEventDefinition(callback) {
    this.#on(PM_EVENTS.REQUESTED_TRIGGER_EVENT_DEFINITION, callback);
    return this;
  }

  /**
   * Handler for the response to requestInteraction(). The payload is the
   * interaction (journey) object; its triggers[].metaData carry the entry
   * event definition. See README section 9.10 for verification status.
   *
   * @param {(interaction: object|null) => void} callback
   */
  onRequestedInteraction(callback) {
    this.#on(PM_EVENTS.REQUESTED_INTERACTION, callback);
    return this;
  }

  /**
   * Sends the updated activity definition back to Journey Builder.
   * @param {object} activity
   */
  updateActivity(activity) {
    this.#trigger(PM_EVENTS.UPDATE_ACTIVITY, activity);
  }

  /**
   * Updates a Journey Builder button. Accepted keys: button ('next'|'back'),
   * enabled, visible, label.
   *
   * @param {object} configuration
   */
  updateButton(configuration) {
    this.#trigger(PM_EVENTS.UPDATE_BUTTON, configuration);
  }

  /** Advances to the next Journey Builder step. */
  nextStep() {
    this.#trigger(PM_EVENTS.NEXT_STEP);
  }

  /** Goes back to the previous Journey Builder step. */
  previousStep() {
    this.#trigger(PM_EVENTS.PREVIOUS_STEP);
  }

  /** Asks Journey Builder for the entry event definition of the journey. */
  requestTriggerEventDefinition() {
    this.#trigger(PM_EVENTS.REQUEST_TRIGGER_EVENT_DEFINITION);
  }

  /** Asks Journey Builder for the current interaction (journey), including its triggers. */
  requestInteraction() {
    this.#trigger(PM_EVENTS.REQUEST_INTERACTION);
  }

  /** Tears the session down and drops every registered handler. */
  destroy() {
    if (this.#session) {
      this.#session.end();
    }
    this.#session = null;
    this.#initialized = false;
    this.#handlers.clear();
  }

  #registerSdkListeners() {
    this.#session.on(PM_EVENTS.INIT_ACTIVITY, (...args) => this.#dispatch(PM_EVENTS.INIT_ACTIVITY, ...args));
    this.#session.on(PM_EVENTS.CLICKED_NEXT, (...args) => this.#dispatch(PM_EVENTS.CLICKED_NEXT, ...args));
    this.#session.on(PM_EVENTS.CLICKED_BACK, (...args) => this.#dispatch(PM_EVENTS.CLICKED_BACK, ...args));
    this.#session.on(PM_EVENTS.CLICKED_GOTO_STEP, (...args) => this.#dispatch(PM_EVENTS.CLICKED_GOTO_STEP, ...args));
    this.#session.on(PM_EVENTS.REQUESTED_TRIGGER_EVENT_DEFINITION, (...args) =>
      this.#dispatch(PM_EVENTS.REQUESTED_TRIGGER_EVENT_DEFINITION, ...args)
    );
    this.#session.on(PM_EVENTS.REQUESTED_INTERACTION, (...args) =>
      this.#dispatch(PM_EVENTS.REQUESTED_INTERACTION, ...args)
    );
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

  #trigger(event, ...args) {
    if (!this.#session) {
      throw new Error(`PostmongerClient is not initialized (cannot trigger ${event}).`);
    }
    this.#session.trigger(event, ...args);
  }
}