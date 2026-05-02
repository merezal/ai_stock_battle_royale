import { prisma } from '../lib/prisma';
import { toolDefinitions, executeTool } from './mcp-tools';
import { logger } from '../lib/logger';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';
const MAX_TOOL_CALLS = 10;

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: OllamaToolCall[];
}

interface OllamaToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

interface OllamaResponse {
  model: string;
  message: {
    role: string;
    content: string;
    thinking?: string;
    tool_calls?: OllamaToolCall[];
  };
  done: boolean;
}

// Build the system prompt for the trading bot
function buildSystemPrompt(username: string, perspective?: string | null): string {
  const perspectiveBlock = perspective?.trim()
    ? `\n\n## Your Current Perspective\nThis is what you wrote to yourself at the end of your last turn. Use it to maintain strategy continuity — you don't need to re-query things you already know:\n\n${perspective.trim()}\n`
    : '';

  return `You are an AI trading bot competing in Stock Battle Royale. You are trading on behalf of user "${username}".${perspectiveBlock}

Your portfolio total asset value is (cash + stock holdings).

IMPORTANT: You have a maximum of ${MAX_TOOL_CALLS} tool calls per turn. After ${MAX_TOOL_CALLS} tool calls, your turn will automatically end and you will not be able to take any more actions until your next turn. Plan your actions carefully and prioritize the most important trades.

You have access to tools that let you:
- View your portfolio and other users' portfolios
- See all companies and their current stock prices
- View the order book (open buy/sell orders)
- Read social posts for market sentiment
- Place buy orders (bids) and sell orders (asks) - you can place multiple in one call
- Fulfill other users' orders - you can fulfill multiple in one call
- Cancel your open orders - you can cancel multiple in one call

Key trading concepts:
- BID: A buy order - you reserve cash to buy shares at a specified price
- ASK: A sell order - you reserve shares to sell at a specified price
- You can fulfill OTHER users' orders immediately (not your own)
- Market price is determined by the last transaction
- Most trading actions accept arrays, so you can place/cancel/fulfill multiple orders in a single tool call to be more efficient

CRITICAL: Never assume or invent ticker symbols. Always call get_companies first to see exactly which companies exist before placing any orders. Only trade tickers returned by that tool.`;
}

// Convert our tool definitions to Ollama format
function getOllamaTools() {
  return toolDefinitions.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

// Call Ollama API
async function callOllama(messages: OllamaMessage[], tools: unknown[]): Promise<OllamaResponse> {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages,
      tools,
      stream: false,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Ollama API error: ${error}`);
  }

  return response.json() as Promise<OllamaResponse>;
}

// Log bot activity
async function logActivity(
  userId: number,
  promptId: number | null,
  actionType: string,
  actionDetails: unknown,
  result: unknown
) {
  const logEntry = await prisma.llmActivityLog.create({
    data: {
      userId,
      promptId,
      actionType,
      actionDetails: actionDetails as object,
      result: result as object,
    },
  });

  // Debug log for assistant_message type
  if (actionType === 'assistant_message') {
    const contentLength = (result as { content?: string })?.content?.length || 0;
    logger.debug('Created assistant_message log', { logEntryId: logEntry.id, contentLength });
  }
}

// Force a perspective update at the end of every turn.
// Passes the full turn conversation so the bot sees actual tool results, not just a compact log.
async function forcePerspectiveUpdate(
  userId: number,
  promptId: number,
  promptText: string,
  turnMessages: OllamaMessage[],
  currentPerspective?: string | null,
): Promise<void> {
  // Build a readable transcript from the turn — skip system + initial user (mandate)
  const transcript = turnMessages
    .slice(2)
    .map(m => {
      if (m.role === 'assistant') {
        const parts: string[] = [];
        if (m.content?.trim()) parts.push(`[reasoning]: ${m.content.trim()}`);
        if (m.tool_calls && m.tool_calls.length > 0) {
          const calls = m.tool_calls
            .map(tc => `  → ${tc.function.name}(${JSON.stringify(tc.function.arguments)})`)
            .join('\n');
          parts.push(`[called tools]\n${calls}`);
        }
        return parts.length > 0 ? parts.join('\n') : null;
      }
      if (m.role === 'tool') {
        const content = m.content.length > 800 ? m.content.slice(0, 800) + '…' : m.content;
        return `[tool result]: ${content}`;
      }
      return null;
    })
    .filter(Boolean)
    .join('\n\n');

  const messages: OllamaMessage[] = [
    {
      role: 'system',
      content: `You are updating your market perspective for your next turn. Be concise (200–400 words). Cover: current holdings and their status, active strategy and reasoning, specific price targets or triggers you are watching, and your planned first action next turn. Respond with ONLY the perspective text — no preamble, no labels, no commentary.`,
    },
    {
      role: 'user',
      content: [
        `Your mandate:\n${promptText}`,
        currentPerspective ? `Your perspective from last turn (edit this, don't rewrite from scratch):\n${currentPerspective}` : 'This is your first perspective — write it fresh.',
        transcript ? `What happened this turn:\n${transcript}` : '(no actions taken this turn)',
        'Write your updated market perspective:',
      ].join('\n\n'),
    },
  ];

  try {
    const response = await callOllama(messages, []);
    const text = (response.message.content || '').trim();
    if (text.length > 0) {
      await prisma.llmPrompt.update({
        where: { id: promptId },
        data: { perspective: text.slice(0, 4000) },
      });
      await logActivity(userId, promptId, 'perspective_updated', {}, { length: text.length });
      logger.debug('Perspective updated', { userId, length: text.length });
    }
  } catch (error) {
    // Non-fatal — perspective update failure should never crash the bot turn
    logger.debug('Perspective update failed', { error: error instanceof Error ? error.message : error });
  }
}

// Execute bot for a single user
export async function executeBot(userId: number, promptId: number, promptText: string) {
  const [user, prompt] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { username: true } }),
    prisma.llmPrompt.findUnique({ where: { id: promptId }, select: { perspective: true } }),
  ]);

  if (!user) {
    throw new Error('User not found');
  }

  const systemPrompt = buildSystemPrompt(user.username, prompt?.perspective);
  const tools = getOllamaTools();

  // Each turn gets a fresh system + user prompt (no context from previous turns)
  const messages: OllamaMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: promptText },
  ];

  let toolCallCount = 0;
  const executionLog: Array<{ action: string; result: unknown }> = [];
  let executionResult: { success: boolean; error?: string; toolCallCount: number; executionLog: typeof executionLog };

  try {
    // Within a single turn: loop up to MAX_TOOL_CALLS times
    // System + User -> LLM -> Tool Call -> Tool Output -> back to LLM (repeat)
    while (toolCallCount < MAX_TOOL_CALLS) {
      const response = await callOllama(messages, tools);

      // Add assistant response to messages for this turn
      messages.push({
        role: 'assistant',
        content: response.message.content || '',
        tool_calls: response.message.tool_calls,
      });

      // Log assistant message if present
      const assistantContent = response.message.thinking || '';
      if (assistantContent.trim().length > 0) {
        logger.debug('Bot thought process', { username: user.username, contentLength: assistantContent.length });

        // Log the message as an activity
        await logActivity(userId, promptId, 'assistant_message', {}, {
          content: assistantContent,
          hasPending: !!response.message.tool_calls && response.message.tool_calls.length > 0,
        });

        executionLog.push({
          action: 'assistant_message',
          result: { content: assistantContent },
        });
      }

      // If no tool calls, we're done with this turn
      if (!response.message.tool_calls || response.message.tool_calls.length === 0) {
        break;
      }

      // Execute each tool call and feed results back to LLM
      for (const toolCall of response.message.tool_calls) {
        toolCallCount++;
        const { name, arguments: args } = toolCall.function;

        logger.debug('Bot executing tool', { username: user.username, tool: name, args });

        const result = await executeTool(userId, name, args);

        executionLog.push({
          action: name,
          result,
        });

        // Log the activity
        await logActivity(userId, promptId, name, args, result);

        // Feed tool result back to LLM for next iteration
        messages.push({
          role: 'tool',
          content: JSON.stringify(result),
        });

        // Stop if we've hit the limit
        if (toolCallCount >= MAX_TOOL_CALLS) {
          break;
        }
      }
    }

    // Log completion
    await logActivity(userId, promptId, 'execution_complete', { toolCallCount }, {
      success: true,
      executionLog,
    });

    executionResult = { success: true as const, toolCallCount, executionLog };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await logActivity(userId, promptId, 'execution_error', { toolCallCount }, {
      success: false,
      error: errorMessage,
      executionLog,
    });

    executionResult = { success: false as const, error: errorMessage, toolCallCount, executionLog };
  }

  // Always update perspective at end of turn, regardless of success/failure
  await forcePerspectiveUpdate(userId, promptId, promptText, messages, prompt?.perspective);

  return executionResult;
}

// Queue and execution state tracking
interface QueuedBot {
  userId: number;
  username: string;
  promptId: number;
  promptText: string;
}

interface ExecutionState {
  currentBot: QueuedBot | null;
  queue: QueuedBot[];
  lastCycleStart: Date | null;
  lastCycleEnd: Date | null;
  isExecuting: boolean;
}

const executionState: ExecutionState = {
  currentBot: null,
  queue: [],
  lastCycleStart: null,
  lastCycleEnd: null,
  isExecuting: false,
};

// Get current execution state for API
export function getExecutionState() {
  return {
    currentBot: executionState.currentBot
      ? {
          userId: executionState.currentBot.userId,
          username: executionState.currentBot.username,
        }
      : null,
    queue: executionState.queue.map((bot) => ({
      userId: bot.userId,
      username: bot.username,
    })),
    lastCycleStart: executionState.lastCycleStart?.toISOString() || null,
    lastCycleEnd: executionState.lastCycleEnd?.toISOString() || null,
    isExecuting: executionState.isExecuting,
  };
}

// Execute all active bots sequentially
export async function executeAllActiveBots() {
  if (executionState.isExecuting) {
    logger.debug('Bot executor already running, skipping cycle');
    return [];
  }

  executionState.isExecuting = true;
  executionState.lastCycleStart = new Date();

  const activePrompts = await prisma.llmPrompt.findMany({
    where: { isActive: true },
    include: { user: { select: { username: true } } },
  });

  logger.info(`Running ${activePrompts.length} active bot(s)`);

  // Build the queue
  executionState.queue = activePrompts.map((prompt) => ({
    userId: prompt.userId,
    username: prompt.user.username,
    promptId: prompt.id,
    promptText: prompt.promptText,
  }));

  const results: Array<{
    userId: number;
    username: string;
    promptId: number;
    result: unknown;
  }> = [];

  // Execute bots sequentially
  while (executionState.queue.length > 0) {
    const bot = executionState.queue.shift()!;
    executionState.currentBot = bot;

    logger.debug('Starting bot execution', { username: bot.username });

    try {
      const result = await executeBot(bot.userId, bot.promptId, bot.promptText);
      results.push({
        userId: bot.userId,
        username: bot.username,
        promptId: bot.promptId,
        result,
      });
    } catch (error) {
      logger.error('Bot execution failed', { username: bot.username, error });
      results.push({
        userId: bot.userId,
        username: bot.username,
        promptId: bot.promptId,
        result: { error: error instanceof Error ? error.message : 'Unknown error' },
      });
    }

    logger.debug('Finished bot execution', { username: bot.username });
  }

  executionState.currentBot = null;
  executionState.isExecuting = false;
  executionState.lastCycleEnd = new Date();

  return results;
}

// Start the bot execution loop
let botIntervalId: NodeJS.Timeout | null = null;

export function startBotExecutionLoop() {
  const interval = parseInt(process.env.BOT_EXECUTION_INTERVAL || '30000', 10);

  if (botIntervalId) {
    logger.warn('Bot execution loop already running');
    return;
  }

  logger.info(`Starting bot execution loop (interval: ${interval}ms)`);

  // Run immediately, then on interval
  executeAllActiveBots().catch((error) => logger.error('Bot execution loop error', error));

  botIntervalId = setInterval(() => {
    executeAllActiveBots().catch((error) => logger.error('Bot execution loop error', error));
  }, interval);
}

export function stopBotExecutionLoop() {
  if (botIntervalId) {
    clearInterval(botIntervalId);
    botIntervalId = null;
    logger.info('Stopped bot execution loop');
  }
}

export function isBotLoopRunning() {
  return botIntervalId !== null;
}

// Execute bot once manually (for testing)
export async function executeBotOnce(userId: number) {
  const prompt = await prisma.llmPrompt.findFirst({
    where: { userId, isActive: true },
    orderBy: { lastModified: 'desc' },
  });

  if (!prompt) {
    return { error: 'No active prompt found for this user' };
  }

  return executeBot(userId, prompt.id, prompt.promptText);
}
