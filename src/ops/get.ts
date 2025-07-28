import {
  ComKey,
  isValidItemKey,
  Item,
  PriKey,
  validatePK
} from "@fjell/core";
import { ClientApi } from "@fjell/client-api";
import { CacheMap } from "../CacheMap";
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
  api: ClientApi<V, S, L1, L2, L3, L4, L5>,
  cacheMap: CacheMap<V, S, L1, L2, L3, L4, L5>,
  pkType: S,
  key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>
): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V | null]> => {
  logger.default('get', { key });

  if (!isValidItemKey(key)) {
    logger.error('Key for Get is not a valid ItemKey: %j', key);
    throw new Error('Key for Get is not a valid ItemKey');
  }

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
    cacheMap,
    ret ?
      validatePK(ret, pkType) as V :
      null
  ];
};
