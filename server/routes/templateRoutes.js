import { Router } from 'express';

/**
 * Template catalog routes, mounted under /api.
 *
 * GET /api/templates
 *
 * @param {object} deps
 * @param {import('../controllers/templateController.js').TemplateController} deps.controller
 * @returns {import('express').Router}
 */
export function createTemplateRouter({ controller }) {
  const router = Router();

  router.get('/templates', controller.getTemplates);

  return router;
}
