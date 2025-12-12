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

  const keyStr = JSON.stringify(key);

  if (!isValidItemKey(key)) {
    logger.error('CACHE_OP: Invalid key for remove operation', {
      operation: 'remove',
      key: keyStr,
      keyType: typeof key,
      reason: 'Key validation failed - must be a valid PriKey or ComKey',
      suggestion: 'Ensure the key has the correct structure: PriKey { kt, pk } or ComKey { kt, sk, lk }'
    });
    throw new Error(`Invalid key for remove operation: ${keyStr}. Expected valid PriKey or ComKey structure.`);
  }

  const startTime = Date.now();

  try {
    logger.debug('CACHE_OP: remove() started', {
      operation: 'remove',
      key: keyStr,
      cacheType: cacheMap.implementationType
    });

    // Get item before removal for event
    const previousItem = await cacheMap.get(key);

    // First remove from API, then from cache to maintain consistency
    await api.remove(key);
    const apiDuration = Date.now() - startTime;
    
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

    const totalDuration = Date.now() - startTime;
    logger.debug('CACHE_OP: remove() completed successfully', {
      operation: 'remove',
      key: keyStr,
      hadCachedItem: !!previousItem,
      apiDuration,
      totalDuration
    });
  } catch (e: any) {
    const duration = Date.now() - startTime;
    logger.error('CACHE_OP: remove() operation failed', {
      operation: 'remove',
      key: keyStr,
      duration,
      errorType: e.constructor?.name || typeof e,
      errorMessage: e.message,
      errorCode: e.code || e.errorInfo?.code,
      cacheType: cacheMap.implementationType,
      suggestion: 'Check item exists, delete permissions, referential integrity constraints, and API connectivity',
      stack: e.stack
    });
    throw e;
  }
}
