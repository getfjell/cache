import { ComKey, Item, ItemQuery, LocKeyArray, PriKey } from "@fjell/core";
import { ClientApi } from "@fjell/client-api";
import { Coordinate } from "@fjell/registry";
import { CacheMap } from "./CacheMap";

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
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V[]]>;

  /**
   * Retrieves the first item that matches the query from cache or API.
   * Item is cached automatically after retrieval.
   */
  one(
    query?: ItemQuery,
    locations?: LocKeyArray<L1, L2, L3, L4, L5> | []
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V | null]>;

  /**
   * Creates a new item via API and caches it.
   */
  create(
    item: Partial<Item<S, L1, L2, L3, L4, L5>>,
    locations?: LocKeyArray<L1, L2, L3, L4, L5> | []
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V]>;

  /**
   * Gets an item by key from cache or API and caches it.
   */
  get(
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V | null]>;

  /**
   * Retrieves an item from cache if available, otherwise from API.
   * Returns null as first element if item was already in cache.
   */
  retrieve(
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5> | null, V | null]>;

  /**
   * Removes an item via API and from cache.
   */
  remove(
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>
  ): Promise<CacheMap<V, S, L1, L2, L3, L4, L5>>;

  /**
   * Updates an item via API and caches the result.
   */
  update(
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
    item: Partial<Item<S, L1, L2, L3, L4, L5>>
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V]>;

  /**
   * Executes an action on an item via API and caches the result.
   */
  action(
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
    action: string,
    body?: any
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V]>;

  /**
   * Executes an action on all items matching criteria via API and caches results.
   */
  allAction(
    action: string,
    body?: any,
    locations?: LocKeyArray<L1, L2, L3, L4, L5> | []
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V[]]>;

  /**
   * Executes a facet query on an item via API (pass-through, no caching).
   */
  facet(
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
    facet: string,
    params?: Record<string, string | number | boolean | Date | Array<string | number | boolean | Date>>
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, any]>;

  /**
   * Executes a facet query on all items matching criteria via API (pass-through, no caching).
   */
  allFacet(
    facet: string,
    params?: Record<string, string | number | boolean | Date | Array<string | number | boolean | Date>>,
    locations?: LocKeyArray<L1, L2, L3, L4, L5> | []
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, any]>;

  /**
   * Finds items using a finder method via API and caches results.
   */
  find(
    finder: string,
    params?: Record<string, string | number | boolean | Date | Array<string | number | boolean | Date>>,
    locations?: LocKeyArray<L1, L2, L3, L4, L5> | []
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V[]]>;

  /**
   * Finds a single item using a finder method via API and caches result.
   */
  findOne(
    finder: string,
    params?: Record<string, string | number | boolean | Date | Array<string | number | boolean | Date>>,
    locations?: LocKeyArray<L1, L2, L3, L4, L5> | []
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V]>;

  /**
   * Sets an item directly in cache without API call.
   */
  set(
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
    item: Item<S, L1, L2, L3, L4, L5>
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V]>;

  /**
   * Resets the cache, clearing all cached items.
   */
  reset(): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>]>;
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
    pkType: S
  ): Operations<V, S, L1, L2, L3, L4, L5> => {
  return {
    all: (query, locations) => all(api, cacheMap, pkType, query, locations),
    one: (query, locations) => one(api, cacheMap, pkType, query, locations),
    create: (item, locations) => create(api, cacheMap, pkType, item, locations),
    get: (key) => get(api, cacheMap, pkType, key),
    retrieve: (key) => retrieve(api, cacheMap, pkType, key),
    remove: (key) => remove(api, cacheMap, key),
    update: (key, item) => update(api, cacheMap, pkType, key, item),
    action: (key, actionName, body) => action(api, cacheMap, pkType, key, actionName, body),
    allAction: (actionName, body, locations) => allAction(api, cacheMap, pkType, actionName, body, locations),
    facet: (key, facetName, params) => facet(api, cacheMap, key, facetName, params),
    allFacet: (facetName, params, locations) => allFacet(api, cacheMap, facetName, params, locations),
    find: (finder, params, locations) => find(api, cacheMap, pkType, finder, params, locations),
    findOne: (finder, params, locations) => findOne(api, cacheMap, pkType, finder, params, locations),
    set: (key, item) => set(cacheMap, pkType, key, item),
    reset: () => reset(coordinate)
  };
};
