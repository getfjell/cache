import { QueryCacheLayer, QueryMetadata, QueryResult } from '../types/TwoLayerTypes';

/**
 * Query Cache Layer - Stores query results as arrays of item keys + metadata
 *
 * This layer is responsible for:
 * - Storing query results with metadata (complete vs partial)
 * - Different TTLs for complete vs faceted queries
 * - Pattern-based invalidation
 * - Tracking query completeness to prevent cache poisoning
 */
export class QueryCache implements QueryCacheLayer {
  private storage: Map<string, QueryResult>;
  private queryTTL: number;      // TTL for complete queries
  private facetTTL: number;      // TTL for faceted/partial queries
  private debug: boolean;

  constructor(options: {
    queryTTL?: number;
    facetTTL?: number;
    debug?: boolean;
  } = {}) {
    this.storage = new Map();
    this.queryTTL = options.queryTTL || 300;  // 5 minutes for complete queries
    this.facetTTL = options.facetTTL || 60;   // 1 minute for faceted queries
    this.debug = options.debug || false;
  }

  async getResult(queryKey: string): Promise<QueryResult | null> {
    const result = this.storage.get(queryKey);

    if (!result) {
      if (this.debug) {
        console.log(`[QueryCache] Cache miss for query: ${queryKey}`);
      }
      return null;
    }

    // Check expiration
    if (result.metadata.expiresAt < new Date()) {
      if (this.debug) {
        console.log(`[QueryCache] Expired query removed: ${queryKey}`);
      }
      this.storage.delete(queryKey);
      return null;
    }

    if (this.debug) {
      console.log(`[QueryCache] Cache hit for query: ${queryKey} (${result.itemKeys.length} items, complete: ${result.metadata.isComplete})`);
    }
    return result;
  }

  async setResult(queryKey: string, result: QueryResult): Promise<void> {
    // Set TTL based on completeness - this is KEY to preventing cache poisoning
    const ttlSeconds = result.metadata.isComplete ? this.queryTTL : this.facetTTL;
    
    // Always set expiration time
    const now = new Date();
    result.metadata.expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
    
    // Ensure createdAt is set
    if (!result.metadata.createdAt) {
      result.metadata.createdAt = now;
    }

    this.storage.set(queryKey, result);

    if (this.debug) {
      console.log(`[QueryCache] Stored query result: ${queryKey}`);
      console.log(`  - Items: ${result.itemKeys.length}`);
      console.log(`  - Complete: ${result.metadata.isComplete}`);
      console.log(`  - TTL: ${ttlSeconds}s`);
      console.log(`  - Expires: ${result.metadata.expiresAt.toISOString()}`);
    }
  }

  async invalidatePattern(pattern: string): Promise<void> {
    let invalidatedCount = 0;
    
    try {
      const regex = new RegExp(pattern);
      
      for (const [key] of this.storage) {
        if (regex.test(key)) {
          this.storage.delete(key);
          invalidatedCount++;
        }
      }
    } catch (error) {
      // If regex is invalid, fall back to simple string matching
      if (this.debug) {
        console.warn(`[QueryCache] Invalid regex pattern: ${pattern}, using string matching`);
      }
      
      for (const [key] of this.storage) {
        if (key.includes(pattern)) {
          this.storage.delete(key);
          invalidatedCount++;
        }
      }
    }

    if (this.debug) {
      console.log(`[QueryCache] Invalidated ${invalidatedCount} queries matching pattern: ${pattern}`);
    }
  }

  async clear(): Promise<void> {
    const count = this.storage.size;
    this.storage.clear();
    if (this.debug) {
      console.log(`[QueryCache] Cleared ${count} query results`);
    }
  }

  // ===== UTILITY METHODS =====

  /**
   * Get all query keys (for debugging and targeted invalidation)
   */
  getAllQueryKeys(): string[] {
    return Array.from(this.storage.keys());
  }

  /**
   * Find queries that contain a specific item key
   */
  findQueriesContainingItem(itemKey: string): string[] {
    const matchingQueries: string[] = [];

    for (const [queryKey, result] of this.storage.entries()) {
      // Check if this query result contains the item
      if (result.itemKeys.includes(itemKey)) {
        matchingQueries.push(queryKey);
      }
    }

    if (this.debug && matchingQueries.length > 0) {
      console.log(`[QueryCache] Found ${matchingQueries.length} queries containing item: ${itemKey}`);
    }

    return matchingQueries;
  }

  /**
   * Invalidate all queries containing a specific item
   */
  async invalidateQueriesContainingItem(itemKey: string): Promise<void> {
    const affectedQueries = this.findQueriesContainingItem(itemKey);
    
    for (const queryKey of affectedQueries) {
      this.storage.delete(queryKey);
    }

    if (this.debug) {
      console.log(`[QueryCache] Invalidated ${affectedQueries.length} queries containing item: ${itemKey}`);
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const now = new Date();
    let expiredCount = 0;
    let validCount = 0;
    let completeCount = 0;
    let partialCount = 0;

    for (const [key, result] of this.storage.entries()) {
      if (result.metadata.expiresAt < now) {
        expiredCount++;
      } else {
        validCount++;
        if (result.metadata.isComplete) {
          completeCount++;
        } else {
          partialCount++;
        }
      }
    }

    return {
      total: this.storage.size,
      valid: validCount,
      expired: expiredCount,
      complete: completeCount,
      partial: partialCount
    };
  }

  /**
   * Clean up expired query results
   */
  cleanup(): number {
    const now = new Date();
    let removedCount = 0;

    for (const [key, result] of this.storage.entries()) {
      if (result.metadata.expiresAt < now) {
        this.storage.delete(key);
        removedCount++;
      }
    }

    if (this.debug && removedCount > 0) {
      console.log(`[QueryCache] Cleaned up ${removedCount} expired query results`);
    }

    return removedCount;
  }
}
