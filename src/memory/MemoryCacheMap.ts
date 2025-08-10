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

  public set(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>, value: V): void {
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

  public delete(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): void {
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

  public keys(): (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[] {
    return Object.values(this.map).map(entry => entry.originalKey);
  }

  public async values(): Promise<V[]> {
    return Object.values(this.map).map(entry => entry.value);
  }

  public clear(): void {
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
    for (const key of this.keys()) {
      // get() will use the correct normalized retrieval
      const value = await this.get(key);
      if (value) { // Should handle null/undefined values if they can be set
        clone.set(key, value);
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

  public setQueryResult(queryHash: string, itemKeys: (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[]): void {
    logger.trace('setQueryResult', { queryHash, itemKeys });

    const entry: QueryCacheEntry = {
      itemKeys: [...itemKeys] // Create a copy to avoid external mutations
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

  public hasQueryResult(queryHash: string): boolean {
    const entry = this.queryResultCache[queryHash];
    return !!entry;
  }

  public deleteQueryResult(queryHash: string): void {
    logger.trace('deleteQueryResult', { queryHash });
    delete this.queryResultCache[queryHash];
  }

  public invalidateItemKeys(keys: (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[]): void {
    logger.debug('invalidateItemKeys', { keys });
    keys.forEach(key => {
      this.delete(key);
    });
  }

  public async invalidateLocation(locations: LocKeyArray<L1, L2, L3, L4, L5> | []): Promise<void> {
    logger.debug('invalidateLocation', { locations });

    if (locations.length === 0) {
      // For primary items (no location), clear all primary keys
      const allKeys = this.keys();
      const primaryKeys = allKeys.filter(key => !isComKey(key));
      this.invalidateItemKeys(primaryKeys);
    } else {
      // For contained items, get all items in the location and invalidate them
      const itemsInLocation = await this.allIn(locations);
      const keysToInvalidate = itemsInLocation.map(item => item.key);
      this.invalidateItemKeys(keysToInvalidate);
    }

    // Clear all query results that might be affected
    // For now, we'll clear all query results to be safe
    // A more sophisticated approach would be to track which queries are location-specific
    this.clearQueryResults();
  }

  public clearQueryResults(): void {
    logger.trace('clearQueryResults');
    this.queryResultCache = {};
  }

  // CacheMapMetadataProvider implementation
  public getMetadata(key: string): CacheItemMetadata | null {
    return this.metadataMap.get(key) || null;
  }

  public setMetadata(key: string, metadata: CacheItemMetadata): void {
    this.metadataMap.set(key, metadata);
  }

  public deleteMetadata(key: string): void {
    this.metadataMap.delete(key);
  }

  public getAllMetadata(): Map<string, CacheItemMetadata> {
    return new Map(this.metadataMap);
  }

  public clearMetadata(): void {
    this.metadataMap.clear();
  }

  public getCurrentSize(): { itemCount: number; sizeBytes: number } {
    let sizeBytes = 0;
    for (const entry of Object.values(this.map)) {
      sizeBytes += estimateValueSize(entry.value);
    }

    return {
      itemCount: Object.keys(this.map).length,
      sizeBytes
    };
  }

  public getSizeLimits(): { maxItems: number | null; maxSizeBytes: number | null } {
    // Basic MemoryCacheMap has no size limits
    return {
      maxItems: null,
      maxSizeBytes: null
    };
  }
}
