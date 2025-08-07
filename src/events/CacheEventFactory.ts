import { ComKey, Item, ItemQuery, LocKeyArray, PriKey } from "@fjell/core";
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
    return {
      type,
      timestamp: Date.now(),
      source: options.source || 'operation',
      context: options.context,
      key,
      item,
      previousItem: options.previousItem,
      affectedLocations: options.affectedLocations
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
      timestamp: Date.now(),
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
      timestamp: Date.now(),
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
      timestamp: Date.now(),
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
      timestamp: Date.now(),
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
