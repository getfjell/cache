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
import { createNormalizedHashFunction, isLocKeyArrayEqual } from "../normalization";
import LibLogger from "../logger";

const logger = LibLogger.get("SessionStorageCacheMap");

/**
 * SessionStorage implementation of CacheMap for browser environments.
 * Data persists only for the current browser tab/session.
 *
 * Note: SessionStorage has a ~5MB limit and stores strings only.
 * Data is synchronous but is lost when the tab is closed.
 */
export class SessionStorageCacheMap<
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
> extends CacheMap<V, S, L1, L2, L3, L4, L5> {

  public readonly implementationType = "browser/sessionStorage";

  private keyPrefix: string;
  private normalizedHashFunction: (key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>) => string;

  public constructor(
    types: AllItemTypeArrays<S, L1, L2, L3, L4, L5>,
    keyPrefix: string = 'fjell-session-cache'
  ) {
    super(types);
    this.keyPrefix = keyPrefix;
    this.normalizedHashFunction = createNormalizedHashFunction<ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>>();
  }

  private getStorageKey(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): string {
    const hashedKey = this.normalizedHashFunction(key);
    return `${this.keyPrefix}:${hashedKey}`;
  }

  private getAllStorageKeys(): string[] {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(`${this.keyPrefix}:`)) {
        keys.push(key);
      }
    }
    return keys;
  }

  public get(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): V | null {
    logger.trace('get', { key });
    try {
      const storageKey = this.getStorageKey(key);
      const stored = sessionStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Verify the original key matches (for collision detection)
        if (this.normalizedHashFunction(parsed.originalKey) === this.normalizedHashFunction(key)) {
          return parsed.value as V;
        }
      }
      return null;
    } catch (error) {
      logger.error('Error retrieving from sessionStorage', { key, error });
      return null;
    }
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

    try {
      const storageKey = this.getStorageKey(key);
      const stored = sessionStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Verify the original key matches (for collision detection)
        if (this.normalizedHashFunction(parsed.originalKey) !== this.normalizedHashFunction(key)) {
          return null;
        }

        // Check if the item has expired
        if (typeof parsed.timestamp === 'number' && !isNaN(parsed.timestamp)) {
          const now = Date.now();
          const age = now - parsed.timestamp;

          if (age >= ttl) {
            // Item has expired, remove it from cache
            logger.trace('Item expired, removing from sessionStorage', { key, age, ttl });
            sessionStorage.removeItem(storageKey);
            return null;
          }
        } else {
          // If no valid timestamp, treat as expired and remove
          logger.trace('Item has no valid timestamp, treating as expired', { key });
          sessionStorage.removeItem(storageKey);
          return null;
        }

        return parsed.value as V;
      }
      return null;
    } catch (error) {
      logger.error('Error retrieving with TTL from sessionStorage', { key, ttl, error });
      return null;
    }
  }

  public set(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>, value: V): void {
    logger.trace('set', { key, value });
    try {
      const storageKey = this.getStorageKey(key);
      const toStore = {
        originalKey: key,
        value: value,
        timestamp: Date.now()
      };
      sessionStorage.setItem(storageKey, JSON.stringify(toStore));
    } catch (error) {
      logger.error('Error storing to sessionStorage', { key, value, error });
      // Handle quota exceeded or other sessionStorage errors
      throw new Error(`Failed to store item in sessionStorage: ${error}`);
    }
  }

  public includesKey(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): boolean {
    try {
      const storageKey = this.getStorageKey(key);
      const stored = sessionStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        return this.normalizedHashFunction(parsed.originalKey) === this.normalizedHashFunction(key);
      }
      return false;
    } catch (error) {
      logger.error('Error checking key in sessionStorage', { key, error });
      return false;
    }
  }

  public delete(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): void {
    logger.trace('delete', { key });
    try {
      const storageKey = this.getStorageKey(key);
      sessionStorage.removeItem(storageKey);
    } catch (error) {
      logger.error('Error deleting from sessionStorage', { key, error });
    }
  }

  public allIn(locations: LocKeyArray<L1, L2, L3, L4, L5> | []): V[] {
    const allKeys = this.keys();

    if (locations.length === 0) {
      logger.debug('Returning all items, LocKeys is empty');
      return allKeys.map(key => this.get(key)).filter(item => item !== null) as V[];
    } else {
      const locKeys: LocKeyArray<L1, L2, L3, L4, L5> | [] = locations;
      logger.debug('allIn', { locKeys, keys: allKeys.length });
      return allKeys
        .filter((key) => key && isComKey(key))
        .filter((key) => {
          const ComKey = key as ComKey<S, L1, L2, L3, L4, L5>;
          logger.debug('Comparing Location Keys', {
            locKeys,
            ComKey,
          });
          return isLocKeyArrayEqual(locKeys, ComKey.loc);
        })
        .map((key) => this.get(key) as V);
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

  public clone(): SessionStorageCacheMap<V, S, L1, L2, L3, L4, L5> {
    // SessionStorage is shared globally for the tab, so clone just creates a new instance with same prefix
    return new SessionStorageCacheMap<V, S, L1, L2, L3, L4, L5>(this.types, this.keyPrefix);
  }

  public keys(): (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[] {
    const keys: (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[] = [];

    try {
      const storageKeys = this.getAllStorageKeys();
      for (const storageKey of storageKeys) {
        const stored = sessionStorage.getItem(storageKey);
        if (!stored) continue;

        try {
          const parsed = JSON.parse(stored);
          if (parsed.originalKey) {
            keys.push(parsed.originalKey);
          }
        } catch (itemError) {
          // Skip items that can't be parsed or are invalid
          logger.trace('Skipping invalid storage item', { storageKey, error: itemError });
        }
      }
    } catch (error) {
      logger.error('Error getting keys from sessionStorage', { error });
    }

    return keys;
  }

  public values(): V[] {
    const values: V[] = [];

    try {
      const storageKeys = this.getAllStorageKeys();
      for (const storageKey of storageKeys) {
        const stored = sessionStorage.getItem(storageKey);
        if (!stored) continue;

        try {
          const parsed = JSON.parse(stored);
          if (parsed.value != null) {
            values.push(parsed.value);
          }
        } catch (itemError) {
          // Skip items that can't be parsed or are invalid
          logger.trace('Skipping invalid storage item for values', { storageKey, error: itemError });
        }
      }
    } catch (error) {
      logger.error('Error getting values from sessionStorage', { error });
    }

    return values;
  }

  public clear(): void {
    logger.debug('Clearing sessionStorage cache');
    try {
      const storageKeys = this.getAllStorageKeys();
      for (const storageKey of storageKeys) {
        sessionStorage.removeItem(storageKey);
      }
    } catch (error) {
      logger.error('Error clearing sessionStorage cache', { error });
    }
  }

  // Query result caching methods implementation

  public setQueryResult(queryHash: string, itemKeys: (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[], ttl?: number): void {
    logger.trace('setQueryResult', { queryHash, itemKeys, ttl });
    const queryKey = `${this.keyPrefix}:query:${queryHash}`;

    const entry: any = {
      itemKeys
    };

    if (ttl) {
      entry.expiresAt = Date.now() + ttl;
    }

    try {
      sessionStorage.setItem(queryKey, JSON.stringify(entry));
    } catch (error) {
      logger.error('Failed to store query result in sessionStorage', { queryHash, error });
    }
  }

  public getQueryResult(queryHash: string): (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[] | null {
    logger.trace('getQueryResult', { queryHash });
    const queryKey = `${this.keyPrefix}:query:${queryHash}`;
    try {
      const data = sessionStorage.getItem(queryKey);
      if (!data) {
        return null;
      }

      const entry = JSON.parse(data);

      // Handle both old format (just array) and new format (with expiration)
      if (Array.isArray(entry)) {
        // Old format without expiration - return as is
        return entry;
      }

      // New format with expiration
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        logger.trace('Query result expired, removing', { queryHash, expiresAt: entry.expiresAt });
        sessionStorage.removeItem(queryKey);
        return null;
      }

      return entry.itemKeys || null;
    } catch (error) {
      logger.error('Failed to retrieve query result from sessionStorage', { queryHash, error });
      return null;
    }
  }

  public hasQueryResult(queryHash: string): boolean {
    // Use getQueryResult which handles expiration checking
    return this.getQueryResult(queryHash) !== null;
  }

  public deleteQueryResult(queryHash: string): void {
    logger.trace('deleteQueryResult', { queryHash });
    const queryKey = `${this.keyPrefix}:query:${queryHash}`;
    try {
      sessionStorage.removeItem(queryKey);
    } catch (error) {
      logger.error('Failed to delete query result from sessionStorage', { queryHash, error });
    }
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
    this.clearQueryResults();
  }

  public clearQueryResults(): void {
    logger.trace('clearQueryResults');
    const queryPrefix = `${this.keyPrefix}:query:`;
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith(queryPrefix)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => sessionStorage.removeItem(key));
    } catch (error) {
      logger.error('Failed to clear query results from sessionStorage', { error });
    }
  }

  public getCacheInfo(): CacheInfo {
    return {
      implementationType: this.implementationType,
      supportsTTL: true, // Supports TTL via getWithTTL()
      supportsEviction: false // Browser storage handles its own eviction
    };
  }
}
