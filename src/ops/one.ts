import {
  Item,
  ItemQuery,
  LocKeyArray,
  validatePK
} from "@fjell/core";
import { ClientApi } from "@fjell/client-api";
import { NotFoundError } from "@fjell/http-api";
import { CacheMap } from "@/CacheMap";
import LibLogger from "@/logger";

const logger = LibLogger.get('one');

export const one = async <
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
  query: ItemQuery = {},
  locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = []
): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V | null]> => {
  logger.default('one', { query, locations });

  let retItem: V | null = null;
  try {
    retItem = await api.one(query, locations);
    if (retItem) {
      cacheMap.set(retItem.key, retItem);
    }
  } catch (e: unknown) {
    if (e instanceof NotFoundError) {
      // Handle not found gracefully
    } else {
      throw e;
    }
  }
  return [
    cacheMap,
    retItem ?
      validatePK(retItem, pkType) as V :
      null
  ];
};
