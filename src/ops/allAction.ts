import {
  Item,
  LocKeyArray,
  validatePK
} from "@fjell/core";
import { NotFoundError } from "@fjell/http-api";
import { CacheContext } from "../CacheContext";
import LibLogger from "../logger";

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
  action: string,
  body: any = {},
  locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = [],
  context: CacheContext<V, S, L1, L2, L3, L4, L5>
): Promise<[CacheContext<V, S, L1, L2, L3, L4, L5>, V[]]> => {
  const { api, cacheMap, pkType } = context;
  logger.default('allAction', { action, body, locations });

  // Invalidate all items in the specified locations before executing the action
  logger.debug('Invalidating location before allAction', { locations });
  cacheMap.invalidateLocation(locations);

  let ret: V[] = [];
  try {
    ret = await api.allAction(action, body, locations);

    // Cache all results after the action
    logger.debug('Caching allAction results', { resultCount: ret.length });
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
  return [context, validatePK(ret, pkType) as V[]];
};
