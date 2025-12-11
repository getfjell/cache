import {
  AllItemTypeArrays,
  ComKey,
  isComKey,
  isQueryMatch,
  Item,
  ItemQuery,
  LocKeyArray,
  PriKey
} from "@fjell/core";
import { CacheItemMetadata } from "../eviction/EvictionStrategy";
import { createNormalizedHashFunction, isLocKeyArrayEqual, QueryCacheEntry } from "../normalization";
import { AsyncIndexDBCacheMap } from "./AsyncIndexDBCacheMap";
import LibLogger from "../logger";
import { CacheMap } from "../CacheMap";

const logger = LibLogger.get("IndexDBCacheMap");

interface MemoryEntry<K, V> {
  originalKey: K;
  value: V;
  metadata?: CacheItemMetadata;
}

/**
 * Synchronous IndexedDB CacheMap wrapper implementation.
 *
 * This implementation provides synchronous memory operations with background IndexedDB persistence.
 * Memory operations are immediate while IndexedDB operations happen asynchronously in the background.
 *
 * Benefits:
 * - Fast memory access for immediate operations
 * - Background persistence to IndexedDB for durability
 * - Synchronous API compatible with other CacheMap implementations
 * - Automatic sync between memory and IndexedDB
 */
export class IndexDBCacheMap<
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
> extends CacheMap<V, S, L1, L2, L3, L4, L5> {

  public readonly implementationType = "browser/indexedDB";

  // Memory storage
  private memoryMap: { [key: string]: MemoryEntry<ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>, V> } = {};
  private queryResultCache: { [queryHash: string]: QueryCacheEntry } = {};
  private metadataMap: Map<string, CacheItemMetadata> = new Map();
  private normalizedHashFunction: (key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>) => string;
  protected types: AllItemTypeArrays<S, L1, L2, L3, L4, L5>;

  // IndexedDB for persistence
  public asyncCache: AsyncIndexDBCacheMap<V, S, L1, L2, L3, L4, L5>;

  // Background sync management
  private syncInterval: NodeJS.Timeout | null = null;
  private pendingOperations: Array<{
    type: 'set' | 'delete' | 'clear';
    key?: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>;
    value?: V;
    metadata?: CacheItemMetadata;
    sequenceId: number;
  }> = [];
  private sequenceCounter = 0;

  public constructor(
    types: AllItemTypeArrays<S, L1, L2, L3, L4, L5>,
    dbName: string = 'fjell-indexdb-cache',
    storeName: string = 'cache',
    version: number = 1
  ) {
    super(types);
    this.types = types;
    this.normalizedHashFunction = createNormalizedHashFunction<ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>>();
    this.asyncCache = new AsyncIndexDBCacheMap<V, S, L1, L2, L3, L4, L5>(types, dbName, storeName, version);

    // Initialize from IndexedDB and start background sync
    this.initializeFromIndexedDB();
    this.startPeriodicSync();
  }

  private async initializeFromIndexedDB(): Promise<void> {
    try {
      const keys = await this.asyncCache.keys();

      let successCount = 0;
      let errorCount = 0;

      for (const key of keys) {
        try {
          const hashedKey = this.normalizedHashFunction(key);
          // Only load if not already in memory cache
          if (!this.memoryMap[hashedKey]) {
            const value = await this.asyncCache.get(key);
            if (value) {
              this.memoryMap[hashedKey] = {
                originalKey: key,
                value: value
              };
              successCount++;
            }
          }
        } catch (keyError) {
          // Log the error but continue with other keys
          logger.debug('Failed to load individual key from IndexedDB, skipping', { key, error: keyError });
          errorCount++;
        }
      }

      if (errorCount > 0 && successCount === 0) {
        logger.warning(`Failed to load any keys from IndexedDB (${errorCount} errors), continuing with empty cache`);
      } else if (errorCount > 0) {
        logger.debug(`Loaded ${successCount} keys from IndexedDB with ${errorCount} errors (skipped)`);
      } else if (successCount > 0) {
        logger.debug(`Successfully loaded ${successCount} keys from IndexedDB`);
      }
    } catch (error) {
      // Only log if we can't even access IndexedDB at all (different from per-key errors)
      logger.warning('Failed to access IndexedDB keys during initialization', { error });
    }
  }

  private startPeriodicSync(): void {
    // Process pending operations every 10ms for responsive syncing
    this.syncInterval = setInterval(() => {
      this.processPendingOperations();
    }, 10);
  }

  private async processPendingOperations(): Promise<void> {
    if (this.pendingOperations.length === 0) return;

    const operations = [...this.pendingOperations];
    this.pendingOperations = [];

    for (const op of operations) {
      try {
        switch (op.type) {
          case 'set':
            if (op.key && op.value) {
              await this.asyncCache.set(op.key, op.value, op.metadata);
            }
            break;
          case 'delete':
            if (op.key) {
              await this.asyncCache.delete(op.key);
            }
            break;
          case 'clear':
            await this.asyncCache.clear();
            break;
        }
      } catch (error) {
        console.warn('Failed to sync operation to IndexedDB:', error);
      }
    }
  }

  // Synchronous memory operations

  public async get(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): Promise<V | null> {
    const hashedKey = this.normalizedHashFunction(key);
    const entry = this.memoryMap[hashedKey];

    if (entry && this.normalizedHashFunction(entry.originalKey) === hashedKey) {
      return entry.value;
    }

    return null;
  }

  public async set(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>, value: V): Promise<void> {
    const hashedKey = this.normalizedHashFunction(key);
    const now = Date.now();

    // Create metadata
    const metadata: CacheItemMetadata = {
      key: JSON.stringify(key),
      addedAt: now,
      lastAccessedAt: now,
      accessCount: 1,
      estimatedSize: JSON.stringify(value).length // rough estimate
    };

    // Update memory immediately
    this.memoryMap[hashedKey] = {
      originalKey: key,
      value: value
    };

    // Add to pending operations for background sync
    this.pendingOperations.push({
      type: 'set',
      key,
      value,
      metadata,
      sequenceId: ++this.sequenceCounter
    });

    // Trigger immediate sync for critical operations
    this.processPendingOperations();
  }

  public async includesKey(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): Promise<boolean> {
    const hashedKey = this.normalizedHashFunction(key);
    const entry = this.memoryMap[hashedKey];
    return !!(entry && this.normalizedHashFunction(entry.originalKey) === hashedKey);
  }

  public async delete(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): Promise<void> {
    const hashedKey = this.normalizedHashFunction(key);

    // Remove from memory immediately
    delete this.memoryMap[hashedKey];
    this.metadataMap.delete(hashedKey);

    // Add to pending operations for background sync
    this.pendingOperations.push({
      type: 'delete',
      key,
      sequenceId: ++this.sequenceCounter
    });

    // Trigger immediate sync for critical operations
    this.processPendingOperations();
  }

  public async keys(): Promise<(ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[]> {
    return Object.values(this.memoryMap).map(entry => entry.originalKey);
  }

  public async values(): Promise<V[]> {
    return Object.values(this.memoryMap).map(entry => entry.value);
  }

  public async clear(): Promise<void> {
    // Clear memory immediately
    this.memoryMap = {};
    this.queryResultCache = {};
    this.metadataMap.clear();

    // Add to pending operations for background sync
    this.pendingOperations.push({
      type: 'clear',
      sequenceId: ++this.sequenceCounter
    });

    // Trigger immediate sync for critical operations
    this.processPendingOperations();
  }

  public async allIn(locations: LocKeyArray<L1, L2, L3, L4, L5> | []): Promise<V[]> {
    const result: V[] = [];

    for (const entry of Object.values(this.memoryMap)) {
      const key = entry.originalKey;

      if (locations.length === 0) {
        // Return all items if no locations specified
        result.push(entry.value);
      } else if (isComKey(key)) {
        // Check if item is in specified locations
        if (isLocKeyArrayEqual((key as ComKey<S, L1, L2, L3, L4, L5>).loc, locations)) {
          result.push(entry.value);
        }
      }
    }

    return result;
  }

  public async contains(query: ItemQuery, locations: LocKeyArray<L1, L2, L3, L4, L5> | []): Promise<boolean> {
    const items = await this.queryIn(query, locations);
    return items.length > 0;
  }

  public async queryIn(query: ItemQuery, locations: LocKeyArray<L1, L2, L3, L4, L5> | []): Promise<V[]> {
    const candidates = await this.allIn(locations);

    if (!query.compoundCondition) {
      return candidates;
    }

    return candidates.filter(item => isQueryMatch(item, query));
  }

  // Query result caching methods

  public async setQueryResult(queryHash: string, itemKeys: (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[], metadata?: any): Promise<void> {
    this.queryResultCache[queryHash] = {
      itemKeys,
      metadata
    };

    // Also persist to IndexedDB
    await this.asyncCache.setQueryResult(queryHash, itemKeys, metadata);
  }

  public async getQueryResult(queryHash: string): Promise<(ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[] | null> {
    const entry = this.queryResultCache[queryHash];
    return entry ? entry.itemKeys : null;
  }

  public async getQueryResultWithMetadata(queryHash: string): Promise<{ itemKeys: (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[]; metadata?: any } | null> {
    let entry = this.queryResultCache[queryHash];

    // If not in memory, try to load from IndexedDB
    if (!entry) {
      const persistedResult = await this.asyncCache.getQueryResultWithMetadata(queryHash);
      if (persistedResult) {
        // Cache it in memory
        this.queryResultCache[queryHash] = {
          itemKeys: persistedResult.itemKeys,
          metadata: persistedResult.metadata
        };
        entry = this.queryResultCache[queryHash];
      }
    }

    if (!entry) {
      return null;
    }

    return {
      itemKeys: entry.itemKeys,
      metadata: entry.metadata
    };
  }

  public async hasQueryResult(queryHash: string): Promise<boolean> {
    return queryHash in this.queryResultCache;
  }

  public async deleteQueryResult(queryHash: string): Promise<void> {
    delete this.queryResultCache[queryHash];
  }

  public async clearQueryResults(): Promise<void> {
    this.queryResultCache = {};
  }

  // Invalidation methods

  public async invalidateItemKeys(keys: (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[]): Promise<void> {
    logger.debug('invalidateItemKeys', { keys });

    if (keys.length === 0) {
      // No keys to invalidate, so no queries should be affected
      return;
    }

    // Delete the actual cache entries without triggering individual query invalidations
    for (const key of keys) {
      await this.delete(key);
    }

    // For bulk invalidation, remove entire queries (don't filter)
    this.invalidateQueriesReferencingKeys(keys);
  }

  /**
   * Intelligently invalidate only queries that reference the affected keys
   * This prevents clearing all query results when only specific items change
   */
  private invalidateQueriesReferencingKeys(keys: (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[]): void {
    if (keys.length === 0) {
      return;
    }

    // Convert keys to their hashed form for comparison
    const hashedKeysToInvalidate = new Set(keys.map(key => this.normalizedHashFunction(key)));

    // Clear query results that reference any of the invalidated keys
    const queriesToRemove: string[] = [];
    for (const queryHash in this.queryResultCache) {
      const entry = this.queryResultCache[queryHash];
      if (entry && entry.itemKeys.some(key => keys.some(affectedKey =>
        this.normalizedHashFunction(affectedKey) === this.normalizedHashFunction(key)
      ))) {
        queriesToRemove.push(queryHash);
      }
    }

    // Remove the affected queries
    queriesToRemove.forEach(queryHash => {
      delete this.queryResultCache[queryHash];
    });

    logger.debug('Selectively invalidated queries referencing affected keys', {
      affectedKeys: keys.length,
      queriesRemoved: queriesToRemove.length,
      totalQueries: Object.keys(this.queryResultCache).length
    });
  }

  public async invalidateLocation(locations: LocKeyArray<L1, L2, L3, L4, L5> | []): Promise<void> {
    const itemsToDelete: (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[] = [];

    for (const entry of Object.values(this.memoryMap)) {
      const key = entry.originalKey;

      if (isComKey(key) && isLocKeyArrayEqual((key as ComKey<S, L1, L2, L3, L4, L5>).loc, locations)) {
        itemsToDelete.push(key);
      }
    }

    // Use invalidateItemKeys which will selectively clear only affected queries
    await this.invalidateItemKeys(itemsToDelete);
  }

  // Metadata operations

  public async getMetadata(key: string): Promise<CacheItemMetadata | null> {
    return this.metadataMap.get(key) || null;
  }

  public async setMetadata(key: string, metadata: CacheItemMetadata): Promise<void> {
    this.metadataMap.set(key, metadata);
  }

  public async deleteMetadata(key: string): Promise<void> {
    this.metadataMap.delete(key);
  }

  public async getAllMetadata(): Promise<Map<string, CacheItemMetadata>> {
    return new Map(this.metadataMap);
  }

  public async clearMetadata(): Promise<void> {
    this.metadataMap.clear();
  }

  // Size operations

  public async getCurrentSize(): Promise<{ itemCount: number; sizeBytes: number }> {
    const itemCount = Object.keys(this.memoryMap).length;

    // Calculate actual size
    let sizeBytes = 0;
    for (const entry of Object.values(this.memoryMap)) {
      sizeBytes += JSON.stringify(entry.value).length;
    }

    return { itemCount, sizeBytes };
  }

  public async getSizeLimits(): Promise<{ maxItems: number | null; maxSizeBytes: number | null }> {
    // Memory cache has no hard limits, but IndexedDB does
    return { maxItems: null, maxSizeBytes: null };
  }

  // Clone operation

  public async clone(): Promise<CacheMap<V, S, L1, L2, L3, L4, L5>> {
    const cloned = new IndexDBCacheMap<V, S, L1, L2, L3, L4, L5>(
      this.types,
      'fjell-indexdb-cache-clone',
      'cache-clone',
      1
    );

    // Copy memory state
    cloned.memoryMap = { ...this.memoryMap };
    cloned.queryResultCache = { ...this.queryResultCache };
    cloned.metadataMap = new Map(this.metadataMap);

    return cloned;
  }

  /**
   * Clean up resources when the cache is no longer needed
   */
  public destroy(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }
}
