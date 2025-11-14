import {
  AllItemTypeArrays,
  ComKey,
  Item,
  ItemQuery,
  LocKeyArray,
  PriKey
} from "@fjell/core";
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
      facetTTL: options.facetTTL || 60,        // 1 minute for partial queries
      debug: options.debug || false
    };

    if (this.options.debug) {
      logger.info('TwoLayerCacheMap initialized', {
        underlyingType: this.underlyingCache.implementationType,
        itemTTL: this.options.itemTTL,
        queryTTL: this.options.queryTTL,
        facetTTL: this.options.facetTTL
      });
    }
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
    // Store the basic query result in underlying cache
    await this.underlyingCache.setQueryResult(queryHash, itemKeys);
    
    // Store metadata for this query with proper TTL
    const now = new Date();
    const isComplete = this.determineQueryCompleteness(queryHash, itemKeys);
    const ttlSeconds = isComplete ? this.options.queryTTL : this.options.facetTTL;
    
    const metadata: QueryMetadata = {
      queryType: this.extractQueryType(queryHash),
      isComplete,
      createdAt: now,
      expiresAt: new Date(now.getTime() + ttlSeconds * 1000),
      filter: this.extractFilter(queryHash),
      params: this.extractParams(queryHash)
    };
    
    this.queryMetadataMap.set(queryHash, metadata);
    
    if (this.options.debug) {
      logger.debug('Set query result with metadata', {
        queryHash,
        itemCount: itemKeys.length,
        isComplete,
        ttlSeconds,
        expiresAt: metadata.expiresAt.toISOString()
      });
    }
  }

  /**
   * Get a query result with expiration checking
   */
  async getQueryResult(queryHash: string): Promise<(ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[] | null> {
    // Check if query has expired based on metadata
    const metadata = this.queryMetadataMap.get(queryHash);
    if (metadata && metadata.expiresAt < new Date()) {
      // Query has expired - clean it up
      await this.deleteQueryResult(queryHash);
      
      if (this.options.debug) {
        logger.debug('Query result expired and removed', { queryHash });
      }
      
      return null;
    }
    
    // Get the actual query result from underlying cache
    const result = await this.underlyingCache.getQueryResult(queryHash);
    
    if (result && this.options.debug) {
      logger.debug('Query result cache hit', {
        queryHash,
        itemCount: result.length,
        isComplete: metadata?.isComplete
      });
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
    await this.underlyingCache.deleteQueryResult(queryHash);
    this.queryMetadataMap.delete(queryHash);
    
    if (this.options.debug) {
      logger.debug('Deleted query result', { queryHash });
    }
  }

  // ===== QUERY INVALIDATION (CRITICAL FOR TWO-LAYER ARCHITECTURE) =====

  /**
   * Invalidate queries that are affected by item changes
   */
  private async invalidateQueriesForItem(
    itemKey: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>
  ): Promise<void> {
    const affectedQueries = await this.findQueriesContainingItem(itemKey);
    
    for (const queryHash of affectedQueries) {
      await this.deleteQueryResult(queryHash);
    }
    
    if (this.options.debug && affectedQueries.length > 0) {
      logger.debug('Invalidated queries for item change', {
        itemKey: JSON.stringify(itemKey),
        queriesInvalidated: affectedQueries.length
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
    if (queryHash.includes('facet:') || queryHash.includes('filter:')) {
      return false; // Partial query
    }
    
    if (queryHash.includes('all:') && !queryHash.includes('query:')) {
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
    const now = new Date();
    const expiredQueries: string[] = [];

    for (const [queryHash, metadata] of this.queryMetadataMap.entries()) {
      if (metadata.expiresAt < now) {
        expiredQueries.push(queryHash);
      }
    }

    for (const queryHash of expiredQueries) {
      await this.deleteQueryResult(queryHash);
    }

    if (this.options.debug && expiredQueries.length > 0) {
      logger.debug('Cleaned up expired queries', { count: expiredQueries.length });
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
    // Use underlying cache implementation
    if ('invalidateItemKeys' in this.underlyingCache && typeof this.underlyingCache.invalidateItemKeys === 'function') {
      await (this.underlyingCache as any).invalidateItemKeys(keys);
    }
    
    // Also invalidate queries for each affected item
    for (const key of keys) {
      await this.invalidateQueriesForItem(key);
    }
  }

  async invalidateLocation(locations: LocKeyArray<L1, L2, L3, L4, L5> | []): Promise<void> {
    // Use underlying cache implementation
    if ('invalidateLocation' in this.underlyingCache && typeof this.underlyingCache.invalidateLocation === 'function') {
      await (this.underlyingCache as any).invalidateLocation(locations);
    }
    
    // Clear all query metadata since location invalidation affects many items
    this.queryMetadataMap.clear();
  }

  async clearQueryResults(): Promise<void> {
    // Use underlying cache implementation
    if ('clearQueryResults' in this.underlyingCache && typeof this.underlyingCache.clearQueryResults === 'function') {
      await (this.underlyingCache as any).clearQueryResults();
    }
    
    // Clear our query metadata
    this.queryMetadataMap.clear();
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
