import {
  AllOperationResult,
  AllOptions,
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

// Track in-flight API requests to prevent duplicate calls for the same query
const inFlightRequests = new Map<string, { promise: Promise<any>; timestamp: number }>();

// Periodic cleanup of stale in-flight requests (cleanup after 30 seconds)
const CLEANUP_INTERVAL = 30000;
const REQUEST_TIMEOUT = 25000;

setInterval(() => {
  const now = Date.now();
  inFlightRequests.forEach((request, key) => {
    if (now - request.timestamp > REQUEST_TIMEOUT) {
      logger.debug('Cleaning up stale in-flight all() request', { key });
      inFlightRequests.delete(key);
    }
  });
}, CLEANUP_INTERVAL);

// Function to clear all in-flight requests (useful for testing)
export const clearInFlightRequests = () => {
  inFlightRequests.clear();
};

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
  context: CacheContext<V, S, L1, L2, L3, L4, L5>,
  allOptions?: AllOptions
): Promise<[CacheContext<V, S, L1, L2, L3, L4, L5>, AllOperationResult<V>]> => {
  const { coordinate } = context;
  logger.default('all', { query, locations, allOptions });

  // Use wrapper for validation
  const wrappedAll = createAllWrapper(
    coordinate,
    async (q, locs, opts) => {
      return await executeAllLogic(q ?? {}, locs ?? [], context, opts);
    }
  );

  const result = await wrappedAll(query, locations, allOptions);
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
  context: CacheContext<V, S, L1, L2, L3, L4, L5>,
  allOptions?: AllOptions
): Promise<AllOperationResult<V>> {
  const { api, cacheMap, pkType, ttlManager } = context;

  // Helper to create AllOperationResult from cached items
  const createCachedResult = (items: V[]): AllOperationResult<V> => ({
    items,
    metadata: {
      total: items.length,
      returned: items.length,
      limit: allOptions?.limit ?? query?.limit,
      offset: allOptions?.offset ?? query?.offset ?? 0,
      hasMore: false  // When serving from cache, we assume we have all matching items
    }
  });

  // Check if cache bypass is enabled
  if (context.options?.bypassCache) {
    logger.debug('Cache bypass enabled, fetching directly from API', { query, locations });

    try {
      const ret = await api.all(query, locations, allOptions);
      logger.debug('API response received (not cached due to bypass)', {
        operation: 'all',
        mode: 'bypass',
        query,
        locations,
        itemCount: ret.items.length,
        metadata: ret.metadata
      });
      return ret;
    } catch (error: any) {
      logger.error('API request failed in bypass mode', {
        operation: 'all',
        mode: 'bypass',
        query,
        locations,
        errorType: error.constructor?.name || typeof error,
        errorMessage: error.message,
        errorCode: error.code || error.errorInfo?.code,
        suggestion: 'Verify API endpoint is accessible, query syntax is correct, and locations are valid',
        error
      });
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
      return createCachedResult(cachedItems);
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

  // For empty queries (`.all()` with no filters), skip direct cache query
  // because we can't trust that cached items represent complete data.
  // Cached items might be from previous filtered queries.
  const isEmptyQuery = Object.keys(query).length === 0 ||
                      (Object.keys(query).length === 1 &&
                       'limit' in query || 'offset' in query);

  if (!isEmptyQuery) {
    // Only try direct cache query for filtered queries where we can validate completeness
    logger.debug('QUERY_CACHE: Attempting direct cache query using queryIn() for filtered query', {
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

        return createCachedResult(directCachedItems);
      } else {
        logger.debug('QUERY_CACHE: Direct cache query returned no items', { queryHash });
      }
    } catch (error: any) {
      logger.debug('QUERY_CACHE: Error querying cache directly, proceeding to API', {
        operation: 'all',
        phase: 'cache-query',
        queryHash,
        query: JSON.stringify(query),
        locations: JSON.stringify(locations),
        errorType: error.constructor?.name || typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        cacheType: cacheMap.implementationType,
        note: 'This is expected behavior - falling back to API when cache query fails'
      });
    }
  } else {
    logger.debug('QUERY_CACHE: Skipping direct cache query for empty/all query - cannot trust completeness', {
      queryHash,
      query: JSON.stringify(query)
    });
  }

  // Fetch from API with request deduplication
  logger.debug('QUERY_CACHE: Fetching from API (cache miss or invalid)', {
    queryHash,
    query: JSON.stringify(query),
    locations: JSON.stringify(locations)
  });

  // Check if there's already an in-flight request for this query
  const timestamp = Date.now();
  const existingRequest = inFlightRequests.get(queryHash);

  if (existingRequest && (timestamp - existingRequest.timestamp < REQUEST_TIMEOUT)) {
    logger.debug('QUERY_CACHE: Using existing in-flight all() request', {
      queryHash,
      age: timestamp - existingRequest.timestamp
    });
    return await existingRequest.promise;
  }

  let apiResult: AllOperationResult<V> = { items: [], metadata: { total: 0, returned: 0, offset: 0, hasMore: false } };
  try {
    // Create new API request and store it for deduplication
    const apiRequest = api.all(query, locations, allOptions);
    inFlightRequests.set(queryHash, { promise: apiRequest, timestamp });

    // Clean up after completion
    const cleanup = () => inFlightRequests.delete(queryHash);
    apiRequest.then(cleanup, cleanup);

    apiResult = await apiRequest;
    logger.debug('QUERY_CACHE: API response received', {
      queryHash,
      itemCount: apiResult.items.length,
      total: apiResult.metadata?.total,
      itemKeys: apiResult.items.map(item => JSON.stringify(item.key))
    });

    // Store individual items in cache
    logger.debug('QUERY_CACHE: Storing items in item cache', {
      queryHash,
      itemCount: apiResult.items.length
    });
    for (const v of apiResult.items) {
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
    const itemKeys = apiResult.items.map(item => item.key);
    await cacheMap.setQueryResult(queryHash, itemKeys);
    logger.debug('QUERY_CACHE: Stored query result in query cache', {
      queryHash,
      itemKeyCount: itemKeys.length,
      itemKeys: itemKeys.map(k => JSON.stringify(k))
    });

    // Emit query event
    const event = CacheEventFactory.createQueryEvent<V, S, L1, L2, L3, L4, L5>(query, locations, apiResult.items);
    context.eventEmitter.emit(event);
    logger.debug('QUERY_CACHE: Emitted query event', { queryHash });

  } catch (e: unknown) {
    // Ensure we clean up the in-flight request on error
    inFlightRequests.delete(queryHash);

    if (e instanceof NotFoundError) {
      // Handle not found gracefully - cache empty result
      logger.debug('QUERY_CACHE: API returned NotFoundError, caching empty result', { queryHash });
      await cacheMap.setQueryResult(queryHash, []);
      logger.debug('QUERY_CACHE: Cached empty query result for not found', { queryHash });
    } else {
      logger.error('QUERY_CACHE: API error occurred during all() operation', {
        operation: 'all',
        phase: 'api-fetch',
        queryHash,
        query: JSON.stringify(query),
        locations: JSON.stringify(locations),
        errorType: e instanceof Error ? e.constructor.name : typeof e,
        errorMessage: e instanceof Error ? e.message : String(e),
        errorCode: (e as any).code || (e as any).errorInfo?.code,
        cacheType: cacheMap.implementationType,
        inFlightRequestsCount: inFlightRequests.size,
        suggestion: 'Check API connectivity, query syntax, location keys, and network connectivity',
        error: e
      });
      throw e;
    }
  }
  logger.debug('QUERY_CACHE: all() operation completed', {
    queryHash,
    resultCount: apiResult.items.length,
    total: apiResult.metadata?.total
  });
  return apiResult;
};
