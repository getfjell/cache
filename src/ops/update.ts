import {
  ComKey,
  isValidItemKey,
  Item,
  PriKey,
  validatePK
} from "@fjell/core";
import { CacheContext } from "../CacheContext";
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
  key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
  v: Partial<Item<S, L1, L2, L3, L4, L5>>,
  context: CacheContext<V, S, L1, L2, L3, L4, L5>
): Promise<[CacheContext<V, S, L1, L2, L3, L4, L5>, V]> => {
  const { api, cacheMap, pkType } = context;
  logger.default('update', { key, v });

  if (!isValidItemKey(key)) {
    logger.error('Key for Update is not a valid ItemKey: %j', key);
    throw new Error('Key for Update is not a valid ItemKey');
  }

  // Invalidate the item key before executing the update
  logger.debug('Invalidating item key before update', { key });
  cacheMap.invalidateItemKeys([key]);

  try {
    const updated = await api.update(key, v);

    // Cache the result after the update
    logger.debug('Caching update result', { updatedKey: updated.key });
    cacheMap.set(updated.key, updated);

    return [context, validatePK(updated, pkType) as V];
  } catch (e) {
    logger.error("Error updating item", { error: e });
    throw e;
  }
};
