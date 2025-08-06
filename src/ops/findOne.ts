import {
  Item,
  LocKeyArray,
  validatePK
} from "@fjell/core";
import { CacheContext } from "../CacheContext";
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
): Promise<[CacheContext<V, S, L1, L2, L3, L4, L5>, V]> => {
  const { api, cacheMap, pkType, queryTtl } = context;
  logger.default('findOne', { finder, finderParams, locations });

  // Generate query hash for caching
  const queryHash = createFinderHash(finder, finderParams, locations);
  logger.debug('Generated query hash for findOne', { queryHash });

  // Check if we have cached query results
  const cachedItemKeys = cacheMap.getQueryResult(queryHash);
  if (cachedItemKeys && cachedItemKeys.length > 0) {
    logger.debug('Using cached query results', { cachedKeyCount: cachedItemKeys.length });

    // Retrieve the first cached item - if missing, invalidate the query cache
    const item = cacheMap.get(cachedItemKeys[0]);
    if (item) {
      return [context, validatePK(item, pkType) as V];
    } else {
      logger.debug('Cached item missing, invalidating query cache');
      cacheMap.deleteQueryResult(queryHash);
    }
  }

  // Fetch from API
  const ret = await api.findOne(finder, finderParams, locations);

  // Store individual item in cache
  cacheMap.set(ret.key, ret);

  // Store query result (single item key) in query cache
  cacheMap.setQueryResult(queryHash, [ret.key], queryTtl);
  logger.debug('Cached query result', { queryHash, itemKey: ret.key, ttl: queryTtl });

  return [context, validatePK(ret, pkType) as V];
};
