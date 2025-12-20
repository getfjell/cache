import { ComKey, Item, ItemQuery, LocKeyArray, PriKey } from "@fjell/types";

/**
 * Types of events that can be emitted by the cache system
 */
export type CacheEventType =
  | 'item_created'     // Item was created via API and cached
  | 'item_updated'     // Item was updated via API and cache updated
  | 'item_removed'     // Item was removed via API and from cache
  | 'item_retrieved'   // Item was retrieved from API and cached
  | 'item_set'         // Item was set directly in cache (no API call)
  | 'items_queried'    // Multiple items were queried and cached
  | 'cache_cleared'    // Entire cache was cleared
  | 'location_invalidated'  // Specific location(s) were invalidated
  | 'query_invalidated';    // Cached query results were invalidated

/**
 * Base interface for all cache events
 */
export interface CacheEvent {
  /** Type of the event */
  type: CacheEventType;

  /** Timestamp when the event occurred */
  timestamp: number;

  /** Source of the event */
  source: 'api' | 'cache' | 'operation';

  /** Optional context about what triggered this event */
  context?: {
    operation?: string;
    requestId?: string;
    userId?: string;
  };
}

/**
 * Event emitted when a single item is affected
 */
export interface ItemEvent<
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
> extends CacheEvent {
  type: 'item_created' | 'item_updated' | 'item_removed' | 'item_retrieved' | 'item_set';

  /** The key of the affected item */
  key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>;

  /** The current item (null for 'item_removed') */
  item: V | null;

  /** The previous item before the change (for updates/removals) */
  previousItem?: V | null;

  /** Locations affected by this change */
  affectedLocations?: LocKeyArray<L1, L2, L3, L4, L5> | [];
}

/**
 * Event emitted when multiple items are affected by a query
 */
export interface QueryEvent<
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
> extends CacheEvent {
  type: 'items_queried';

  /** The query that was executed */
  query: ItemQuery;

  /** Locations where the query was executed */
  locations: LocKeyArray<L1, L2, L3, L4, L5> | [];

  /** Items returned by the query */
  items: V[];

  /** Keys of all items affected by this query */
  affectedKeys: (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[];
}

/**
 * Event emitted when the entire cache is cleared
 */
export interface CacheClearedEvent extends CacheEvent {
  type: 'cache_cleared';

  /** Number of items that were cleared */
  itemsCleared: number;

  /** Whether query cache was also cleared */
  queryCacheCleared: boolean;
}

/**
 * Event emitted when specific locations are invalidated
 */
export interface LocationInvalidatedEvent<
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
> extends CacheEvent {
  type: 'location_invalidated';

  /** Locations that were invalidated */
  locations: LocKeyArray<L1, L2, L3, L4, L5> | [];

  /** Keys of items that were affected by the invalidation */
  affectedKeys: (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[];
}

/**
 * Event emitted when cached query results are invalidated
 */
export interface QueryInvalidatedEvent extends CacheEvent {
  type: 'query_invalidated';

  /** Queries that were invalidated (query hashes) */
  invalidatedQueries: string[];

  /** Reason for invalidation */
  reason: 'manual' | 'item_changed' | 'location_changed' | 'ttl_expired';
}

/**
 * Union type of all possible cache events
 */
export type AnyCacheEvent<
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
> =
  | ItemEvent<V, S, L1, L2, L3, L4, L5>
  | QueryEvent<V, S, L1, L2, L3, L4, L5>
  | CacheClearedEvent
  | LocationInvalidatedEvent<S, L1, L2, L3, L4, L5>
  | QueryInvalidatedEvent;

/**
 * Function type for cache event listeners
 */
export type CacheEventListener<
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
> = (event: AnyCacheEvent<V, S, L1, L2, L3, L4, L5>) => void;

/**
 * Options for subscribing to cache events
 */
export interface CacheSubscriptionOptions<
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
> {
  /** Only emit events for specific keys */
  keys?: (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[];

  /** Only emit events for specific locations */
  locations?: LocKeyArray<L1, L2, L3, L4, L5> | [];

  /** Only emit events matching this query */
  query?: ItemQuery;

  /** Filter by event types */
  eventTypes?: CacheEventType[];

  /** Debounce events by this many milliseconds */
  debounceMs?: number;

  /** Whether to emit events for items that match the subscription criteria */
  includeExistingItems?: boolean;

  /** Optional error handler for listener errors */
  onError?: (error: Error, event: any) => void;

  /** Use weak references for the listener (default: true if WeakRef is available) */
  useWeakRef?: boolean;
}

/**
 * Represents an active subscription to cache events
 */
export interface CacheSubscription {
  /** Unique identifier for this subscription */
  id: string;

  /** Unsubscribe from events */
  unsubscribe: () => void;

  /** Check if this subscription is still active */
  isActive: () => boolean;

  /** Get subscription options */
  getOptions: () => CacheSubscriptionOptions<any, any, any, any, any, any>;
}
