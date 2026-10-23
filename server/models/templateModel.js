// Template domain model and validation.
// Pure functions only: no I/O, no Express, no Notification Hub knowledge.
//
// Channels are stored internally as codes (SMS, CHATAPP, ZALO, BRC_ZALO).
// The data file may use display names ("ChatApp", "Zalo", "BRC Zalo"); they are
// normalized here so the rest of the system only sees the codes.

export const CHANNEL_CODES = Object.freeze({
  SMS: 'SMS',
  CHATAPP: 'CHATAPP',
  ZALO: 'ZALO',
  BRC_ZALO: 'BRC_ZALO',
});

export const SUPPORTED_CHANNELS = Object.freeze(Object.values(CHANNEL_CODES));

/**
 * Normalizes a channel name for comparison: removes spaces, underscores and
 * hyphens and lowercases. "BRC Zalo", "brc_zalo" and "BRC-ZALO" are equal.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeChannelName(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[_\-\s]/g, '').toLowerCase();
}

const CHANNEL_BY_NORMALIZED_NAME = Object.freeze({
  sms: CHANNEL_CODES.SMS,
  chatapp: CHANNEL_CODES.CHATAPP,
  zalo: CHANNEL_CODES.ZALO,
  brczalo: CHANNEL_CODES.BRC_ZALO,
});

/**
 * @param {unknown} value - display name or code
 * @returns {string|null} the channel code, or null when unsupported
 */
export function toChannelCode(value) {
  return CHANNEL_BY_NORMALIZED_NAME[normalizeChannelName(value)] ?? null;
}

export class TemplateValidationError extends Error {
  /**
   * @param {string} message
   * @param {Array<string>} [problems]
   */
  constructor(message, problems = []) {
    super(message);
    this.name = 'TemplateValidationError';
    this.problems = problems;
  }
}

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

const isNamedEntry = (entry) => entry !== null && typeof entry === 'object' && isNonEmptyString(entry.name);

/**
 * Validates one raw template object from the data source.
 * Returns a list of human-readable problems; an empty list means valid.
 *
 * @param {unknown} raw
 * @returns {Array<string>}
 */
export function findTemplateProblems(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return ['template must be an object'];
  }

  const problems = [];

  if (!isNonEmptyString(raw.templateKey)) problems.push('templateKey is required');
  if (!isNonEmptyString(raw.displayName)) problems.push('displayName is required');

  if (toChannelCode(raw.channel) === null) {
    problems.push(`channel must be one of: ${SUPPORTED_CHANNELS.join(', ')}`);
  }

  if (raw.version !== undefined && !(Number.isInteger(raw.version) && raw.version >= 1)) {
    problems.push('version must be a positive integer when provided');
  }

  if (!Array.isArray(raw.addresses)) {
    problems.push('addresses must be an array');
  } else if (!raw.addresses.every(isNamedEntry)) {
    problems.push('every address needs a non-empty name');
  }

  if (!Array.isArray(raw.params)) {
    problems.push('params must be an array');
  } else if (!raw.params.every(isNamedEntry)) {
    problems.push('every param needs a non-empty name');
  }

  if (raw.recipientFields !== undefined) {
    if (!Array.isArray(raw.recipientFields)) {
      problems.push('recipientFields must be an array when provided');
    } else if (!raw.recipientFields.every(isNamedEntry)) {
      problems.push('every recipientField needs a non-empty name');
    }
  }

  return problems;
}

/**
 * Converts a raw, already validated object into a frozen template model with
 * defaults applied. The channel is stored as its code.
 *
 * @param {object} raw
 * @returns {Readonly<object>}
 */
export function createTemplateModel(raw) {
  return Object.freeze({
    templateKey: raw.templateKey,
    displayName: raw.displayName,
    channel: toChannelCode(raw.channel),
    version: raw.version ?? 1,
    addresses: Object.freeze(raw.addresses.map((item) => Object.freeze({ ...item }))),
    recipientFields: Object.freeze((raw.recipientFields ?? []).map((item) => Object.freeze({ ...item }))),
    params: Object.freeze(raw.params.map((item) => Object.freeze({ ...item }))),
  });
}
