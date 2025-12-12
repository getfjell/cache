import {
  createCreateWrapper,
  Item,
  LocKeyArray
} from "@fjell/core";
import { CacheContext } from "../CacheContext";
import { CacheEventFactory } from "../events/CacheEventFactory";
import LibLogger from "../logger";

const logger = LibLogger.get('create');

export const create = async <
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
>(
  v: Partial<Item<S, L1, L2, L3, L4, L5>>,
  locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = [],
  context: CacheContext<V, S, L1, L2, L3, L4, L5>
): Promise<[CacheContext<V, S, L1, L2, L3, L4, L5>, V]> => {
  const { coordinate } = context;
  logger.default('create', { v, locations });

  const wrappedCreate = createCreateWrapper(
    coordinate,
    async (item, createOptions) => {
      const locs = createOptions?.locations ?? [];
      return await executeCreateLogic(item, locs, context);
    }
  );

  const result = await wrappedCreate(v, locations.length > 0 ? { locations: locations as LocKeyArray<L1, L2, L3, L4, L5> } : undefined);
  return [context, result];
};

async function executeCreateLogic<
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
>(
  v: Partial<Item<S, L1, L2, L3, L4, L5>>,
  locations: LocKeyArray<L1, L2, L3, L4, L5> | [],
  context: CacheContext<V, S, L1, L2, L3, L4, L5>
): Promise<V> {
  const startTime = Date.now();
  const { api, cacheMap, pkType, eventEmitter, ttlManager, evictionManager } = context;

  try {
    logger.debug('CACHE_OP: create() started', {
      operation: 'create',
      itemType: pkType,
      hasLocations: locations.length > 0,
      locationCount: locations.length,
      itemData: JSON.stringify(v)
    });

    const created = await api.create(v, locations.length > 0 ? { locations: locations as LocKeyArray<L1, L2, L3, L4, L5> } : undefined);
    const apiDuration = Date.now() - startTime;
    
    cacheMap.set(created.key, created);

    // Set TTL metadata for the newly cached item
    const keyStr = JSON.stringify(created.key);
    ttlManager.onItemAdded(keyStr, cacheMap);

    // Handle eviction for the newly cached item
    const evictedKeys = await evictionManager.onItemAdded(keyStr, created, cacheMap);
    // Remove evicted items from cache
    for (const evictedKey of evictedKeys) {
      const parsedKey = JSON.parse(evictedKey);
      await cacheMap.delete(parsedKey);
    }

    // Clear query results since this new item might match existing queries
    await cacheMap.clearQueryResults();

    // Emit events
    const itemEvent = CacheEventFactory.itemCreated(created.key, created as V, 'api');
    eventEmitter.emit(itemEvent);

    const queryInvalidatedEvent = CacheEventFactory.createQueryInvalidatedEvent(
      [], // We don't track which specific queries were invalidated
      'item_changed',
      { source: 'operation', context: { operation: 'create' } }
    );
    eventEmitter.emit(queryInvalidatedEvent);

    const totalDuration = Date.now() - startTime;
    logger.debug('CACHE_OP: create() completed successfully', {
      operation: 'create',
      itemType: pkType,
      key: keyStr,
      evictedCount: evictedKeys.length,
      apiDuration,
      totalDuration
    });

    return created;
  } catch (e: any) {
    const duration = Date.now() - startTime;
    logger.error('CACHE_OP: create() operation failed', {
      operation: 'create',
      itemType: pkType,
      itemData: JSON.stringify(v),
      locations: JSON.stringify(locations),
      duration,
      errorType: e.constructor?.name || typeof e,
      errorMessage: e.message,
      errorCode: e.code || e.errorInfo?.code,
      cacheType: cacheMap.implementationType,
      suggestion: 'Check validation errors, duplicate constraints, required fields, and API connectivity',
      stack: e.stack
    });
    throw e;
  }
}
