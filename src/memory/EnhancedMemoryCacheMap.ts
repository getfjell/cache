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
import { createNormalizedHashFunction, isLocKeyArrayEqual, QueryCacheEntry } from "../normalization";
import { CacheSizeConfig } from "../Options";
import {
  CacheItemMetadata,
  createEvictionStrategy,
  EvictionStrategy
} from "../eviction";
import { estimateValueSize, parseSizeString } from "../utils/CacheSize";
import LibLogger from "../logger";

const logger = LibLogger.get("EnhancedMemoryCacheMap");

interface EnhancedDictionaryEntry<K, V> {
  originalKey: K;
  value: V;
  metadata: CacheItemMetadata;
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

  private map: { [key: string]: EnhancedDictionaryEntry<ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>, V> } = {};
  private normalizedHashFunction: (key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>) => string;

  // Query result cache: maps query hash to cache entry with expiration
  private queryResultCache: { [queryHash: string]: QueryCacheEntry } = {};
  // Mutex-like tracking for TTL operations to prevent race conditions
  private ttlOperationsInProgress: Set<string> = new Set();

  // Size tracking
  private currentSizeBytes: number = 0;
  private currentItemCount: number = 0;
  private queryResultsCacheSize: number = 0;

  // Size limits
  private readonly maxSizeBytes?: number;
  private readonly maxItems?: number;

  // Eviction strategy
  private readonly evictionStrategy: EvictionStrategy;

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

    // Initialize eviction strategy
    const policy = sizeConfig?.evictionPolicy || 'lru';
    const maxCacheSize = this.maxItems || 1000; // Default for strategies that need it
    this.evictionStrategy = createEvictionStrategy(policy, maxCacheSize);
    logger.debug('Eviction strategy initialized', { policy });

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

    // Check if entry exists AND the normalized keys match
    if (entry && this.normalizedHashFunction(entry.originalKey) === hashedKey) {
      // Update access metadata
      this.evictionStrategy.onItemAccessed(hashedKey, entry.metadata);
      return entry.value;
    }

    return null;
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

    // Check if entry exists AND the normalized keys match
    if (entry && this.normalizedHashFunction(entry.originalKey) === hashedKey) {
      // Check if the item has expired
      const now = Date.now();
      const age = now - entry.metadata.addedAt;

      if (age >= ttl) {
        // Item has expired, remove it from cache
        logger.trace('Item expired, removing from enhanced cache', { key, age, ttl });
        this.delete(key);
        return null;
      }

      // Update access metadata
      this.evictionStrategy.onItemAccessed(hashedKey, entry.metadata);
      return entry.value;
    }

    return null;
  }

  public set(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>, value: V): void {
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

      // For updates, we need to notify eviction strategy properly
      // Since the value changed, this is effectively a remove + add
      this.evictionStrategy.onItemRemoved(hashedKey);
      this.evictionStrategy.onItemAdded(hashedKey, existingEntry.metadata);

      logger.trace('Updated existing cache entry', {
        key: hashedKey,
        sizeDiff,
        currentSize: this.currentSizeBytes,
        oldValue: oldValue !== value
      });
    } else {
      // New entry - check if we need to evict first
      this.ensureSpaceAvailable(estimatedSize);

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

      this.evictionStrategy.onItemAdded(hashedKey, metadata);

      logger.trace('Added new cache entry', {
        key: hashedKey,
        size: estimatedSize,
        currentSize: this.currentSizeBytes,
        currentCount: this.currentItemCount
      });
    }
  }

  public includesKey(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): boolean {
    const hashedKey = this.normalizedHashFunction(key);
    const entry = this.map[hashedKey];
    return !!entry && this.normalizedHashFunction(entry.originalKey) === hashedKey;
  }

  public delete(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): void {
    logger.trace('delete', { key });
    const hashedKey = this.normalizedHashFunction(key);
    const entry = this.map[hashedKey];

    if (entry && this.normalizedHashFunction(entry.originalKey) === hashedKey) {
      this.currentSizeBytes -= entry.metadata.estimatedSize;
      this.currentItemCount--;
      this.evictionStrategy.onItemRemoved(hashedKey);
      delete this.map[hashedKey];

      logger.trace('Deleted cache entry', {
        key: hashedKey,
        freedSize: entry.metadata.estimatedSize,
        currentSize: this.currentSizeBytes,
        currentCount: this.currentItemCount
      });
    }
  }

  public keys(): (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[] {
    return Object.values(this.map).map(entry => entry.originalKey);
  }

  public values(): V[] {
    return Object.values(this.map).map(entry => entry.value);
  }

  public clear(): void {
    logger.debug('Clearing cache', {
      itemsCleared: this.currentItemCount,
      bytesFreed: this.currentSizeBytes
    });

    // Notify eviction strategy of all removals
    for (const hashedKey of Object.keys(this.map)) {
      this.evictionStrategy.onItemRemoved(hashedKey);
    }

    this.map = {};
    this.currentSizeBytes = 0;
    this.currentItemCount = 0;
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
          return isLocKeyArrayEqual(locations, (key as ComKey<S, L1, L2, L3, L4, L5>).loc);
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

  public clone(): EnhancedMemoryCacheMap<V, S, L1, L2, L3, L4, L5> {
    const sizeConfig: CacheSizeConfig = {};
    if (this.maxSizeBytes) {
      sizeConfig.maxSizeBytes = this.maxSizeBytes.toString();
    }
    if (this.maxItems) {
      sizeConfig.maxItems = this.maxItems;
    }

    const clone = new EnhancedMemoryCacheMap<V, S, L1, L2, L3, L4, L5>(this.types, sizeConfig);

    // Copy entries (this will trigger proper size tracking)
    for (const key of this.keys()) {
      const value = this.get(key);
      if (value) {
        clone.set(key, value);
      }
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

  /**
   * Ensure there's space available for a new item of the given size
   * Evicts items if necessary based on the configured eviction policy
   */
  private ensureSpaceAvailable(newItemSize: number): void {
    // Get current metadata for all items
    const itemMetadata = new Map<string, CacheItemMetadata>();
    for (const [hashedKey, entry] of Object.entries(this.map)) {
      itemMetadata.set(hashedKey, entry.metadata);
    }

    // Check if we need to evict based on item count
    while (this.maxItems && this.currentItemCount >= this.maxItems) {
      const keyToEvict = this.evictionStrategy.selectForEviction(itemMetadata);
      if (!keyToEvict) {
        logger.debug('No item selected for eviction despite being over item limit');
        break;
      }

      this.evictItem(keyToEvict, itemMetadata);
      logger.debug('Evicted item due to count limit', {
        evictedKey: keyToEvict,
        currentCount: this.currentItemCount,
        maxItems: this.maxItems
      });
    }

    // Check if we need to evict based on size (including query results cache)
    while (this.maxSizeBytes && (this.getTotalSizeBytes() + newItemSize) > this.maxSizeBytes) {
      const keyToEvict = this.evictionStrategy.selectForEviction(itemMetadata);
      if (!keyToEvict) {
        logger.debug('No item selected for eviction despite being over size limit');
        break;
      }

      this.evictItem(keyToEvict, itemMetadata);
      logger.debug('Evicted item due to size limit', {
        evictedKey: keyToEvict,
        currentItemsSize: this.currentSizeBytes,
        queryResultsSize: this.queryResultsCacheSize,
        totalSize: this.getTotalSizeBytes(),
        newItemSize,
        maxSizeBytes: this.maxSizeBytes
      });
    }
  }

  /**
   * Evict a specific item and update metadata tracking
   */
  private evictItem(hashedKey: string, itemMetadata: Map<string, CacheItemMetadata>): void {
    const entry = this.map[hashedKey];
    if (entry) {
      const originalKey = entry.originalKey;
      this.delete(originalKey); // This will handle size tracking and eviction strategy notification
      itemMetadata.delete(hashedKey);
    }
  }

  // Query result caching methods
  public setQueryResult(queryHash: string, itemKeys: (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[], ttl?: number): void {
    logger.trace('setQueryResult', { queryHash, itemKeys, ttl });

    // Remove existing entry to get accurate size tracking
    if (queryHash in this.queryResultCache) {
      this.removeQueryResultFromSizeTracking(queryHash);
    }

    const entry: QueryCacheEntry = {
      itemKeys: [...itemKeys] // Create a copy to avoid external mutations
    };

    if (ttl) {
      entry.expiresAt = Date.now() + ttl;
    }

    this.queryResultCache[queryHash] = entry;
    this.addQueryResultToSizeTracking(queryHash, entry);
  }

  public getQueryResult(queryHash: string): (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[] | null {
    logger.trace('getQueryResult', { queryHash });

    // Check if TTL operation is already in progress for this query
    if (this.ttlOperationsInProgress.has(queryHash)) {
      // Another thread is handling TTL, return current value or null
      const entry = this.queryResultCache[queryHash];
      return entry ? [...entry.itemKeys] : null;
    }

    const entry = this.queryResultCache[queryHash];

    if (!entry) {
      return null;
    }

    // Check if entry has expired - use atomic operation
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      // Mark TTL operation in progress
      this.ttlOperationsInProgress.add(queryHash);

      try {
        // Double-check expiry inside the critical section
        if (entry.expiresAt && Date.now() > entry.expiresAt) {
          logger.trace('Query result expired, removing', { queryHash, expiresAt: entry.expiresAt });
          this.removeQueryResultFromSizeTracking(queryHash);
          delete this.queryResultCache[queryHash];
          return null;
        }
      } finally {
        // Always release the lock
        this.ttlOperationsInProgress.delete(queryHash);
      }
    }

    return [...entry.itemKeys]; // Return a copy to avoid external mutations
  }

  public hasQueryResult(queryHash: string): boolean {
    // Check if TTL operation is already in progress for this query
    if (this.ttlOperationsInProgress.has(queryHash)) {
      // Another thread is handling TTL, return current state
      return queryHash in this.queryResultCache;
    }

    const entry = this.queryResultCache[queryHash];
    if (!entry) {
      return false;
    }

    // Check if entry has expired - use atomic operation
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      // Mark TTL operation in progress
      this.ttlOperationsInProgress.add(queryHash);

      try {
        // Double-check expiry inside the critical section
        if (entry.expiresAt && Date.now() > entry.expiresAt) {
          this.removeQueryResultFromSizeTracking(queryHash);
          delete this.queryResultCache[queryHash];
          return false;
        }
      } finally {
        // Always release the lock
        this.ttlOperationsInProgress.delete(queryHash);
      }
    }

    return true;
  }

  public deleteQueryResult(queryHash: string): void {
    if (queryHash in this.queryResultCache) {
      this.removeQueryResultFromSizeTracking(queryHash);
      delete this.queryResultCache[queryHash];
    }
  }

  public clearQueryResults(): void {
    this.queryResultCache = {};
    this.queryResultsCacheSize = 0;
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

  /**
   * Add query result to size tracking
   */
  private addQueryResultToSizeTracking(queryHash: string, entry: QueryCacheEntry): void {
    // Estimate size: queryHash + itemKeys array + metadata
    const hashSize = estimateValueSize(queryHash);
    const itemKeysSize = estimateValueSize(entry.itemKeys);
    const metadataSize = entry.expiresAt ? 8 : 0; // 8 bytes for timestamp
    const totalSize = hashSize + itemKeysSize + metadataSize;

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
      const metadataSize = entry.expiresAt ? 8 : 0;
      const totalSize = hashSize + itemKeysSize + metadataSize;

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
}
