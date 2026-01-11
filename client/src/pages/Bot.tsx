import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '../hooks/useCurrentUser';
import {
  getBotPrompt,
  saveBotPrompt,
  toggleBot,
  runBotOnce,
  getBotLogs,
  getBotTools,
  getBotStatus,
  type BotPrompt,
  type BotActivityLog,
  type BotTool,
  type BotStatus,
} from '../api/client';

export function Bot() {
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [promptText, setPromptText] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [runResult, setRunResult] = useState<{
    success?: boolean;
    error?: string;
    toolCallCount?: number;
    executionLog?: Array<{ action: string; result: unknown }>;
  } | null>(null);

  // Fetch current prompt
  const { data: botPrompt, isLoading: promptLoading } = useQuery<BotPrompt>({
    queryKey: ['botPrompt', user?.id],
    queryFn: () => getBotPrompt(user!.id),
    enabled: !!user?.id,
  });

  // Sync prompt text from server on initial load
  useEffect(() => {
    if (botPrompt && !initialLoaded) {
      setPromptText(botPrompt.promptText);
      setInitialLoaded(true);
    }
  }, [botPrompt, initialLoaded]);

  // Fetch available tools
  const { data: tools } = useQuery<BotTool[]>({
    queryKey: ['botTools'],
    queryFn: getBotTools,
  });

  // Fetch bot status
  const { data: botStatus } = useQuery<BotStatus>({
    queryKey: ['botStatus'],
    queryFn: getBotStatus,
    refetchInterval: 2000, // Poll more frequently to show queue updates
  });

  // Fetch activity logs
  const { data: logs, isLoading: logsLoading } = useQuery<BotActivityLog[]>({
    queryKey: ['botLogs', user?.id],
    queryFn: () => getBotLogs(user!.id, 30),
    enabled: !!user?.id,
    refetchInterval: 10000,
  });

  // Save prompt mutation
  const saveMutation = useMutation({
    mutationFn: () => saveBotPrompt(user!.id, promptText),
    onSuccess: () => {
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ['botPrompt', user?.id] });
    },
  });

  // Toggle mutation
  const toggleMutation = useMutation({
    mutationFn: (isActive: boolean) => toggleBot(user!.id, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['botPrompt', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['botStatus'] });
    },
  });

  // Run once mutation
  const runOnceMutation = useMutation({
    mutationFn: () => runBotOnce(user!.id),
    onSuccess: (result) => {
      setRunResult(result);
      queryClient.invalidateQueries({ queryKey: ['botLogs', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['portfolio', user?.id] });
    },
  });

  if (!user) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold text-white mb-4">AI Trading Bot</h1>
        <p className="text-gray-400">Please log in to configure your trading bot.</p>
      </div>
    );
  }

  if (promptLoading) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  const handlePromptChange = (value: string) => {
    setPromptText(value);
    setHasChanges(value !== (botPrompt?.promptText || ''));
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">AI Trading Bot</h1>
        {botStatus && (
          <div className="flex items-center space-x-4">
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                botStatus.loopRunning
                  ? 'bg-green-900/50 text-green-400'
                  : 'bg-gray-700 text-gray-400'
              }`}
            >
              {botStatus.loopRunning ? 'System Running' : 'System Paused'}
            </span>
            <span className="text-gray-500 text-sm">
              {botStatus.activeBotsCount} active bots
            </span>
          </div>
        )}
      </div>

      {/* Execution Queue */}
      {botStatus && (botStatus.isExecuting || botStatus.queue.length > 0 || botStatus.currentBot) && (
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-xl font-semibold text-white mb-4">Execution Queue</h2>
          <div className="space-y-3">
            {/* Currently Executing */}
            {botStatus.currentBot && (
              <div className="flex items-center space-x-3 bg-green-900/30 border border-green-700 rounded-lg px-4 py-3">
                <div className="relative">
                  <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                </div>
                <span className="text-green-400 font-medium">Currently Executing:</span>
                <span className="text-white">{botStatus.currentBot.username}</span>
              </div>
            )}

            {/* Queue */}
            {botStatus.queue.length > 0 && (
              <div className="space-y-2">
                <p className="text-gray-400 text-sm">Waiting in queue:</p>
                {botStatus.queue.map((bot, index) => (
                  <div
                    key={bot.userId}
                    className="flex items-center space-x-3 bg-gray-700/50 rounded-lg px-4 py-2"
                  >
                    <span className="text-gray-500 font-mono text-sm w-6">{index + 1}.</span>
                    <span className="text-gray-300">{bot.username}</span>
                  </div>
                ))}
              </div>
            )}

            {/* No activity */}
            {!botStatus.currentBot && botStatus.queue.length === 0 && (
              <p className="text-gray-500">No bots currently executing</p>
            )}

            {/* Last cycle info */}
            {botStatus.lastCycleEnd && (
              <p className="text-gray-500 text-sm mt-2">
                Last cycle completed: {new Date(botStatus.lastCycleEnd).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Bot Status & Controls */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-white">Bot Status</h2>
            <p className="text-gray-400 text-sm mt-1">
              {botPrompt?.isActive
                ? 'Your bot is active and will execute on the next cycle'
                : 'Your bot is inactive'}
            </p>
          </div>
          <div className="flex items-center space-x-4">
            {/* Toggle Switch */}
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={botPrompt?.isActive || false}
                onChange={(e) => toggleMutation.mutate(e.target.checked)}
                disabled={toggleMutation.isPending || !botPrompt?.promptId}
                className="sr-only peer"
              />
              <div className="w-14 h-7 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-green-600"></div>
              <span className="ml-3 text-sm font-medium text-gray-300">
                {botPrompt?.isActive ? 'Active' : 'Inactive'}
              </span>
            </label>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-4">
          <button
            onClick={() => runOnceMutation.mutate()}
            disabled={runOnceMutation.isPending || !botPrompt?.promptId}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white px-4 py-2 rounded-md text-sm font-medium"
          >
            {runOnceMutation.isPending ? 'Running...' : 'Run Once'}
          </button>
          {!botPrompt?.promptId && (
            <p className="text-yellow-500 text-sm self-center">
              Save a prompt first to enable bot controls
            </p>
          )}
        </div>
      </div>

      {/* Run Result */}
      {runResult && (
        <div
          className={`rounded-lg p-4 border ${
            runResult.success
              ? 'bg-green-900/20 border-green-700'
              : 'bg-red-900/20 border-red-700'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <h3
              className={`font-medium ${
                runResult.success ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {runResult.success ? 'Execution Complete' : 'Execution Failed'}
            </h3>
            <button
              onClick={() => setRunResult(null)}
              className="text-gray-500 hover:text-gray-300"
            >
              Dismiss
            </button>
          </div>
          {runResult.error && (
            <p className="text-red-400 text-sm">{runResult.error}</p>
          )}
          {runResult.toolCallCount !== undefined && (
            <p className="text-gray-400 text-sm">
              Tool calls made: {runResult.toolCallCount}
            </p>
          )}
          {runResult.executionLog && runResult.executionLog.length > 0 && (
            <div className="mt-2">
              <p className="text-gray-400 text-sm mb-1">Actions taken:</p>
              <ul className="text-sm space-y-1">
                {runResult.executionLog.map((log, i) => (
                  <li key={i} className="text-gray-300">
                    <span className="text-blue-400">{log.action}</span>
                    {(log.result as { error?: string })?.error && (
                      <span className="text-red-400 ml-2">
                        - {(log.result as { error: string }).error}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Prompt Editor */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-white">Bot Prompt</h2>
            <p className="text-gray-400 text-sm mt-1">
              Write instructions for your AI trading bot. The bot will use available
              tools to analyze the market and make trades.
            </p>
          </div>
          {botPrompt?.version ? (
            <span className="text-gray-500 text-sm">v{botPrompt.version}</span>
          ) : null}
        </div>

        <textarea
          value={promptText}
          onChange={(e) => handlePromptChange(e.target.value)}
          placeholder="Enter your trading strategy prompt here...

Example:
Analyze the market and look for undervalued stocks. Check the order book for opportunities where I can buy low and sell high. Be conservative with trades and maintain at least 20% of my portfolio in cash.

Focus on:
1. Stocks with recent price drops that might recover
2. Large bid/ask spreads indicating potential profit opportunities
3. Avoid stocks where one user holds more than 50% (manipulation risk)"
          className="w-full h-64 bg-gray-900 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-green-500 resize-none font-mono text-sm"
        />

        <div className="flex items-center justify-between mt-4">
          <div className="text-sm text-gray-500">
            {hasChanges && <span className="text-yellow-500">Unsaved changes</span>}
            {botPrompt?.lastModified && !hasChanges && (
              <span>
                Last saved: {new Date(botPrompt.lastModified).toLocaleString()}
              </span>
            )}
          </div>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={!hasChanges || saveMutation.isPending}
            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-6 py-2 rounded-md font-medium"
          >
            {saveMutation.isPending ? 'Saving...' : 'Save Prompt'}
          </button>
        </div>

        {saveMutation.isError && (
          <p className="text-red-400 text-sm mt-2">
            Failed to save: {(saveMutation.error as Error).message}
          </p>
        )}
      </div>

      {/* Available Tools */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h2 className="text-xl font-semibold text-white mb-4">Available Tools</h2>
        <p className="text-gray-400 text-sm mb-4">
          Your bot can use these tools to analyze the market and execute trades:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {tools?.map((tool) => (
            <div
              key={tool.name}
              className="bg-gray-700/50 rounded px-3 py-2"
            >
              <code className="text-green-400 text-sm">{tool.name}</code>
              <p className="text-gray-400 text-xs mt-1">{tool.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Activity Logs */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h2 className="text-xl font-semibold text-white mb-4">Recent Activity</h2>
        {logsLoading ? (
          <p className="text-gray-400">Loading logs...</p>
        ) : logs && logs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-gray-400 text-sm border-b border-gray-700">
                  <th className="pb-2">Time</th>
                  <th className="pb-2">Action</th>
                  <th className="pb-2">Details</th>
                  <th className="pb-2">Result</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.logId} className="border-b border-gray-700/50">
                    <td className="py-2 text-gray-400 text-sm whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="py-2">
                      <code className="text-blue-400 text-sm">{log.actionType}</code>
                    </td>
                    <td className="py-2 text-gray-300 text-sm max-w-xs truncate">
                      {log.actionDetails && Object.keys(log.actionDetails).length > 0
                        ? JSON.stringify(log.actionDetails)
                        : '-'}
                    </td>
                    <td className="py-2">
                      {(log.result as { error?: string })?.error ? (
                        <span className="text-red-400 text-sm">
                          {(log.result as { error: string }).error}
                        </span>
                      ) : (log.result as { success?: boolean })?.success !== undefined ? (
                        <span
                          className={`text-sm ${
                            (log.result as { success: boolean }).success
                              ? 'text-green-400'
                              : 'text-red-400'
                          }`}
                        >
                          {(log.result as { success: boolean }).success
                            ? 'Success'
                            : 'Failed'}
                        </span>
                      ) : (
                        <span className="text-gray-500 text-sm">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500">No activity logs yet. Run your bot to see activity.</p>
        )}
      </div>
    </div>
  );
}
