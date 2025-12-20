import {
  AllItemTypeArrays,
  ComKey,
  Item,
  ItemQuery,
  LocKeyArray,
  PriKey
} from "@fjell/types";
import {
  isComKey,
  isQueryMatch,
} from "@fjell/core";
import { CacheMap } from "../CacheMap";
import { createNormalizedHashFunction, isLocKeyArrayEqual, QueryCacheEntry } from "../normalization";
import { CacheSizeConfig } from "../Options";
import {
  CacheItemMetadata
} from "../eviction";
import { estimateValueSize, parseSizeString } from "../utils/CacheSize";
import LibLogger from "../logger";

const logger = LibLogger.get("EnhancedMemoryCacheMap");

interface EnhancedDictionaryEntry<K, V> {
  originalKey: K;
  value: V;
  metadata: CacheItemMetadata;
  metadataCleared?: boolean;
}

/**
 * Enhanced in-memory implementation of CacheMap with size limits and eviction policies.
 * Supports byte-based and item-count limits with configurable eviction strategies.
 */
export class EnhancedMemoryCacheMap<
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
> extends CacheMap<V, S, L1, L2, L3, L4, L5> {

  public readonly implementationType = "memory/enhanced";

  private map: { [key: string]: EnhancedDictionaryEntry<ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>, V> } = {};
  private normalizedHashFunction: (key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>) => string;

  // Query result cache: maps query hash to cache entry
  private queryResultCache: { [queryHash: string]: QueryCacheEntry } = {};

  // Size tracking
  private currentSizeBytes: number = 0;
  private currentItemCount: number = 0;
  private queryResultsCacheSize: number = 0;

  // Size limits
  private readonly maxSizeBytes?: number;
  private readonly maxItems?: number;

  public constructor(
    types: AllItemTypeArrays<S, L1, L2, L3, L4, L5>,
    sizeConfig?: CacheSizeConfig,
    initialData?: { [key: string]: V }
  ) {
    super(types);
    this.normalizedHashFunction = createNormalizedHashFunction<ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>>();

    // Parse size configuration
    if (sizeConfig?.maxSizeBytes) {
      this.maxSizeBytes = parseSizeString(sizeConfig.maxSizeBytes);
      logger.debug('Cache size limit set', { maxSizeBytes: this.maxSizeBytes });
    }

    if (sizeConfig?.maxItems) {
      this.maxItems = sizeConfig.maxItems;
      logger.debug('Cache item limit set', { maxItems: this.maxItems });
    }

    // Note: Eviction is handled externally - this cache map only provides metadata access

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

    // Check if entry exists AND the normalized keys match AND has a real value
    if (entry && this.normalizedHashFunction(entry.originalKey) === hashedKey && entry.value !== null) {
      return entry.value;
    }

    return null;
  }

  public async set(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>, value: V): Promise<void> {
    logger.trace('set', { key, value });
    const hashedKey = this.normalizedHashFunction(key);
    const estimatedSize = estimateValueSize(value);

    // Check if this is an update to existing entry
    const existingEntry = this.map[hashedKey];
    const isUpdate = existingEntry && this.normalizedHashFunction(existingEntry.originalKey) === hashedKey;

    if (isUpdate) {
      // Update existing entry
      const sizeDiff = estimatedSize - existingEntry.metadata.estimatedSize;
      this.currentSizeBytes += sizeDiff;

      const oldValue = existingEntry.value;
      existingEntry.value = value;
      existingEntry.metadata.estimatedSize = estimatedSize;

      logger.trace('Updated existing cache entry', {
        key: hashedKey,
        sizeDiff,
        currentSize: this.currentSizeBytes,
        oldValue: oldValue !== value
      });
    } else {
      // Create new entry
      const metadata: CacheItemMetadata = {
        addedAt: Date.now(),
        lastAccessedAt: Date.now(),
        accessCount: 0,
        estimatedSize: estimatedSize,
        key: hashedKey
      };

      this.map[hashedKey] = {
        originalKey: key,
        value: value,
        metadata
      };

      this.currentSizeBytes += estimatedSize;
      this.currentItemCount++;

      logger.trace('Added new cache entry', {
        key: hashedKey,
        size: estimatedSize,
        currentSize: this.currentSizeBytes,
        currentCount: this.currentItemCount
      });
    }
  }

  public async includesKey(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): Promise<boolean> {
    const hashedKey = this.normalizedHashFunction(key);
    const entry = this.map[hashedKey];
    return !!entry && this.normalizedHashFunction(entry.originalKey) === hashedKey && entry.value !== null;
  }

  public async delete(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): Promise<void> {
    this.deleteInternal(key, true, 'filter');
  }

  private deleteInternal(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>, invalidateQueries: boolean = false, invalidationMode: 'filter' | 'remove' = 'remove'): void {
    logger.trace('delete', { key });
    const hashedKey = this.normalizedHashFunction(key);
    const entry = this.map[hashedKey];

    if (entry && this.normalizedHashFunction(entry.originalKey) === hashedKey) {
      this.currentSizeBytes -= entry.metadata.estimatedSize;
      this.currentItemCount--;
      delete this.map[hashedKey];

      logger.trace('Deleted cache entry', {
        key: hashedKey,
        freedSize: entry.metadata.estimatedSize,
        currentSize: this.currentSizeBytes,
        currentCount: this.currentItemCount
      });

      // Invalidate queries that reference this key only if requested
      if (invalidateQueries) {
        if (invalidationMode === 'filter') {
          this.filterQueriesReferencingKeys([key]);
        } else {
          this.invalidateQueriesReferencingKeys([key]);
        }
      }
    }
  }

  public async keys(): Promise<(ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[]> {
    return Object.values(this.map)
      .filter(entry => entry.value !== null)
      .map(entry => entry.originalKey);
  }

  public async values(): Promise<V[]> {
    return Object.values(this.map)
      .filter(entry => entry.value !== null)
      .map(entry => entry.value);
  }

  public async clear(): Promise<void> {
    logger.debug('Clearing cache', {
      itemsCleared: this.currentItemCount,
      bytesFreed: this.currentSizeBytes
    });

    this.map = {};
    this.currentSizeBytes = 0;
    this.currentItemCount = 0;
    // Note: Query results are preserved when clearing cache items
    // Use clearQueryResults() separately if you need to clear query cache as well
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
          return isLocKeyArrayEqual(locations, (key as ComKey<S, L1, L2, L3, L4, L5>).loc);
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

  public async clone(): Promise<CacheMap<V, S, L1, L2, L3, L4, L5>> {
    const sizeConfig: CacheSizeConfig = {};
    if (this.maxSizeBytes) {
      sizeConfig.maxSizeBytes = this.maxSizeBytes.toString();
    }
    if (this.maxItems) {
      sizeConfig.maxItems = this.maxItems;
    }

    const clone = new EnhancedMemoryCacheMap<V, S, L1, L2, L3, L4, L5>(this.types, sizeConfig);

    // Copy entries (this will trigger proper size tracking)
    const keys = await this.keys();
    for (const key of keys) {
      const value = await this.get(key);
      if (value) {
        await clone.set(key, value);
      }
    }

    // Copy query results
    for (const [queryHash, entry] of Object.entries(this.queryResultCache)) {
      await clone.setQueryResult(queryHash, entry.itemKeys);
    }

    return clone;
  }

  /**
   * Get current cache statistics
   */
  public getStats(): {
    currentSizeBytes: number;
    currentItemCount: number;
    maxSizeBytes?: number;
    maxItems?: number;
    utilizationPercent: {
      bytes?: number;
      items?: number;
    };
    } {
    const stats = {
      currentSizeBytes: this.currentSizeBytes,
      currentItemCount: this.currentItemCount,
      maxSizeBytes: this.maxSizeBytes,
      maxItems: this.maxItems,
      utilizationPercent: {} as { bytes?: number; items?: number }
    };

    if (this.maxSizeBytes) {
      stats.utilizationPercent.bytes = (this.currentSizeBytes / this.maxSizeBytes) * 100;
    }

    if (this.maxItems) {
      stats.utilizationPercent.items = (this.currentItemCount / this.maxItems) * 100;
    }

    return stats;
  }

  // Query result caching methods
  public async setQueryResult(queryHash: string, itemKeys: (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[], metadata?: any): Promise<void> {
    logger.trace('setQueryResult', { queryHash, itemKeys, hasMetadata: !!metadata });

    // Remove existing entry to get accurate size tracking
    if (queryHash in this.queryResultCache) {
      this.removeQueryResultFromSizeTracking(queryHash);
    }

    const entry: QueryCacheEntry = {
      itemKeys: [...itemKeys], // Create a copy to avoid external mutations
      metadata
    };

    this.queryResultCache[queryHash] = entry;
    this.addQueryResultToSizeTracking(queryHash, entry);
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
    if (queryHash in this.queryResultCache) {
      this.removeQueryResultFromSizeTracking(queryHash);
      delete this.queryResultCache[queryHash];
    }
  }

  public async clearQueryResults(): Promise<void> {
    this.queryResultCache = {};
    this.queryResultsCacheSize = 0;
  }

  public async invalidateItemKeys(keys: (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[]): Promise<void> {
    logger.debug('invalidateItemKeys', { keys });

    if (keys.length === 0) {
      // No keys to invalidate, so no queries should be affected
      return;
    }

    // Delete the actual cache entries without triggering individual query invalidations
    for (const key of keys) {
      this.deleteInternal(key, false);
    }

    // For bulk invalidation, remove entire queries (don't filter)
    this.invalidateQueriesReferencingKeys(keys);
  }

  private filterQueriesReferencingKeys(keys: (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[]): void {
    if (keys.length === 0) {
      return;
    }

    // Convert keys to their hashed form for comparison
    const hashedKeysToInvalidate = new Set(keys.map(key => this.normalizedHashFunction(key)));

    // Filter invalidated keys from query results instead of removing entire queries
    const queriesToRemove: string[] = [];
    for (const [queryHash, entry] of Object.entries(this.queryResultCache)) {
      // Filter out invalidated keys from the query result
      const filteredKeys = entry.itemKeys.filter(itemKey => {
        const hashedItemKey = this.normalizedHashFunction(itemKey);
        return !hashedKeysToInvalidate.has(hashedItemKey);
      });

      if (filteredKeys.length === 0) {
        // If no keys remain after filtering, remove the entire query
        queriesToRemove.push(queryHash);
      } else if (filteredKeys.length !== entry.itemKeys.length) {
        // If some keys were filtered out, update the query with remaining keys
        this.setQueryResult(queryHash, filteredKeys);
      }
      // If filteredKeys.length === entry.itemKeys.length, no changes needed
    }

    // Remove queries that have no valid keys remaining
    queriesToRemove.forEach(queryHash => {
      this.deleteQueryResult(queryHash);
    });
  }

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

  /**
   * Add query result to size tracking
   */
  private addQueryResultToSizeTracking(queryHash: string, entry: QueryCacheEntry): void {
    // Estimate size: queryHash + itemKeys array
    const hashSize = estimateValueSize(queryHash);
    const itemKeysSize = estimateValueSize(entry.itemKeys);
    const totalSize = hashSize + itemKeysSize;

    this.queryResultsCacheSize += totalSize;
    logger.trace('Added query result to size tracking', {
      queryHash,
      estimatedSize: totalSize,
      totalQueryCacheSize: this.queryResultsCacheSize
    });
  }

  /**
   * Remove query result from size tracking
   */
  private removeQueryResultFromSizeTracking(queryHash: string): void {
    const entry = this.queryResultCache[queryHash];
    if (entry) {
      const hashSize = estimateValueSize(queryHash);
      const itemKeysSize = estimateValueSize(entry.itemKeys);
      const totalSize = hashSize + itemKeysSize;

      this.queryResultsCacheSize = Math.max(0, this.queryResultsCacheSize - totalSize);
      logger.trace('Removed query result from size tracking', {
        queryHash,
        estimatedSize: totalSize,
        totalQueryCacheSize: this.queryResultsCacheSize
      });
    }
  }

  /**
   * Get total cache size including query results
   */
  public getTotalSizeBytes(): number {
    return this.currentSizeBytes + this.queryResultsCacheSize;
  }

  // CacheMapMetadataProvider implementation
  public async getMetadata(key: string): Promise<CacheItemMetadata | null> {
    const entry = this.map[key];
    if (entry && !entry.metadataCleared) {
      return entry.metadata;
    }
    return null;
  }

  public async setMetadata(key: string, metadata: CacheItemMetadata): Promise<void> {
    const entry = this.map[key];
    if (entry) {
      entry.metadata = metadata;
      entry.metadataCleared = false; // Unclear metadata when setting new metadata
    } else {
      // Create a synthetic entry for metadata-only storage
      // This allows setting metadata for keys that don't exist in the cache yet
      let originalKey: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>;

      try {
        // Try to parse as JSON (for real cache keys)
        originalKey = JSON.parse(key) as ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>;
      } catch {
        // If not JSON, create a synthetic primary key
        originalKey = { kt: 'metadata-only' as S, pk: key } as PriKey<S>;
      }

      this.map[key] = {
        originalKey,
        value: null as any, // Placeholder value
        metadata,
        metadataCleared: false
      };
    }
  }

  public async deleteMetadata(_key: string): Promise<void> {
    // Metadata is deleted when the item is deleted
    // This is a no-op since metadata is part of the item entry
  }

  public async getAllMetadata(): Promise<Map<string, CacheItemMetadata>> {
    const metadata = new Map<string, CacheItemMetadata>();
    for (const [hashedKey, entry] of Object.entries(this.map)) {
      // Only include metadata if it hasn't been cleared
      if (!entry.metadataCleared) {
        metadata.set(hashedKey, entry.metadata);
      }
    }
    return metadata;
  }

  public async clearMetadata(): Promise<void> {
    // Mark all entries as having cleared metadata
    const keysToRemove: string[] = [];

    for (const [hashedKey, entry] of Object.entries(this.map)) {
      if (entry.value === null) {
        // This is a metadata-only entry, remove it completely
        keysToRemove.push(hashedKey);
      } else {
        // This is a real cache entry, mark metadata as cleared
        entry.metadataCleared = true;
      }
    }

    // Remove metadata-only entries
    for (const key of keysToRemove) {
      delete this.map[key];
    }
  }

  public async getCurrentSize(): Promise<{ itemCount: number; sizeBytes: number }> {
    return {
      itemCount: this.currentItemCount,
      sizeBytes: this.currentSizeBytes
    };
  }

  public async getSizeLimits(): Promise<{ maxItems: number | null; maxSizeBytes: number | null }> {
    return {
      maxItems: this.maxItems ?? null,
      maxSizeBytes: this.maxSizeBytes ?? null
    };
  }

}
