
import { ComKey, Item, ItemQuery, LocKeyArray, PriKey } from "@fjell/types";
import {
  CacheClearedEvent,
  ItemEvent,
  LocationInvalidatedEvent,
  QueryEvent,
  QueryInvalidatedEvent
} from "./CacheEventTypes";

/**
 * Factory functions for creating cache events
 */
export class CacheEventFactory {
  private static lastTimestamp = 0;
  private static cleanupInterval: NodeJS.Timeout | null = null;
  private static instanceCount = 0;
  private static readonly CLEANUP_INTERVAL_MS = 60000; // 1 minute
  private static readonly MAX_TIMESTAMP_AGE_MS = 300000; // 5 minutes

  /**
   * Initialize cleanup mechanism when first instance is created
   */
  private static initializeCleanup(): void {
    if (this.cleanupInterval === null && this.instanceCount === 0) {
      this.startCleanupTimer();
    }
    this.instanceCount++;
  }

  /**
   * Cleanup mechanism when instance is destroyed
   */
  public static destroyInstance(): void {
    this.instanceCount = Math.max(0, this.instanceCount - 1);
    if (this.instanceCount === 0) {
      this.stopCleanupTimer();
      this.resetTimestamp();
    }
  }

  /**
   * Start automatic cleanup timer
   */
  private static startCleanupTimer(): void {
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, this.CLEANUP_INTERVAL_MS);

    // Don't keep the process alive just for cleanup
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Stop automatic cleanup timer
   */
  private static stopCleanupTimer(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Perform periodic cleanup of stale timestamp state
   */
  private static performCleanup(): void {
    const now = Date.now();
    // Reset timestamp if it's too old to prevent memory issues
    if (now - this.lastTimestamp > this.MAX_TIMESTAMP_AGE_MS) {
      this.lastTimestamp = 0;
    }
  }

  /**
   * Reset the timestamp state (useful for testing)
   */
  public static resetTimestamp(): void {
    this.lastTimestamp = 0;
  }

  /**
   * Generate a unique timestamp that is always greater than the previous one
   */
  private static generateTimestamp(): number {
    this.initializeCleanup();

    const now = Date.now();
    // If current time is greater than last timestamp, use current time
    // Otherwise, increment last timestamp to ensure uniqueness
    if (now > this.lastTimestamp) {
      this.lastTimestamp = now;
    } else {
      this.lastTimestamp = this.lastTimestamp + 1;
    }
    return this.lastTimestamp;
  }

  /**
   * Extract affected locations from an item key
   */
  private static extractAffectedLocations<
    S extends string,
    L1 extends string = never,
    L2 extends string = never,
    L3 extends string = never,
    L4 extends string = never,
    L5 extends string = never
  >(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): LocKeyArray<L1, L2, L3, L4, L5> | [] {
    if ('loc' in key && key.loc) {
      return key.loc;
    }
    return [];
  }

  /**
   * Create an item-related event
   */
  public static createItemEvent<
    V extends Item<S, L1, L2, L3, L4, L5>,
    S extends string,
    L1 extends string = never,
    L2 extends string = never,
    L3 extends string = never,
    L4 extends string = never,
    L5 extends string = never
  >(
    type: 'item_created' | 'item_updated' | 'item_removed' | 'item_retrieved' | 'item_set',
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
    item: V | null,
    options: {
      previousItem?: V | null | null;
      source?: 'api' | 'cache' | 'operation';
      affectedLocations?: LocKeyArray<L1, L2, L3, L4, L5> | [];
      context?: {
        operation?: string;
        requestId?: string;
        userId?: string;
      };
    } = {}
  ): ItemEvent<V, S, L1, L2, L3, L4, L5> {
    // Auto-calculate affected locations if not provided
    const affectedLocations = options.affectedLocations !== undefined
      ? options.affectedLocations
      : this.extractAffectedLocations(key);

    return {
      type,
      timestamp: this.generateTimestamp(),
      source: options.source || 'operation',
      context: options.context,
      key,
      item,
      previousItem: options.previousItem,
      affectedLocations
    };
  }

  /**
   * Create a query event
   */
  public static createQueryEvent<
    V extends Item<S, L1, L2, L3, L4, L5>,
    S extends string,
    L1 extends string = never,
    L2 extends string = never,
    L3 extends string = never,
    L4 extends string = never,
    L5 extends string = never
  >(
    query: ItemQuery,
    locations: LocKeyArray<L1, L2, L3, L4, L5> | [],
    items: V[],
    options: {
      source?: 'api' | 'cache' | 'operation';
      context?: {
        operation?: string;
        requestId?: string;
        userId?: string;
      };
    } = {}
  ): QueryEvent<V, S, L1, L2, L3, L4, L5> {
    const affectedKeys = items.map(item => item.key);

    return {
      type: 'items_queried',
      timestamp: this.generateTimestamp(),
      source: options.source || 'operation',
      context: options.context,
      query,
      locations,
      items,
      affectedKeys
    };
  }

  /**
   * Create a cache cleared event
   */
  public static createCacheClearedEvent(
    itemsCleared: number,
    queryCacheCleared: boolean = true,
    options: {
      source?: 'api' | 'cache' | 'operation';
      context?: {
        operation?: string;
        requestId?: string;
        userId?: string;
      };
    } = {}
  ): CacheClearedEvent {
    return {
      type: 'cache_cleared',
      timestamp: this.generateTimestamp(),
      source: options.source || 'operation',
      context: options.context,
      itemsCleared,
      queryCacheCleared
    };
  }

  /**
   * Create a location invalidated event
   */
  public static createLocationInvalidatedEvent<
    S extends string,
    L1 extends string = never,
    L2 extends string = never,
    L3 extends string = never,
    L4 extends string = never,
    L5 extends string = never
  >(
    locations: LocKeyArray<L1, L2, L3, L4, L5> | [],
    affectedKeys: (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[],
    options: {
      source?: 'api' | 'cache' | 'operation';
      context?: {
        operation?: string;
        requestId?: string;
        userId?: string;
      };
    } = {}
  ): LocationInvalidatedEvent<S, L1, L2, L3, L4, L5> {
    return {
      type: 'location_invalidated',
      timestamp: this.generateTimestamp(),
      source: options.source || 'operation',
      context: options.context,
      locations,
      affectedKeys
    };
  }

  /**
   * Create a query invalidated event
   */
  public static createQueryInvalidatedEvent(
    invalidatedQueries: string[],
    reason: 'manual' | 'item_changed' | 'location_changed' | 'ttl_expired',
    options: {
      source?: 'api' | 'cache' | 'operation';
      context?: {
        operation?: string;
        requestId?: string;
        userId?: string;
      };
    } = {}
  ): QueryInvalidatedEvent {
    return {
      type: 'query_invalidated',
      timestamp: this.generateTimestamp(),
      source: options.source || 'operation',
      context: options.context,
      invalidatedQueries,
      reason
    };
  }

  /**
   * Create an item created event
   */
  public static itemCreated<
    V extends Item<S, L1, L2, L3, L4, L5>,
    S extends string,
    L1 extends string = never,
    L2 extends string = never,
    L3 extends string = never,
    L4 extends string = never,
    L5 extends string = never
  >(
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
    item: V,
    source: 'api' | 'cache' | 'operation' = 'api'
  ): ItemEvent<V, S, L1, L2, L3, L4, L5> {
    return this.createItemEvent('item_created', key, item, { source });
  }

  /**
   * Create an item updated event
   */
  public static itemUpdated<
    V extends Item<S, L1, L2, L3, L4, L5>,
    S extends string,
    L1 extends string = never,
    L2 extends string = never,
    L3 extends string = never,
    L4 extends string = never,
    L5 extends string = never
  >(
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
    item: V,
    previousItem?: V | null,
    source: 'api' | 'cache' | 'operation' = 'api'
  ): ItemEvent<V, S, L1, L2, L3, L4, L5> {
    return this.createItemEvent('item_updated', key, item, { previousItem, source });
  }

  /**
   * Create an item removed event
   */
  public static itemRemoved<
    V extends Item<S, L1, L2, L3, L4, L5>,
    S extends string,
    L1 extends string = never,
    L2 extends string = never,
    L3 extends string = never,
    L4 extends string = never,
    L5 extends string = never
  >(
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
    previousItem?: V | null,
    source: 'api' | 'cache' | 'operation' = 'api'
  ): ItemEvent<V, S, L1, L2, L3, L4, L5> {
    return this.createItemEvent('item_removed', key, null, { previousItem, source });
  }

  /**
   * Create an item retrieved event
   */
  public static itemRetrieved<
    V extends Item<S, L1, L2, L3, L4, L5>,
    S extends string,
    L1 extends string = never,
    L2 extends string = never,
    L3 extends string = never,
    L4 extends string = never,
    L5 extends string = never
  >(
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
    item: V,
    source: 'api' | 'cache' | 'operation' = 'api'
  ): ItemEvent<V, S, L1, L2, L3, L4, L5> {
    return this.createItemEvent('item_retrieved', key, item, { source });
  }

  /**
   * Create an item set event (direct cache operation)
   */
  public static itemSet<
    V extends Item<S, L1, L2, L3, L4, L5>,
    S extends string,
    L1 extends string = never,
    L2 extends string = never,
    L3 extends string = never,
    L4 extends string = never,
    L5 extends string = never
  >(
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
    item: V,
    previousItem?: V | null
  ): ItemEvent<V, S, L1, L2, L3, L4, L5> {
    return this.createItemEvent('item_set', key, item, {
      previousItem,
      source: 'cache'
    });
  }
}
