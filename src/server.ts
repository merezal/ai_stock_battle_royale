import app from './app';
import { startBotExecutionLoop } from './services/bot-executor';
import { logger } from './lib/logger';

const port = process.env.PORT || 3000;

app.listen(port, () => {
  logger.info(`Server running on port ${port}`);

  // Auto-start the bot execution loop
  startBotExecutionLoop();
});
