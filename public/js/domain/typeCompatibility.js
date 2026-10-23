/*
 * Source-to-target type compatibility.
 *
 * Source types come from schema/field-type-normalizer.js. Target types come from
 * the template parameter definitions (addresses[].type, params[].type, ...).
 *
 * Result:
 *   { compatible: boolean, severity: 'ok' | 'warning' | 'error', message: string }
 *
 *   - error   blocks save
 *   - warning does not block save; it is shown to the designer
 *   - ok      silent
 *
 * This module only decides design-time compatibility. Runtime conversion and
 * validation are the middleware's responsibility.
 */

import { FIELD_TYPES } from '../schema/field-type-normalizer.js';

export const COMPATIBILITY_SEVERITY = Object.freeze({
  OK: 'ok',
  WARNING: 'warning',
  ERROR: 'error',
});

/** Target types with a compatibility rule. */
export const TARGET_TYPES = Object.freeze(['string', 'phone', 'email', 'number', 'decimal', 'integer', 'date', 'datetime', 'boolean']);

/**
 * Target type aliases. "url" is text at the transport level, so it uses the
 * string rules.
 */
const TARGET_TYPE_ALIASES = Object.freeze({
  url: 'string',
});

const T = FIELD_TYPES;

/** Explicit compatible pairs, keyed "<source>-><target>". Anything not listed is incompatible. */
const RULES = Object.freeze({
  [`${T.TEXT}->phone`]: { severity: COMPATIBILITY_SEVERITY.WARNING, message: 'Text will be used as a phone value and validated at runtime.' },
  [`${T.TEXT}->email`]: { severity: COMPATIBILITY_SEVERITY.WARNING, message: 'Text will be used as an email value and validated at runtime.' },
  [`${T.PHONE}->phone`]: { severity: COMPATIBILITY_SEVERITY.OK, message: 'Phone matches the phone target.' },
  [`${T.EMAIL}->email`]: { severity: COMPATIBILITY_SEVERITY.OK, message: 'Email matches the email target.' },
  [`${T.INTEGER}->number`]: { severity: COMPATIBILITY_SEVERITY.OK, message: 'Integer matches the number target.' },
  [`${T.INTEGER}->decimal`]: { severity: COMPATIBILITY_SEVERITY.OK, message: 'Integer matches the decimal target.' },
  [`${T.NUMBER}->number`]: { severity: COMPATIBILITY_SEVERITY.OK, message: 'Number matches the number target.' },
  [`${T.NUMBER}->decimal`]: { severity: COMPATIBILITY_SEVERITY.OK, message: 'Number matches the decimal target.' },
  [`${T.DECIMAL}->number`]: { severity: COMPATIBILITY_SEVERITY.OK, message: 'Decimal matches the number target.' },
  [`${T.DECIMAL}->decimal`]: { severity: COMPATIBILITY_SEVERITY.OK, message: 'Decimal matches the decimal target.' },
  [`${T.DATE}->date`]: { severity: COMPATIBILITY_SEVERITY.OK, message: 'Date matches the date target.' },
  [`${T.DATE_TIME}->datetime`]: { severity: COMPATIBILITY_SEVERITY.OK, message: 'DateTime matches the datetime target.' },
  [`${T.DATE_TIME}->date`]: { severity: COMPATIBILITY_SEVERITY.WARNING, message: 'DateTime will be truncated to a date at runtime.' },
  [`${T.BOOLEAN}->boolean`]: { severity: COMPATIBILITY_SEVERITY.OK, message: 'Boolean matches the boolean target.' },
});

/**
 * @param {string} sourceType - normalized source type (see FIELD_TYPES)
 * @param {string} targetType - template target type
 * @returns {{ compatible: boolean, severity: string, message: string }}
 */
export function checkTypeCompatibility(sourceType, targetType) {
  if (!sourceType || sourceType === T.UNKNOWN) {
    return {
      compatible: true,
      severity: COMPATIBILITY_SEVERITY.WARNING,
      message: 'The field type is unknown; the value will be validated at runtime.',
    };
  }

  const target = TARGET_TYPE_ALIASES[targetType] ?? targetType;

  if (!TARGET_TYPES.includes(target)) {
    return {
      compatible: true,
      severity: COMPATIBILITY_SEVERITY.WARNING,
      message: `Target type "${targetType}" has no compatibility rule; the value will be validated at runtime.`,
    };
  }

  if (target === 'string') {
    return { compatible: true, severity: COMPATIBILITY_SEVERITY.OK, message: `${sourceType} can be sent as text.` };
  }

  const rule = RULES[`${sourceType}->${target}`];
  if (rule) {
    return { compatible: rule.severity !== COMPATIBILITY_SEVERITY.ERROR, severity: rule.severity, message: rule.message };
  }

  return {
    compatible: false,
    severity: COMPATIBILITY_SEVERITY.ERROR,
    message: `${sourceType} cannot be used as ${target}.`,
  };
}
