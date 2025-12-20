import {
  FindOperationResult,
  FindOptions,
  Item,
  LocKeyArray
} from "@fjell/types";
import {
  createFindWrapper,
} from "@fjell/core";
import { CacheContext } from "../CacheContext";
import { CacheEventFactory } from "../events/CacheEventFactory";
import { createFinderHash } from "../normalization";
import LibLogger from "../logger";

const logger = LibLogger.get('find');

export const find = async <
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
>(
  finder: string,
  params: Record<string, string | number | boolean | Date | Array<string | number | boolean | Date>> = {},
  locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = [],
  context: CacheContext<V, S, L1, L2, L3, L4, L5>,
  findOptions?: FindOptions
): Promise<[CacheContext<V, S, L1, L2, L3, L4, L5>, FindOperationResult<V>]> => {
  const { coordinate } = context;
  logger.default('find', { finder, params, locations, findOptions });

  const wrappedFind = (createFindWrapper as any)(
    coordinate,
    async (f: string, p: any, locs: any, opts: any) => {
      return await executeFindLogic(f, p ?? {}, locs ?? [], context, opts);
    },
    {
      operationName: 'find',
      skipValidation: false, // Keep validation enabled, but ensure proper error handling
      debug: context.options?.enableDebugLogging
    }
  );

  const result = await (wrappedFind as any)(finder, params, locations, findOptions) as FindOperationResult<V>;
  return [context, result];
};

async function executeFindLogic<
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
>(
  finder: string,
  params: Record<string, string | number | boolean | Date | Array<string | number | boolean | Date>>,
  locations: LocKeyArray<L1, L2, L3, L4, L5> | [],
  context: CacheContext<V, S, L1, L2, L3, L4, L5>,
  findOptions?: FindOptions
): Promise<FindOperationResult<V>> {
  const { api, cacheMap, pkType, ttlManager, eventEmitter } = context;

  // Helper to create FindOperationResult from cached items
  const createCachedResult = (items: V[]): FindOperationResult<V> => ({
    items,
    metadata: {
      total: items.length,
      returned: items.length,
      limit: findOptions?.limit,
      offset: findOptions?.offset ?? 0,
      hasMore: false  // When serving from cache, we assume we have all matching items
    }
  });

  // Check if cache bypass is enabled
  if (context.options?.bypassCache) {
    logger.debug('Cache bypass enabled, fetching directly from API', { finder, params, locations, findOptions });

    try {
      const ret = await (api.find as any)(finder, params, locations, findOptions) as FindOperationResult<V>;
      logger.debug('API response received (not cached due to bypass)', { finder, params, locations, itemCount: ret.items.length, total: ret.metadata.total });
      return ret;
    } catch (error) {
      logger.error('API request failed', { finder, params, locations, findOptions, error });
      throw error;
    }
  }

  // Generate query hash for caching (include pagination options in hash for proper cache key)
  // Note: For now, we don't include pagination in hash - cache stores all results, pagination applied after
  // This matches the behavior of all() operation
  const queryHash = createFinderHash(finder, params, locations);
  logger.debug('QUERY_CACHE: Generated query hash for find()', {
    queryHash,
    finder,
    params: JSON.stringify(params),
    locations: JSON.stringify(locations)
  });

  // Check if we have cached query results
  logger.debug('QUERY_CACHE: Checking query cache for hash', { queryHash });
  try {
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

        // Apply pagination to cached results
        let paginatedItems = cachedItems;
        const offset = findOptions?.offset ?? 0;
        const limit = findOptions?.limit;

        if (offset > 0) {
          paginatedItems = paginatedItems.slice(offset);
        }
        if (limit != null && limit >= 0) {
          paginatedItems = paginatedItems.slice(0, limit);
        }

        return {
          items: paginatedItems,
          metadata: {
            total: cachedItems.length, // Total before pagination
            returned: paginatedItems.length,
            offset,
            limit,
            hasMore: limit != null && (offset + paginatedItems.length < cachedItems.length)
          }
        };
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
  } catch (error) {
    logger.error('QUERY_CACHE: Error checking query cache, falling back to API', {
      queryHash,
      error: error instanceof Error ? error.message : String(error)
    });
    // Fall through to API call below
  }

  // Note: We don't try to use queryIn here because finder parameters don't map to ItemQuery objects
  // The queryIn method is designed for ItemQuery objects, not finder parameters

  // Fetch from API
  logger.debug('QUERY_CACHE: Fetching from API (cache miss or invalid)', {
    queryHash,
    finder,
    params: JSON.stringify(params),
    locations: JSON.stringify(locations),
    findOptions
  });
  const ret = await (api.find as any)(finder, params, locations, findOptions) as FindOperationResult<V>;
  logger.debug('QUERY_CACHE: API response received', {
    queryHash,
    itemCount: ret.items.length,
    total: ret.metadata.total,
    itemKeys: ret.items.map(item => JSON.stringify(item.key))
  });

  // Store individual items in cache (store all items, not just paginated subset)
  // Note: We store all items from the API response, but the API may have already applied pagination
  // For optimal caching, we'd want to cache the full result set, but that requires the finder to opt-in
  logger.debug('QUERY_CACHE: Storing items in item cache', {
    queryHash,
    itemCount: ret.items.length
  });
  for (const v of ret.items) {
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
  const itemKeys = ret.items.map(item => item.key);
  await cacheMap.setQueryResult(queryHash, itemKeys);
  logger.debug('QUERY_CACHE: Stored query result in query cache', {
    queryHash,
    itemKeyCount: itemKeys.length,
    itemKeys: itemKeys.map(k => JSON.stringify(k))
  });

  // Emit query event
  const event = CacheEventFactory.createQueryEvent<V, S, L1, L2, L3, L4, L5>(params, locations, ret.items);
  eventEmitter.emit(event);
  logger.debug('QUERY_CACHE: Emitted query event', { queryHash });

  logger.debug('QUERY_CACHE: find() operation completed', {
    queryHash,
    resultCount: ret.items.length,
    total: ret.metadata.total
  });
  return ret;
}
