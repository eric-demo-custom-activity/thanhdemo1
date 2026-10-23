/*
 * Channel selector.
 *
 * Renders the four notification channels and reports user changes upward.
 * It does not decide whether a change is allowed; the application does that.
 */

import { CHANNELS } from '../domain/channels.js';

export class ChannelSelector {
  #select;
  #onChange;

  /**
   * @param {object} options
   * @param {HTMLSelectElement} options.select
   * @param {(channelCode: string) => void} options.onChange
   */
  constructor({ select, onChange }) {
    this.#select = select;
    this.#onChange = onChange;

    this.#select.replaceChildren(this.#option('', 'Select channel'), ...CHANNELS.map((c) => this.#option(c.code, c.label)));
    this.#select.addEventListener('change', () => {
      if (this.#select.value !== '') {
        this.#onChange(this.#select.value);
      }
    });
  }

  /** @param {string|null} channelCode - null shows the placeholder */
  setSelected(channelCode) {
    const value = channelCode ?? '';
    if (this.#select.value !== value) {
      this.#select.value = value;
    }
  }

  /** @returns {string|null} */
  getSelected() {
    return this.#select.value === '' ? null : this.#select.value;
  }

  #option(value, text) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    return option;
  }
}
