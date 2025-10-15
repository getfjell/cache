import {
  Item,
  LocKeyArray,
  validatePK
} from "@fjell/core";
import { CacheContext } from "../CacheContext";
import { CacheEventFactory } from "../events/CacheEventFactory";
import { createFinderHash } from "../normalization";
import { validateLocations } from "../validation/LocationKeyValidator";
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
  const { api, cacheMap, pkType, ttlManager, eventEmitter, coordinate } = context;
  logger.default('find', { finder, params, locations });

  // Validate location key order
  validateLocations(locations, coordinate, 'find');

  // Check if cache bypass is enabled
  if (context.options?.bypassCache) {
    logger.debug('Cache bypass enabled, fetching directly from API', { finder, params, locations });

    try {
      const ret = await api.find(finder, params, locations);
      logger.debug('API response received (not cached due to bypass)', { finder, params, locations, itemCount: ret.length });
      return [context, validatePK(ret, pkType) as V[]];
    } catch (error) {
      logger.error('API request failed', { finder, params, locations, error });
      throw error;
    }
  }

  // Generate query hash for caching
  const queryHash = createFinderHash(finder, params, locations);
  logger.debug('Generated query hash for find', { queryHash, finder, params, locations });

  // Check if we have cached query results
  const cachedItemKeys = await cacheMap.getQueryResult(queryHash);
  if (cachedItemKeys) {
    logger.debug('Using cached query results', { cachedKeyCount: cachedItemKeys.length, queryHash });

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

  // Note: We don't try to use queryIn here because finder parameters don't map to ItemQuery objects
  // The queryIn method is designed for ItemQuery objects, not finder parameters

  // Fetch from API
  const ret: V[] = await api.find(finder, params, locations);

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
  const event = CacheEventFactory.createQueryEvent<V, S, L1, L2, L3, L4, L5>(params, locations, ret);
  eventEmitter.emit(event);

  return [context, validatePK(ret, pkType) as V[]];
};
