// Centralized logging utility

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * Format log message with timestamp and level
 */
function formatLog(level: LogLevel, message: string, meta?: unknown): string {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
}

export const logger = {
  info(message: string, meta?: unknown): void {
    console.log(formatLog('info', message, meta));
  },

  warn(message: string, meta?: unknown): void {
    console.warn(formatLog('warn', message, meta));
  },

  error(message: string, error?: unknown): void {
    if (error instanceof Error) {
      console.error(formatLog('error', message, { error: error.message, stack: error.stack }));
    } else {
      console.error(formatLog('error', message, error));
    }
  },

  debug(message: string, meta?: unknown): void {
    if (isDevelopment) {
      console.log(formatLog('debug', message, meta));
    }
  },
};
