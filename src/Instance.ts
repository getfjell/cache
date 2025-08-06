
import LibLogger from "./logger";
import { Item } from "@fjell/core";
import { Coordinate, Registry } from "@fjell/registry";
import { ClientApi } from "@fjell/client-api";
import { Cache, createCache } from "./Cache";

const logger = LibLogger.get("Instance");

/**
 * The Cache Instance interface represents a cache model instance that extends the base Instance
 * from @fjell/registry and adds cache operations for interacting with cached data.
 *
 * This is an alias for the Cache interface since Cache now extends Instance directly.
 *
 * @template V - The type of the data model item, extending Item
 * @template S - The string literal type representing the model's key type
 * @template L1-L5 - Optional string literal types for location hierarchy levels
 */
export type Instance<
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
> = Cache<V, S, L1, L2, L3, L4, L5>;

export const createInstance = <
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
>(
    registry: Registry,
    coordinate: Coordinate<S, L1, L2, L3, L4, L5>,
    api: ClientApi<V, S, L1, L2, L3, L4, L5>,
    options?: Partial<import('./Options').Options<V, S, L1, L2, L3, L4, L5>>
  ): Instance<V, S, L1, L2, L3, L4, L5> => {
  logger.debug("createInstance", { coordinate, api, registry, options });
  return createCache(api, coordinate, registry, options);
}

export const isInstance = (instance: any): instance is Instance<any, any, any, any, any, any, any> => {
  return instance !== null &&
    typeof instance === 'object' &&
    'coordinate' in instance &&
    'registry' in instance &&
    'api' in instance &&
    'cacheMap' in instance &&
    'operations' in instance;
}
