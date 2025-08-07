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
import { CacheInfo, CacheMap } from "../CacheMap";
import { createNormalizedHashFunction, isLocKeyArrayEqual, QueryCacheEntry } from "../normalization";
import LibLogger from "../logger";

const logger = LibLogger.get("MemoryCacheMap");

interface DictionaryEntry<K, V> {
  originalKey: K;
  value: V;
  timestamp: number; // Added for TTL tracking
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

  // Query result cache: maps query hash to cache entry with expiration
  private queryResultCache: { [queryHash: string]: QueryCacheEntry } = {};

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

  public get(
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
  ): V | null {
    logger.trace('get', { key });
    const hashedKey = this.normalizedHashFunction(key);
    const entry = this.map[hashedKey];
    // Check if entry exists AND the normalized keys match.
    // This is crucial for handling number vs string pk/lk values.
    return entry && this.normalizedHashFunction(entry.originalKey) === hashedKey ? entry.value : null;
  }

  public getWithTTL(
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
    ttl: number
  ): V | null {
    logger.trace('getWithTTL', { key, ttl });

    // If TTL is 0, don't check cache - this disables caching
    if (ttl === 0) {
      return null;
    }

    const hashedKey = this.normalizedHashFunction(key);
    const entry = this.map[hashedKey];

    if (!entry || this.normalizedHashFunction(entry.originalKey) !== hashedKey) {
      return null;
    }

    // Check if the item has expired
    const now = Date.now();
    const age = now - entry.timestamp;

    if (age >= ttl) {
      // Item has expired, remove it from cache
      logger.trace('Item expired, removing from cache', { key, age, ttl });
      delete this.map[hashedKey];
      return null;
    }

    return entry.value;
  }

  public set(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>, value: V): void {
    logger.trace('set', { key, value });
    const hashedKey = this.normalizedHashFunction(key);
    this.map[hashedKey] = { originalKey: key, value: value, timestamp: Date.now() };
  }

  public includesKey(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): boolean {
    const hashedKey = this.normalizedHashFunction(key);
    const entry = this.map[hashedKey];
    return !!entry && this.normalizedHashFunction(entry.originalKey) === hashedKey;
  }

  public delete(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): void {
    logger.trace('delete', { key });
    const hashedKey = this.normalizedHashFunction(key);
    delete this.map[hashedKey];
  }

  public keys(): (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[] {
    return Object.values(this.map).map(entry => entry.originalKey);
  }

  public values(): V[] {
    return Object.values(this.map).map(entry => entry.value);
  }

  public clear(): void {
    this.map = {};
  }

  public allIn(
    locations: LocKeyArray<L1, L2, L3, L4, L5> | []
  ): V[] {
    const allValues = this.values();
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

  public contains(query: ItemQuery, locations: LocKeyArray<L1, L2, L3, L4, L5> | []): boolean {
    logger.debug('contains', { query, locations });
    const items = this.allIn(locations);

    return items.some((item) => isQueryMatch(item, query));
  }

  public queryIn(
    query: ItemQuery,
    locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = []
  ): V[] {
    logger.debug('queryIn', { query, locations });
    const items = this.allIn(locations);

    return items.filter((item) => isQueryMatch(item, query));
  }

  public clone(): MemoryCacheMap<V, S, L1, L2, L3, L4, L5> {
    const clone = new MemoryCacheMap<V, S, L1, L2, L3, L4, L5>(this.types);
    // Create an independent copy of the map.
    // This is a shallow copy of the entries, so items themselves are not deep-cloned.
    for (const key of this.keys()) {
      // get() will use the correct normalized retrieval
      const value = this.get(key);
      if (value) { // Should handle null/undefined values if they can be set
        clone.set(key, value);
      }
    }

    // Copy query result cache
    for (const [queryHash, entry] of Object.entries(this.queryResultCache)) {
      clone.queryResultCache[queryHash] = {
        itemKeys: [...entry.itemKeys], // Shallow copy of the array
        expiresAt: entry.expiresAt
      };
    }

    return clone;
  }

  // Query result caching methods implementation

  public setQueryResult(queryHash: string, itemKeys: (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[], ttl?: number): void {
    logger.trace('setQueryResult', { queryHash, itemKeys, ttl });

    const entry: QueryCacheEntry = {
      itemKeys: [...itemKeys] // Create a copy to avoid external mutations
    };

    if (ttl) {
      entry.expiresAt = Date.now() + ttl;
    }

    this.queryResultCache[queryHash] = entry;
  }

  public getQueryResult(queryHash: string): (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[] | null {
    logger.trace('getQueryResult', { queryHash });
    const entry = this.queryResultCache[queryHash];

    if (!entry) {
      return null;
    }

    // Check if entry has expired
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      logger.trace('Query result expired, removing', { queryHash, expiresAt: entry.expiresAt });
      delete this.queryResultCache[queryHash];
      return null;
    }

    return [...entry.itemKeys]; // Return a copy to avoid external mutations
  }

  public hasQueryResult(queryHash: string): boolean {
    const entry = this.queryResultCache[queryHash];

    if (!entry) {
      return false;
    }

    // Check if entry has expired
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      logger.trace('Query result expired, removing', { queryHash, expiresAt: entry.expiresAt });
      delete this.queryResultCache[queryHash];
      return false;
    }

    return true;
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

  public invalidateLocation(locations: LocKeyArray<L1, L2, L3, L4, L5> | []): void {
    logger.debug('invalidateLocation', { locations });

    if (locations.length === 0) {
      // For primary items (no location), clear all primary keys
      const allKeys = this.keys();
      const primaryKeys = allKeys.filter(key => !isComKey(key));
      this.invalidateItemKeys(primaryKeys);
    } else {
      // For contained items, get all items in the location and invalidate them
      const itemsInLocation = this.allIn(locations);
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

  public getCacheInfo(): CacheInfo {
    return {
      implementationType: this.implementationType,
      supportsTTL: true, // Supports TTL via getWithTTL()
      supportsEviction: false // No eviction support in basic implementation
    };
  }
}
