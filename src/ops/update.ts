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
  logger.debug('Invalidating item key before update', { key });
  cacheMap.invalidateItemKeys([key]);

  // Also clear query results since this item might be included in cached queries
  await cacheMap.clearQueryResults();

  try {
    // Get previous item for event
    const previousItem = await cacheMap.get(key);

    const updated = await api.update(key, v);

    // Cache the result after the update
    logger.debug('Caching update result', { updatedKey: updated.key });
    await cacheMap.set(updated.key, updated);

    // Create base metadata if it doesn't exist (needed for TTL and eviction)
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

    // Emit event
    const event = CacheEventFactory.itemUpdated(updated.key, updated as V, previousItem, 'api');
    context.eventEmitter.emit(event);

    return [context, validatePK(updated, pkType) as V];
  } catch (e) {
    logger.error("Error updating item", { error: e });
    throw e;
  }
};
