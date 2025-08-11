import {
  Item,
  ItemQuery,
  LocKeyArray,
  validatePK
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
  const { api, cacheMap, pkType, ttlManager } = context;
  logger.default('one', { query, locations });

  // Generate query hash for caching
  const queryHash = createQueryHash(pkType, query, locations);
  logger.debug('Generated query hash for one', { queryHash });

  // Check if we have cached query results
  const cachedItemKeys = await cacheMap.getQueryResult(queryHash);
  if (cachedItemKeys) {
    logger.debug('Using cached query results', { cachedKeyCount: cachedItemKeys.length });

    if (cachedItemKeys.length === 0) {
      // Cached empty result (not found)
      return [context, null];
    }

    // Retrieve the first cached item - if missing, invalidate the query cache
    const item = await cacheMap.get(cachedItemKeys[0]);
    if (item) {
      return [context, validatePK(item, pkType) as V];
    } else {
      logger.debug('Cached item missing, invalidating query cache');
      cacheMap.deleteQueryResult(queryHash);
    }
  }

  // If no cached query results, try to find item directly in cache using queryIn
  // This handles cases where individual items are cached but query results are not yet cached
  try {
    const directCachedItems = await cacheMap.queryIn(query, locations);
    if (directCachedItems && directCachedItems.length > 0) {
      logger.debug('Found item directly in cache, skipping API call');
      const foundItem = directCachedItems[0]; // Take first match for 'one' operation

      // Cache the query result for future use
      await cacheMap.setQueryResult(queryHash, [foundItem.key]);
      logger.debug('Cached query result from direct cache hit', { queryHash, itemKey: foundItem.key });

      return [context, validatePK(foundItem, pkType) as V];
    }
  } catch (error) {
    logger.debug('Error querying cache directly, proceeding to API', { error });
  }

  let retItem: V | null = null;
  try {
    retItem = await api.one(query, locations);
    if (retItem) {
      // Store individual item in cache
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
      }

      // Store query result (single item key) in query cache
      await cacheMap.setQueryResult(queryHash, [retItem.key]);
      logger.debug('Cached query result', { queryHash, itemKey: retItem.key });
    } else {
      // Store empty result in query cache
      await cacheMap.setQueryResult(queryHash, []);
      logger.debug('Cached empty query result', { queryHash });
    }
  } catch (e: unknown) {
    if (e instanceof NotFoundError) {
      // Handle not found gracefully - cache empty result
      cacheMap.setQueryResult(queryHash, []);
      logger.debug('Cached empty query result for not found', { queryHash });
    } else {
      throw e;
    }
  }
  return [
    context,
    retItem ?
      validatePK(retItem, pkType) as V :
      null
  ];
};
