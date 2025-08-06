import {
  ComKey,
  isValidItemKey,
  Item,
  PriKey,
  validatePK
} from "@fjell/core";
import { CacheContext } from "../CacheContext";
import LibLogger from "../logger";

const logger = LibLogger.get('get');

export const get = async <
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
>(
  key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
  context: CacheContext<V, S, L1, L2, L3, L4, L5>
): Promise<[CacheContext<V, S, L1, L2, L3, L4, L5>, V | null]> => {
  const { api, cacheMap, pkType, itemTtl } = context;
  logger.default('get', { key, itemTtl });

  if (!isValidItemKey(key)) {
    logger.error('Key for Get is not a valid ItemKey: %j', key);
    throw new Error('Key for Get is not a valid ItemKey');
  }

  // If TTL is defined and greater than 0, check cache first
  if (typeof itemTtl === 'number' && itemTtl > 0) {
    const cachedItem = cacheMap.getWithTTL(key, itemTtl);
    if (cachedItem) {
      logger.debug('Cache hit with TTL', { key, itemTtl });
      return [context, validatePK(cachedItem, pkType) as V];
    }
    logger.debug('Cache miss or expired', { key, itemTtl });
  }

  // If TTL is 0 or cache miss/expired, fetch from API
  let ret: V | null;
  try {
    ret = await api.get(key);
    if (ret) {
      cacheMap.set(ret.key, ret);
    }
  } catch (e: any) {
    logger.error("Error getting item for key", { key, message: e.message, stack: e.stack });
    throw e;
  }

  return [
    context,
    ret ?
      validatePK(ret, pkType) as V :
      null
  ];
};
