import {
  AllItemTypeArrays,
  ComKey,
  Item,
  ItemQuery,
  LocKeyArray,
  PriKey
} from "@fjell/types";
import { CacheMap } from "../../CacheMap";
import { QueryMetadata, QueryResult, TwoLayerCacheOptions } from "../types/TwoLayerTypes";
import LibLogger from "../../logger";

const logger = LibLogger.get('TwoLayerCacheMap');

/**
 * TwoLayerCacheMap - Unified implementation that works with existing CacheMap implementations
 *
 * This class enhances any CacheMap implementation with proper two-layer architecture:
 * - Item Layer: Uses the underlying CacheMap for individual item storage
 * - Query Layer: Enhances the CacheMap query result methods with rich metadata
 *
 * Key Benefits:
 * - Works with ALL existing CacheMap implementations (Memory, IndexedDB, localStorage, etc.)
 * - Prevents cache poisoning through proper query metadata
 * - Different TTLs for complete vs partial queries
 * - Automatic query invalidation on item changes
 */
export class TwoLayerCacheMap<
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
> extends CacheMap<V, S, L1, L2, L3, L4, L5> {

  private options: Required<TwoLayerCacheOptions>;

  // Query metadata tracking for enhanced TTL and completeness
  private queryMetadataMap: Map<string, QueryMetadata> = new Map();

  constructor(
    private underlyingCache: CacheMap<V, S, L1, L2, L3, L4, L5>,
    options: TwoLayerCacheOptions = {}
  ) {
    super((underlyingCache as any).types);

    this.options = {
      itemTTL: options.itemTTL || 3600,        // 1 hour for items
      queryTTL: options.queryTTL || 300,       // 5 minutes for complete queries
      facetTTL: options.facetTTL || 60        // 1 minute for partial queries
    };

    logger.debug('TwoLayerCacheMap initialized', {
      underlyingType: this.underlyingCache.implementationType,
      itemTTL: this.options.itemTTL,
      queryTTL: this.options.queryTTL,
      facetTTL: this.options.facetTTL
    });
  }

  // ===== PASS-THROUGH METHODS TO UNDERLYING CACHE (ITEM LAYER) =====

  async get(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): Promise<V | null> {
    return this.underlyingCache.get(key);
  }

  async set(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>, value: V): Promise<void> {
    await this.underlyingCache.set(key, value);

    // Invalidate affected queries when items change
    await this.invalidateQueriesForItem(key);
  }

  async includesKey(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): Promise<boolean> {
    return this.underlyingCache.includesKey(key);
  }

  async delete(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): Promise<void> {
    await this.underlyingCache.delete(key);

    // Invalidate affected queries when items are deleted
    await this.invalidateQueriesForItem(key);
  }

  async allIn(locations: LocKeyArray<L1, L2, L3, L4, L5> | []): Promise<V[]> {
    return this.underlyingCache.allIn(locations);
  }

  async contains(query: ItemQuery, locations: LocKeyArray<L1, L2, L3, L4, L5> | []): Promise<boolean> {
    return this.underlyingCache.contains(query, locations);
  }

  async queryIn(query: ItemQuery, locations: LocKeyArray<L1, L2, L3, L4, L5> | []): Promise<V[]> {
    return this.underlyingCache.queryIn(query, locations);
  }

  async clone(): Promise<CacheMap<V, S, L1, L2, L3, L4, L5>> {
    const clonedUnderlying = await this.underlyingCache.clone();
    return new TwoLayerCacheMap(clonedUnderlying, this.options);
  }

  async keys(): Promise<(ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[]> {
    return this.underlyingCache.keys();
  }

  async values(): Promise<V[]> {
    return this.underlyingCache.values();
  }

  async clear(): Promise<void> {
    await this.underlyingCache.clear();
    this.queryMetadataMap.clear();
  }

  // ===== ENHANCED QUERY LAYER METHODS =====

  /**
   * Set a query result with rich metadata for two-layer architecture
   */
  async setQueryResult(
    queryHash: string,
    itemKeys: (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[]
  ): Promise<void> {
    logger.debug('QUERY_CACHE: TwoLayerCacheMap.setQueryResult() called', {
      queryHash,
      itemKeyCount: itemKeys.length,
      itemKeys: itemKeys.map(k => JSON.stringify(k))
    });
    
    // Create metadata for this query with proper TTL
    const now = new Date();
    const isComplete = this.determineQueryCompleteness(queryHash, itemKeys);
    const ttlSeconds = isComplete ? this.options.queryTTL : this.options.facetTTL;
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    const metadata: QueryMetadata = {
      queryType: this.extractQueryType(queryHash),
      isComplete,
      createdAt: now,
      expiresAt,
      filter: this.extractFilter(queryHash),
      params: this.extractParams(queryHash)
    };

    // Store metadata in memory
    this.queryMetadataMap.set(queryHash, metadata);

    // Store the query result WITH metadata in underlying cache (if supported)
    if ('setQueryResult' in this.underlyingCache) {
      // Check if underlying cache supports metadata (3 parameters)
      const setQueryResultFn = (this.underlyingCache as any).setQueryResult;
      if (setQueryResultFn.length >= 3) {
        // Underlying cache supports metadata - pass it along
        await (this.underlyingCache as any).setQueryResult(queryHash, itemKeys, metadata);
        logger.debug('QUERY_CACHE: Stored query result with metadata in underlying cache', { queryHash });
      } else {
        // Underlying cache doesn't support metadata - store without it
        await this.underlyingCache.setQueryResult(queryHash, itemKeys);
        logger.debug('QUERY_CACHE: Stored query result without metadata in underlying cache (not supported)', { queryHash });
      }
    }

    logger.debug('QUERY_CACHE: Set query result with metadata', {
      queryHash,
      itemCount: itemKeys.length,
      isComplete,
      ttlSeconds,
      queryType: metadata.queryType,
      createdAt: metadata.createdAt.toISOString(),
      expiresAt: metadata.expiresAt.toISOString(),
      filter: metadata.filter,
      params: metadata.params
    });
  }

  /**
   * Get a query result with expiration checking
   */
  async getQueryResult(queryHash: string): Promise<(ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[] | null> {
    logger.debug('QUERY_CACHE: TwoLayerCacheMap.getQueryResult() called', { queryHash });
    
    // Check if metadata is in memory
    let metadata = this.queryMetadataMap.get(queryHash);
    
    // If not in memory, try to load from underlying cache (if supported)
    if (!metadata && 'getQueryResultWithMetadata' in this.underlyingCache) {
      logger.debug('QUERY_CACHE: Metadata not in memory, loading from underlying cache', { queryHash });
      const resultWithMetadata = await (this.underlyingCache as any).getQueryResultWithMetadata(queryHash);
      
      if (resultWithMetadata?.metadata) {
        // Restore metadata from persistent storage
        const restoredMetadata = resultWithMetadata.metadata as QueryMetadata;
        metadata = restoredMetadata;
        this.queryMetadataMap.set(queryHash, restoredMetadata);
        logger.debug('QUERY_CACHE: Loaded metadata from underlying cache', {
          queryHash,
          expiresAt: restoredMetadata.expiresAt.toISOString(),
          isComplete: restoredMetadata.isComplete,
          queryType: restoredMetadata.queryType
        });
      }
    }
    
    // Check expiration if we have metadata
    if (metadata) {
      const now = new Date();
      const isExpired = metadata.expiresAt < now;
      logger.debug('QUERY_CACHE: Query metadata found', {
        queryHash,
        isExpired,
        expiresAt: metadata.expiresAt.toISOString(),
        now: now.toISOString(),
        isComplete: metadata.isComplete,
        queryType: metadata.queryType
      });
      
      if (isExpired) {
        // Query has expired - clean it up
        logger.debug('QUERY_CACHE: Query result EXPIRED, removing', {
          queryHash,
          expiresAt: metadata.expiresAt.toISOString(),
          now: now.toISOString()
        });
        await this.deleteQueryResult(queryHash);
        return null;
      }
    } else {
      logger.debug('QUERY_CACHE: No metadata found for query hash (neither in memory nor persistent)', { queryHash });
    }

    // Get the actual query result from underlying cache
    logger.debug('QUERY_CACHE: Fetching query result from underlying cache', { queryHash });
    const result = await this.underlyingCache.getQueryResult(queryHash);

    if (result) {
      logger.debug('QUERY_CACHE: Query result retrieved from underlying cache', {
        queryHash,
        itemCount: result.length,
        isComplete: metadata?.isComplete,
        itemKeys: result.map(k => JSON.stringify(k))
      });
    } else {
      logger.debug('QUERY_CACHE: No query result found in underlying cache', { queryHash });
    }

    return result;
  }

  /**
   * Check if query result exists and is not expired
   */
  async hasQueryResult(queryHash: string): Promise<boolean> {
    const result = await this.getQueryResult(queryHash);
    return result !== null;
  }

  /**
   * Delete a query result and its metadata
   */
  async deleteQueryResult(queryHash: string): Promise<void> {
    logger.debug('QUERY_CACHE: TwoLayerCacheMap.deleteQueryResult() called', { queryHash });
    
    const hadMetadata = this.queryMetadataMap.has(queryHash);
    const metadata = this.queryMetadataMap.get(queryHash);
    
    await this.underlyingCache.deleteQueryResult(queryHash);
    this.queryMetadataMap.delete(queryHash);

    logger.debug('QUERY_CACHE: Deleted query result', {
      queryHash,
      hadMetadata,
      wasComplete: metadata?.isComplete,
      queryType: metadata?.queryType
    });
  }

  // ===== QUERY INVALIDATION (CRITICAL FOR TWO-LAYER ARCHITECTURE) =====

  /**
   * Invalidate queries that are affected by item changes
   */
  private async invalidateQueriesForItem(
    itemKey: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>
  ): Promise<void> {
    logger.debug('QUERY_CACHE: Invalidating queries for item change', {
      itemKey: JSON.stringify(itemKey)
    });
    
    const affectedQueries = await this.findQueriesContainingItem(itemKey);
    logger.debug('QUERY_CACHE: Found queries containing item', {
      itemKey: JSON.stringify(itemKey),
      affectedQueryCount: affectedQueries.length,
      affectedQueries: affectedQueries
    });

    for (const queryHash of affectedQueries) {
      await this.deleteQueryResult(queryHash);
    }

    if (affectedQueries.length > 0) {
      logger.debug('QUERY_CACHE: Invalidated queries for item change', {
        itemKey: JSON.stringify(itemKey),
        queriesInvalidated: affectedQueries.length,
        queryHashes: affectedQueries
      });
    } else {
      logger.debug('QUERY_CACHE: No queries found containing item', {
        itemKey: JSON.stringify(itemKey)
      });
    }
  }

  /**
   * Find queries that contain a specific item (requires scanning - can be optimized)
   */
  private async findQueriesContainingItem(
    itemKey: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>
  ): Promise<string[]> {
    const affectedQueries: string[] = [];
    const itemKeyStr = JSON.stringify(itemKey);

    // Scan all cached query results to find ones containing this item
    for (const [queryHash, metadata] of this.queryMetadataMap.entries()) {
      const queryResult = await this.underlyingCache.getQueryResult(queryHash);

      if (queryResult && queryResult.some(key => JSON.stringify(key) === itemKeyStr)) {
        affectedQueries.push(queryHash);
      }
    }

    return affectedQueries;
  }

  // ===== METADATA UTILITY METHODS =====

  /**
   * Determine if a query result is complete or partial based on query hash
   */
  private determineQueryCompleteness(
    queryHash: string,
    itemKeys: (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[]
  ): boolean {
    // Heuristic: queries with no filters/params are typically complete
    // Queries with specific filters are typically partial
    
    // Partial queries: faceted queries or filtered queries
    if (queryHash.includes('facet:') || queryHash.includes('filter:')) {
      return false; // Partial query
    }

    // Complete queries: "all" operations with empty query
    if (queryHash.startsWith('all:') && (queryHash.includes('query:{}') || queryHash.includes('"query":{}') || queryHash.includes('"query": {}'))) {
      return true; // Complete "all" query with no filters
    }

    // Complete queries: "all" operations without query parameter
    if (queryHash.startsWith('all:') && !queryHash.includes('query:')) {
      return true; // Complete "all" query
    }

    // Default to partial for safety (shorter TTL)
    return false;
  }

  /**
   * Extract query type from hash for metadata
   */
  private extractQueryType(queryHash: string): string {
    if (queryHash.startsWith('all:')) return 'all';
    if (queryHash.startsWith('find:')) return 'find';
    if (queryHash.startsWith('one:')) return 'one';
    if (queryHash.startsWith('facet:')) return 'facet';
    return 'unknown';
  }

  /**
   * Extract filter information from query hash
   */
  private extractFilter(queryHash: string): string | undefined {
    const filterMatch = queryHash.match(/filter:([^:]+)/);
    return filterMatch ? filterMatch[1] : undefined;
  }

  /**
   * Extract parameters from query hash
   */
  private extractParams(queryHash: string): any {
    try {
      const paramsMatch = queryHash.match(/params:(.+)$/);
      return paramsMatch ? JSON.parse(decodeURIComponent(paramsMatch[1])) : undefined;
    } catch (error) {
      return undefined;
    }
  }

  // ===== METADATA PROVIDER METHODS (DELEGATE TO UNDERLYING) =====

  async getMetadata(key: string): Promise<any> {
    if ('getMetadata' in this.underlyingCache) {
      return (this.underlyingCache as any).getMetadata(key);
    }
    return null;
  }

  async setMetadata(key: string, metadata: any): Promise<void> {
    if ('setMetadata' in this.underlyingCache) {
      await (this.underlyingCache as any).setMetadata(key, metadata);
    }
  }

  async deleteMetadata(key: string): Promise<void> {
    if ('deleteMetadata' in this.underlyingCache) {
      await (this.underlyingCache as any).deleteMetadata(key);
    }
  }

  async getAllMetadata(): Promise<Map<string, any>> {
    if ('getAllMetadata' in this.underlyingCache) {
      return (this.underlyingCache as any).getAllMetadata();
    }
    return new Map();
  }

  async clearMetadata(): Promise<void> {
    if ('clearMetadata' in this.underlyingCache) {
      await (this.underlyingCache as any).clearMetadata();
    }
  }

  async getCurrentSize(): Promise<{ itemCount: number; sizeBytes: number }> {
    if ('getCurrentSize' in this.underlyingCache) {
      return (this.underlyingCache as any).getCurrentSize();
    }
    const keys = await this.keys();
    return { itemCount: keys.length, sizeBytes: 0 };
  }

  async getSizeLimits(): Promise<{ maxItems: number | null; maxSizeBytes: number | null }> {
    if ('getSizeLimits' in this.underlyingCache) {
      return (this.underlyingCache as any).getSizeLimits();
    }
    return { maxItems: null, maxSizeBytes: null };
  }

  // ===== TWO-LAYER SPECIFIC METHODS =====

  /**
   * Get statistics about the two-layer cache
   */
  getTwoLayerStats() {
    const now = new Date();
    let expiredQueries = 0;
    let validQueries = 0;
    let completeQueries = 0;
    let partialQueries = 0;

    for (const [queryHash, metadata] of this.queryMetadataMap.entries()) {
      if (metadata.expiresAt < now) {
        expiredQueries++;
      } else {
        validQueries++;
        if (metadata.isComplete) {
          completeQueries++;
        } else {
          partialQueries++;
        }
      }
    }

    return {
      queryMetadata: {
        total: this.queryMetadataMap.size,
        valid: validQueries,
        expired: expiredQueries,
        complete: completeQueries,
        partial: partialQueries
      }
    };
  }

  /**
   * Clean up expired queries
   */
  async cleanup(): Promise<number> {
    const startTime = Date.now();
    const now = new Date();
    const expiredQueries: string[] = [];

    logger.debug('TWO_LAYER: Starting query cleanup', {
      totalQueries: this.queryMetadataMap.size,
      now: now.toISOString()
    });

    for (const [queryHash, metadata] of this.queryMetadataMap.entries()) {
      if (metadata.expiresAt < now) {
        expiredQueries.push(queryHash);
        logger.debug('TWO_LAYER: Found expired query', {
          queryHash,
          queryType: metadata.queryType,
          isComplete: metadata.isComplete,
          expiresAt: metadata.expiresAt.toISOString(),
          expiredByMs: now.getTime() - metadata.expiresAt.getTime()
        });
      }
    }

    for (const queryHash of expiredQueries) {
      await this.deleteQueryResult(queryHash);
    }

    const duration = Date.now() - startTime;
    
    if (expiredQueries.length > 0) {
      logger.debug('TWO_LAYER: Query cleanup completed', {
        expiredCount: expiredQueries.length,
        totalQueries: this.queryMetadataMap.size,
        duration
      });
    } else {
      logger.debug('TWO_LAYER: Query cleanup - no expired queries', {
        totalQueries: this.queryMetadataMap.size,
        duration
      });
    }

    return expiredQueries.length;
  }

  // ===== PROPERTIES =====

  get implementationType(): string {
    return `two-layer/${this.underlyingCache.implementationType}`;
  }

  // Note: Removed types getter to avoid override conflict with base class
  // The types are accessible through super.types

  // ===== MISSING ABSTRACT METHODS FROM CacheMap =====

  async invalidateItemKeys(keys: (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[]): Promise<void> {
    const startTime = Date.now();
    
    logger.debug('TWO_LAYER: Invalidating item keys', {
      keyCount: keys.length,
      keys: keys.map(k => JSON.stringify(k))
    });
    
    // Use underlying cache implementation
    if ('invalidateItemKeys' in this.underlyingCache && typeof this.underlyingCache.invalidateItemKeys === 'function') {
      await (this.underlyingCache as any).invalidateItemKeys(keys);
    }

    // Also invalidate queries for each affected item
    let totalInvalidatedQueries = 0;
    for (const key of keys) {
      const beforeCount = this.queryMetadataMap.size;
      await this.invalidateQueriesForItem(key);
      const afterCount = this.queryMetadataMap.size;
      const invalidated = beforeCount - afterCount;
      totalInvalidatedQueries += invalidated;
      
      if (invalidated > 0) {
        logger.debug('TWO_LAYER: Invalidated queries for item', {
          key: JSON.stringify(key),
          queriesInvalidated: invalidated
        });
      }
    }

    const duration = Date.now() - startTime;
    
    logger.debug('TWO_LAYER: Item key invalidation completed', {
      keyCount: keys.length,
      totalQueriesInvalidated: totalInvalidatedQueries,
      duration
    });
  }

  async invalidateLocation(locations: LocKeyArray<L1, L2, L3, L4, L5> | []): Promise<void> {
    const startTime = Date.now();
    const queryCountBefore = this.queryMetadataMap.size;
    
    logger.debug('TWO_LAYER: Invalidating location', {
      locations: JSON.stringify(locations),
      queryCountBefore
    });
    
    // Use underlying cache implementation
    if ('invalidateLocation' in this.underlyingCache && typeof this.underlyingCache.invalidateLocation === 'function') {
      await (this.underlyingCache as any).invalidateLocation(locations);
    }

    // Clear all query metadata since location invalidation affects many items
    this.queryMetadataMap.clear();

    const duration = Date.now() - startTime;
    
    logger.debug('TWO_LAYER: Location invalidation completed', {
      locations: JSON.stringify(locations),
      queriesCleared: queryCountBefore,
      duration
    });
  }

  async clearQueryResults(): Promise<void> {
    const startTime = Date.now();
    const queryCountBefore = this.queryMetadataMap.size;
    
    logger.debug('TWO_LAYER: Clearing all query results', {
      queryCountBefore
    });
    
    // Use underlying cache implementation
    if ('clearQueryResults' in this.underlyingCache && typeof this.underlyingCache.clearQueryResults === 'function') {
      await (this.underlyingCache as any).clearQueryResults();
    }

    // Clear our query metadata
    this.queryMetadataMap.clear();

    const duration = Date.now() - startTime;
    
    logger.debug('TWO_LAYER: Cleared all query results', {
      queriesCleared: queryCountBefore,
      duration
    });
  }

  /**
   * Check if two-layer mode is enabled
   */
  get isTwoLayerEnabled(): boolean {
    return true;
  }

  /**
   * Get the underlying cache implementation
   */
  get underlying(): CacheMap<V, S, L1, L2, L3, L4, L5> {
    return this.underlyingCache;
  }
}
