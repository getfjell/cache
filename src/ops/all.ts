import {
  Item,
  ItemQuery,
  LocKeyArray,
  validatePK
} from "@fjell/core";
import { NotFoundError } from "@fjell/http-api";
import { CacheContext } from "../CacheContext";
import { createQueryHash } from "../normalization";
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
  const { api, cacheMap, pkType, queryTtl } = context;
  logger.default('all', { query, locations });

  // Generate query hash for caching
  const queryHash = createQueryHash(pkType, query, locations);
  logger.debug('Generated query hash for all', { queryHash });

  // Check if we have cached query results
  const cachedItemKeys = cacheMap.getQueryResult(queryHash);
  if (cachedItemKeys) {
    logger.debug('Using cached query results', { cachedKeyCount: cachedItemKeys.length });

    // Retrieve all cached items - if any are missing, invalidate the query cache
    const cachedItems: V[] = [];
    let allItemsAvailable = true;

    for (const itemKey of cachedItemKeys) {
      const item = cacheMap.get(itemKey);
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
  let ret: V[] = [];
  try {
    ret = await api.all(query, locations);

    // Store individual items in cache
    ret.forEach((v) => {
      cacheMap.set(v.key, v);
    });

    // Store query result (item keys) in query cache
    const itemKeys = ret.map(item => item.key);
    cacheMap.setQueryResult(queryHash, itemKeys, queryTtl);
    logger.debug('Cached query result', { queryHash, itemKeyCount: itemKeys.length, ttl: queryTtl });

  } catch (e: unknown) {
    if (e instanceof NotFoundError) {
      // Handle not found gracefully - cache empty result
      cacheMap.setQueryResult(queryHash, [], queryTtl);
      logger.debug('Cached empty query result for not found', { queryHash });
    } else {
      throw e;
    }
  }
  return [context, validatePK(ret, pkType) as V[]];
};
