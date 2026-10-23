import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';

import { createHealthRouter } from './routes/health.routes.js';
import { createConfigRouter } from './routes/config.routes.js';
import { createTemplateRouter } from './routes/templateRoutes.js';
import { createJourneyRouter } from './routes/journey.routes.js';
import { createJwtVerificationMiddleware } from './middleware/jwt-verification-middleware.js';
import { notFoundHandler } from './middleware/not-found.middleware.js';
import { errorHandler } from './middleware/error-handler.middleware.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(currentDir, '..', 'public');

/**
 * Builds the Express application. Separate from server.js so tests can import
 * it without opening a port.
 *
 * @param {object} options
 * @param {object} options.container - from createContainer()
 * @param {object} options.config - validated configuration
 * @returns {import('express').Express}
 */
export function createApp({ container, config }) {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

  // Public endpoints
  app.use(createConfigRouter({ config }));
  app.use(createHealthRouter({ config, templateRepository: container.templateRepository }));

  // Body parsing (before JWT verification, which may read body.jwt)
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: true, limit: '100kb' }));

  // Activity UI served from the public root
  app.use(express.static(publicDir, { index: 'index.html', dotfiles: 'ignore' }));

  // Template catalog for the UI
  app.use('/api', createTemplateRouter({ controller: container.templateController }));

  // Journey Builder lifecycle, behind JWT verification
  const verifyJwt = createJwtVerificationMiddleware({
    required: config.requireJwt,
    secret: config.jwtSecret,
    clockSkewSeconds: config.jwtClockSkewSeconds,
  });
  app.use('/journey', createJourneyRouter({ controller: container.journeyController, verifyJwt }));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
