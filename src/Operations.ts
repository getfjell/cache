import {
  AffectedKeys,
  Operations as CoreOperations,
  CreateOptions,
  isOperationComKey as isComKey,
  isOperationPriKey as isPriKey,
  OperationParams
} from "@fjell/core";
import { ComKey, Item, ItemQuery, LocKeyArray, PriKey } from "@fjell/core";
import { ClientApi } from "@fjell/client-api";
import { Coordinate } from "@fjell/core";
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

// Re-export core types
export type { OperationParams, AffectedKeys, CreateOptions };
export { isPriKey, isComKey };

/**
 * Cache Operations interface extends core Operations and adds cache-specific methods.
 *
 * Inherits all standard operations from @fjell/core, plus:
 * - retrieve: Get from cache without API fallback
 * - set: Set directly in cache
 * - reset: Clear cache
 */
export interface Operations<
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never,
> extends CoreOperations<V, S, L1, L2, L3, L4, L5> {
  /**
   * Retrieves an item from cache if available, otherwise from API.
   * Similar to get() but distinguishes between cache-first retrieval.
   */
  retrieve(
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>
  ): Promise<V | null>;

  /**
   * Sets an item directly in cache without API call.
   * Useful for manual cache population.
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
    create: (item, options) => {
      // Handle CreateOptions - extract locations if provided
      const locations = options?.locations || [];
      return create(item, locations, context).then(([ctx, result]) => result);
    },
    get: (key) => get(key, context).then(([ctx, result]) => result),
    retrieve: (key) => retrieve(key, context).then(([ctx, result]) => result),
    remove: (key) => remove(key, context).then((ctx) => undefined),
    update: (key, item) => update(key, item, context).then(([ctx, result]) => result),
    upsert: async (key, itemProperties, locations) => {
      // Implement upsert using get/create/update
      const existing = await get(key, context).then(([ctx, result]) => result);
      if (existing) {
        return update(key, itemProperties, context).then(([ctx, result]) => result);
      } else {
        // For creation, we need to pass locations
        return create(itemProperties, locations || [], context).then(([ctx, result]) => result);
      }
    },
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
