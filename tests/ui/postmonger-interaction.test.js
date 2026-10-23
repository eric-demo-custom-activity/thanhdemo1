import { describe, it, expect, jest } from '@jest/globals';

import { PostmongerClient } from '../../public/js/postmonger-client.js';

/** Records SDK listener registrations and outgoing triggers. */
function createFakePostmonger() {
  const sessions = [];
  class FakeSession {
    constructor() {
      this.listeners = {};
      this.sent = [];
      sessions.push(this);
    }
    on(event, callback) {
      (this.listeners[event] ??= []).push(callback);
    }
    trigger(event, ...args) {
      this.sent.push([event, ...args]);
    }
    end() {}
    fire(event, ...args) {
      (this.listeners[event] ?? []).forEach((callback) => callback(...args));
    }
  }
  return { Postmonger: { Session: FakeSession }, sessions };
}

describe('PostmongerClient interaction discovery', () => {
  it('sends requestInteraction only after initialization', () => {
    const { Postmonger, sessions } = createFakePostmonger();
    const client = new PostmongerClient({ Postmonger });

    expect(() => client.requestInteraction()).toThrow(/not initialized/);

    client.initialize();
    client.requestInteraction();

    expect(sessions[0].sent).toContainEqual(['requestInteraction']);
  });

  it('delivers requestedInteraction payloads to the registered callback', () => {
    const { Postmonger, sessions } = createFakePostmonger();
    const client = new PostmongerClient({ Postmonger });
    const callback = jest.fn();
    const interaction = { triggers: [{ metaData: { eventDefinitionKey: 'K' } }] };

    client.onRequestedInteraction(callback).initialize();
    sessions[0].fire('requestedInteraction', interaction);

    expect(callback).toHaveBeenCalledWith(interaction);
  });

  it('registers the SDK listener for requestedInteraction exactly once', () => {
    const { Postmonger, sessions } = createFakePostmonger();
    const client = new PostmongerClient({ Postmonger });

    client.onRequestedInteraction(() => {}).initialize();
    client.initialize();

    expect(sessions[0].listeners.requestedInteraction ?? []).toHaveLength(1);
  });

  it('does not duplicate handlers when the same callback is added twice', () => {
    const { Postmonger, sessions } = createFakePostmonger();
    const client = new PostmongerClient({ Postmonger });
    const callback = jest.fn();

    client.onRequestedInteraction(callback).onRequestedInteraction(callback).initialize();
    sessions[0].fire('requestedInteraction', {});

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('no longer exposes the unverified data-sources events', () => {
    const { Postmonger } = createFakePostmonger();
    const client = new PostmongerClient({ Postmonger });

    expect(client.requestDataSources).toBeUndefined();
    expect(client.onRequestedDataSources).toBeUndefined();
  });
});
