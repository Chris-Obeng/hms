/**
 * Bed24 API Rate Limiter
 * 
 * Implements credit-based rate limiting for Bed24 API V2.
 * Bed24 enforces 100 credits per rolling 5-minute window.
 * 
 * @module lib/bed24-rate-limiter
 * @see https://wiki.beds24.com/index.php/API_V2#Rate_Limits
 */

/**
 * Credit costs for different Bed24 API operations
 */
const OPERATION_COSTS = {
  TOKEN_REFRESH: 1,
  PROPERTY_FETCH: 2,
  BOOKING_FETCH: 3,
  AVAILABILITY_PUSH_PER_ROOM: 5,
  BOOKING_CREATE: 5,
  INVENTORY_FETCH: 3,
} as const;

/**
 * Rate limit configuration
 */
const RATE_LIMIT_CONFIG = {
  MAX_CREDITS: 100, // Maximum credits in the window
  WINDOW_MS: 5 * 60 * 1000, // 5 minutes in milliseconds
  WARNING_THRESHOLD: 80, // Warn when 80% of credits used
} as const;

/**
 * Request record for tracking
 */
interface RequestRecord {
  timestamp: number;
  cost: number;
  operation: string;
}

/**
 * Rate limit status
 */
export interface RateLimitStatus {
  remaining: number;
  total: number;
  resetsIn: number; // milliseconds until window resets
  isNearLimit: boolean; // true if > 80% used
  requests: RequestRecord[];
}

/**
 * In-memory rate limiter for Bed24 API
 * 
 * Tracks API request credits over a rolling 5-minute window.
 * Thread-safe for single-process Node.js (uses in-memory storage).
 * 
 * Note: For multi-process or serverless environments, consider using Redis.
 */
class Bed24RateLimiter {
  private requests: RequestRecord[] = [];

  /**
   * Remove expired requests outside the current window
   */
  private cleanupExpiredRequests(): void {
    const now = Date.now();
    const windowStart = now - RATE_LIMIT_CONFIG.WINDOW_MS;
    
    this.requests = this.requests.filter((req) => req.timestamp >= windowStart);
  }

  /**
   * Calculate total credits used in current window
   */
  private getUsedCredits(): number {
    this.cleanupExpiredRequests();
    return this.requests.reduce((sum, req) => sum + req.cost, 0);
  }

  /**
   * Get remaining credits in current window
   */
  getRemainingCredits(): number {
    const used = this.getUsedCredits();
    return Math.max(0, RATE_LIMIT_CONFIG.MAX_CREDITS - used);
  }

  /**
   * Get current rate limit status
   */
  getStatus(): RateLimitStatus {
    this.cleanupExpiredRequests();
    
    const used = this.getUsedCredits();
    const remaining = RATE_LIMIT_CONFIG.MAX_CREDITS - used;
    
    // Find when the oldest request expires
    const now = Date.now();
    const oldestRequest = this.requests[0];
    const resetsIn = oldestRequest
      ? oldestRequest.timestamp + RATE_LIMIT_CONFIG.WINDOW_MS - now
      : RATE_LIMIT_CONFIG.WINDOW_MS;
    
    return {
      remaining,
      total: RATE_LIMIT_CONFIG.MAX_CREDITS,
      resetsIn: Math.max(0, resetsIn),
      isNearLimit: used >= RATE_LIMIT_CONFIG.WARNING_THRESHOLD,
      requests: [...this.requests], // Return copy for safety
    };
  }

  /**
   * Check if an operation can be performed without exceeding the limit
   * 
   * @param cost - Credit cost of the operation
   * @returns true if operation can proceed, false if it would exceed limit
   */
  canProceed(cost: number): boolean {
    const remaining = this.getRemainingCredits();
    return remaining >= cost;
  }

  /**
   * Record an API request and consume credits
   * 
   * @param operation - Name of the operation (for tracking)
   * @param cost - Credit cost of the operation
   * @throws Error if operation would exceed rate limit
   */
  recordRequest(operation: string, cost: number): void {
    if (!this.canProceed(cost)) {
      const status = this.getStatus();
      const resetMinutes = Math.ceil(status.resetsIn / 60000);
      
      throw new Error(
        `Bed24 API rate limit exceeded. ` +
        `Operation requires ${cost} credits but only ${status.remaining} available. ` +
        `Limit resets in ${resetMinutes} minute${resetMinutes === 1 ? "" : "s"}.`
      );
    }

    this.requests.push({
      timestamp: Date.now(),
      cost,
      operation,
    });
  }

  /**
   * Record a request with automatic cost calculation
   * 
   * @param operation - Type of operation (from OPERATION_COSTS)
   * @param multiplier - Optional multiplier (e.g., number of rooms for availability push)
   */
  recordKnownOperation(
    operation: keyof typeof OPERATION_COSTS,
    multiplier: number = 1
  ): void {
    const cost = OPERATION_COSTS[operation] * multiplier;
    this.recordRequest(operation, cost);
  }

  /**
   * Wait until enough credits are available
   * 
   * @param cost - Required credits
   * @param maxWaitMs - Maximum time to wait (default: 5 minutes)
   * @returns Promise that resolves when credits are available
   */
  async waitForCredits(
    cost: number,
    maxWaitMs: number = RATE_LIMIT_CONFIG.WINDOW_MS
  ): Promise<void> {
    const startTime = Date.now();
    
    while (!this.canProceed(cost)) {
      const elapsed = Date.now() - startTime;
      
      if (elapsed >= maxWaitMs) {
        throw new Error(
          `Timeout waiting for rate limit credits. ` +
          `Required: ${cost}, Available: ${this.getRemainingCredits()}`
        );
      }
      
      // Wait 1 second before checking again
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  /**
   * Reset all tracked requests (for testing purposes only)
   * 
   * @internal
   */
  reset(): void {
    this.requests = [];
  }
}

/**
 * Singleton instance of the rate limiter
 * 
 * Use this instance for all Bed24 API calls to ensure
 * consistent rate limit tracking across the application.
 */
export const bed24RateLimiter = new Bed24RateLimiter();

/**
 * Operation costs for reference
 */
export { OPERATION_COSTS };

/**
 * Rate limit configuration for reference
 */
export { RATE_LIMIT_CONFIG };

/**
 * Helper function to check if an operation can proceed
 * 
 * @param operation - Type of operation
 * @param multiplier - Optional multiplier
 * @returns true if operation can proceed
 */
export function canPerformOperation(
  operation: keyof typeof OPERATION_COSTS,
  multiplier: number = 1
): boolean {
  const cost = OPERATION_COSTS[operation] * multiplier;
  return bed24RateLimiter.canProceed(cost);
}

/**
 * Helper function to get human-readable rate limit status
 */
export function getRateLimitSummary(): string {
  const status = bed24RateLimiter.getStatus();
  const resetMinutes = Math.ceil(status.resetsIn / 60000);
  
  if (status.isNearLimit) {
    return `⚠️ Rate limit warning: ${status.remaining}/${status.total} credits remaining. Resets in ${resetMinutes}m.`;
  }
  
  return `✓ Rate limit OK: ${status.remaining}/${status.total} credits available.`;
}
