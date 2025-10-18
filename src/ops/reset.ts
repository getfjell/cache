import {
  Coordinate,
  Item
} from "@fjell/core";
import { CacheMap } from "../CacheMap";
import { createCacheMap, Options, validateOptions } from "../Options";

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
  try {
    // Validate options first
    validateOptions(options);

    // Create a new cache map with the provided configuration
    const newCacheMap = createCacheMap<V, S, L1, L2, L3, L4, L5>(coordinate.kta, options);

    return [newCacheMap];
  } catch (error) {
    // Re-throw any errors during reset
    throw error;
  }
};
