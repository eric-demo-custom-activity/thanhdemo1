/*
 * Domain errors. Each error carries a stable code, an HTTP status and a message
 * that is safe to return to Journey Builder. Details never include secrets,
 * tokens, customer values or stack traces.
 */

export class AppError extends Error {
  /**
   * @param {string} message - safe, user-facing message
   * @param {{ code: string, status: number, details?: unknown[] }} options
   */
  constructor(message, { code, status, details = [] }) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message = 'The request is invalid.', details = []) {
    super(message, { code: 'VALIDATION_FAILED', status: 400, details });
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed.') {
    super(message, { code: 'AUTHENTICATION_FAILED', status: 401 });
  }
}

export class ConfigurationError extends AppError {
  constructor(message, details = []) {
    super(message, { code: 'INVALID_CONFIGURATION', status: 500, details });
  }
}

export class TemplateNotFoundError extends AppError {
  constructor(templateKey) {
    super('The selected template does not exist.', { code: 'TEMPLATE_NOT_FOUND', status: 400, details: [] });
    this.templateKey = templateKey;
  }
}

export class NotificationHubError extends AppError {
  constructor(message = 'Notification Hub rejected the request.') {
    super(message, { code: 'NOTIFICATION_HUB_ERROR', status: 502 });
  }
}
