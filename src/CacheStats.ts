import LibLogger from './logger';

const logger = LibLogger.get('CacheStats');

/**
 * Cache statistics tracking interface
 */
export interface CacheStats {
  /** Total number of cache requests (get/retrieve operations) */
  numRequests: number;
  /** Total number of cache misses (items not found in cache) */
  numMisses: number;
  /** Total number of cache hits (items found in cache) */
  numHits: number;
  /** Total number of subscription requests */
  numSubscriptions: number;
  /** Total number of unsubscription requests */
  numUnsubscriptions: number;
  /** Current number of active subscriptions */
  activeSubscriptions: number;
}

/**
 * Cache statistics manager that tracks various cache metrics
 */
export class CacheStatsManager {
  private stats: CacheStats = {
    numRequests: 0,
    numMisses: 0,
    numHits: 0,
    numSubscriptions: 0,
    numUnsubscriptions: 0,
    activeSubscriptions: 0
  };
  
  private lastLoggedStats: CacheStats = {
    numRequests: 0,
    numMisses: 0,
    numHits: 0,
    numSubscriptions: 0,
    numUnsubscriptions: 0,
    activeSubscriptions: 0
  };
  private readonly LOG_THRESHOLD = 100; // Log every 100 requests

  /**
   * Increment the request counter
   */
  incrementRequests(): void {
    this.stats.numRequests++;
    this.maybeLogStats();
  }

  /**
   * Increment the cache hit counter
   */
  incrementHits(): void {
    this.stats.numHits++;
  }

  /**
   * Increment the cache miss counter
   */
  incrementMisses(): void {
    this.stats.numMisses++;
  }
  
  /**
   * Log statistics periodically for monitoring
   */
  private maybeLogStats(): void {
    const requestsSinceLastLog = this.stats.numRequests - this.lastLoggedStats.numRequests;
    
    if (requestsSinceLastLog >= this.LOG_THRESHOLD) {
      const hitRate = this.stats.numRequests > 0
        ? ((this.stats.numHits / this.stats.numRequests) * 100).toFixed(2)
        : '0.00';
      
      logger.debug('Cache statistics update', {
        component: 'cache',
        subcomponent: 'CacheStatsManager',
        totalRequests: this.stats.numRequests,
        hits: this.stats.numHits,
        misses: this.stats.numMisses,
        hitRate: `${hitRate}%`,
        activeSubscriptions: this.stats.activeSubscriptions,
        requestsSinceLastLog,
        note: `Statistics logged every ${this.LOG_THRESHOLD} requests for monitoring`
      });
      
      this.lastLoggedStats = { ...this.stats };
    }
  }

  /**
   * Increment the subscription counter
   */
  incrementSubscriptions(): void {
    this.stats.numSubscriptions++;
    this.stats.activeSubscriptions++;
  }

  /**
   * Increment the unsubscription counter
   */
  incrementUnsubscriptions(): void {
    this.stats.numUnsubscriptions++;
    if (this.stats.activeSubscriptions > 0) {
      this.stats.activeSubscriptions--;
    }
  }

  /**
   * Get a copy of the current statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Reset all statistics to zero
   */
  reset(): void {
    this.stats = {
      numRequests: 0,
      numMisses: 0,
      numHits: 0,
      numSubscriptions: 0,
      numUnsubscriptions: 0,
      activeSubscriptions: 0
    };
  }
}
