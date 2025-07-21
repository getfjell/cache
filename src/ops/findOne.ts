import {
  Item,
  LocKeyArray,
  validatePK
} from "@fjell/core";
import { ClientApi } from "@fjell/client-api";
import { CacheMap } from "@/CacheMap";
import LibLogger from "@/logger";

const logger = LibLogger.get('findOne');

export const findOne = async <
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
  finder: string,
  finderParams: Record<string, string | number | boolean | Date | Array<string | number | boolean | Date>> = {},
  locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = []
): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V]> => {
  logger.default('findOne', { finder, finderParams, locations });
  const ret = await api.findOne(finder, finderParams, locations);
  cacheMap.set(ret.key, ret);
  return [cacheMap, validatePK(ret, pkType) as V];
};
