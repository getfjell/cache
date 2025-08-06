import {
  Item
} from "@fjell/core";
import { CacheMap } from "../CacheMap";
import { createCacheMap, Options } from "../Options";
import { Coordinate } from "@fjell/registry";

export const reset = async <
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
>(
  coordinate: Coordinate<S, L1, L2, L3, L4, L5>,
  options: Options<V, S, L1, L2, L3, L4, L5>
): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>]> => {
  // Create a new cache map using the same configuration as the original
  const cacheMap = createCacheMap<V, S, L1, L2, L3, L4, L5>(coordinate.kta, options);
  return [cacheMap];
};
