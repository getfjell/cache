import {
  createOneWrapper,
  Item,
  ItemQuery,
  LocKeyArray
} from "@fjell/core";
import { NotFoundError } from "@fjell/http-api";
import { CacheContext } from "../CacheContext";
import { createQueryHash } from "../normalization";
import { estimateValueSize } from "../utils/CacheSize";
import LibLogger from "../logger";

const logger = LibLogger.get('one');

export const one = async <
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
): Promise<[CacheContext<V, S, L1, L2, L3, L4, L5>, V | null]> => {
  const { api, cacheMap, pkType, ttlManager, coordinate } = context;
  logger.default('one', { query, locations });

  // Use wrapper for validation
  const wrappedOne = createOneWrapper(
    coordinate,
    async (q, locs) => {
      return await executeOneLogic(q ?? {}, locs ?? [], context);
    }
  );

  const result = await wrappedOne(query, locations);
  return [context, result];
};

async function executeOneLogic<
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
): Promise<V | null> {
  const { api, cacheMap, pkType, ttlManager } = context;

  // Check if cache bypass is enabled
  if (context.options?.bypassCache) {
    logger.debug('Cache bypass enabled, fetching directly from API', { query, locations });

    try {
      const retItem = await api.one(query, locations);
      if (retItem) {
        logger.debug('API response received (not cached due to bypass)', { query, locations });
        return retItem;
      } else {
        logger.debug('API returned null', { query, locations });
        return null;
      }
    } catch (error) {
      logger.error('API request failed', { query, locations, error });
      throw error;
    }
  }

  // Generate query hash for caching
  const queryHash = createQueryHash(pkType, query, locations);
  logger.debug('QUERY_CACHE: Generated query hash for one()', {
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

    if (cachedItemKeys.length === 0) {
      // Cached empty result (not found)
      logger.debug('QUERY_CACHE: Cached empty result (not found)', { queryHash });
      return null;
    }

    // Retrieve the first cached item - if missing, invalidate the query cache
    const itemKey = cachedItemKeys[0];
    logger.debug('QUERY_CACHE: Retrieving first cached item', {
      queryHash,
      itemKey: JSON.stringify(itemKey)
    });
    const item = await cacheMap.get(itemKey);
    if (item) {
      logger.debug('QUERY_CACHE: Retrieved cached item successfully', {
        queryHash,
        itemKey: JSON.stringify(itemKey),
        itemKeyStr: JSON.stringify(item.key)
      });
      return item;
    } else {
      logger.debug('QUERY_CACHE: Cached item MISSING from item cache, invalidating query cache', {
        queryHash,
        itemKey: JSON.stringify(itemKey)
      });
      cacheMap.deleteQueryResult(queryHash);
    }
  } else {
    logger.debug('QUERY_CACHE: Cache MISS - No cached query result found', { queryHash });
  }

  // If no cached query results, try to find item directly in cache using queryIn
  // This handles cases where individual items are cached but query results are not yet cached
  logger.debug('QUERY_CACHE: Attempting direct cache query using queryIn()', {
    queryHash,
    query: JSON.stringify(query),
    locations: JSON.stringify(locations)
  });
  try {
    const directCachedItems = await cacheMap.queryIn(query, locations);
    if (directCachedItems && directCachedItems.length > 0) {
      logger.debug('QUERY_CACHE: Direct cache query SUCCESS - Found item in item cache', {
        queryHash,
        itemCount: directCachedItems.length,
        itemKeys: directCachedItems.map(item => JSON.stringify(item.key))
      });
      const foundItem = directCachedItems[0]; // Take first match for 'one' operation

      // Cache the query result for future use
      await cacheMap.setQueryResult(queryHash, [foundItem.key]);
      logger.debug('QUERY_CACHE: Stored query result from direct cache hit', {
        queryHash,
        itemKey: JSON.stringify(foundItem.key)
      });

      return foundItem;
    } else {
      logger.debug('QUERY_CACHE: Direct cache query returned no items', { queryHash });
    }
  } catch (error) {
    logger.debug('QUERY_CACHE: Error querying cache directly, proceeding to API', {
      queryHash,
      error: error instanceof Error ? error.message : String(error)
    });
  }

  logger.debug('QUERY_CACHE: Fetching from API (cache miss or invalid)', {
    queryHash,
    query: JSON.stringify(query),
    locations: JSON.stringify(locations)
  });
  let retItem: V | null = null;
  try {
    retItem = await api.one(query, locations);
    if (retItem) {
      logger.debug('QUERY_CACHE: API response received', {
        queryHash,
        itemKey: JSON.stringify(retItem.key)
      });
      
      // Store individual item in cache
      logger.debug('QUERY_CACHE: Storing item in item cache', {
        queryHash,
        itemKey: JSON.stringify(retItem.key)
      });
      await cacheMap.set(retItem.key, retItem);

      // Create base metadata if it doesn't exist (needed for TTL and eviction)
      const keyStr = JSON.stringify(retItem.key);
      const metadata = await cacheMap.getMetadata(keyStr);
      if (!metadata) {
        const now = Date.now();
        const baseMetadata = {
          key: keyStr,
          addedAt: now,
          lastAccessedAt: now,
          accessCount: 1,
          estimatedSize: estimateValueSize(retItem)
        };
        await cacheMap.setMetadata(keyStr, baseMetadata);
      }

      // Set TTL metadata for the newly cached item
      await ttlManager.onItemAdded(keyStr, cacheMap);

      // Handle eviction for the newly cached item
      const evictedKeys = await context.evictionManager.onItemAdded(keyStr, retItem, cacheMap);
      // Remove evicted items from cache
      for (const evictedKey of evictedKeys) {
        const parsedKey = JSON.parse(evictedKey);
        await cacheMap.delete(parsedKey);
        logger.debug('QUERY_CACHE: Evicted item due to cache limits', {
          evictedKey,
          queryHash
        });
      }

      // Store query result (single item key) in query cache
      await cacheMap.setQueryResult(queryHash, [retItem.key]);
      logger.debug('QUERY_CACHE: Stored query result in query cache', {
        queryHash,
        itemKey: JSON.stringify(retItem.key)
      });
    } else {
      logger.debug('QUERY_CACHE: API returned null, caching empty result', { queryHash });
      // Store empty result in query cache
      await cacheMap.setQueryResult(queryHash, []);
      logger.debug('QUERY_CACHE: Cached empty query result', { queryHash });
    }
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
  
  logger.debug('QUERY_CACHE: one() operation completed', {
    queryHash,
    result: retItem ? JSON.stringify(retItem.key) : null
  });
  return retItem || null;
}
