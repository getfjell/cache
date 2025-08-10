import {
  Item,
  LocKeyArray,
  validatePK
} from "@fjell/core";
import { CacheContext } from "../CacheContext";
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
  context: CacheContext<V, S, L1, L2, L3, L4, L5>
): Promise<[CacheContext<V, S, L1, L2, L3, L4, L5>, V[]]> => {
  const { api, cacheMap, pkType, ttlManager } = context;
  logger.default('find', { finder, params, locations });

  // Generate query hash for caching
  const queryHash = createFinderHash(finder, params, locations);
  logger.debug('Generated query hash for find', { queryHash });

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
      return [context, validatePK(cachedItems, pkType) as V[]];
    } else {
      logger.debug('Some cached items missing, invalidating query cache');
      cacheMap.deleteQueryResult(queryHash);
    }
  }

  // Fetch from API
  const ret: V[] = await api.find(finder, params, locations);

  // Store individual items in cache
  ret.forEach((v) => {
    cacheMap.set(v.key, v);

    // Set TTL metadata for the newly cached item
    const keyStr = JSON.stringify(v.key);
    ttlManager.onItemAdded(keyStr, cacheMap);

    // Handle eviction for the newly cached item
    const evictedKeys = context.evictionManager.onItemAdded(keyStr, v, cacheMap);
    // Remove evicted items from cache
    evictedKeys.forEach(evictedKey => {
      const parsedKey = JSON.parse(evictedKey);
      cacheMap.delete(parsedKey);
    });
  });

  // Store query result (item keys) in query cache
  const itemKeys = ret.map(item => item.key);
  cacheMap.setQueryResult(queryHash, itemKeys);
  logger.debug('Cached query result', { queryHash, itemKeyCount: itemKeys.length });

  return [context, validatePK(ret, pkType) as V[]];
};
