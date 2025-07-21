import {
  ComKey,
  isValidItemKey,
  Item,
  PriKey
} from "@fjell/core";
import { ClientApi } from "@fjell/client-api";
import { CacheMap } from "@/CacheMap";
import LibLogger from "@/logger";

const logger = LibLogger.get('remove');

export const remove = async <
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
  key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>
): Promise<CacheMap<V, S, L1, L2, L3, L4, L5>> => {
  logger.default('remove', { key });

  if (!isValidItemKey(key)) {
    logger.error('Key for Remove is not a valid ItemKey: %j', key);
    throw new Error('Key for Remove is not a valid ItemKey');
  }

  try {
    await api.remove(key);
    cacheMap.delete(key);
  } catch (e) {
    logger.error("Error deleting item", { error: e });
    throw e;
  }

  return cacheMap;
};
