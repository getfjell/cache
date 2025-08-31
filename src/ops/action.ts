import {
  ComKey,
  isValidItemKey,
  Item,
  LocKeyArray,
  PriKey,
  validatePK
} from "@fjell/core";
import { CacheContext } from "../CacheContext";
import { CacheEventFactory } from "../events/CacheEventFactory";
import { handleActionCacheInvalidation } from "../utils/cacheInvalidation";
import LibLogger from "../logger";

const logger = LibLogger.get('action');

export const action = async <
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
>(
  key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
  action: string,
  body: any = {},
  context: CacheContext<V, S, L1, L2, L3, L4, L5>
): Promise<[CacheContext<V, S, L1, L2, L3, L4, L5>, V, Array<PriKey<any> | ComKey<any, any, any, any, any, any> | LocKeyArray<any, any, any, any, any>>]> => {
  const { api, cacheMap, pkType, registry } = context;
  logger.default('action', { key, action, body });

  if (!isValidItemKey(key)) {
    logger.error('Key for Action is not a valid ItemKey: %j', key);
    throw new Error('Key for Action is not a valid ItemKey');
  }

  // Invalidate the item key before executing the action
  logger.debug('Invalidating item key before action', { key });
  cacheMap.invalidateItemKeys([key]);

  const result = await api.action(key, action, body);
  const updated = result[0];
  const affectedItems = result[1];

  // Handle cache invalidation based on affected items
  if (affectedItems && affectedItems.length > 0) {
    logger.debug('Handling cache invalidation for affected items', {
      affectedItemsCount: affectedItems.length
    });

    try {
      await handleActionCacheInvalidation(registry, affectedItems);
    } catch (error) {
      logger.warning('Failed to handle cache invalidation for affected items', {
        error: error instanceof Error ? error.message : String(error),
        affectedItems
      });
      // Continue with the operation even if cache invalidation fails
    }
  }

  // Cache the result after the action
  logger.debug('Caching action result', { updatedKey: updated.key });
  cacheMap.set(updated.key, updated);

  // Set TTL metadata for the newly cached item
  const keyStr = JSON.stringify(updated.key);
  context.ttlManager.onItemAdded(keyStr, cacheMap);

  // Handle eviction for the newly cached item
  const evictedKeys = await context.evictionManager.onItemAdded(keyStr, updated, cacheMap);
  // Remove evicted items from cache
  for (const evictedKey of evictedKeys) {
    try {
      const parsedKey = JSON.parse(evictedKey);
      await cacheMap.delete(parsedKey);
    } catch (error) {
      logger.error('Failed to parse evicted key during deletion', {
        evictedKey,
        error: error instanceof Error ? error.message : String(error)
      });
      // Continue processing other keys rather than failing completely
    }
  }

  // Emit item updated event
  logger.debug('Emitting itemUpdated event after action', {
    key: updated.key,
    action
  });
  const itemEvent = CacheEventFactory.itemUpdated<V, S, L1, L2, L3, L4, L5>(updated.key, updated as V, null, 'api');
  context.eventEmitter.emit(itemEvent);

  // Emit query invalidated event so components can react
  logger.debug('Emitting queryInvalidatedEvent after action', {
    eventType: 'query_invalidated',
    reason: 'item_changed',
    action
  });
  const queryInvalidatedEvent = CacheEventFactory.createQueryInvalidatedEvent(
    [], // We don't track which specific queries were invalidated
    'item_changed',
    { source: 'operation', context: { operation: 'action' } }
  );
  context.eventEmitter.emit(queryInvalidatedEvent);

  return [context, validatePK(updated, pkType) as V, affectedItems];
};
