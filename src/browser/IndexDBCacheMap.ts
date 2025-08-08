
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
import { CacheItemMetadata } from "../eviction/EvictionStrategy";

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

  public readonly implementationType = "browser/indexedDB";

  public asyncCache: AsyncIndexDBCacheMap<V, S, L1, L2, L3, L4, L5>;
  private memoryCache: MemoryCacheMap<V, S, L1, L2, L3, L4, L5>;
  private syncInterval: NodeJS.Timeout | null = null;
  private readonly SYNC_INTERVAL_MS = 5000; // Sync every 5 seconds
  private pendingSyncOperations: Map<string, { type: 'set' | 'delete'; key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>; value?: V; sequenceId: number; promise: Promise<void>; cancelled: boolean }> = new Map();
  private initializationPromise: Promise<void> | null = null;
  private isInitialized = false;
  private readonly MAX_RETRY_ATTEMPTS = 3;
  private operationSequence = 0;

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
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = (async () => {
      try {
        const keys = await this.asyncCache.keys();
        for (const key of keys) {
          // Only load from IndexedDB if not already in memory cache
          // This prevents overwriting newer data with stale data
          if (!this.memoryCache.includesKey(key)) {
            const value = await this.asyncCache.get(key);
            if (value) {
              this.memoryCache.set(key, value);
            }
          }
        }
        this.isInitialized = true;
      } catch (error) {
        console.warn('Failed to initialize from IndexedDB:', error);
        // Still mark as initialized to prevent infinite retries
        this.isInitialized = true;
      }
    })();

    return this.initializationPromise;
  }

  private startPeriodicSync(): void {
    this.syncInterval = setInterval(() => {
      this.syncToIndexedDB();
    }, this.SYNC_INTERVAL_MS);
  }

  private async syncToIndexedDB(): Promise<void> {
    try {
      // Process pending operations first
      await this.processPendingOperations();

      // Then sync memory cache changes to IndexedDB
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

  private async processPendingOperations(): Promise<void> {
    const pendingOps = Array.from(this.pendingSyncOperations.entries());

    for (const [keyStr, operation] of pendingOps) {
      // Skip cancelled operations
      if (operation.cancelled) {
        this.pendingSyncOperations.delete(keyStr);
        continue;
      }

      try {
        // Wait for the operation's promise to complete
        await operation.promise;

        // The promise completion should have already handled cleanup,
        // but ensure cleanup in case of any edge cases
        const currentOp = this.pendingSyncOperations.get(keyStr);
        if (currentOp && currentOp.sequenceId === operation.sequenceId) {
          this.pendingSyncOperations.delete(keyStr);
        }
      } catch (error) {
        console.warn(`Failed to process pending ${operation.type} operation:`, error);

        // Check if operation was superseded or cancelled
        const currentOp = this.pendingSyncOperations.get(keyStr);
        if (!currentOp || currentOp.sequenceId !== operation.sequenceId || currentOp.cancelled) {
          // Operation was superseded, remove it
          if (currentOp && currentOp.sequenceId === operation.sequenceId) {
            this.pendingSyncOperations.delete(keyStr);
          }
        }
        // Keep in pending operations for retry only if it's still the current operation
      }
    }
  }

  private queueForSync(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>, value: V): void {
    // Convert key to string for tracking
    const keyStr = JSON.stringify(key);
    const sequenceId = ++this.operationSequence;

    // Cancel any existing operation for this key
    const existingOp = this.pendingSyncOperations.get(keyStr);
    if (existingOp) {
      existingOp.cancelled = true;
    }

    // Create the sync operation promise
    const syncPromise = (async () => {
      try {
        await this.asyncCache.set(key, value);

        // Use atomic check-and-delete to avoid race condition
        const currentOp = this.pendingSyncOperations.get(keyStr);
        if (currentOp && currentOp.sequenceId === sequenceId && !currentOp.cancelled) {
          this.pendingSyncOperations.delete(keyStr);
        }
      } catch (error) {
        console.warn('Failed to sync single operation to IndexedDB:', error);

        // Only keep in pending operations if not cancelled and operation is still current
        const currentOp = this.pendingSyncOperations.get(keyStr);
        if (!currentOp || currentOp.sequenceId !== sequenceId || currentOp.cancelled) {
          // This operation was superseded or cancelled, remove it
          if (currentOp && currentOp.sequenceId === sequenceId) {
            this.pendingSyncOperations.delete(keyStr);
          }
        }
      }
    })();

    // Store the operation with its promise and cancellation flag
    this.pendingSyncOperations.set(keyStr, {
      type: 'set',
      key,
      value,
      sequenceId,
      promise: syncPromise,
      cancelled: false
    });
  }

  private queueDeleteForSync(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): void {
    // Convert key to string for tracking
    const keyStr = JSON.stringify(key);
    const sequenceId = ++this.operationSequence;

    // Cancel any existing operation for this key
    const existingOp = this.pendingSyncOperations.get(keyStr);
    if (existingOp) {
      existingOp.cancelled = true;
    }

    // Create the sync operation promise
    const syncPromise = (async () => {
      try {
        await this.asyncCache.delete(key);

        // Use atomic check-and-delete to avoid race condition
        const currentOp = this.pendingSyncOperations.get(keyStr);
        if (currentOp && currentOp.sequenceId === sequenceId && !currentOp.cancelled) {
          this.pendingSyncOperations.delete(keyStr);
        }
      } catch (error) {
        console.warn('Failed to sync delete operation to IndexedDB:', error);

        // Only keep in pending operations if not cancelled and operation is still current
        const currentOp = this.pendingSyncOperations.get(keyStr);
        if (!currentOp || currentOp.sequenceId !== sequenceId || currentOp.cancelled) {
          // This operation was superseded or cancelled, remove it
          if (currentOp && currentOp.sequenceId === sequenceId) {
            this.pendingSyncOperations.delete(keyStr);
          }
        }
      }
    })();

    // Store the operation with its promise and cancellation flag
    this.pendingSyncOperations.set(keyStr, {
      type: 'delete',
      key,
      sequenceId,
      promise: syncPromise,
      cancelled: false
    });
  }

  private queueClearForSync(): void {
    // Cancel all existing operations since we're clearing everything
    for (const operation of this.pendingSyncOperations.values()) {
      operation.cancelled = true;
    }

    // Clear all pending operations since we're clearing everything
    this.pendingSyncOperations.clear();

    // Use Promise.resolve() to ensure proper async execution order
    Promise.resolve().then(async () => {
      try {
        await this.asyncCache.clear();
      } catch (error) {
        console.warn('Failed to sync clear operation to IndexedDB:', error);
      }
    });
  }

  public get(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): V | null {
    // Ensure initialization is complete before reading
    if (!this.isInitialized && this.initializationPromise) {
      // For synchronous API, we can't wait for async initialization
      // Fall back to memory cache only and let background init continue
    }
    return this.memoryCache.get(key);
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

  public setQueryResult(queryHash: string, itemKeys: (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[]): void {
    return this.memoryCache.setQueryResult(queryHash, itemKeys);
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

  // CacheMapMetadataProvider implementation
  // Delegate to the memory cache for metadata operations for consistency
  public getMetadata(key: string): CacheItemMetadata | null {
    return this.memoryCache.getMetadata(key);
  }

  public setMetadata(key: string, metadata: CacheItemMetadata): void {
    this.memoryCache.setMetadata(key, metadata);
  }

  public deleteMetadata(key: string): void {
    this.memoryCache.deleteMetadata(key);
  }

  public getAllMetadata(): Map<string, CacheItemMetadata> {
    return this.memoryCache.getAllMetadata();
  }

  public clearMetadata(): void {
    this.memoryCache.clearMetadata();
  }

  public getCurrentSize(): { itemCount: number; sizeBytes: number } {
    return this.memoryCache.getCurrentSize();
  }

  public getSizeLimits(): { maxItems: number | null; maxSizeBytes: number | null } {
    return this.memoryCache.getSizeLimits();
  }

}
