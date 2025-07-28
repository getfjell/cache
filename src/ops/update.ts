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

const logger = LibLogger.get('update');

export const update = async <
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
  key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
  v: Partial<Item<S, L1, L2, L3, L4, L5>>
): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V]> => {
  logger.default('update', { key, v });

  if (!isValidItemKey(key)) {
    logger.error('Key for Update is not a valid ItemKey: %j', key);
    throw new Error('Key for Update is not a valid ItemKey');
  }

  try {
    const updated = await api.update(key, v);
    cacheMap.set(updated.key, updated);
    return [cacheMap, validatePK(updated, pkType) as V];
  } catch (e) {
    logger.error("Error updating item", { error: e });
    throw e;
  }
};
