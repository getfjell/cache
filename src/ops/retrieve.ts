import {
  ComKey,
  isValidItemKey,
  Item,
  PriKey
} from "@fjell/core";
import { CacheContext } from "../CacheContext";
import LibLogger from "../logger";
import { get } from "./get";

const logger = LibLogger.get('retrieve');

export const retrieve = async <
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
>(
  key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
  context: CacheContext<V, S, L1, L2, L3, L4, L5>
): Promise<[CacheContext<V, S, L1, L2, L3, L4, L5> | null, V | null]> => {
  const startTime = Date.now();
  const { cacheMap, pkType, statsManager } = context;
  const keyStr = JSON.stringify(key);
  
  logger.default('retrieve', { key });
  logger.debug('CACHE_OP: retrieve() started', {
    key: keyStr,
    cacheType: cacheMap.implementationType,
    bypassEnabled: !!context.options?.bypassCache
  });

  // Track cache request
  statsManager.incrementRequests();

  if (!isValidItemKey(key)) {
    logger.error('CACHE_OP: Invalid key for retrieve', { key: keyStr });
    throw new Error('Key for Retrieve is not a valid ItemKey');
  }

  // Check if cache bypass is enabled
  if (context.options?.bypassCache) {
    logger.debug('CACHE_OP: Cache bypass enabled, fetching directly from API', { key: keyStr });
    statsManager.incrementMisses();
    
    try {
      const apiStartTime = Date.now();
      const { api } = context;
      const retrieved = await api.get(key);
      const apiDuration = Date.now() - apiStartTime;
      
      if (retrieved) {
        logger.debug('CACHE_OP: API response received (bypass mode)', {
          key: keyStr,
          apiDuration,
          hasValue: true
        });
        return [null, retrieved];
      } else {
        logger.debug('CACHE_OP: API returned null (bypass mode)', {
          key: keyStr,
          apiDuration
        });
        return [null, null];
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('CACHE_OP: API request failed in bypass mode', {
        key: keyStr,
        duration,
        error
      });
      throw error;
    }
  }

  const containsItemKey = await cacheMap.includesKey(key);
  logger.debug('CACHE_OP: Cache key check completed', {
    key: keyStr,
    exists: containsItemKey
  });

  let retrieved: V | null;
  let contextToReturn: CacheContext<V, S, L1, L2, L3, L4, L5> | null;

  if (containsItemKey) {
    logger.default('Looking for Object in Cache', key);
    logger.debug('CACHE_OP: Cache HIT - retrieving from cache', { key: keyStr });
    const getStartTime = Date.now();
    retrieved = await cacheMap.get(key);
    const getDuration = Date.now() - getStartTime;
    
    contextToReturn = null;
    statsManager.incrementHits();
    
    const totalDuration = Date.now() - startTime;
    logger.debug('CACHE_OP: retrieve() completed (cache hit)', {
      key: keyStr,
      getDuration,
      totalDuration,
      hasValue: !!retrieved
    });
  } else {
    logger.default('Object Not Found in Cache, Retrieving from Server API', { key });
    logger.debug('CACHE_OP: Cache MISS - fetching from API', { key: keyStr });
    statsManager.incrementMisses();
    
    const apiStartTime = Date.now();
    [contextToReturn, retrieved] = await get(key, context);
    const apiDuration = Date.now() - apiStartTime;
    
    const totalDuration = Date.now() - startTime;
    logger.debug('CACHE_OP: retrieve() completed (cache miss)', {
      key: keyStr,
      apiDuration,
      totalDuration,
      hasValue: !!retrieved
    });
  }

  const retValue: [CacheContext<V, S, L1, L2, L3, L4, L5> | null, V | null] = [
    contextToReturn,
    retrieved || null
  ];

  return retValue;
};
