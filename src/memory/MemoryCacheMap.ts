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
import { CacheMap } from "../CacheMap";
import { CacheItemMetadata } from "../eviction/EvictionStrategy";
import { createNormalizedHashFunction, isLocKeyArrayEqual, QueryCacheEntry } from "../normalization";
import { estimateValueSize } from "../utils/CacheSize";
import LibLogger from "../logger";

const logger = LibLogger.get("MemoryCacheMap");

interface DictionaryEntry<K, V> {
  originalKey: K;
  value: V;
}

/**
 * In-memory implementation of CacheMap using a plain object as the underlying storage.
 * This implementation stores all data in memory and will be lost when the application restarts.
 */
export class MemoryCacheMap<
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
> extends CacheMap<V, S, L1, L2, L3, L4, L5> {

  public readonly implementationType = "memory/memory";

  private map: { [key: string]: DictionaryEntry<ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>, V> } = {};
  private normalizedHashFunction: (key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>) => string;

  // Query result cache: maps query hash to cache entry
  private queryResultCache: { [queryHash: string]: QueryCacheEntry } = {};

  // Metadata storage for eviction strategies
  private metadataMap: Map<string, CacheItemMetadata> = new Map();

  public constructor(
    types: AllItemTypeArrays<S, L1, L2, L3, L4, L5>,
    initialData?: { [key: string]: V }
  ) {
    super(types);
    this.normalizedHashFunction = createNormalizedHashFunction<ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>>();

    // Initialize with data if provided
    if (initialData) {
      for (const [keyStr, value] of Object.entries(initialData)) {
        try {
          const key = JSON.parse(keyStr) as ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>;
          this.set(key, value);
        } catch (error) {
          logger.error('Failed to parse initial data key', { keyStr, error });
        }
      }
    }
  }

  public async get(
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
  ): Promise<V | null> {
    logger.trace('get', { key });
    const hashedKey = this.normalizedHashFunction(key);
    const entry = this.map[hashedKey];

    if (entry && this.normalizedHashFunction(entry.originalKey) === hashedKey) {
      // Update metadata for access tracking
      const keyStr = JSON.stringify(key);
      const metadata = this.metadataMap.get(keyStr);
      if (metadata) {
        metadata.lastAccessedAt = Date.now();
        metadata.accessCount++;
      }
      return entry.value;
    }
    return null;
  }

  public async set(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>, value: V): Promise<void> {
    logger.trace('set', { key, value });
    const hashedKey = this.normalizedHashFunction(key);
    const keyStr = JSON.stringify(key);

    // Create or update the item entry
    this.map[hashedKey] = { originalKey: key, value: value };

    // Create metadata if it doesn't exist
    if (!this.metadataMap.has(keyStr)) {
      const now = Date.now();
      const metadata: CacheItemMetadata = {
        key: keyStr,
        addedAt: now,
        lastAccessedAt: now,
        accessCount: 1,
        estimatedSize: estimateValueSize(value)
      };
      this.metadataMap.set(keyStr, metadata);
    } else {
      // Update existing metadata
      const metadata = this.metadataMap.get(keyStr)!;
      metadata.lastAccessedAt = Date.now();
      metadata.accessCount++;
      metadata.estimatedSize = estimateValueSize(value);
    }
  }

  public async includesKey(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): Promise<boolean> {
    const hashedKey = this.normalizedHashFunction(key);
    const entry = this.map[hashedKey];
    return !!entry && this.normalizedHashFunction(entry.originalKey) === hashedKey;
  }

  public async delete(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): Promise<void> {
    logger.trace('delete', { key });
    const hashedKey = this.normalizedHashFunction(key);
    const entry = this.map[hashedKey];
    if (entry && this.normalizedHashFunction(entry.originalKey) === hashedKey) {
      // Remove associated metadata using the original key representation
      const keyStr = JSON.stringify(entry.originalKey);
      this.metadataMap.delete(keyStr);

      delete this.map[hashedKey];

      // Remove this key from any cached query results
      for (const [queryHash, cacheEntry] of Object.entries(this.queryResultCache)) {
        cacheEntry.itemKeys = cacheEntry.itemKeys.filter(k => this.normalizedHashFunction(k) !== hashedKey);
        if (cacheEntry.itemKeys.length === 0) {
          delete this.queryResultCache[queryHash];
        }
      }
    }
  }

  public async keys(): Promise<(ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[]> {
    return Object.values(this.map).map(entry => entry.originalKey);
  }

  public async values(): Promise<V[]> {
    return Object.values(this.map).map(entry => entry.value);
  }

  public async clear(): Promise<void> {
    this.map = {};
    // Clear related metadata and query results to avoid memory leaks
    this.metadataMap.clear();
    this.queryResultCache = {};
  }

  public async allIn(
    locations: LocKeyArray<L1, L2, L3, L4, L5> | []
  ): Promise<V[]> {
    const allValues = await this.values();
    if (locations.length === 0) {
      logger.debug('Returning all items, LocKeys is empty');
      return allValues;
    } else {
      logger.debug('allIn', { locations, count: allValues.length });
      return allValues.filter(item => {
        const key = item.key;
        if (key && isComKey(key)) {
          const comKey = key as ComKey<S, L1, L2, L3, L4, L5>;
          return isLocKeyArrayEqual(locations, comKey.loc);
        }
        return false;
      });
    }
  }

  public async contains(query: ItemQuery, locations: LocKeyArray<L1, L2, L3, L4, L5> | []): Promise<boolean> {
    logger.debug('contains', { query, locations });
    const items = await this.allIn(locations);

    return items.some((item) => isQueryMatch(item, query));
  }

  public async queryIn(
    query: ItemQuery,
    locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = []
  ): Promise<V[]> {
    logger.debug('queryIn', { query, locations });
    const items = await this.allIn(locations);

    return items.filter((item) => isQueryMatch(item, query));
  }

  public async clone(): Promise<MemoryCacheMap<V, S, L1, L2, L3, L4, L5>> {
    const clone = new MemoryCacheMap<V, S, L1, L2, L3, L4, L5>(this.types);
    // Create an independent copy of the map.
    // This is a shallow copy of the entries, so items themselves are not deep-cloned.
    const keys = await this.keys();
    for (const key of keys) {
      // get() will use the correct normalized retrieval
      const value = await this.get(key);
      if (value) { // Should handle null/undefined values if they can be set
        await clone.set(key, value);
      }
    }

    // Copy query result cache
    for (const [queryHash, entry] of Object.entries(this.queryResultCache)) {
      clone.queryResultCache[queryHash] = {
        itemKeys: [...entry.itemKeys] // Shallow copy of the array
      };
    }

    return clone;
  }

  // Query result caching methods implementation

  public async setQueryResult(queryHash: string, itemKeys: (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[], metadata?: any): Promise<void> {
    logger.trace('setQueryResult', { queryHash, itemKeys, hasMetadata: !!metadata });

    const entry: QueryCacheEntry = {
      itemKeys: [...itemKeys], // Create a copy to avoid external mutations
      metadata
    };

    this.queryResultCache[queryHash] = entry;
  }

  public async getQueryResult(queryHash: string): Promise<(ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[] | null> {
    logger.trace('getQueryResult', { queryHash });
    const entry = this.queryResultCache[queryHash];

    if (!entry) {
      return null;
    }

    return [...entry.itemKeys]; // Return a copy to avoid external mutations
  }

  public async getQueryResultWithMetadata(queryHash: string): Promise<{ itemKeys: (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[]; metadata?: any } | null> {
    logger.trace('getQueryResultWithMetadata', { queryHash });
    const entry = this.queryResultCache[queryHash];

    if (!entry) {
      return null;
    }

    return {
      itemKeys: [...entry.itemKeys], // Return a copy to avoid external mutations
      metadata: entry.metadata
    };
  }

  public async hasQueryResult(queryHash: string): Promise<boolean> {
    const entry = this.queryResultCache[queryHash];
    return !!entry;
  }

  public async deleteQueryResult(queryHash: string): Promise<void> {
    logger.trace('deleteQueryResult', { queryHash });
    delete this.queryResultCache[queryHash];
  }

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
    for (const [queryHash, entry] of Object.entries(this.queryResultCache)) {
      const queryReferencesInvalidatedKey = entry.itemKeys.some(itemKey => {
        const hashedItemKey = this.normalizedHashFunction(itemKey);
        return hashedKeysToInvalidate.has(hashedItemKey);
      });

      if (queryReferencesInvalidatedKey) {
        queriesToRemove.push(queryHash);
      }
    }

    // Remove the affected queries
    queriesToRemove.forEach(queryHash => {
      this.deleteQueryResult(queryHash);
    });

    logger.debug('Selectively invalidated queries referencing affected keys', {
      affectedKeys: keys.length,
      queriesRemoved: queriesToRemove.length,
      totalQueries: Object.keys(this.queryResultCache).length
    });
  }

  public async invalidateLocation(locations: LocKeyArray<L1, L2, L3, L4, L5> | []): Promise<void> {
    logger.debug('invalidateLocation', { locations });

    let keysToInvalidate: (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[] = [];

    if (locations.length === 0) {
      // For primary items (no location), clear all primary keys
      const allKeys = await this.keys();
      const primaryKeys = allKeys.filter(key => !isComKey(key));
      keysToInvalidate = primaryKeys;
    } else {
      // For contained items, get all items in the location and invalidate them
      const itemsInLocation = await this.allIn(locations);
      keysToInvalidate = itemsInLocation.map(item => item.key);
    }

    // Use invalidateItemKeys which will selectively clear only affected queries
    await this.invalidateItemKeys(keysToInvalidate);
  }

  public async clearQueryResults(): Promise<void> {
    logger.trace('clearQueryResults');
    this.queryResultCache = {};
  }

  // CacheMapMetadataProvider implementation
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

  public async getCurrentSize(): Promise<{ itemCount: number; sizeBytes: number }> {
    let sizeBytes = 0;
    for (const entry of Object.values(this.map)) {
      sizeBytes += estimateValueSize(entry.value);
    }

    return {
      itemCount: Object.keys(this.map).length,
      sizeBytes
    };
  }

  public async getSizeLimits(): Promise<{ maxItems: number | null; maxSizeBytes: number | null }> {
    // Basic MemoryCacheMap has no size limits
    return {
      maxItems: null,
      maxSizeBytes: null
    };
  }
}
