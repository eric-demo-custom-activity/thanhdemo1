/**
 * Catch-all for unknown routes. Registered after all routers.
 */
export function notFoundHandler(req, res) {
  res.status(404).json({ message: 'Not found' });
}
