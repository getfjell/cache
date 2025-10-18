import {
  ComKey,
  createRemoveWrapper,
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
  const { coordinate } = context;
  logger.default('remove', { key });

  const wrappedRemove = createRemoveWrapper(
    coordinate,
    async (k) => {
      await executeRemoveLogic(k, context);
    }
  );

  await wrappedRemove(key);
  return context;
};

async function executeRemoveLogic<
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
): Promise<void> {
  const { api, cacheMap } = context;

  if (!isValidItemKey(key)) {
    logger.error('Key for Remove is not a valid ItemKey: %j', key);
    throw new Error('Key for Remove is not a valid ItemKey');
  }

  try {
    // Get item before removal for event
    const previousItem = await cacheMap.get(key);

    // First remove from API, then from cache to maintain consistency
    await api.remove(key);
    cacheMap.delete(key);

    // Clear query results since this item might have been in cached queries
    await cacheMap.clearQueryResults();

    // Emit events
    if (previousItem) {
      const itemEvent = CacheEventFactory.itemRemoved(key, previousItem, 'api');
      context.eventEmitter.emit(itemEvent);
    }

    const queryInvalidatedEvent = CacheEventFactory.createQueryInvalidatedEvent(
      [],
      'item_changed',
      { source: 'operation', context: { operation: 'remove' } }
    );
    context.eventEmitter.emit(queryInvalidatedEvent);

    logger.debug('Successfully removed item from API and cache', { key });
  } catch (e) {
    logger.error("Error deleting item", { error: e });
    throw e;
  }
}
