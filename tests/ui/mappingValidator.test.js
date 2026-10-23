import { describe, it, expect } from '@jest/globals';

import { validateMappings, getMissingErrors, VALIDATION_CODES } from '../../public/js/domain/mappingValidator.js';
import { createFieldCatalog } from '../../public/js/schema/field-catalog-model.js';

const zns = {
  templateKey: 'fptlc.order-confirm.zns.6a12eabf',
  displayName: 'Order Confirmation ZNS',
  channel: 'zns',
  version: 1,
  addresses: [{ name: 'phone', required: true, type: 'phone' }],
  recipientFields: [{ name: 'customerId', required: true, type: 'string' }],
  params: [
    { name: 'customerName', required: true, type: 'string' },
    { name: 'amount', required: true, type: 'string' },
    { name: 'shopName', required: false, type: 'string' },
  ],
};

const email = {
  templateKey: 'acc.password-reset.email.5c9d21a7',
  displayName: 'Password Reset Email',
  channel: 'email',
  version: 1,
  addresses: [{ name: 'email', required: true, type: 'email' }],
  recipientFields: [{ name: 'customerId', required: true, type: 'string' }],
  params: [{ name: 'resetLink', required: true, type: 'url' }],
};

/** Normalized entry-schema catalog (the shape state stores after discovery). */
const catalog = createFieldCatalog({
  eventDefinitionKey: 'CONTACT_EVENT_KEY',
  fields: [
    { id: 'CustomerId', name: 'CustomerId', label: 'Customer ID', dataType: 'Text', bindingPath: 'CustomerId' },
    { id: 'CustomerName', name: 'CustomerName', label: 'Customer Name', dataType: 'Text', bindingPath: 'CustomerName' },
    { id: 'MobilePhone', name: 'MobilePhone', label: 'Mobile Phone', dataType: 'Phone', bindingPath: 'MobilePhone' },
    { id: 'OrderAmount', name: 'OrderAmount', label: 'Order Amount', dataType: 'Number', bindingPath: 'OrderAmount' },
    { id: 'ShopName', name: 'ShopName', label: 'Shop Name', dataType: 'Text', bindingPath: 'ShopName' },
    { id: 'OrderToken', name: 'OrderToken', label: 'Order Token', dataType: 'Text', bindingPath: 'OrderToken' },
  ],
});

const fullZnsMapping = () => ({
  'addresses.phone': { mode: 'field', value: 'MobilePhone' },
  customerId: { mode: 'field', value: 'CustomerId' },
  'params.customerName': { mode: 'field', value: 'CustomerName' },
  'params.amount': { mode: 'field', value: 'OrderAmount' },
});

const codesOf = (result) => result.errors.map((item) => item.code);

const validate = ({ template, mappings, fieldCatalog = catalog, eventDefinitionKey = 'CONTACT_EVENT_KEY' }) =>
  validateMappings({ template, mappings, fieldCatalog, eventDefinitionKey });

describe('mappingValidator', () => {
  describe('Rule 1: required fields must be mapped', () => {
    it('reports a required parameter that is not mapped', () => {
      const mappings = fullZnsMapping();
      delete mappings['params.amount'];

      const result = validate({ template: zns, mappings });

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: VALIDATION_CODES.REQUIRED_MISSING,
          targetKey: 'params.amount',
          name: 'amount',
        })
      );
    });

    it('accepts a template whose required fields are all mapped', () => {
      const result = validate({ template: zns, mappings: fullZnsMapping() });

      expect(result).toEqual({ valid: true, errors: [], warnings: [] });
    });

    it('does not require optional parameters', () => {
      const result = validate({ template: zns, mappings: fullZnsMapping() });

      expect(result.errors.map((item) => item.targetKey)).not.toContain('params.shopName');
    });
  });

  describe('Rule 2: static values cannot be empty', () => {
    it('flags a static value that is an empty string', () => {
      const mappings = { ...fullZnsMapping(), 'params.shopName': { mode: 'static', value: '' } };

      const result = validate({ template: zns, mappings });

      expect(result.valid).toBe(false);
      expect(codesOf(result)).toContain(VALIDATION_CODES.STATIC_EMPTY);
    });

    it('flags a static value that is only whitespace', () => {
      const mappings = { ...fullZnsMapping(), 'params.shopName': { mode: 'static', value: '   ' } };

      const result = validate({ template: zns, mappings });

      expect(codesOf(result)).toContain(VALIDATION_CODES.STATIC_EMPTY);
    });

    it('accepts a non-empty static value', () => {
      const mappings = { ...fullZnsMapping(), 'params.shopName': { mode: 'static', value: 'Long Chau Pharmacy' } };

      const result = validate({ template: zns, mappings });

      expect(result.valid).toBe(true);
    });
  });

  describe('Rule 3: field mappings cannot be empty', () => {
    it('flags a field mapping with no field selected', () => {
      const mappings = { ...fullZnsMapping(), 'params.amount': { mode: 'field', value: '' } };

      const result = validate({ template: zns, mappings });

      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: VALIDATION_CODES.FIELD_EMPTY, targetKey: 'params.amount' })
      );
    });

    it('flags a field mapping that points to a field not in the catalog', () => {
      const mappings = { ...fullZnsMapping(), 'params.amount': { mode: 'field', value: 'NoSuchField' } };

      const result = validate({ template: zns, mappings });

      expect(codesOf(result)).toContain(VALIDATION_CODES.SOURCE_FIELD_NOT_FOUND);
    });
  });

  describe('Rules 4 and 5: address and recipient routing targets must exist', () => {
    it('reports the phone address when it is not mapped', () => {
      const mappings = fullZnsMapping();
      delete mappings['addresses.phone'];

      const result = validate({ template: zns, mappings });

      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: VALIDATION_CODES.REQUIRED_MISSING, targetKey: 'addresses.phone' })
      );
    });

    it('reports customerId when it is not mapped', () => {
      const mappings = fullZnsMapping();
      delete mappings.customerId;

      const result = validate({ template: zns, mappings });

      expect(result.errors.map((item) => item.targetKey)).toContain('customerId');
    });

    it('applies the routing rule to an optional address of another channel (email)', () => {
      const emailOptional = { ...email, addresses: [{ name: 'email', required: false, type: 'email' }] };

      const result = validate({ template: emailOptional, mappings: {} });

      expect(codesOf(result)).toContain(VALIDATION_CODES.ROUTING_MISSING);
    });

    it('accepts an email template that maps its address and recipient (no phone needed)', () => {
      const mappings = {
        'addresses.email': { mode: 'field', value: 'CustomerId' },
        customerId: { mode: 'field', value: 'CustomerId' },
        'params.resetLink': { mode: 'field', value: 'OrderToken' },
      };

      const result = validate({ template: email, mappings });

      expect(result.valid).toBe(true);
    });
  });

  describe('Journey entry schema gating', () => {
    it('blocks field mappings when the event definition key is missing', () => {
      const result = validate({ template: zns, mappings: fullZnsMapping(), eventDefinitionKey: null });

      expect(result.valid).toBe(false);
      expect(codesOf(result)).toContain(VALIDATION_CODES.EVENT_DEFINITION_KEY_MISSING);
    });

    it('blocks field mappings when the schema is unavailable', () => {
      const emptyCatalog = createFieldCatalog({ eventDefinitionKey: 'CONTACT_EVENT_KEY', fields: [] });
      const result = validate({ template: zns, mappings: fullZnsMapping(), fieldCatalog: emptyCatalog });

      expect(result.valid).toBe(false);
      expect(codesOf(result)).toContain(VALIDATION_CODES.SCHEMA_UNAVAILABLE);
    });

    it('keeps static mappings valid when the schema is unavailable', () => {
      const staticOnlyTemplate = {
        templateKey: 'tpl.static.1',
        displayName: 'Static Only',
        channel: 'sms',
        version: 1,
        addresses: [],
        recipientFields: [],
        params: [{ name: 'shopName', required: false, type: 'string' }],
      };
      const emptyCatalog = createFieldCatalog({ eventDefinitionKey: null, fields: [] });
      const mappings = { 'params.shopName': { mode: 'static', value: 'Fixed' } };

      const result = validate({
        template: staticOnlyTemplate,
        mappings,
        fieldCatalog: emptyCatalog,
        eventDefinitionKey: null,
      });

      expect(result.valid).toBe(true);
    });
  });

  describe('defensive checks', () => {
    it('reports a mapping for a target the template does not define', () => {
      const mappings = { ...fullZnsMapping(), 'params.ghost': { mode: 'field', value: 'ShopName' } };

      const result = validate({ template: zns, mappings });

      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: VALIDATION_CODES.UNKNOWN_TARGET, targetKey: 'params.ghost' })
      );
    });

    it('reports an unsupported mode', () => {
      const mappings = { ...fullZnsMapping(), 'params.amount': { mode: 'json', value: 'x' } };

      const result = validate({ template: zns, mappings });

      expect(codesOf(result)).toContain(VALIDATION_CODES.INVALID_MODE);
    });

    it('returns NO_TEMPLATE when no template is selected', () => {
      const result = validate({ template: null, mappings: {} });

      expect(result.valid).toBe(false);
      expect(codesOf(result)).toEqual([VALIDATION_CODES.NO_TEMPLATE]);
    });
  });

  describe('getMissingErrors', () => {
    it('returns only the errors that mean "not mapped yet"', () => {
      const mappings = {
        ...fullZnsMapping(),
        'params.amount': { mode: 'field', value: '' },
        'params.shopName': { mode: 'static', value: '' },
      };
      delete mappings['params.customerName'];

      const result = validate({ template: zns, mappings });
      const missing = getMissingErrors(result).map((item) => item.name);

      expect(missing).toEqual(expect.arrayContaining(['customerName', 'amount']));
      expect(codesOf({ errors: getMissingErrors(result) })).not.toContain(VALIDATION_CODES.STATIC_EMPTY);
    });
  });
});