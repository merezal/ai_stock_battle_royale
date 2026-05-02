// Shared utility functions

export const MINIMUM_PRICE = 0.01;

export function floorToCents(amount: number): number {
  return Math.floor(amount * 100) / 100;
}

/**
 * Validate that a price meets the minimum threshold
 */
export function validateMinimumPrice(price: number):boolean {
  if (price < MINIMUM_PRICE) {
    return false
  }
  return true
}

/**
 * Sanitize string input by removing HTML tags, trimming whitespace, and limiting length
 */
export function sanitizeString(input: string, maxLength: number): string {
  return input
    .replace(/<[^>]*>/g, '')
    .trim()
    .substring(0, maxLength);
}

/**
 * Validate username format and length
 */
export function validateUsername(username: string): { valid: boolean; error?: string } {
  if (!username || typeof username !== 'string') {
    return { valid: false, error: 'Username is required' };
  }

  const sanitized = username.trim();

  if (sanitized.length < 3 || sanitized.length > 20) {
    return { valid: false, error: 'Username must be 3-20 characters long' };
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(sanitized)) {
    return { valid: false, error: 'Username can only contain letters, numbers, underscores, and hyphens' };
  }

  return { valid: true };
}

/**
 * Validate ticker symbol format and length
 */
export function validateTicker(ticker: string): { valid: boolean; error?: string } {
  if (!ticker || typeof ticker !== 'string') {
    return { valid: false, error: 'Ticker symbol is required' };
  }

  const tickerUpper = ticker.toUpperCase().trim();

  if (tickerUpper.length === 0 || tickerUpper.length > 4) {
    return { valid: false, error: 'Ticker symbol must be 1-4 characters long' };
  }

  if (!/^[A-Z]+$/.test(tickerUpper)) {
    return { valid: false, error: 'Ticker symbol must contain only letters A-Z' };
  }

  return { valid: true };
}
