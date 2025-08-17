import {
  ComKey,
  isValidItemKey,
  Item,
  PriKey,
  validatePK
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
  const { api, cacheMap, pkType } = context;
  logger.default('update', { key, v });

  if (!isValidItemKey(key)) {
    logger.error('Key for Update is not a valid ItemKey: %j', key);
    throw new Error('Key for Update is not a valid ItemKey');
  }

  // Invalidate the item key before executing the update
  console.log('[ORDERDATES] fjell-cache update: Invalidating item key before update', {
    key,
    keyType: key.kt,
    keyId: key.pk
  });
  logger.debug('Invalidating item key before update', { key });
  cacheMap.invalidateItemKeys([key]);

  // Also clear query results since this item might be included in cached queries
  console.log('[ORDERDATES] fjell-cache update: Clearing query results');
  await cacheMap.clearQueryResults();

  try {
    // Get previous item for event
    console.log('[ORDERDATES] fjell-cache update: Getting previous item for event');
    const previousItem = await cacheMap.get(key);
    console.log('[ORDERDATES] fjell-cache update: Previous item retrieved, calling API update');

    const updated = await api.update(key, v);
    console.log('[ORDERDATES] fjell-cache update: API update completed', {
      updatedKey: updated.key,
      updatedId: updated.key.pk,
      requestedUpdate: v,
      returnedData: {
        targetDate: (updated as any).targetDate,
        id: (updated as any).id
      }
    });

    // Cache the result after the update
    console.log('[ORDERDATES] fjell-cache update: Caching update result', {
      key: updated.key,
      updatedObject: {
        id: (updated as any).id,
        targetDate: (updated as any).targetDate,
        phase: (updated as any).phase,
        keyPk: updated.key.pk,
        keyKt: updated.key.kt
      }
    });
    logger.debug('Caching update result', { updatedKey: updated.key });
    await cacheMap.set(updated.key, updated);
    console.log('[ORDERDATES] fjell-cache update: Update result cached successfully');

    // Verify what was cached
    const cachedItem = await cacheMap.get(updated.key);
    console.log('[ORDERDATES] fjell-cache update: Verification - cached item retrieved', {
      cachedId: (cachedItem as any)?.id,
      cachedTargetDate: (cachedItem as any)?.targetDate,
      isSameAsUpdated: cachedItem === updated
    });

    // Create base metadata if it doesn't exist (needed for TTL and eviction)
    console.log('[ORDERDATES] fjell-cache update: Setting up metadata and eviction');
    const keyStr = JSON.stringify(updated.key);
    const metadata = await cacheMap.getMetadata(keyStr);
    if (!metadata) {
      const now = Date.now();
      const baseMetadata = {
        key: keyStr,
        addedAt: now,
        lastAccessedAt: now,
        accessCount: 1,
        estimatedSize: estimateValueSize(updated)
      };
      await cacheMap.setMetadata(keyStr, baseMetadata);
    }

    // Set TTL metadata for the newly cached item
    await context.ttlManager.onItemAdded(keyStr, cacheMap);

    // Handle eviction for the newly cached item
    const evictedKeys = await context.evictionManager.onItemAdded(keyStr, updated, cacheMap);
    // Remove evicted items from cache
    for (const evictedKey of evictedKeys) {
      const parsedKey = JSON.parse(evictedKey);
      await cacheMap.delete(parsedKey);
    }
    console.log('[ORDERDATES] fjell-cache update: Metadata and eviction handling completed');

    // Emit events
    console.log('[ORDERDATES] fjell-cache update: Emitting itemUpdated event', {
      key: updated.key,
      keyType: updated.key.kt,
      keyId: updated.key.pk,
      hasEventEmitter: !!context.eventEmitter
    });
    const itemEvent = CacheEventFactory.itemUpdated(updated.key, updated as V, previousItem, 'api');
    context.eventEmitter.emit(itemEvent);

    // Emit query invalidated event so components can react
    console.log('[ORDERDATES] fjell-cache update: Emitting queryInvalidatedEvent', {
      eventType: 'query_invalidated',
      reason: 'item_changed',
      hasEventEmitter: !!context.eventEmitter
    });
    const queryInvalidatedEvent = CacheEventFactory.createQueryInvalidatedEvent(
      [], // We don't track which specific queries were invalidated
      'item_changed',
      { source: 'operation', context: { operation: 'update' } }
    );
    context.eventEmitter.emit(queryInvalidatedEvent);

    return [context, validatePK(updated, pkType) as V];
  } catch (e) {
    logger.error("Error updating item", { error: e });
    throw e;
  }
};
