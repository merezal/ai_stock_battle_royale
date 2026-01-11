import app from './app';
import { startBotExecutionLoop } from './services/bot-executor';

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Server running on port ${port}`);

  // Auto-start the bot execution loop
  startBotExecutionLoop();
});
