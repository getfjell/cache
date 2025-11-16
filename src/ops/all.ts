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
  logger.debug('QUERY_CACHE: Generated query hash for all()', {
    queryHash,
    query: JSON.stringify(query),
    locations: JSON.stringify(locations),
    pkType
  });

  // Check if we have cached query results
  logger.debug('QUERY_CACHE: Checking query cache for hash', { queryHash });
  const cachedItemKeys = await cacheMap.getQueryResult(queryHash);
  if (cachedItemKeys) {
    logger.debug('QUERY_CACHE: Cache HIT - Found cached query result', {
      queryHash,
      cachedKeyCount: cachedItemKeys.length,
      itemKeys: cachedItemKeys.map(k => JSON.stringify(k))
    });

    // Retrieve all cached items - if any are missing, invalidate the query cache
    const cachedItems: V[] = [];
    let allItemsAvailable = true;
    const missingKeys: any[] = [];

    for (const itemKey of cachedItemKeys) {
      const item = await cacheMap.get(itemKey);
      if (item) {
        cachedItems.push(item);
        logger.debug('QUERY_CACHE: Retrieved cached item', {
          itemKey: JSON.stringify(itemKey),
          itemKeyStr: JSON.stringify(item.key)
        });
      } else {
        allItemsAvailable = false;
        missingKeys.push(itemKey);
        logger.debug('QUERY_CACHE: Cached item MISSING from item cache', {
          itemKey: JSON.stringify(itemKey),
          queryHash
        });
        break;
      }
    }

    if (allItemsAvailable) {
      logger.debug('QUERY_CACHE: All cached items available, returning from cache', {
        queryHash,
        itemCount: cachedItems.length
      });
      return cachedItems;
    } else {
      logger.debug('QUERY_CACHE: Some cached items missing, invalidating query cache', {
        queryHash,
        missingKeys: missingKeys.map(k => JSON.stringify(k)),
        foundCount: cachedItems.length,
        expectedCount: cachedItemKeys.length
      });
      cacheMap.deleteQueryResult(queryHash);
    }
  } else {
    logger.debug('QUERY_CACHE: Cache MISS - No cached query result found', { queryHash });
  }

  // If no cached query results, try to find items directly in cache using queryIn
  // This handles cases where individual items are cached but query results are not yet cached
  logger.debug('QUERY_CACHE: Attempting direct cache query using queryIn()', {
    queryHash,
    query: JSON.stringify(query),
    locations: JSON.stringify(locations)
  });
  try {
    const directCachedItems = await cacheMap.queryIn(query, locations);
    if (directCachedItems && directCachedItems.length > 0) {
      logger.debug('QUERY_CACHE: Direct cache query SUCCESS - Found items in item cache', {
        queryHash,
        itemCount: directCachedItems.length,
        itemKeys: directCachedItems.map(item => JSON.stringify(item.key))
      });

      // Cache the query result for future use
      const itemKeys = directCachedItems.map(item => item.key);
      await cacheMap.setQueryResult(queryHash, itemKeys);
      logger.debug('QUERY_CACHE: Stored query result from direct cache hit', {
        queryHash,
        itemKeyCount: itemKeys.length,
        itemKeys: itemKeys.map(k => JSON.stringify(k))
      });

      return directCachedItems;
    } else {
      logger.debug('QUERY_CACHE: Direct cache query returned no items', { queryHash });
    }
  } catch (error) {
    logger.debug('QUERY_CACHE: Error querying cache directly, proceeding to API', {
      queryHash,
      error: error instanceof Error ? error.message : String(error)
    });
  }

  // Fetch from API
  logger.debug('QUERY_CACHE: Fetching from API (cache miss or invalid)', {
    queryHash,
    query: JSON.stringify(query),
    locations: JSON.stringify(locations)
  });
  let ret: V[] = [];
  try {
    ret = await api.all(query, locations);
    logger.debug('QUERY_CACHE: API response received', {
      queryHash,
      itemCount: ret.length,
      itemKeys: ret.map(item => JSON.stringify(item.key))
    });

    // Store individual items in cache
    logger.debug('QUERY_CACHE: Storing items in item cache', {
      queryHash,
      itemCount: ret.length
    });
    for (const v of ret) {
      await cacheMap.set(v.key, v);
      logger.debug('QUERY_CACHE: Stored item in cache', {
        itemKey: JSON.stringify(v.key),
        queryHash
      });

      // Set TTL metadata for the newly cached item
      const keyStr = JSON.stringify(v.key);
      ttlManager.onItemAdded(keyStr, cacheMap);

      // Handle eviction for the newly cached item
      const evictedKeys = await context.evictionManager.onItemAdded(keyStr, v, cacheMap);
      // Remove evicted items from cache
      for (const evictedKey of evictedKeys) {
        const parsedKey = JSON.parse(evictedKey);
        await cacheMap.delete(parsedKey);
        logger.debug('QUERY_CACHE: Evicted item due to cache limits', {
          evictedKey,
          queryHash
        });
      }
    }

    // Store query result (item keys) in query cache
    const itemKeys = ret.map(item => item.key);
    await cacheMap.setQueryResult(queryHash, itemKeys);
    logger.debug('QUERY_CACHE: Stored query result in query cache', {
      queryHash,
      itemKeyCount: itemKeys.length,
      itemKeys: itemKeys.map(k => JSON.stringify(k))
    });

    // Emit query event
    const event = CacheEventFactory.createQueryEvent<V, S, L1, L2, L3, L4, L5>(query, locations, ret);
    context.eventEmitter.emit(event);
    logger.debug('QUERY_CACHE: Emitted query event', { queryHash });

  } catch (e: unknown) {
    if (e instanceof NotFoundError) {
      // Handle not found gracefully - cache empty result
      logger.debug('QUERY_CACHE: API returned NotFoundError, caching empty result', { queryHash });
      await cacheMap.setQueryResult(queryHash, []);
      logger.debug('QUERY_CACHE: Cached empty query result for not found', { queryHash });
    } else {
      logger.debug('QUERY_CACHE: API error occurred', {
        queryHash,
        error: e instanceof Error ? e.message : String(e)
      });
      throw e;
    }
  }
  logger.debug('QUERY_CACHE: all() operation completed', {
    queryHash,
    resultCount: ret.length
  });
  return ret;
};
