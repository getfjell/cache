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
import { createNormalizedHashFunction, isLocKeyArrayEqual } from "../normalization";
import LibLogger from "../logger";
import { MemoryCacheMap } from "../memory/MemoryCacheMap";

const logger = LibLogger.get("LocalStorageCacheMap");

/**
 * LocalStorage implementation of CacheMap for browser environments.
 * Data persists across browser sessions and page reloads.
 *
 * Note: LocalStorage has a ~5-10MB limit and stores strings only.
 * Data is synchronous and survives browser restarts.
 */
export class LocalStorageCacheMap<
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
> extends CacheMap<V, S, L1, L2, L3, L4, L5> {

  private keyPrefix: string;
  private normalizedHashFunction: (key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>) => string;
  private fallbackCache: MemoryCacheMap<V, S, L1, L2, L3, L4, L5> | null = null;
  private quotaExceeded = false;

  public constructor(
    types: AllItemTypeArrays<S, L1, L2, L3, L4, L5>,
    keyPrefix: string = 'fjell-cache'
  ) {
    super(types);
    this.keyPrefix = keyPrefix;
    this.normalizedHashFunction = createNormalizedHashFunction<ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>>();
  }

  private getStorageKey(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): string {
    const hashedKey = this.normalizedHashFunction(key);
    return `${this.keyPrefix}:${hashedKey}`;
  }

  private initializeFallbackCache(): void {
    if (!this.fallbackCache) {
      this.fallbackCache = new MemoryCacheMap<V, S, L1, L2, L3, L4, L5>(this.types);
      logger.warning('LocalStorage quota exceeded, falling back to in-memory cache');
    }
  }

  private isQuotaExceededError(error: any): boolean {
    return error && (
      error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      error.code === 22 ||
      error.code === 1014
    );
  }

  private tryCleanupOldEntries(): boolean {
    try {
      const allEntries = this.collectCacheEntries();
      return this.removeOldestEntries(allEntries);
    } catch (error) {
      logger.error('Failed to cleanup old localStorage entries', { error });
      return false;
    }
  }

  private collectCacheEntries(): { key: string; timestamp: number }[] {
    const allEntries: { key: string; timestamp: number }[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(this.keyPrefix + ':')) {
        continue;
      }

      try {
        const stored = localStorage.getItem(key);
        if (stored) {
          const parsed = JSON.parse(stored);
          allEntries.push({ key, timestamp: parsed.timestamp || 0 });
        }
      } catch {
        // If we can't parse it, mark it for deletion
        allEntries.push({ key, timestamp: 0 });
      }
    }

    return allEntries;
  }

  private removeOldestEntries(allEntries: { key: string; timestamp: number }[]): boolean {
    // Sort by timestamp (oldest first) and remove the oldest 25% of entries
    allEntries.sort((a, b) => a.timestamp - b.timestamp);
    const toRemove = Math.ceil(allEntries.length * 0.25);

    for (let i = 0; i < toRemove; i++) {
      localStorage.removeItem(allEntries[i].key);
    }

    logger.info(`Cleaned up ${toRemove} old localStorage entries to free space`);
    return toRemove > 0;
  }

  private getAllStorageKeys(): string[] {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`${this.keyPrefix}:`)) {
        keys.push(key);
      }
    }
    return keys;
  }

  public get(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): V | null {
    logger.trace('get', { key });

    // If in fallback mode, check memory cache first
    if (this.quotaExceeded && this.fallbackCache) {
      const memoryResult = this.fallbackCache.get(key);
      if (memoryResult) {
        return memoryResult;
      }
    }

    try {
      const storageKey = this.getStorageKey(key);
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Verify the original key matches (for collision detection)
        if (this.normalizedHashFunction(parsed.originalKey) === this.normalizedHashFunction(key)) {
          return parsed.value as V;
        }
      }

      // If not in fallback mode but have fallback cache, check it too
      if (!this.quotaExceeded && this.fallbackCache) {
        return this.fallbackCache.get(key);
      }

      return null;
    } catch (error) {
      logger.error('Error retrieving from localStorage', { key, error });

      // If localStorage fails but we have fallback, use it
      if (this.fallbackCache) {
        return this.fallbackCache.get(key);
      }

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
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Verify the original key matches (for collision detection)
        if (this.normalizedHashFunction(parsed.originalKey) !== this.normalizedHashFunction(key)) {
          return null;
        }

        // Check if the item has expired (only if timestamp exists)
        if (typeof parsed.timestamp === 'number' && !isNaN(parsed.timestamp)) {
          const now = Date.now();
          const age = now - parsed.timestamp;

          if (age >= ttl) {
            // Item has expired, remove it from cache
            logger.trace('Item expired, removing from localStorage', { key, age, ttl });
            localStorage.removeItem(storageKey);
            return null;
          }
        }
        // If no valid timestamp, treat as non-expiring and return the item

        return parsed.value as V;
      }
      return null;
    } catch (error) {
      logger.error('Error retrieving with TTL from localStorage', { key, ttl, error });
      return null;
    }
  }

  public set(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>, value: V): void {
    logger.trace('set', { key, value });

    // If we're already in fallback mode, use memory cache
    if (this.quotaExceeded && this.fallbackCache) {
      this.fallbackCache.set(key, value);
      return;
    }

    try {
      const storageKey = this.getStorageKey(key);
      const toStore = {
        originalKey: key,
        value: value,
        timestamp: Date.now()
      };
      localStorage.setItem(storageKey, JSON.stringify(toStore));

      // If we previously had quota issues but this succeeds, we might be okay now
      if (this.quotaExceeded) {
        logger.info('LocalStorage is working again, switching back from fallback cache');
        this.quotaExceeded = false;
      }
    } catch (error) {
      logger.error('Error storing to localStorage', { key, value, error });

      if (this.isQuotaExceededError(error)) {
        logger.warning('LocalStorage quota exceeded, attempting cleanup...');

        // Try to clean up old entries first
        const cleanupSucceeded = this.tryCleanupOldEntries();

        if (cleanupSucceeded) {
          // Try again after cleanup
          try {
            const storageKey = this.getStorageKey(key);
            const toStore = {
              originalKey: key,
              value: value,
              timestamp: Date.now()
            };
            localStorage.setItem(storageKey, JSON.stringify(toStore));
            logger.info('Successfully stored item after cleanup');
            return;
          } catch {
            logger.warning('Storage failed even after cleanup, falling back to memory cache');
          }
        }

        // Cleanup failed or retry failed, switch to fallback
        this.quotaExceeded = true;
        this.initializeFallbackCache();
        if (this.fallbackCache) {
          this.fallbackCache.set(key, value);
          logger.info('Item stored in fallback memory cache');
        }
      } else {
        // For non-quota errors, still throw
        throw new Error(`Failed to store item in localStorage: ${error}`);
      }
    }
  }

  public includesKey(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): boolean {
    // If in fallback mode, check memory cache first
    if (this.quotaExceeded && this.fallbackCache) {
      if (this.fallbackCache.includesKey(key)) {
        return true;
      }
    }

    try {
      const storageKey = this.getStorageKey(key);
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        return this.normalizedHashFunction(parsed.originalKey) === this.normalizedHashFunction(key);
      }

      // If not in fallback mode but have fallback cache, check it too
      if (!this.quotaExceeded && this.fallbackCache) {
        return this.fallbackCache.includesKey(key);
      }

      return false;
    } catch (error) {
      logger.error('Error checking key in localStorage', { key, error });

      // If localStorage fails but we have fallback, use it
      if (this.fallbackCache) {
        return this.fallbackCache.includesKey(key);
      }

      return false;
    }
  }

  public delete(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): void {
    logger.trace('delete', { key });

    // Always delete from fallback cache if it exists
    if (this.fallbackCache) {
      this.fallbackCache.delete(key);
    }

    try {
      const storageKey = this.getStorageKey(key);
      localStorage.removeItem(storageKey);
    } catch (error) {
      logger.error('Error deleting from localStorage', { key, error });
      // Non-critical error for delete operation
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

  public clone(): LocalStorageCacheMap<V, S, L1, L2, L3, L4, L5> {
    // LocalStorage is shared globally, so clone just creates a new instance with same prefix
    return new LocalStorageCacheMap<V, S, L1, L2, L3, L4, L5>(this.types, this.keyPrefix);
  }

  private parseStorageEntry(storageKey: string): any | null {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (parseError) {
      // Skip corrupted entries
      logger.debug('Skipping corrupted localStorage entry', { storageKey, error: parseError });
    }
    return null;
  }

  public keys(): (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[] {
    const keys: (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[] = [];

    try {
      const storageKeys = this.getAllStorageKeys();
      for (const storageKey of storageKeys) {
        const parsed = this.parseStorageEntry(storageKey);
        if (parsed?.originalKey) {
          keys.push(parsed.originalKey);
        }
      }
    } catch (error) {
      logger.error('Error getting keys from localStorage', { error });
    }

    return keys;
  }

  public values(): V[] {
    const values: V[] = [];

    try {
      const storageKeys = this.getAllStorageKeys();
      for (const storageKey of storageKeys) {
        const parsed = this.parseStorageEntry(storageKey);
        if (parsed?.value) {
          values.push(parsed.value);
        }
      }
    } catch (error) {
      logger.error('Error getting values from localStorage', { error });
    }

    return values;
  }

  public clear(): void {
    logger.debug('Clearing localStorage cache');
    try {
      const storageKeys = this.getAllStorageKeys();
      for (const storageKey of storageKeys) {
        // Only clear regular cache items, not query results
        if (!storageKey.includes(':query:')) {
          localStorage.removeItem(storageKey);
        }
      }
    } catch (error) {
      logger.error('Error clearing localStorage cache', { error });
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
      localStorage.setItem(queryKey, JSON.stringify(entry));
    } catch (error) {
      logger.error('Failed to store query result in localStorage', { queryHash, error });
    }
  }

  public getQueryResult(queryHash: string): (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[] | null {
    logger.trace('getQueryResult', { queryHash });
    const queryKey = `${this.keyPrefix}:query:${queryHash}`;
    try {
      const data = localStorage.getItem(queryKey);
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
        localStorage.removeItem(queryKey);
        return null;
      }

      return entry.itemKeys || null;
    } catch (error) {
      logger.error('Failed to retrieve query result from localStorage', { queryHash, error });
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
      localStorage.removeItem(queryKey);
    } catch (error) {
      logger.error('Failed to delete query result from localStorage', { queryHash, error });
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
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(queryPrefix)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
    } catch (error) {
      logger.error('Failed to clear query results from localStorage', { error });
    }
  }
}
