/*
 * Channel and template selection rules. Pure functions, no DOM, no state.
 */

/**
 * Templates that belong to a channel.
 *
 * @param {ReadonlyArray<{ channel: string }>} templates
 * @param {string|null} channel - channel code
 * @returns {Array<object>}
 */
export function templatesForChannel(templates, channel) {
  if (!channel) return [];
  return templates.filter((template) => template.channel === channel);
}

/**
 * What to do with the template selection after a channel has been applied.
 *   - empty:      no templates for the channel
 *   - autoSelect: exactly one template, select it
 *   - choose:     several templates, the designer chooses
 *
 * @param {ReadonlyArray<{ channel: string, templateKey: string }>} templates
 * @param {string|null} channel
 * @returns {{ action: 'empty' } | { action: 'autoSelect', templateKey: string } | { action: 'choose' }}
 */
export function planTemplateAfterChannelChange(templates, channel) {
  const candidates = templatesForChannel(templates, channel);
  if (candidates.length === 0) return { action: 'empty' };
  if (candidates.length === 1) return { action: 'autoSelect', templateKey: candidates[0].templateKey };
  return { action: 'choose' };
}

/**
 * Decides how a requested channel change proceeds.
 *   - noop:    the channel is already selected
 *   - confirm: mappings exist and will be cleared; ask first
 *   - apply:   nothing to lose; change now
 *
 * @param {{ currentChannel: string|null, requestedChannel: string, hasMappings: boolean }} input
 * @returns {{ action: 'noop' } | { action: 'confirm' } | { action: 'apply' }}
 */
export function planChannelChange({ currentChannel, requestedChannel, hasMappings }) {
  if (currentChannel === requestedChannel) return { action: 'noop' };
  if (hasMappings) return { action: 'confirm' };
  return { action: 'apply' };
}
