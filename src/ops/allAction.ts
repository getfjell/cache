import {
  ComKey,
  Item,
  LocKeyArray,
  PriKey,
  validatePK
} from "@fjell/core";
import { NotFoundError } from "@fjell/http-api";
import { CacheContext } from "../CacheContext";
import { CacheEventFactory } from "../events/CacheEventFactory";
import { handleActionCacheInvalidation } from "../utils/cacheInvalidation";
import LibLogger from "../logger";

const logger = LibLogger.get('allAction');

export const allAction = async <
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
>(
  action: string,
  body: any = {},
  locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = [],
  context: CacheContext<V, S, L1, L2, L3, L4, L5>
): Promise<[CacheContext<V, S, L1, L2, L3, L4, L5>, V[]]> => {
  const { api, cacheMap, pkType, eventEmitter, registry } = context;
  logger.default('allAction', { action, body, locations });

  // Get existing items in the specified locations before executing the action
  // This helps us track which items were modified
  const existingItems: V[] = [];
  if (locations && locations.length > 0) {
    try {
      // Try to get existing items from cache to compare with results
      const cachedItems = await cacheMap.allIn(locations);
      if (cachedItems) {
        existingItems.push(...cachedItems);
      }
    } catch (error) {
      logger.debug('Could not retrieve existing items for comparison', { error });
    }
  }

  // Invalidate all items in the specified locations before executing the action
  logger.debug('Invalidating location before allAction', { locations });
  await cacheMap.invalidateLocation(locations);

  let ret: V[] = [];
  let affectedItems: Array<PriKey<any> | ComKey<any, any, any, any, any, any> | LocKeyArray<any, any, any, any, any>> = [];
  try {
    const result = await api.allAction(action, body, locations);

    // Handle the return type: [V[], Array<PriKey<any> | ComKey<any, any, any, any, any, any> | LocKeyArray<any, any, any, any, any>>]
    if (Array.isArray(result) && result.length === 2) {
      ret = result[0];
      affectedItems = result[1];
    } else {
      // This should never happen with the current API contract, but handle gracefully
      logger.warning('Unexpected result format from allAction', {
        resultType: typeof result,
        isArray: Array.isArray(result),
        resultLength: Array.isArray(result) ? result.length : 'not array'
      });
      ret = [];
      affectedItems = [];
    }

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

    // Cache all results after the action
    logger.debug('Caching allAction results', { resultCount: ret.length });

    // Track which items were modified vs newly created
    const modifiedItems: V[] = [];
    const newItems: V[] = [];

    for (const v of ret) {
      // Check if this item existed before the action
      const existedBefore = existingItems.some(existing =>
        JSON.stringify(existing.key) === JSON.stringify(v.key)
      );

      if (existedBefore) {
        modifiedItems.push(v);
      } else {
        newItems.push(v);
      }

      await cacheMap.set(v.key, v);

      // Set TTL metadata for the newly cached item
      const keyStr = JSON.stringify(v.key);
      context.ttlManager.onItemAdded(keyStr, cacheMap);

      // Handle eviction for the newly cached item
      const evictedKeys = await context.evictionManager.onItemAdded(keyStr, v, cacheMap);
      // Remove evicted items from cache
      for (const evictedKey of evictedKeys) {
        const parsedKey = JSON.parse(evictedKey);
        await cacheMap.delete(parsedKey);
      }
    }

    // Emit individual item events for each modified/created item
    // This ensures individual item caches are properly invalidated
    for (const item of modifiedItems) {
      logger.debug('Emitting item_updated event for modified item', { key: item.key });
      const itemEvent = CacheEventFactory.itemUpdated(
        item.key,
        item,
        null, // We don't have the previous item state
        'operation'
      );
      eventEmitter.emit(itemEvent);
    }

    for (const item of newItems) {
      logger.debug('Emitting item_created event for new item', { key: item.key });
      const itemEvent = CacheEventFactory.itemCreated(
        item.key,
        item,
        'operation'
      );
      eventEmitter.emit(itemEvent);
    }

    // Also invalidate individual item keys for modified items to ensure
    // any cached individual item data is cleared
    if (modifiedItems.length > 0) {
      const modifiedKeys = modifiedItems.map(item => item.key);
      logger.debug('Invalidating individual item keys for modified items', {
        keyCount: modifiedKeys.length,
        keys: modifiedKeys
      });
      await cacheMap.invalidateItemKeys(modifiedKeys);
    }

    // Clear query results since items were modified
    await cacheMap.clearQueryResults();

    // Emit query invalidated event so components can react
    logger.debug('Emitting query_invalidated event after allAction', {
      eventType: 'query_invalidated',
      reason: 'item_changed',
      action,
      modifiedCount: modifiedItems.length,
      newCount: newItems.length
    });

    const queryInvalidatedEvent = CacheEventFactory.createQueryInvalidatedEvent(
      [], // We don't track which specific queries were invalidated
      'item_changed',
      {
        source: 'operation',
        context: {
          operation: 'allAction',
          requestId: `allAction_${action}_${Date.now()}`
        }
      }
    );
    eventEmitter.emit(queryInvalidatedEvent);

  } catch (e: unknown) {
    // istanbul ignore next
    if (e instanceof NotFoundError) {
      // Handle not found gracefully
    } else {
      throw e;
    }
  }
  return [context, validatePK(ret, pkType) as V[]];
};
