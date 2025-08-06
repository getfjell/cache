import { Item } from "@fjell/core";
import { ClientApi } from "@fjell/client-api";
import { CacheMap } from "./CacheMap";
import { Options } from "./Options";

/**
 * Context object that consolidates all cache-related parameters
 * passed to cache operations. This prevents cache concerns from
 * polluting operation signatures.
 */
export interface CacheContext<
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
> {
  /** The client API for making requests */
  api: ClientApi<V, S, L1, L2, L3, L4, L5>;

  /** The cache map for storing and retrieving cached items */
  cacheMap: CacheMap<V, S, L1, L2, L3, L4, L5>;

  /** The primary key type */
  pkType: S;

  /** Cache options including TTL configuration */
  options: Options<V, S, L1, L2, L3, L4, L5>;

  /** TTL for individual items (from memoryConfig.ttl or ttl) */
  itemTtl?: number;

  /** TTL for query results (from ttl) */
  queryTtl?: number;
}

/**
 * Creates a CacheContext from the individual cache-related parameters
 */
export const createCacheContext = <
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
>(
    api: ClientApi<V, S, L1, L2, L3, L4, L5>,
    cacheMap: CacheMap<V, S, L1, L2, L3, L4, L5>,
    pkType: S,
    options: Options<V, S, L1, L2, L3, L4, L5>
  ): CacheContext<V, S, L1, L2, L3, L4, L5> => {
  return {
    api,
    cacheMap,
    pkType,
    options,
    itemTtl: options.memoryConfig?.ttl || options.ttl,
    queryTtl: options.memoryConfig?.ttl || options.ttl
  };
};
