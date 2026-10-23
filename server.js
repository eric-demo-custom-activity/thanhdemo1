import { loadConfig, maskSecret } from './server/config.js';
import { createContainer } from './server/container.js';
import { createApp } from './server/app.js';
import { logger, configureLogger } from './server/logger.js';

async function main() {
  const config = loadConfig();
  configureLogger({ level: config.logLevel });

  if (config.isDevelopment) {
    logger.warn(`DEVELOPMENT MODE. Do not expose this instance publicly. JWT verification: ${config.requireJwt ? 'enabled' : 'DISABLED'}.`);
  }
  logger.info(`Mode: ${config.env}`);
  logger.info(`Public base URL: ${config.publicBaseUrl}`);
  logger.info(`JWT verification: ${config.requireJwt ? 'required' : 'disabled'}, secret ${maskSecret(config.jwtSecret)}`);
  logger.info(`Notification Hub mode: ${config.notificationHub.mode}`);

  const container = await createContainer({ config });
  const app = createApp({ container, config });

  const server = app.listen(config.port, () => {
    logger.info(`Listening on port ${config.port}`);
  });

  const shutdown = (signal) => {
    logger.info(`${signal} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  logger.error(`Startup failed: ${error.message}`);
  for (const detail of error.details ?? []) {
    logger.error(`  - ${detail.message ?? detail.code}`);
  }
  process.exit(1);
});
