import {
  Item,
  LocKeyArray,
  validatePK
} from "@fjell/core";
import { CacheContext } from "../CacheContext";
import { CacheEventFactory } from "../events/CacheEventFactory";
import { createFinderHash } from "../normalization";
import LibLogger from "../logger";

const logger = LibLogger.get('findOne');

export const findOne = async <
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
>(
  finder: string,
  finderParams: Record<string, string | number | boolean | Date | Array<string | number | boolean | Date>> = {},
  locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = [],
  context: CacheContext<V, S, L1, L2, L3, L4, L5>
): Promise<[CacheContext<V, S, L1, L2, L3, L4, L5>, V]> => {
  const { api, cacheMap, pkType, ttlManager, eventEmitter } = context;
  logger.default('findOne', { finder, finderParams, locations });

  // Generate query hash for caching
  const queryHash = createFinderHash(finder, finderParams, locations);
  logger.debug('Generated query hash for findOne', { queryHash });

  // Check if we have cached query results
  const cachedItemKeys = await cacheMap.getQueryResult(queryHash);
  if (cachedItemKeys && cachedItemKeys.length > 0) {
    logger.debug('Using cached query results', { cachedKeyCount: cachedItemKeys.length });

    // Retrieve the first cached item - if missing, invalidate the query cache
    const item = await cacheMap.get(cachedItemKeys[0]);
    if (item) {
      return [context, validatePK(item, pkType) as V];
    } else {
      logger.debug('Cached item missing, invalidating query cache');
      cacheMap.deleteQueryResult(queryHash);
    }
  }

  // If no cached query results, try to find items directly in cache using queryIn
  // This handles cases where individual items are cached but query results are not yet cached
  // Only do this if we don't have any cached query results at all
  if (!cachedItemKeys || cachedItemKeys.length === 0) {
    try {
      const directCachedItems = await cacheMap.queryIn(finderParams, locations);
      if (directCachedItems && directCachedItems.length > 0) {
        logger.debug('Found items directly in cache, skipping API call', { itemCount: directCachedItems.length });

        // Cache the query result for future use
        const firstItem = directCachedItems[0];
        await cacheMap.setQueryResult(queryHash, [firstItem.key]);
        logger.debug('Cached query result from direct cache hit', { queryHash, itemKey: firstItem.key });

        // Emit query event for cached results
        const event = CacheEventFactory.createQueryEvent<V, S, L1, L2, L3, L4, L5>(finderParams, locations, [firstItem]);
        eventEmitter.emit(event);

        return [context, validatePK(firstItem, pkType) as V];
      }
    } catch (error) {
      logger.debug('Error querying cache directly, proceeding to API', { error });
    }
  }

  // Fetch from API
  const ret = await api.findOne(finder, finderParams, locations);

  // Store individual item in cache
  cacheMap.set(ret.key, ret);

  // Set TTL metadata for the newly cached item
  const keyStr = JSON.stringify(ret.key);
  ttlManager.onItemAdded(keyStr, cacheMap);

  // Handle eviction for the newly cached item
  const evictedKeys = await context.evictionManager.onItemAdded(keyStr, ret, cacheMap);
  // Remove evicted items from cache
  for (const evictedKey of evictedKeys) {
    const parsedKey = JSON.parse(evictedKey);
    await cacheMap.delete(parsedKey);
  }

  // Store query result (single item key) in query cache
  cacheMap.setQueryResult(queryHash, [ret.key]);
  logger.debug('Cached query result', { queryHash, itemKey: ret.key });

  // Emit query event
  const event = CacheEventFactory.createQueryEvent<V, S, L1, L2, L3, L4, L5>(finderParams, locations, [ret]);
  eventEmitter.emit(event);

  return [context, validatePK(ret, pkType) as V];
};
