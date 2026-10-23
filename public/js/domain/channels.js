/*
 * Notification channels (client side).
 *
 * Codes match the server model. Labels are what the designer sees.
 * Channel values from the server are codes; display names are accepted and
 * normalized so a stored or hand-written value still resolves.
 */

import { normalizeName } from './nameNormalizer.js';

export const CHANNELS = Object.freeze([
  Object.freeze({ code: 'SMS', label: 'SMS' }),
  Object.freeze({ code: 'CHATAPP', label: 'ChatApp' }),
  Object.freeze({ code: 'ZALO', label: 'Zalo' }),
  Object.freeze({ code: 'BRC_ZALO', label: 'BRC Zalo' }),
]);

/**
 * @param {unknown} value - code or display name
 * @returns {string|null} channel code, or null when unsupported
 */
export function toChannelCode(value) {
  if (typeof value !== 'string') return null;
  const wanted = normalizeName(value);
  const match = CHANNELS.find((channel) => normalizeName(channel.code) === wanted || normalizeName(channel.label) === wanted);
  return match ? match.code : null;
}

/** @param {unknown} code @returns {boolean} */
export function isSupportedChannel(code) {
  return CHANNELS.some((channel) => channel.code === code);
}

/** @param {string|null} code @returns {string} the display label, or the code when unknown */
export function channelLabel(code) {
  return CHANNELS.find((channel) => channel.code === code)?.label ?? code ?? '';
}
