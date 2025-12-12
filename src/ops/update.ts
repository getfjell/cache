import {
  ComKey,
  createUpdateWrapper,
  isValidItemKey,
  Item,
  PriKey
} from "@fjell/core";
import { CacheContext } from "../CacheContext";
import { CacheEventFactory } from "../events/CacheEventFactory";
import { estimateValueSize } from "../utils/CacheSize";
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
  const { coordinate } = context;
  logger.default('update', { key, v });

  const wrappedUpdate = createUpdateWrapper(
    coordinate,
    async (k, item) => {
      return await executeUpdateLogic(k, item, context);
    }
  );

  const result = await wrappedUpdate(key, v);
  return [context, result];
};

async function executeUpdateLogic<
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
): Promise<V> {
  const { api, cacheMap, pkType } = context;

  if (!isValidItemKey(key)) {
    logger.error('CACHE_OP: Invalid key for update operation', {
      operation: 'update',
      key: JSON.stringify(key),
      keyType: typeof key,
      itemType: pkType,
      reason: 'Key validation failed - must be a valid PriKey or ComKey',
      suggestion: 'Ensure the key has the correct structure: PriKey { kt, pk } or ComKey { kt, sk, lk }'
    });
    throw new Error(`Invalid key for update operation: ${JSON.stringify(key)}. Expected valid PriKey or ComKey structure.`);
  }

  // Invalidate the item key before executing the update
  logger.debug('Invalidating item key before update', { key });
  cacheMap.invalidateItemKeys([key]);

  // Also clear query results since this item might be included in cached queries
  await cacheMap.clearQueryResults();

  const startTime = Date.now();
  const keyStr = JSON.stringify(key);

  try {
    logger.debug('CACHE_OP: update() started', {
      operation: 'update',
      key: keyStr,
      itemType: pkType,
      updateData: JSON.stringify(v)
    });

    // Get previous item for event
    const previousItem = await cacheMap.get(key);

    const updated = await api.update(key, v);
    const apiDuration = Date.now() - startTime;

    // Cache the result after the update
    logger.debug('CACHE_OP: Caching update result', {
      operation: 'update',
      updatedKey: JSON.stringify(updated.key)
    });
    await cacheMap.set(updated.key, updated);

    // Verify what was cached
    const cachedItem = await cacheMap.get(updated.key);

    // Create base metadata if it doesn't exist (needed for TTL and eviction)
    const updatedKeyStr = JSON.stringify(updated.key);
    const metadata = await cacheMap.getMetadata(updatedKeyStr);
    if (!metadata) {
      const now = Date.now();
      const baseMetadata = {
        key: updatedKeyStr,
        addedAt: now,
        lastAccessedAt: now,
        accessCount: 1,
        estimatedSize: estimateValueSize(updated)
      };
      await cacheMap.setMetadata(updatedKeyStr, baseMetadata);
    }

    // Set TTL metadata for the newly cached item
    await context.ttlManager.onItemAdded(updatedKeyStr, cacheMap);

    // Handle eviction for the newly cached item
    const evictedKeys = await context.evictionManager.onItemAdded(updatedKeyStr, updated, cacheMap);
    // Remove evicted items from cache
    for (const evictedKey of evictedKeys) {
      const parsedKey = JSON.parse(evictedKey);
      await cacheMap.delete(parsedKey);
    }

    // Emit events
    const itemEvent = CacheEventFactory.itemUpdated(updated.key, updated as V, previousItem, 'api');
    context.eventEmitter.emit(itemEvent);

    // Emit query invalidated event so components can react
    const queryInvalidatedEvent = CacheEventFactory.createQueryInvalidatedEvent(
      [], // We don't track which specific queries were invalidated
      'item_changed',
      { source: 'operation', context: { operation: 'update' } }
    );
    context.eventEmitter.emit(queryInvalidatedEvent);

    const totalDuration = Date.now() - startTime;
    logger.debug('CACHE_OP: update() completed successfully', {
      operation: 'update',
      key: updatedKeyStr,
      itemType: pkType,
      evictedCount: evictedKeys.length,
      apiDuration,
      totalDuration
    });

    return updated;
  } catch (e: any) {
    const duration = Date.now() - startTime;
    logger.error('CACHE_OP: update() operation failed', {
      operation: 'update',
      key: keyStr,
      itemType: pkType,
      updateData: JSON.stringify(v),
      duration,
      errorType: e.constructor?.name || typeof e,
      errorMessage: e.message,
      errorCode: e.code || e.errorInfo?.code,
      cacheType: cacheMap.implementationType,
      suggestion: 'Check item exists, validation rules, update permissions, and API connectivity',
      stack: e.stack
    });
    throw e;
  }
}
