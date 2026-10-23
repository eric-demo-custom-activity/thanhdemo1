/*
 * Name normalization for comparisons (field matching, channel lookup).
 * "customerId", "Customer_Id", "CUSTOMERID" and "customer-id" are all equal.
 */

/**
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeName(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[_\-\s]/g, '').toLowerCase();
}
