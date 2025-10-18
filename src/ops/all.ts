import {
  createAllWrapper,
  Item,
  ItemQuery,
  LocKeyArray
} from "@fjell/core";
import { NotFoundError } from "@fjell/http-api";
import { CacheContext } from "../CacheContext";
import { createQueryHash } from "../normalization";
import { CacheEventFactory } from "../events/CacheEventFactory";
import LibLogger from "../logger";

const logger = LibLogger.get('all');

export const all = async <
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
>(
  query: ItemQuery = {},
  locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = [],
  context: CacheContext<V, S, L1, L2, L3, L4, L5>
): Promise<[CacheContext<V, S, L1, L2, L3, L4, L5>, V[]]> => {
  const { api, cacheMap, pkType, ttlManager, coordinate } = context;
  logger.default('all', { query, locations });

  // Use wrapper for validation
  const wrappedAll = createAllWrapper(
    coordinate,
    async (q, locs) => {
      return await executeAllLogic(q ?? {}, locs ?? [], context);
    }
  );

  const result = await wrappedAll(query, locations);
  return [context, result];
};

async function executeAllLogic<
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
>(
  query: ItemQuery,
  locations: LocKeyArray<L1, L2, L3, L4, L5> | [],
  context: CacheContext<V, S, L1, L2, L3, L4, L5>
): Promise<V[]> {
  const { api, cacheMap, pkType, ttlManager } = context;

  // Check if cache bypass is enabled
  if (context.options?.bypassCache) {
    logger.debug('Cache bypass enabled, fetching directly from API', { query, locations });

    try {
      const ret = await api.all(query, locations);
      logger.debug('API response received (not cached due to bypass)', { query, locations, itemCount: ret.length });
      return ret;
    } catch (error) {
      logger.error('API request failed', { query, locations, error });
      throw error;
    }
  }

  // Generate query hash for caching
  const queryHash = createQueryHash(pkType, query, locations);
  logger.debug('Generated query hash for all', { queryHash });

  // Check if we have cached query results
  const cachedItemKeys = await cacheMap.getQueryResult(queryHash);
  if (cachedItemKeys) {
    logger.debug('Using cached query results', { cachedKeyCount: cachedItemKeys.length });

    // Retrieve all cached items - if any are missing, invalidate the query cache
    const cachedItems: V[] = [];
    let allItemsAvailable = true;

    for (const itemKey of cachedItemKeys) {
      const item = await cacheMap.get(itemKey);
      if (item) {
        cachedItems.push(item);
      } else {
        allItemsAvailable = false;
        break;
      }
    }

    if (allItemsAvailable) {
      return cachedItems;
    } else {
      logger.debug('Some cached items missing, invalidating query cache');
      cacheMap.deleteQueryResult(queryHash);
    }
  }

  // If no cached query results, try to find items directly in cache using queryIn
  // This handles cases where individual items are cached but query results are not yet cached
  try {
    const directCachedItems = await cacheMap.queryIn(query, locations);
    if (directCachedItems && directCachedItems.length > 0) {
      logger.debug('Found items directly in cache, skipping API call', { itemCount: directCachedItems.length });

      // Cache the query result for future use
      const itemKeys = directCachedItems.map(item => item.key);
      await cacheMap.setQueryResult(queryHash, itemKeys);
      logger.debug('Cached query result from direct cache hit', { queryHash, itemKeyCount: itemKeys.length });

      return directCachedItems;
    }
  } catch (error) {
    logger.debug('Error querying cache directly, proceeding to API', { error });
  }

  // Fetch from API
  let ret: V[] = [];
  try {
    ret = await api.all(query, locations);

    // Store individual items in cache
    for (const v of ret) {
      await cacheMap.set(v.key, v);

      // Set TTL metadata for the newly cached item
      const keyStr = JSON.stringify(v.key);
      ttlManager.onItemAdded(keyStr, cacheMap);

      // Handle eviction for the newly cached item
      const evictedKeys = await context.evictionManager.onItemAdded(keyStr, v, cacheMap);
      // Remove evicted items from cache
      for (const evictedKey of evictedKeys) {
        const parsedKey = JSON.parse(evictedKey);
        await cacheMap.delete(parsedKey);
      }
    }

    // Store query result (item keys) in query cache
    const itemKeys = ret.map(item => item.key);
    cacheMap.setQueryResult(queryHash, itemKeys);
    logger.debug('Cached query result', { queryHash, itemKeyCount: itemKeys.length });

    // Emit query event
    const event = CacheEventFactory.createQueryEvent<V, S, L1, L2, L3, L4, L5>(query, locations, ret);
    context.eventEmitter.emit(event);

  } catch (e: unknown) {
    if (e instanceof NotFoundError) {
      // Handle not found gracefully - cache empty result
      cacheMap.setQueryResult(queryHash, []);
      logger.debug('Cached empty query result for not found', { queryHash });
    } else {
      throw e;
    }
  }
  return ret;
};
