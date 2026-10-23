import { Router } from 'express';

/**
 * Lifecycle routes, mounted under /journey. Every route passes through the JWT
 * middleware, which is a pass-through only when verification is disabled
 * (development).
 *
 * @param {object} deps
 * @param {import('../controllers/journey.controller.js').JourneyController} deps.controller
 * @param {import('express').RequestHandler} deps.verifyJwt
 * @returns {import('express').Router}
 */
export function createJourneyRouter({ controller, verifyJwt }) {
  const router = Router();
  router.use(verifyJwt);

  router.post('/save', controller.save);
  router.post('/validate', controller.validate);
  router.post('/publish', controller.publish);
  router.post('/stop', controller.stop);
  router.post('/execute', controller.execute);

  return router;
}
