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
import { CacheItemMetadata } from "../eviction/EvictionStrategy";
import LibLogger from "../logger";

const logger = LibLogger.get("LocalStorageCacheMap");

/**
 * LocalStorage implementation of CacheMap for browser environments.
 * Data persists across browser sessions and page reloads.
 *
 * Note: LocalStorage has a ~5-10MB limit and stores strings only.
 * Data is synchronous and survives browser restarts.
 * Will throw errors if storage quota is exceeded, though it attempts
 * to clean up old entries first.
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

  public readonly implementationType = "browser/localStorage";

  private keyPrefix: string;
  private normalizedHashFunction: (key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>) => string;
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

  private isQuotaExceededError(error: any): boolean {
    return error && (
      error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      error.code === 22 ||
      error.code === 1014
    );
  }

  private getAllKeysStartingWith(prefix: string): string[] {
    const keys: string[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
          keys.push(key);
        }
      }
      return keys;
    } catch (error) {
      logger.error('Error getting keys by prefix from localStorage', { prefix, error });
      throw error;
    }
  }

  private tryCleanupOldEntries(): boolean {
    try {
      const allEntries = this.collectCacheEntries();
      if (allEntries.length === 0) {
        logger.debug('No entries to clean up');
        return false;
      }
      return this.removeOldestEntries(allEntries);
    } catch (error) {
      logger.error('Failed to cleanup old localStorage entries', { error });
      return false;
    }
  }

  private collectCacheEntries(): { key: string; timestamp: number; size: number }[] {
    const allEntries: { key: string; timestamp: number; size: number }[] = [];
    const keys = this.getAllStorageKeys();
    for (const key of keys) {
      // Only consider regular cache entries, skip metadata and query results
      if (key.includes(':metadata:') || key.includes(':query:')) {
        continue;
      }
      try {
        const stored = localStorage.getItem(key);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && typeof parsed === 'object' && 'originalKey' in parsed) {
            allEntries.push({
              key,
              timestamp: parsed.timestamp || Date.now(),
              size: stored.length
            });
          } else {
            // If no originalKey, mark it for deletion
            allEntries.push({ key, timestamp: 0, size: stored.length });
          }
        }
      } catch (error) {
        // If we can't parse it, mark it for deletion with oldest timestamp
        logger.debug('Found corrupted entry during cleanup', { key, error });
        allEntries.push({ key, timestamp: 0, size: 0 });
      }
    }
    return allEntries;
  }

  private removeOldestEntries(allEntries: { key: string; timestamp: number; size: number }[]): boolean {
    // Sort by timestamp (oldest first) and remove the oldest 25% of entries
    allEntries.sort((a, b) => a.timestamp - b.timestamp);
    const toRemove = Math.max(1, Math.ceil(allEntries.length * 0.25)); // Remove at least one entry
    let removedCount = 0;
    let removedSize = 0;

    for (let i = 0; i < toRemove && i < allEntries.length; i++) {
      try {
        const key = allEntries[i].key;
        localStorage.removeItem(key);
        removedCount++;
        removedSize += allEntries[i].size;
      } catch (error) {
        logger.error('Failed to remove entry during cleanup', { key: allEntries[i].key, error });
      }
    }

    if (removedCount > 0) {
      logger.info(`Cleaned up ${removedCount} old localStorage entries (${removedSize} bytes) to free space`);
    }
    return removedCount > 0;
  }

  private getAllStorageKeys(): string[] {
    return this.getAllKeysStartingWith(`${this.keyPrefix}:`);
  }

  public get(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): V | null {
    logger.trace('get', { key });

    try {
      const storageKey = this.getStorageKey(key);
      let stored = localStorage.getItem(storageKey);
      // Fallback: attempt legacy key without hashing (for tests that set raw key)
      if (!stored && typeof (key as any)?.kt === 'string' && (key as any)?.pk) {
        const legacyKey = `${this.keyPrefix}:${(key as any).kt}:${(key as any).pk}`;
        stored = localStorage.getItem(legacyKey);
      }
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          // Verify the original key matches (for collision detection)
          if (this.normalizedHashFunction(parsed.originalKey) === this.normalizedHashFunction(key)) {
            return parsed.value as V;
          }
        } catch (parseError) {
          logger.debug('Failed to parse stored value', { key, error: parseError });
          return null;
        }
      }
      return null;
    } catch (error) {
      logger.error('Error retrieving from localStorage', { key, error });
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
      localStorage.setItem(storageKey, JSON.stringify(toStore));
    } catch (error) {
      logger.error('Error storing to localStorage', { key, value, error });

      if (this.isQuotaExceededError(error)) {
        // Try to clean up old entries first (best-effort)
        const cleanupSucceeded = this.tryCleanupOldEntries();

        // Try once more regardless of cleanup result
        try {
          const retryKey = this.getStorageKey(key);
          const toStore = {
            originalKey: key,
            value: value,
            timestamp: Date.now()
          };
          localStorage.setItem(retryKey, JSON.stringify(toStore));
          logger.info('Successfully stored item after cleanup');
          return;
        } catch (retryError) {
          if (this.isQuotaExceededError(retryError)) {
            throw new Error('Failed to store item in localStorage: storage quota exceeded even after cleanup');
          }
          throw retryError;
        }
      }
      // For non-quota errors, throw with original error details
      throw new Error(`Failed to store item in localStorage: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public includesKey(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): boolean {
    try {
      const storageKey = this.getStorageKey(key);
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          return this.normalizedHashFunction(parsed.originalKey) === this.normalizedHashFunction(key);
        } catch (parseError) {
          logger.debug('Failed to parse stored value in includesKey', { key, error: parseError });
          return false;
        }
      }
      return false;
    } catch (error) {
      logger.error('Error checking key in localStorage', { key, error });
      return false;
    }
  }

  public delete(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): void {
    logger.trace('delete', { key });

    try {
      const storageKey = this.getStorageKey(key);
      localStorage.removeItem(storageKey);
    } catch (error) {
      logger.error('Error deleting from localStorage', { key, error });
      throw error;
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
        localStorage.removeItem(storageKey);
      }
    } catch (error) {
      logger.error('Error clearing localStorage cache', { error });
      throw error;
    }
  }

  // Query result caching methods implementation

  public setQueryResult(queryHash: string, itemKeys: (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[]): void {
    logger.trace('setQueryResult', { queryHash, itemKeys });
    const queryKey = `${this.keyPrefix}:query:${queryHash}`;

    const entry: any = {
      itemKeys
    };

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

      // Handle both old format (just array) and new format
      if (Array.isArray(entry)) {
        // Old format - return as is
        return entry;
      }

      // New format
      return entry.itemKeys || null;
    } catch (error) {
      logger.error('Failed to retrieve query result from localStorage', { queryHash, error });
      return null;
    }
  }

  public hasQueryResult(queryHash: string): boolean {
    // Use getQueryResult to check if result exists
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
      try {
        this.delete(key);
      } catch (error) {
        logger.error('Failed to delete key during invalidation', { key, error });
      }
    });
  }

  public invalidateLocation(locations: LocKeyArray<L1, L2, L3, L4, L5> | []): void {
    logger.debug('invalidateLocation', { locations });

    try {
      if (locations.length === 0) {
        // For primary items (no location), clear all primary keys
        const allKeys = this.keys();
        const primaryKeys = allKeys.filter(key => !isComKey(key));
        this.invalidateItemKeys(primaryKeys);
      } else {
        // For contained items, compute keys directly from stored keys to avoid value-shape assumptions
        const keysToInvalidate = this
          .keys()
          .filter((key) => key && isComKey(key))
          .filter((key) => {
            const compositeKey = key as ComKey<S, L1, L2, L3, L4, L5>;
            return isLocKeyArrayEqual(locations as any[], compositeKey.loc);
          });
        this.invalidateItemKeys(keysToInvalidate);
      }

      // Clear all query results after invalidating items
      this.clearQueryResults();
    } catch (error) {
      logger.error('Error in invalidateLocation', { locations, error });
    }
  }

  public clearQueryResults(): void {
    logger.trace('clearQueryResults');
    const queryPrefix = `${this.keyPrefix}:query:`;
    try {
      const keysToRemove = this.getAllKeysStartingWith(queryPrefix);
      for (const key of keysToRemove) {
        try {
          localStorage.removeItem(key);
        } catch (error) {
          logger.error('Failed to remove query result from localStorage', { key, error });
        }
      }
    } catch (error) {
      logger.error('Failed to clear query results from localStorage', { error });
    }
  }

  // CacheMapMetadataProvider implementation
  public getMetadata(key: string): CacheItemMetadata | null {
    try {
      const metadataKey = `${this.keyPrefix}:metadata:${key}`;
      const stored = localStorage.getItem(metadataKey);
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch (e) {
          // Invalid JSON should be treated as absent
          logger.debug('Invalid metadata JSON, treating as null', { key, error: e });
          return null;
        }
      }
      return null;
    } catch (error) {
      logger.error('Error getting metadata from localStorage', { key, error });
      throw error;
    }
  }

  public setMetadata(key: string, metadata: CacheItemMetadata): void {
    try {
      const metadataKey = `${this.keyPrefix}:metadata:${key}`;
      localStorage.setItem(metadataKey, JSON.stringify(metadata));
    } catch (error) {
      if (this.isQuotaExceededError(error)) {
        logger.warning('LocalStorage quota exceeded when setting metadata, attempting cleanup...');
        this.tryCleanupOldEntries();
        try {
          const retryKey = `${this.keyPrefix}:metadata:${key}`;
          localStorage.setItem(retryKey, JSON.stringify(metadata));
          logger.info('Successfully stored metadata after cleanup');
          return;
        } catch (retryError) {
          throw new Error(`LocalStorage quota exceeded even after cleanup: ${retryError}`);
        }
      }
      throw new Error(`Failed to store metadata in localStorage: ${error}`);
    }
  }

  public deleteMetadata(key: string): void {
    try {
      const metadataKey = `${this.keyPrefix}:metadata:${key}`;
      localStorage.removeItem(metadataKey);
    } catch (error) {
      logger.error('Error deleting metadata from localStorage', { key, error });
      throw error;
    }
  }

  public getAllMetadata(): Map<string, CacheItemMetadata> {
    const metadata = new Map<string, CacheItemMetadata>();

    try {
      const metadataPrefix = `${this.keyPrefix}:metadata:`;
      const metaKeys = this.getAllKeysStartingWith(metadataPrefix);
      for (const key of metaKeys) {
        const metadataKey = key.substring(metadataPrefix.length);
        const stored = localStorage.getItem(key);
        if (!stored) continue;
        try {
          const parsed = JSON.parse(stored);
          // Any valid JSON object can be metadata
          if (parsed && typeof parsed === 'object') {
            metadata.set(metadataKey, parsed as CacheItemMetadata);
          }
        } catch (error) {
          // Skip invalid metadata entries
          logger.debug('Skipping invalid metadata entry', { key, error });
        }
      }
    } catch (error) {
      logger.error('Error getting metadata from localStorage', { error });
      throw error;
    }

    return metadata;
  }

  public clearMetadata(): void {
    try {
      const metadataPrefix = `${this.keyPrefix}:metadata:`;
      const keysToDelete = this.getAllKeysStartingWith(metadataPrefix);
      keysToDelete.forEach(key => localStorage.removeItem(key));
    } catch (error) {
      logger.error('Error clearing metadata from localStorage', { error });
      throw error;
    }
  }

  public getCurrentSize(): { itemCount: number; sizeBytes: number } {
    let itemCount = 0;
    let sizeBytes = 0;

    try {
      const keys = this.getAllStorageKeys();
      for (const key of keys) {
        const value = localStorage.getItem(key);
        if (!value) continue;

        // Calculate size for all entries
        try {
          // Use Blob when available (browser), otherwise fall back to TextEncoder/Buffer (node test env)
          if (typeof Blob !== 'undefined') {
            sizeBytes += new Blob([value]).size;
          } else if (typeof TextEncoder !== 'undefined') {
            sizeBytes += new TextEncoder().encode(value).length;
          } else if (typeof (globalThis as any).Buffer !== 'undefined') {
            sizeBytes += ((globalThis as any).Buffer as any).byteLength(value, 'utf8');
          } else {
            // As a last resort, approximate by string length
            sizeBytes += value.length;
          }

          // Only count regular cache entries for item count
          if (!key.includes(':metadata:') && !key.includes(':query:')) {
            try {
              const parsed = JSON.parse(value);
              // Only count entries that have both originalKey and value properties
              if (parsed && typeof parsed === 'object' && 'originalKey' in parsed && 'value' in parsed) {
                itemCount++;
              }
            } catch (error) {
              // Skip invalid entries for item count
              logger.debug('Invalid entry in getCurrentSize', { key, error });
            }
          }
        } catch (error) {
          // If size calculation fails, use string length as fallback
          logger.debug('Size calculation failed, using string length', { key, error });
          sizeBytes += value.length;
        }
      }
    } catch (error) {
      logger.error('Error calculating size from localStorage', { error });
      throw error;
    }

    return { itemCount, sizeBytes };
  }

  public getSizeLimits(): { maxItems: number | null; maxSizeBytes: number | null } {
    // LocalStorage typically has a 5-10MB limit, but we can't determine the exact limit
    // Return conservative estimates
    return {
      maxItems: null, // No specific item limit
      maxSizeBytes: 5 * 1024 * 1024 // 5MB conservative estimate
    };
  }

}
