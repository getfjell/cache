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
  private readonly MAX_RETRY_ATTEMPTS = 3;
  private readonly AGGRESSIVE_CLEANUP_PERCENTAGE = 0.5; // Remove 50% of entries when quota exceeded
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

  private tryCleanupOldEntries(aggressive: boolean = false): boolean {
    try {
      const allEntries = this.collectCacheEntries();
      if (allEntries.length === 0) {
        logger.debug('No entries to clean up');
        return false;
      }
      return this.removeOldestEntries(allEntries, aggressive);
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

  private removeOldestEntries(allEntries: { key: string; timestamp: number; size: number }[], aggressive: boolean = false): boolean {
    // Sort by timestamp (oldest first)
    allEntries.sort((a, b) => a.timestamp - b.timestamp);

    // Use aggressive cleanup percentage when quota exceeded, otherwise use normal 25%
    const cleanupPercentage = aggressive ? this.AGGRESSIVE_CLEANUP_PERCENTAGE : 0.25;
    const toRemove = Math.max(1, Math.ceil(allEntries.length * cleanupPercentage));
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
      const cleanupType = aggressive ? 'aggressive' : 'normal';
      logger.info(`Cleaned up ${removedCount} old localStorage entries (${removedSize} bytes) using ${cleanupType} cleanup to free space`);
    }
    return removedCount > 0;
  }

  private getAllStorageKeys(): string[] {
    return this.getAllKeysStartingWith(`${this.keyPrefix}:`);
  }

  public async get(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): Promise<V | null> {
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

  public async set(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>, value: V): Promise<void> {
    logger.trace('set', { key, value });

    for (let attempt = 0; attempt < this.MAX_RETRY_ATTEMPTS; attempt++) {
      try {
        const storageKey = this.getStorageKey(key);
        const toStore = {
          originalKey: key,
          value: value,
          timestamp: Date.now()
        };
        localStorage.setItem(storageKey, JSON.stringify(toStore));

        if (attempt > 0) {
          logger.info(`Successfully stored item after ${attempt} retries`);
        }
        return; // Success, exit the retry loop
      } catch (error) {
        const isLastAttempt = attempt === this.MAX_RETRY_ATTEMPTS - 1;
        logger.error(`Error storing to localStorage (attempt ${attempt + 1}/${this.MAX_RETRY_ATTEMPTS})`, {
          key,
          value,
          error,
          isLastAttempt
        });

        if (this.isQuotaExceededError(error)) {
          // Use increasingly aggressive cleanup on each retry attempt
          const useAggressiveCleanup = attempt > 0;
          this.tryCleanupOldEntries(useAggressiveCleanup);

          if (isLastAttempt) {
            // Final attempt failed
            throw new Error('Failed to store item in localStorage: storage quota exceeded even after multiple cleanup attempts');
          }

          // Continue to next retry attempt (no delay needed for localStorage)
          continue;
        }

        // For non-quota errors, throw immediately without retry
        throw new Error(`Failed to store item in localStorage: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  public async includesKey(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): Promise<boolean> {
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

  public async delete(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): Promise<void> {
    logger.trace('delete', { key });

    try {
      const storageKey = this.getStorageKey(key);
      localStorage.removeItem(storageKey);
    } catch (error) {
      logger.error('Error deleting from localStorage', { key, error });
      throw error;
    }
  }

  public async allIn(locations: LocKeyArray<L1, L2, L3, L4, L5> | []): Promise<V[]> {
    const allKeys = this.keys();

    if (locations.length === 0) {
      logger.debug('Returning all items, LocKeys is empty');
      const items: V[] = [];
      for (const key of await allKeys) {
        const item = await this.get(key);
        if (item !== null) {
          items.push(item);
        }
      }
      return items;
    } else {
      const locKeys: LocKeyArray<L1, L2, L3, L4, L5> | [] = locations;
      const resolvedKeys = await allKeys;
      logger.debug('allIn', { locKeys, keys: resolvedKeys.length });

      const filteredKeys = resolvedKeys
        .filter((key) => key && isComKey(key))
        .filter((key) => {
          const ComKey = key as ComKey<S, L1, L2, L3, L4, L5>;
          logger.debug('Comparing Location Keys', {
            locKeys,
            ComKey,
          });
          return isLocKeyArrayEqual(locKeys, ComKey.loc);
        });

      const items: V[] = [];
      for (const key of filteredKeys) {
        const item = await this.get(key);
        if (item !== null) {
          items.push(item);
        }
      }
      return items;
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

  public async clone(): Promise<LocalStorageCacheMap<V, S, L1, L2, L3, L4, L5>> {
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

  public async keys(): Promise<(ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[]> {
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

  public async values(): Promise<V[]> {
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

  public async clear(): Promise<void> {
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

  public async setQueryResult(queryHash: string, itemKeys: (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[], metadata?: any): Promise<void> {
    logger.trace('setQueryResult', { queryHash, itemKeys, hasMetadata: !!metadata });
    const queryKey = `${this.keyPrefix}:query:${queryHash}`;

    const entry: any = {
      itemKeys,
      metadata
    };

    try {
      localStorage.setItem(queryKey, JSON.stringify(entry));
    } catch (error) {
      logger.error('Failed to store query result in localStorage', { queryHash, error });
    }
  }

  public async getQueryResult(queryHash: string): Promise<(ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[] | null> {
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

      // New format - return itemKeys only
      return entry.itemKeys || null;
    } catch (error) {
      logger.error('Failed to retrieve query result from localStorage', { queryHash, error });
      return null;
    }
  }

  public async getQueryResultWithMetadata(queryHash: string): Promise<{ itemKeys: (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[]; metadata?: any } | null> {
    logger.trace('getQueryResultWithMetadata', { queryHash });
    const queryKey = `${this.keyPrefix}:query:${queryHash}`;
    try {
      const data = localStorage.getItem(queryKey);
      if (!data) {
        return null;
      }

      const entry = JSON.parse(data);

      // Handle both old format (just array) and new format (object with itemKeys and metadata)
      if (Array.isArray(entry)) {
        // Old format - return without metadata
        return { itemKeys: entry, metadata: undefined };
      }

      // New format - deserialize Date objects if present
      if (entry.metadata) {
        if (entry.metadata.createdAt) {
          entry.metadata.createdAt = new Date(entry.metadata.createdAt);
        }
        if (entry.metadata.expiresAt) {
          entry.metadata.expiresAt = new Date(entry.metadata.expiresAt);
        }
      }

      return {
        itemKeys: entry.itemKeys || [],
        metadata: entry.metadata
      };
    } catch (error) {
      logger.error('Failed to retrieve query result with metadata from localStorage', { queryHash, error });
      return null;
    }
  }

  public async hasQueryResult(queryHash: string): Promise<boolean> {
    const queryKey = `${this.keyPrefix}:query:${queryHash}`;
    try {
      return localStorage.getItem(queryKey) !== null;
    } catch (error) {
      logger.error('Failed to check query result in localStorage', { queryHash, error });
      return false;
    }
  }

  public async deleteQueryResult(queryHash: string): Promise<void> {
    logger.trace('deleteQueryResult', { queryHash });
    const queryKey = `${this.keyPrefix}:query:${queryHash}`;
    try {
      localStorage.removeItem(queryKey);
    } catch (error) {
      logger.error('Failed to delete query result from localStorage', { queryHash, error });
    }
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
    await this.invalidateQueriesReferencingKeys(keys);
  }

  /**
   * Intelligently invalidate only queries that reference the affected keys
   * This prevents clearing all query results when only specific items change
   */
  private async invalidateQueriesReferencingKeys(keys: (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[]): Promise<void> {
    if (keys.length === 0) {
      return;
    }

    // Convert keys to their hashed form for comparison
    const hashedKeysToInvalidate = new Set(keys.map(key => this.normalizedHashFunction(key)));

    // Get all query results from localStorage to check which ones reference affected keys
    try {
      const queryPrefix = `${this.keyPrefix}:query:`;
      const queryKeys = this.getAllKeysStartingWith(queryPrefix);

      const queriesToRemove: string[] = [];

      for (const queryKey of queryKeys) {
        const queryHash = queryKey.substring(queryPrefix.length);
        const stored = localStorage.getItem(queryKey);

        if (!stored) continue;

        try {
          const itemKeys = JSON.parse(stored);
          if (Array.isArray(itemKeys)) {
            const queryReferencesInvalidatedKey = itemKeys.some(itemKey => {
              const hashedItemKey = this.normalizedHashFunction(itemKey);
              return hashedKeysToInvalidate.has(hashedItemKey);
            });

            if (queryReferencesInvalidatedKey) {
              queriesToRemove.push(queryKey);
            }
          }
        } catch (error) {
          logger.debug('Failed to parse query result', { queryKey, error });
        }
      }

      // Remove the affected queries from localStorage
      queriesToRemove.forEach(queryKey => {
        localStorage.removeItem(queryKey);
      });

      logger.debug('Selectively invalidated queries referencing affected keys', {
        affectedKeys: keys.length,
        queriesRemoved: queriesToRemove.length,
        totalQueries: queryKeys.length
      });

    } catch (error) {
      logger.error('Error during selective query invalidation, falling back to clearing all queries', { error });
      // Fallback: clear all query results if selective invalidation fails
      await this.clearQueryResults();
    }
  }

  public async invalidateLocation(locations: LocKeyArray<L1, L2, L3, L4, L5> | []): Promise<void> {
    logger.debug('invalidateLocation', { locations });

    let keysToInvalidate: (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[] = [];

    if (locations.length === 0) {
      // For primary items (no location), get all primary keys
      const allKeys = await this.keys();
      const primaryKeys = allKeys.filter(key => !isComKey(key));
      keysToInvalidate = primaryKeys;
    } else {
      // For contained items, get all items in the location and invalidate them
      const itemsInLocation = await this.allIn(locations);
      keysToInvalidate = itemsInLocation.map(item => item.key);
    }

    // Use invalidateItemKeys which will selectively clear only affected queries
    if (keysToInvalidate.length > 0) {
      await this.invalidateItemKeys(keysToInvalidate);
    }
  }

  public async clearQueryResults(): Promise<void> {
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
  public async getMetadata(key: string): Promise<CacheItemMetadata | null> {
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

  public async setMetadata(key: string, metadata: CacheItemMetadata): Promise<void> {
    for (let attempt = 0; attempt < this.MAX_RETRY_ATTEMPTS; attempt++) {
      try {
        const metadataKey = `${this.keyPrefix}:metadata:${key}`;
        localStorage.setItem(metadataKey, JSON.stringify(metadata));

        if (attempt > 0) {
          logger.info(`Successfully stored metadata after ${attempt} retries`);
        }
        return; // Success, exit the retry loop
      } catch (error) {
        const isLastAttempt = attempt === this.MAX_RETRY_ATTEMPTS - 1;
        logger.error(`Error storing metadata to localStorage (attempt ${attempt + 1}/${this.MAX_RETRY_ATTEMPTS})`, {
          key,
          error,
          isLastAttempt
        });

        if (this.isQuotaExceededError(error)) {
          // Use increasingly aggressive cleanup on each retry attempt
          const useAggressiveCleanup = attempt > 0;
          this.tryCleanupOldEntries(useAggressiveCleanup);

          if (isLastAttempt) {
            // Final attempt failed
            throw new Error('Failed to store metadata in localStorage: storage quota exceeded even after multiple cleanup attempts');
          }

          // Continue to next retry attempt
          continue;
        }

        // For non-quota errors, throw immediately without retry
        throw new Error(`Failed to store metadata in localStorage: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  public async deleteMetadata(key: string): Promise<void> {
    try {
      const metadataKey = `${this.keyPrefix}:metadata:${key}`;
      localStorage.removeItem(metadataKey);
    } catch (error) {
      logger.error('Error deleting metadata from localStorage', { key, error });
      throw error;
    }
  }

  public async getAllMetadata(): Promise<Map<string, CacheItemMetadata>> {
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

  public async clearMetadata(): Promise<void> {
    try {
      const metadataPrefix = `${this.keyPrefix}:metadata:`;
      const keysToDelete = this.getAllKeysStartingWith(metadataPrefix);
      keysToDelete.forEach(key => localStorage.removeItem(key));
    } catch (error) {
      logger.error('Error clearing metadata from localStorage', { error });
      throw error;
    }
  }

  public async getCurrentSize(): Promise<{ itemCount: number; sizeBytes: number }> {
    let itemCount = 0;
    let sizeBytes = 0;

    try {
      const keys = this.getAllStorageKeys();
      for (const key of keys) {
        const value = localStorage.getItem(key);
        if (!value) continue;

        // Calculate size for all entries
        try {
          // Use Blob when available (browser), otherwise fall back to TextEncoder
          if (typeof Blob !== 'undefined') {
            sizeBytes += new Blob([value]).size;
          } else if (typeof TextEncoder !== 'undefined') {
            sizeBytes += new TextEncoder().encode(value).length;
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

  public async getSizeLimits(): Promise<{ maxItems: number | null; maxSizeBytes: number | null }> {
    // LocalStorage typically has a 5-10MB limit, but we can't determine the exact limit
    // Return conservative estimates
    return {
      maxItems: null, // No specific item limit
      maxSizeBytes: 5 * 1024 * 1024 // 5MB conservative estimate
    };
  }

}
