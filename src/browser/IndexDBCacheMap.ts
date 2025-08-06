
import {
  AllItemTypeArrays,
  ComKey,
  Item,
  ItemQuery,
  LocKeyArray,
  PriKey
} from "@fjell/core";
import { CacheMap } from "../CacheMap";
import { AsyncIndexDBCacheMap } from "./AsyncIndexDBCacheMap";
import { MemoryCacheMap } from "../memory/MemoryCacheMap";

/**
 * Synchronous wrapper for IndexedDB CacheMap implementation.
 *
 * This implementation provides a synchronous interface over IndexedDB
 * by maintaining an in-memory cache that is periodically synchronized
 * with IndexedDB storage. For full async capabilities, use AsyncIndexDBCacheMap.
 *
 * Note: This class maintains synchronous compatibility while providing
 * persistent storage benefits of IndexedDB.
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

  public asyncCache: AsyncIndexDBCacheMap<V, S, L1, L2, L3, L4, L5>;
  private memoryCache: MemoryCacheMap<V, S, L1, L2, L3, L4, L5>;
  private syncInterval: NodeJS.Timeout | null = null;
  private readonly SYNC_INTERVAL_MS = 5000; // Sync every 5 seconds
  private pendingSyncOperations: Set<string> = new Set();

  public constructor(
    types: AllItemTypeArrays<S, L1, L2, L3, L4, L5>,
    dbName: string = 'fjell-indexdb-cache',
    storeName: string = 'cache',
    version: number = 1
  ) {
    super(types);
    this.asyncCache = new AsyncIndexDBCacheMap<V, S, L1, L2, L3, L4, L5>(types, dbName, storeName, version);
    this.memoryCache = new MemoryCacheMap<V, S, L1, L2, L3, L4, L5>(types);

    // Initialize by loading data from IndexedDB into memory cache
    this.initializeFromIndexedDB();

    // Set up periodic sync
    this.startPeriodicSync();
  }

  private async initializeFromIndexedDB(): Promise<void> {
    try {
      // This is a fire-and-forget async operation
      // The memory cache will be populated as data becomes available
      setTimeout(async () => {
        try {
          const keys = await this.asyncCache.keys();
          for (const key of keys) {
            const value = await this.asyncCache.get(key);
            if (value) {
              this.memoryCache.set(key, value);
            }
          }
        } catch (error) {
          console.warn('Failed to initialize from IndexedDB:', error);
        }
      }, 0);
    } catch (error) {
      console.warn('IndexedDB initialization failed:', error);
    }
  }

  private startPeriodicSync(): void {
    this.syncInterval = setInterval(() => {
      this.syncToIndexedDB();
    }, this.SYNC_INTERVAL_MS);
  }

  private async syncToIndexedDB(): Promise<void> {
    try {
      // Sync memory cache changes to IndexedDB
      const memoryKeys = this.memoryCache.keys();
      for (const key of memoryKeys) {
        const value = this.memoryCache.get(key);
        if (value) {
          await this.asyncCache.set(key, value);
        }
      }
    } catch (error) {
      console.warn('Failed to sync to IndexedDB:', error);
    }
  }

  private queueForSync(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>, value: V): void {
    // Convert key to string for tracking
    const keyStr = JSON.stringify(key);
    this.pendingSyncOperations.add(keyStr);

    // Trigger immediate sync in background
    setTimeout(async () => {
      try {
        await this.asyncCache.set(key, value);
        this.pendingSyncOperations.delete(keyStr);
      } catch (error) {
        console.warn('Failed to sync single operation to IndexedDB:', error);
        // Keep in pending set for next periodic sync
      }
    }, 0);
  }

  private queueDeleteForSync(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): void {
    // Convert key to string for tracking
    const keyStr = JSON.stringify(key);
    this.pendingSyncOperations.add(keyStr);

    // Trigger immediate delete sync in background
    setTimeout(async () => {
      try {
        await this.asyncCache.delete(key);
        this.pendingSyncOperations.delete(keyStr);
      } catch (error) {
        console.warn('Failed to sync delete operation to IndexedDB:', error);
        // Keep in pending set for next periodic sync
      }
    }, 0);
  }

  private queueClearForSync(): void {
    // Clear all pending operations since we're clearing everything
    this.pendingSyncOperations.clear();

    // Trigger immediate clear sync in background
    setTimeout(async () => {
      try {
        await this.asyncCache.clear();
      } catch (error) {
        console.warn('Failed to sync clear operation to IndexedDB:', error);
      }
    }, 0);
  }

  public get(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): V | null {
    return this.memoryCache.get(key);
  }

  public getWithTTL(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>, ttl: number): V | null {
    return this.memoryCache.getWithTTL(key, ttl);
  }

  public set(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>, value: V): void {
    // Update memory cache immediately
    this.memoryCache.set(key, value);

    // Trigger background sync to IndexedDB
    this.queueForSync(key, value);
  }

  public includesKey(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): boolean {
    return this.memoryCache.includesKey(key);
  }

  public delete(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): void {
    // Delete from memory cache immediately
    this.memoryCache.delete(key);

    // Trigger background sync to IndexedDB
    this.queueDeleteForSync(key);
  }

  public allIn(locations: LocKeyArray<L1, L2, L3, L4, L5> | []): V[] {
    return this.memoryCache.allIn(locations);
  }

  public contains(query: ItemQuery, locations: LocKeyArray<L1, L2, L3, L4, L5> | []): boolean {
    return this.memoryCache.contains(query, locations);
  }

  public queryIn(query: ItemQuery, locations: LocKeyArray<L1, L2, L3, L4, L5> | []): V[] {
    return this.memoryCache.queryIn(query, locations);
  }

  public clone(): IndexDBCacheMap<V, S, L1, L2, L3, L4, L5> {
    return new IndexDBCacheMap<V, S, L1, L2, L3, L4, L5>(this.types);
  }

  public keys(): (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[] {
    return this.memoryCache.keys();
  }

  public values(): V[] {
    return this.memoryCache.values();
  }

  public clear(): void {
    // Clear memory cache immediately
    this.memoryCache.clear();

    // Trigger background sync to IndexedDB
    this.queueClearForSync();
  }

  // Query result caching methods implementation

  public setQueryResult(queryHash: string, itemKeys: (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[], ttl?: number): void {
    return this.memoryCache.setQueryResult(queryHash, itemKeys, ttl);
  }

  public getQueryResult(queryHash: string): (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[] | null {
    return this.memoryCache.getQueryResult(queryHash);
  }

  public hasQueryResult(queryHash: string): boolean {
    return this.memoryCache.hasQueryResult(queryHash);
  }

  public deleteQueryResult(queryHash: string): void {
    return this.memoryCache.deleteQueryResult(queryHash);
  }

  public invalidateItemKeys(keys: (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[]): void {
    return this.memoryCache.invalidateItemKeys(keys);
  }

  public invalidateLocation(locations: LocKeyArray<L1, L2, L3, L4, L5> | []): void {
    return this.memoryCache.invalidateLocation(locations);
  }

  public clearQueryResults(): void {
    return this.memoryCache.clearQueryResults();
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
