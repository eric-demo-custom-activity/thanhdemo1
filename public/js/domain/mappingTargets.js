/*
 * Mapping target model.
 *
 * Derives every mapping target from the template. The UI and the validator
 * both use this module, so no field name is ever hardcoded.
 *
 * Target key convention (also the key used in state and in Journey save later):
 *   template.addresses[].name        -> "addresses.<name>"
 *   template.recipientFields[].name  -> "<name>"
 *   template.params[].name           -> "params.<name>"
 */

export const MAPPING_MODES = Object.freeze({
  FIELD: 'field',
  STATIC: 'static',
});

export const TARGET_GROUPS = Object.freeze([
  {
    id: 'addresses',
    title: 'Addresses',
    emptyText: 'This template has no address fields.',
    isRouting: true,
  },
  {
    id: 'recipientFields',
    title: 'Recipient Fields',
    emptyText: 'This template has no recipient fields.',
    isRouting: true,
  },
  {
    id: 'params',
    title: 'Template Parameters',
    emptyText: 'This template has no parameters.',
    isRouting: false,
  },
]);

/**
 * @param {string} groupId - one of TARGET_GROUPS[].id
 * @param {string} name
 * @returns {string} target key
 */
export function buildTargetKey(groupId, name) {
  switch (groupId) {
    case 'addresses':
      return `addresses.${name}`;
    case 'params':
      return `params.${name}`;
    case 'recipientFields':
      return name;
    default:
      throw new Error(`Unknown target group: ${groupId}`);
  }
}

/**
 * Inverse of buildTargetKey. Splits a target key back into its group and
 * field name. A bare key (no prefix) belongs to recipientFields.
 *
 * Used by the binding builder to place a resolved value into the nested
 * inArguments structure without hardcoding any field name.
 *
 * @param {string} targetKey
 * @returns {{ groupId: string, name: string }}
 */
export function parseTargetKey(targetKey) {
  if (targetKey.startsWith('addresses.')) {
    return { groupId: 'addresses', name: targetKey.slice('addresses.'.length) };
  }
  if (targetKey.startsWith('params.')) {
    return { groupId: 'params', name: targetKey.slice('params.'.length) };
  }
  return { groupId: 'recipientFields', name: targetKey };
}

/**
 * Lists every mapping target of a template, in display order.
 *
 * @param {object|null} template
 * @returns {Array<{ key: string, groupId: string, name: string, required: boolean, type: string|null, isRouting: boolean }>}
 */
export function listMappingTargets(template) {
  if (!template) return [];

  return TARGET_GROUPS.flatMap((group) =>
    (template[group.id] ?? []).map((field) => ({
      key: buildTargetKey(group.id, field.name),
      groupId: group.id,
      name: field.name,
      required: field.required === true,
      type: field.type ?? null,
      isRouting: group.isRouting,
    }))
  );
}
