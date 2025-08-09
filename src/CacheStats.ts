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

  /**
   * Increment the request counter
   */
  incrementRequests(): void {
    this.stats.numRequests++;
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
