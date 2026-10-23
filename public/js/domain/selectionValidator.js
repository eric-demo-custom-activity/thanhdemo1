/*
 * Selection validation: channel and template are required before a mapping can
 * be saved. Pure function.
 *
 * Messages:
 *   channel missing   "Please select a notification channel."
 *   template missing  "Please select a template."
 */

export const SELECTION_CODES = Object.freeze({
  CHANNEL_MISSING: 'CHANNEL_MISSING',
  TEMPLATE_MISSING: 'TEMPLATE_MISSING',
  CHANNEL_MISMATCH: 'CHANNEL_MISMATCH',
});

const MESSAGES = Object.freeze({
  [SELECTION_CODES.CHANNEL_MISSING]: 'Please select a notification channel.',
  [SELECTION_CODES.TEMPLATE_MISSING]: 'Please select a template.',
  [SELECTION_CODES.CHANNEL_MISMATCH]: 'The selected template does not belong to the selected channel.',
});

/**
 * @param {{ channel: string|null, template: object|null }} input
 * @returns {{ valid: boolean, errors: Array<{ code: string, targetKey: null, name: null, message: string }>, warnings: [] }}
 */
export function validateSelection({ channel, template }) {
  const errors = [];

  if (!channel) {
    errors.push(issue(SELECTION_CODES.CHANNEL_MISSING));
  }
  if (!template) {
    errors.push(issue(SELECTION_CODES.TEMPLATE_MISSING));
  } else if (channel && template.channel !== channel) {
    errors.push(issue(SELECTION_CODES.CHANNEL_MISMATCH));
  }

  return { valid: errors.length === 0, errors, warnings: [] };
}

function issue(code) {
  return { code, targetKey: null, name: null, message: MESSAGES[code] };
}
