/*
 * Template dropdown.
 *
 * Renders the templates of the selected channel and reports user selection
 * upward. It owns the status line (loading / empty / error / disabled hint).
 * It does not read or write application state.
 */

export class TemplateDropdown {
  #select;
  #status;
  #onChange;
  #onRetry;

  /**
   * @param {object} options
   * @param {HTMLSelectElement} options.select
   * @param {HTMLElement} options.status - live region for status text
   * @param {(templateKey: string) => void} options.onChange
   * @param {() => void} options.onRetry
   */
  constructor({ select, status, onChange, onRetry }) {
    this.#select = select;
    this.#status = status;
    this.#onChange = onChange;
    this.#onRetry = onRetry;

    this.#select.addEventListener('change', () => {
      if (this.#select.value !== '') {
        this.#onChange(this.#select.value);
      }
    });
  }

  /**
   * Replaces the options with the given templates (label = displayName), with a
   * placeholder first. The placeholder is shown while no template is chosen.
   *
   * @param {ReadonlyArray<{ templateKey: string, displayName: string }>} templates
   */
  renderOptions(templates) {
    const placeholder = this.#placeholderOption('Select a template');
    const options = templates.map((template) => {
      const option = document.createElement('option');
      option.value = template.templateKey;
      option.textContent = template.displayName;
      return option;
    });

    this.#select.replaceChildren(placeholder, ...options);
    this.#select.disabled = false;
    this.#hideStatus();
  }

  /** @param {string|null} templateKey - null shows the placeholder */
  setSelected(templateKey) {
    const value = templateKey ?? '';
    if (this.#select.value !== value) {
      this.#select.value = value;
    }
  }

  /** @param {string} message - shown while the dropdown cannot be used (for example, no channel yet) */
  showDisabled(message) {
    this.#setPlaceholderOption(message);
    this.#showStatus(message, { kind: 'loading' });
  }

  showLoading() {
    this.#setPlaceholderOption('Loading templates...');
    this.#showStatus('Loading templates...', { kind: 'loading' });
  }

  showEmpty() {
    this.#setPlaceholderOption('No templates available');
    this.#showStatus('No templates available for this channel.', { kind: 'empty' });
  }

  showError() {
    this.#setPlaceholderOption('Unable to load templates');

    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'button button--secondary';
    retry.textContent = 'Retry';
    retry.addEventListener('click', () => this.#onRetry());

    this.#showStatus('Unable to load templates.', { kind: 'error', action: retry });
  }

  #placeholderOption(text) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = text;
    return option;
  }

  #setPlaceholderOption(text) {
    this.#select.replaceChildren(this.#placeholderOption(text));
    this.#select.disabled = true;
  }

  #showStatus(text, { kind, action = null }) {
    const message = document.createElement('p');
    message.className = `status status--${kind}`;
    message.textContent = text;

    const children = action ? [message, action] : [message];
    this.#status.replaceChildren(...children);
    this.#status.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    this.#status.hidden = false;
  }

  #hideStatus() {
    this.#status.replaceChildren();
    this.#status.hidden = true;
  }
}
