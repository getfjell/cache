import {
  Item,
  LocKeyArray,
  validatePK
} from "@fjell/core";
import { ClientApi } from "@fjell/client-api";
import { NotFoundError } from "@fjell/http-api";
import { CacheMap } from "@/CacheMap";
import LibLogger from "@/logger";

const logger = LibLogger.get('allAction');

export const allAction = async <
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
  action: string,
  body: any = {},
  locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = []
): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V[]]> => {
  logger.default('allAction', { action, body, locations });
  let ret: V[] = [];
  try {
    ret = await api.allAction(action, body, locations);
    ret.forEach((v) => {
      cacheMap.set(v.key, v);
    });
  } catch (e: unknown) {
    // istanbul ignore next
    if (e instanceof NotFoundError) {
      // Handle not found gracefully
    } else {
      throw e;
    }
  }
  return [cacheMap, validatePK(ret, pkType) as V[]];
};
