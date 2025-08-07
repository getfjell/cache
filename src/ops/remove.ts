import {
  ComKey,
  isValidItemKey,
  Item,
  PriKey
} from "@fjell/core";
import { CacheContext } from "../CacheContext";
import { CacheEventFactory } from "../events/CacheEventFactory";
import LibLogger from "../logger";

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
  key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
  context: CacheContext<V, S, L1, L2, L3, L4, L5>
): Promise<CacheContext<V, S, L1, L2, L3, L4, L5>> => {
  const { api, cacheMap } = context;
  logger.default('remove', { key });

  if (!isValidItemKey(key)) {
    logger.error('Key for Remove is not a valid ItemKey: %j', key);
    throw new Error('Key for Remove is not a valid ItemKey');
  }

  try {
    // Get item before removal for event
    const previousItem = cacheMap.get(key);

    // First remove from API, then from cache to maintain consistency
    await api.remove(key);
    cacheMap.delete(key);

    // Emit event
    if (previousItem) {
      const event = CacheEventFactory.itemRemoved(key, previousItem, 'api');
      context.eventEmitter.emit(event);
    }

    logger.debug('Successfully removed item from API and cache', { key });
  } catch (e) {
    logger.error("Error deleting item", { error: e });
    // Don't delete from cache if API deletion failed
    throw e;
  }

  return context;
};
