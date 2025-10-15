import { ComKey, Item, ItemQuery, LocKeyArray, PriKey } from "@fjell/core";
import { ClientApi } from "@fjell/client-api";
import { Coordinate } from "@fjell/registry";
import { CacheMap } from "./CacheMap";
import { createCacheContext } from "./CacheContext";
import { CacheEventEmitter } from "./events/CacheEventEmitter";

// Import all operation functions
import { all } from "./ops/all";
import { one } from "./ops/one";
import { create } from "./ops/create";
import { get } from "./ops/get";
import { retrieve } from "./ops/retrieve";
import { remove } from "./ops/remove";
import { update } from "./ops/update";
import { action } from "./ops/action";
import { allAction } from "./ops/allAction";
import { facet } from "./ops/facet";
import { allFacet } from "./ops/allFacet";
import { find } from "./ops/find";
import { findOne } from "./ops/findOne";
import { set } from "./ops/set";
import { reset } from "./ops/reset";
import { Options } from "./Options";
import { TTLManager } from "./ttl/TTLManager";
import { EvictionManager } from "./eviction/EvictionManager";
import { CacheStatsManager } from "./CacheStats";
import { Registry } from "@fjell/registry";

export interface Operations<
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never,
> {

  /**
   * Retrieves all the items that match the query from cache or API.
   * Items are cached automatically after retrieval.
   */
  all(
    query?: ItemQuery,
    locations?: LocKeyArray<L1, L2, L3, L4, L5> | []
  ): Promise<V[]>;

  /**
   * Retrieves the first item that matches the query from cache or API.
   * Item is cached automatically after retrieval.
   */
  one(
    query?: ItemQuery,
    locations?: LocKeyArray<L1, L2, L3, L4, L5> | []
  ): Promise<V | null>;

  /**
   * Creates a new item via API and caches it.
   */
  create(
    item: Partial<Item<S, L1, L2, L3, L4, L5>>,
    locations?: LocKeyArray<L1, L2, L3, L4, L5> | []
  ): Promise<V>;

  /**
   * Gets an item by key from cache or API and caches it.
   */
  get(
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>
  ): Promise<V | null>;

  /**
   * Retrieves an item from cache if available, otherwise from API.
   */
  retrieve(
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>
  ): Promise<V | null>;

  /**
   * Removes an item via API and from cache.
   */
  remove(
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>
  ): Promise<void>;

  /**
   * Updates an item via API and caches the result.
   */
  update(
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
    item: Partial<Item<S, L1, L2, L3, L4, L5>>
  ): Promise<V>;

  /**
   * Executes an action on an item via API and caches the result.
   * Also handles cache invalidation for affected items returned by the action.
   */
  action(
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
    action: string,
    body?: any
  ): Promise<[V, Array<PriKey<any> | ComKey<any, any, any, any, any, any> | LocKeyArray<any, any, any, any, any>>]>;

  /**
   * Executes an action on all items matching criteria via API and caches results.
   * Also handles cache invalidation for affected items returned by the action.
   */
  allAction(
    action: string,
    body?: any,
    locations?: LocKeyArray<L1, L2, L3, L4, L5> | []
  ): Promise<[V[], Array<PriKey<any> | ComKey<any, any, any, any, any, any> | LocKeyArray<any, any, any, any, any>>]>;

  /**
   * Executes a facet query on an item via API (pass-through, no caching).
   */
  facet(
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
    facet: string,
    params?: Record<string, string | number | boolean | Date | Array<string | number | boolean | Date>>
  ): Promise<any>;

  /**
   * Executes a facet query on all items matching criteria via API (pass-through, no caching).
   */
  allFacet(
    facet: string,
    params?: Record<string, string | number | boolean | Date | Array<string | number | boolean | Date>>,
    locations?: LocKeyArray<L1, L2, L3, L4, L5> | []
  ): Promise<any>;

  /**
   * Finds items using a finder method via API and caches results.
   */
  find(
    finder: string,
    params?: Record<string, string | number | boolean | Date | Array<string | number | boolean | Date>>,
    locations?: LocKeyArray<L1, L2, L3, L4, L5> | []
  ): Promise<V[]>;

  /**
   * Finds a single item using a finder method via API and caches result.
   */
  findOne(
    finder: string,
    params?: Record<string, string | number | boolean | Date | Array<string | number | boolean | Date>>,
    locations?: LocKeyArray<L1, L2, L3, L4, L5> | []
  ): Promise<V>;

  /**
   * Sets an item directly in cache without API call.
   */
  set(
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
    item: Item<S, L1, L2, L3, L4, L5>
  ): Promise<V>;

  /**
   * Resets the cache, clearing all cached items.
   */
  reset(): Promise<void>;
}

export const createOperations = <
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
>(
    api: ClientApi<V, S, L1, L2, L3, L4, L5>,
    coordinate: Coordinate<S, L1, L2, L3, L4, L5>,
    cacheMap: CacheMap<V, S, L1, L2, L3, L4, L5>,
    pkType: S,
    options: Options<V, S, L1, L2, L3, L4, L5>,
    eventEmitter: CacheEventEmitter<V, S, L1, L2, L3, L4, L5>,
    ttlManager: TTLManager,
    evictionManager: EvictionManager,
    statsManager: CacheStatsManager,
    registry: Registry
  ): Operations<V, S, L1, L2, L3, L4, L5> => {

  // Create the cache context once and reuse it across all operations
  const context = createCacheContext(api, cacheMap, pkType, options, eventEmitter, ttlManager, evictionManager, statsManager, registry, coordinate);

  return {
    all: (query, locations) => all(query, locations, context).then(([ctx, result]) => result),
    one: (query, locations) => one(query, locations, context).then(([ctx, result]) => result),
    create: (item, locations) => create(item, locations, context).then(([ctx, result]) => result),
    get: (key) => get(key, context).then(([ctx, result]) => result),
    retrieve: (key) => retrieve(key, context).then(([ctx, result]) => result),
    remove: (key) => remove(key, context).then((ctx) => undefined),
    update: (key, item) => update(key, item, context).then(([ctx, result]) => result),
    action: (key, actionName, body) => action(key, actionName, body, context).then(([ctx, result, affectedItems]) => [result, affectedItems]),
    allAction: (actionName, body, locations) => allAction(actionName, body, locations, context).then(([ctx, result, affectedItems]) => [result, affectedItems]),
    facet: (key, facetName, params) => facet(key, facetName, params, context).then(result => result),
    allFacet: (facetName, params, locations) => allFacet(facetName, params, locations, context).then(result => result),
    find: (finder, params, locations) => find(finder, params, locations, context).then(([ctx, result]) => result),
    findOne: (finder, params, locations) => findOne(finder, params, locations, context).then(([ctx, result]) => result),
    set: (key, item) => set(key, item, context).then(([ctx, result]) => result),
    reset: () => reset(coordinate, context.options).then(() => undefined)
  };
};
