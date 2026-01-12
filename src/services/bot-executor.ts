import { prisma } from '../lib/prisma';
import { toolDefinitions, executeTool } from './mcp-tools';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';
const MAX_TOOL_CALLS = 15;

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
function buildSystemPrompt(username: string): string {
  return `You are an AI trading bot competing in Stock Battle Royale. You are trading on behalf of user "${username}".

Your portfolio total asset value is (cash + stock holdings).

You have access to tools that let you:
- View your portfolio and other users' portfolios
- See all companies and their current stock prices
- View the order book (open buy/sell orders)
- Read social posts for market sentiment
- Place buy orders (bids) and sell orders (asks)
- Fulfill other users' orders
- Cancel your open orders

Key trading concepts:
- BID: A buy order - you reserve cash to buy shares at a specified price
- ASK: A sell order - you reserve shares to sell at a specified price
- You can fulfill OTHER users' orders immediately (not your own)
- Market price is determined by the last transaction`;
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
    console.log(`[DB Log] Created assistant_message log (ID: ${logEntry.id}, content length: ${contentLength})`);
  }
}

// Execute bot for a single user
export async function executeBot(userId: number, promptId: number, promptText: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true },
  });

  if (!user) {
    throw new Error('User not found');
  }

  const systemPrompt = buildSystemPrompt(user.username);
  const tools = getOllamaTools();

  const messages: OllamaMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: promptText },
  ];

  let toolCallCount = 0;
  let messageCount = 0; // Track messages to skip initial system/user prompts
  const executionLog: Array<{ action: string; result: unknown }> = [];

  try {
    while (toolCallCount < MAX_TOOL_CALLS) {
      const response = await callOllama(messages, tools);

      // Add assistant response to messages
      messages.push({
        role: 'assistant',
        content: response.message.content || '',
        tool_calls: response.message.tool_calls,
      });

      messageCount++;

      // Log assistant message (skip initial ones if they're just echoing the prompt)
      const assistantContent = response.message.thinking || '';
      if (assistantContent.trim().length > 0 && messageCount > 0) {
        console.log(`[Bot ${user.username}] Logging thought process (${assistantContent.length} chars)`);

        // Log the message as an activity
        await logActivity(userId, promptId, 'assistant_message', {}, {
          content: assistantContent,
          hasPending: !!response.message.tool_calls && response.message.tool_calls.length > 0,
        });

        executionLog.push({
          action: 'assistant_message',
          result: { content: assistantContent },
        });
      } else if (messageCount > 0) {
        console.log(`[Bot ${user.username}] No thinking content to log (thinking field: ${response.message.thinking ? 'present but empty' : 'not present'})`);
      }

      // If no tool calls, we're done
      if (!response.message.tool_calls || response.message.tool_calls.length === 0) {
        break;
      }

      // Execute each tool call
      for (const toolCall of response.message.tool_calls) {
        toolCallCount++;
        const { name, arguments: args } = toolCall.function;

        console.log(`[Bot ${user.username}] Executing tool: ${name}`, args);

        const result = await executeTool(userId, name, args);

        executionLog.push({
          action: name,
          result,
        });

        // Log the activity
        await logActivity(userId, promptId, name, args, result);

        // Add tool result to messages
        messages.push({
          role: 'tool',
          content: JSON.stringify(result),
        });
      }
    }

    // Log completion
    await logActivity(userId, promptId, 'execution_complete', { toolCallCount }, {
      success: true,
      executionLog,
    });

    return {
      success: true,
      toolCallCount,
      executionLog,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await logActivity(userId, promptId, 'execution_error', { toolCallCount }, {
      success: false,
      error: errorMessage,
      executionLog,
    });

    return {
      success: false,
      error: errorMessage,
      toolCallCount,
      executionLog,
    };
  }
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
    console.log('[Bot Executor] Already executing, skipping this cycle');
    return [];
  }

  executionState.isExecuting = true;
  executionState.lastCycleStart = new Date();

  const activePrompts = await prisma.llmPrompt.findMany({
    where: { isActive: true },
    include: { user: { select: { username: true } } },
  });

  console.log(`[Bot Executor] Running ${activePrompts.length} active bots`);

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

    console.log(`[Bot Executor] Starting execution for ${bot.username}`);

    try {
      const result = await executeBot(bot.userId, bot.promptId, bot.promptText);
      results.push({
        userId: bot.userId,
        username: bot.username,
        promptId: bot.promptId,
        result,
      });
    } catch (error) {
      results.push({
        userId: bot.userId,
        username: bot.username,
        promptId: bot.promptId,
        result: { error: error instanceof Error ? error.message : 'Unknown error' },
      });
    }

    console.log(`[Bot Executor] Finished execution for ${bot.username}`);
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
    console.log('[Bot Executor] Loop already running');
    return;
  }

  console.log(`[Bot Executor] Starting execution loop (interval: ${interval}ms)`);

  // Run immediately, then on interval
  executeAllActiveBots().catch(console.error);

  botIntervalId = setInterval(() => {
    executeAllActiveBots().catch(console.error);
  }, interval);
}

export function stopBotExecutionLoop() {
  if (botIntervalId) {
    clearInterval(botIntervalId);
    botIntervalId = null;
    console.log('[Bot Executor] Stopped execution loop');
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
