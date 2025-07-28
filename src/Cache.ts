import { Item } from "@fjell/core";
import { Instance as BaseInstance, Coordinate, Registry } from "@fjell/registry";
import { ClientApi } from "@fjell/client-api";
import { CacheMap } from "./CacheMap";
import { createOperations, Operations } from "./Operations";
import LibLogger from "./logger";

const logger = LibLogger.get('Cache');

/**
 * The Cache interface extends the base Instance from @fjell/registry and adds cache operations
 * for interacting with cached data.
 *
 * The interface extends the base Instance (which provides coordinate and registry) with:
 * - api: Provides methods for interacting with server API
 * - cacheMap: Local cache storage for items
 * - operations: All cache operations (get, set, all, etc.) that work with both cache and API
 *
 * @template V - The type of the data model item, extending Item
 * @template S - The string literal type representing the model's key type
 * @template L1-L5 - Optional string literal types for location hierarchy levels
 */
export interface Cache<
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
> extends BaseInstance<S, L1, L2, L3, L4, L5> {
  /** The API client for interacting with server endpoints */
  api: ClientApi<V, S, L1, L2, L3, L4, L5>;

  /** The cache map that stores cached items */
  cacheMap: CacheMap<V, S, L1, L2, L3, L4, L5>;

  /** All cache operations that work with both cache and API */
  operations: Operations<V, S, L1, L2, L3, L4, L5>;
}

export const createCache = <
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
    registry: Registry
  ): Cache<V, S, L1, L2, L3, L4, L5> => {
  logger.debug('createCache', { coordinate, registry });

  // Create the cache map using the coordinate's key type array
  const cacheMap = new CacheMap<V, S, L1, L2, L3, L4, L5>(coordinate.kta);

  // Get the primary key type from the coordinate
  const pkType = coordinate.kta[0] as S;

  // Create operations
  const operations = createOperations(api, coordinate, cacheMap, pkType);

  return {
    coordinate,
    registry,
    api,
    cacheMap,
    operations
  };
};

export const isCache = (cache: any): cache is Cache<any, any, any, any, any, any, any> => {
  return cache !== null &&
    typeof cache === 'object' &&
    'coordinate' in cache &&
    'registry' in cache &&
    'api' in cache &&
    'cacheMap' in cache &&
    'operations' in cache;
};
