import app from './app';
import { startBotExecutionLoop } from './services/bot-executor';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';

const REQUIRED_ENV_VARS = ['DATABASE_URL', 'JWT_SECRET'] as const;

function validateEnv() {
  const missing = REQUIRED_ENV_VARS.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    logger.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  if (process.env.JWT_SECRET === 'change-this-in-production-use-openssl-rand-base64-32' ||
      process.env.JWT_SECRET === 'your-secret-key-change-in-production') {
    logger.warn('JWT_SECRET is set to an insecure default — change it before going to production');
  }
}

async function main() {
  validateEnv();

  try {
    await prisma.$connect();
    logger.info('Database connection established');
  } catch (error) {
    logger.error('Failed to connect to database', error);
    process.exit(1);
  }

  const port = parseInt(process.env.PORT || '3000', 10);

  app.listen(port, () => {
    logger.info(`Server running on port ${port}`);
    startBotExecutionLoop();
  });
}

main();
