/*
 * Confirmation dialog for template changes.
 *
 * Uses the native <dialog> element: focus trap, Escape to cancel and
 * keyboard support come from the browser.
 *
 * requestConfirmation() resolves true (Continue) or false (Cancel, Escape,
 * or closing the dialog by any other route).
 */

export class TemplateChangeDialog {
  #dialog;
  #cancelButton;
  #continueButton;
  #resolve = null;

  /**
   * @param {object} options
   * @param {HTMLDialogElement} options.dialog
   * @param {HTMLButtonElement} options.cancelButton
   * @param {HTMLButtonElement} options.continueButton
   */
  constructor({ dialog, cancelButton, continueButton }) {
    this.#dialog = dialog;
    this.#cancelButton = cancelButton;
    this.#continueButton = continueButton;

    this.#cancelButton.addEventListener('click', () => this.#finish(false));
    this.#continueButton.addEventListener('click', () => this.#finish(true));
    this.#dialog.addEventListener('close', () => this.#finish(false));
  }

  /** @returns {Promise<boolean>} */
  requestConfirmation() {
    return new Promise((resolve) => {
      this.#resolve = resolve;

      if (typeof this.#dialog.showModal === 'function') {
        this.#dialog.showModal();
      } else {
        this.#dialog.setAttribute('open', '');
      }
      this.#cancelButton.focus();
    });
  }

  #finish(confirmed) {
    if (!this.#resolve) return;

    const resolve = this.#resolve;
    this.#resolve = null;

    if (typeof this.#dialog.close === 'function') {
      if (this.#dialog.open) this.#dialog.close();
    } else {
      this.#dialog.removeAttribute('open');
    }

    resolve(confirmed);
  }
}
