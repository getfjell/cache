import {
  Item,
  LocKeyArray
} from "@fjell/types";
import {
  createFindOneWrapper,
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
): Promise<[CacheContext<V, S, L1, L2, L3, L4, L5>, V | null]> => {
  const { coordinate } = context;
  logger.default('findOne', { finder, finderParams, locations });

  const wrappedFindOne = createFindOneWrapper(
    coordinate,
    async (f, p, locs) => {
      return await executeFindOneLogic(f, p ?? {}, locs ?? [], context);
    }
  );

  const result = await wrappedFindOne(finder, finderParams, locations);
  return [context, result];
};

async function executeFindOneLogic<
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
>(
  finder: string,
  finderParams: Record<string, string | number | boolean | Date | Array<string | number | boolean | Date>>,
  locations: LocKeyArray<L1, L2, L3, L4, L5> | [],
  context: CacheContext<V, S, L1, L2, L3, L4, L5>
): Promise<V> {
  const { api, cacheMap, pkType, ttlManager, eventEmitter } = context;

  // Check if cache bypass is enabled
  if (context.options?.bypassCache) {
    logger.debug('Cache bypass enabled, fetching directly from API', { finder, finderParams, locations });
    
    try {
      const ret = await api.findOne(finder, finderParams, locations);
      if (ret === null) {
        throw new Error(`findOne returned null for finder: ${finder}`);
      }
      logger.debug('API response received (not cached due to bypass)', { finder, finderParams, locations });
      return ret;
    } catch (error) {
      logger.error('API request failed', { finder, finderParams, locations, error });
      throw error;
    }
  }

  // Generate query hash for caching
  const queryHash = createFinderHash(finder, finderParams, locations);
  logger.debug('QUERY_CACHE: Generated query hash for findOne()', {
    queryHash,
    finder,
    finderParams: JSON.stringify(finderParams),
    locations: JSON.stringify(locations)
  });

  // Check if we have cached query results
  logger.debug('QUERY_CACHE: Checking query cache for hash', { queryHash });
  const cachedItemKeys = await cacheMap.getQueryResult(queryHash);
  if (cachedItemKeys && cachedItemKeys.length > 0) {
    logger.debug('QUERY_CACHE: Cache HIT - Found cached query result', {
      queryHash,
      cachedKeyCount: cachedItemKeys.length,
      itemKeys: cachedItemKeys.map(k => JSON.stringify(k))
    });

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

  // Note: We don't try to use queryIn here because finder parameters don't map to ItemQuery objects
  // The queryIn method is designed for ItemQuery objects, not finder parameters

  // Fetch from API
  logger.debug('QUERY_CACHE: Fetching from API (cache miss or invalid)', {
    queryHash,
    finder,
    finderParams: JSON.stringify(finderParams),
    locations: JSON.stringify(locations)
  });
  const ret = await api.findOne(finder, finderParams, locations);

  if (ret === null) {
    logger.debug('QUERY_CACHE: API returned null, throwing error', { queryHash, finder });
    throw new Error(`findOne returned null for finder: ${finder}`);
  }

  logger.debug('QUERY_CACHE: API response received', {
    queryHash,
    itemKey: JSON.stringify(ret.key)
  });

  // Store individual item in cache
  logger.debug('QUERY_CACHE: Storing item in item cache', {
    queryHash,
    itemKey: JSON.stringify(ret.key)
  });
  await cacheMap.set(ret.key, ret);

  // Set TTL metadata for the newly cached item
  const keyStr = JSON.stringify(ret.key);
  ttlManager.onItemAdded(keyStr, cacheMap);

  // Handle eviction for the newly cached item
  const evictedKeys = await context.evictionManager.onItemAdded(keyStr, ret, cacheMap);
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
  await cacheMap.setQueryResult(queryHash, [ret.key]);
  logger.debug('QUERY_CACHE: Stored query result in query cache', {
    queryHash,
    itemKey: JSON.stringify(ret.key)
  });

  // Emit query event
  const event = CacheEventFactory.createQueryEvent<V, S, L1, L2, L3, L4, L5>(finderParams, locations, [ret]);
  eventEmitter.emit(event);
  logger.debug('QUERY_CACHE: Emitted query event', { queryHash });

  logger.debug('QUERY_CACHE: findOne() operation completed', {
    queryHash,
    itemKey: JSON.stringify(ret.key)
  });
  return ret;
}
