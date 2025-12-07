import { QueryCacheLayer, QueryMetadata, QueryResult } from '../types/TwoLayerTypes';
import LibLogger from '../../logger';

const logger = LibLogger.get('QueryCache');

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

  constructor(options: {
    queryTTL?: number;
    facetTTL?: number;
  } = {}) {
    this.storage = new Map();
    this.queryTTL = options.queryTTL || 300;  // 5 minutes for complete queries
    this.facetTTL = options.facetTTL || 60;   // 1 minute for faceted queries
  }

  async getResult(queryKey: string): Promise<QueryResult | null> {
    const result = this.storage.get(queryKey);

    if (!result) {
      logger.debug('Cache miss for query', { queryKey });
      return null;
    }

    // Check expiration
    if (result.metadata.expiresAt < new Date()) {
      logger.debug('Expired query removed', { queryKey });
      this.storage.delete(queryKey);
      return null;
    }

    logger.debug('Cache hit for query', {
      queryKey,
      itemCount: result.itemKeys.length,
      isComplete: result.metadata.isComplete
    });
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

    logger.debug('Stored query result', {
      queryKey,
      itemCount: result.itemKeys.length,
      isComplete: result.metadata.isComplete,
      ttlSeconds,
      expiresAt: result.metadata.expiresAt.toISOString()
    });
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
      logger.warning('Invalid regex pattern, using string matching', { pattern });
      
      for (const [key] of this.storage) {
        if (key.includes(pattern)) {
          this.storage.delete(key);
          invalidatedCount++;
        }
      }
    }

    logger.debug('Invalidated queries matching pattern', { pattern, invalidatedCount });
  }

  async clear(): Promise<void> {
    const count = this.storage.size;
    this.storage.clear();
    logger.debug('Cleared query results', { count });
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

    if (matchingQueries.length > 0) {
      logger.debug('Found queries containing item', { itemKey, count: matchingQueries.length });
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

    logger.debug('Invalidated queries containing item', { itemKey, count: affectedQueries.length });
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

    if (removedCount > 0) {
      logger.debug('Cleaned up expired query results', { removedCount });
    }

    return removedCount;
  }
}
