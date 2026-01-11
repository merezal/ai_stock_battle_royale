import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import {
  executeBotOnce,
  executeAllActiveBots,
  startBotExecutionLoop,
  stopBotExecutionLoop,
  isBotLoopRunning,
  getExecutionState,
} from '../services/bot-executor';
import { toolDefinitions } from '../services/mcp-tools';

const router = Router();

// Get user's prompt
router.get('/prompt/:userId', async (req: Request<{ userId: string }>, res: Response) => {
  try {
    const userId = parseInt(req.params.userId);

    const prompt = await prisma.llmPrompt.findFirst({
      where: { userId },
      orderBy: { lastModified: 'desc' },
    });

    if (!prompt) {
      return res.json({
        promptId: null,
        promptText: '',
        isActive: false,
        version: 0,
      });
    }

    return res.json({
      promptId: prompt.id,
      promptText: prompt.promptText,
      isActive: prompt.isActive,
      version: prompt.version,
      lastModified: prompt.lastModified,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to get prompt' });
  }
});

// Save/update user's prompt
router.post('/prompt', async (req: Request, res: Response) => {
  try {
    const { userId, promptText } = req.body;

    if (!userId || typeof promptText !== 'string') {
      return res.status(400).json({ error: 'userId and promptText are required' });
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Find existing prompt or create new one
    const existingPrompt = await prisma.llmPrompt.findFirst({
      where: { userId },
      orderBy: { lastModified: 'desc' },
    });

    let prompt;
    if (existingPrompt) {
      prompt = await prisma.llmPrompt.update({
        where: { id: existingPrompt.id },
        data: {
          promptText,
          lastModified: new Date(),
          version: { increment: 1 },
        },
      });
    } else {
      prompt = await prisma.llmPrompt.create({
        data: {
          userId,
          promptText,
          isActive: false,
        },
      });
    }

    return res.json({
      success: true,
      promptId: prompt.id,
      version: prompt.version,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to save prompt' });
  }
});

// Toggle bot active state
router.post('/toggle', async (req: Request, res: Response) => {
  try {
    const { userId, isActive } = req.body;

    if (!userId || typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'userId and isActive (boolean) are required' });
    }

    const existingPrompt = await prisma.llmPrompt.findFirst({
      where: { userId },
      orderBy: { lastModified: 'desc' },
    });

    if (!existingPrompt) {
      return res.status(404).json({ error: 'No prompt found. Please save a prompt first.' });
    }

    const prompt = await prisma.llmPrompt.update({
      where: { id: existingPrompt.id },
      data: {
        isActive,
        lastModified: new Date(),
      },
    });

    return res.json({
      success: true,
      isActive: prompt.isActive,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to toggle bot' });
  }
});

// Run bot once manually
router.post('/run-once', async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const result = await executeBotOnce(userId);
    return res.json(result);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to run bot' });
  }
});

// Get recent activity logs for a user
router.get('/logs/:userId', async (req: Request<{ userId: string }>, res: Response) => {
  try {
    const userId = parseInt(req.params.userId);
    const limit = parseInt(req.query.limit as string) || 50;

    const logs = await prisma.llmActivityLog.findMany({
      where: { userId },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    return res.json(
      logs.map((log) => ({
        logId: log.id,
        actionType: log.actionType,
        actionDetails: log.actionDetails,
        result: log.result,
        timestamp: log.timestamp,
      }))
    );
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to get activity logs' });
  }
});

// Get available tools info
router.get('/tools', async (_req: Request, res: Response) => {
  return res.json(
    toolDefinitions.map((tool) => ({
      name: tool.name,
      description: tool.description,
    }))
  );
});

// Admin: Start the bot execution loop
router.post('/admin/start-loop', async (_req: Request, res: Response) => {
  try {
    startBotExecutionLoop();
    return res.json({ success: true, message: 'Bot execution loop started' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to start bot loop' });
  }
});

// Admin: Stop the bot execution loop
router.post('/admin/stop-loop', async (_req: Request, res: Response) => {
  try {
    stopBotExecutionLoop();
    return res.json({ success: true, message: 'Bot execution loop stopped' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to stop bot loop' });
  }
});

// Admin: Get loop status and execution state
router.get('/admin/status', async (_req: Request, res: Response) => {
  const activePrompts = await prisma.llmPrompt.count({
    where: { isActive: true },
  });

  const executionState = getExecutionState();

  return res.json({
    loopRunning: isBotLoopRunning(),
    activeBotsCount: activePrompts,
    executionInterval: parseInt(process.env.BOT_EXECUTION_INTERVAL || '30000', 10),
    ...executionState,
  });
});

// Admin: Run all active bots once
router.post('/admin/run-all', async (_req: Request, res: Response) => {
  try {
    const results = await executeAllActiveBots();
    return res.json({ success: true, results });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to run all bots' });
  }
});

export default router;
