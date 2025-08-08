import {
  ComKey,
  isValidItemKey,
  Item,
  PriKey,
  validatePK
} from "@fjell/core";
import { CacheContext } from "../CacheContext";
import { CacheEventFactory } from "../events/CacheEventFactory";
import { createNormalizedHashFunction } from "../normalization";
import LibLogger from "../logger";

const logger = LibLogger.get('get');

// Track in-flight API requests to prevent duplicate calls for the same key
const inFlightRequests = new Map<string, Promise<any>>();

// Normalized key stringification for tracking purposes - uses same normalization as cache maps
const keyToString = createNormalizedHashFunction<any>();

export const get = async <
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
): Promise<[CacheContext<V, S, L1, L2, L3, L4, L5>, V | null]> => {
  const { api, cacheMap, pkType, ttlManager } = context;
  logger.default('get', { key, defaultTTL: ttlManager.getDefaultTTL() });

  if (!isValidItemKey(key)) {
    logger.error('Key for Get is not a valid ItemKey: %j', key);
    throw new Error('Key for Get is not a valid ItemKey');
  }

  // Check cache first if TTL is enabled
  if (ttlManager.isTTLEnabled()) {
    const keyStr = JSON.stringify(key);
    const cachedItem = cacheMap.get(key);
    if (cachedItem) {
      // Check TTL validity using TTLManager
      const isValid = ttlManager.validateItem(keyStr, cacheMap);
      if (isValid) {
        logger.debug('Cache hit with valid TTL', { key, defaultTTL: ttlManager.getDefaultTTL() });
        return [context, validatePK(cachedItem, pkType) as V];
      } else {
        // Item expired, remove it from cache
        logger.debug('Cache item expired, removing', { key });
        cacheMap.delete(key);
      }
    }
    logger.debug('Cache miss or expired', { key, defaultTTL: ttlManager.getDefaultTTL() });
  }

  // If TTL is 0 or cache miss/expired, fetch from API
  let ret: V | null;
  const keyStr = keyToString(key);

  try {
    // Check if there's already an in-flight request for this key
    let apiRequest = inFlightRequests.get(keyStr);

    if (!apiRequest) {
      // Create new API request
      apiRequest = api.get(key);

      // Only track successful promise creation
      if (apiRequest && typeof apiRequest.then === 'function') {
        inFlightRequests.set(keyStr, apiRequest);

        // Clean up the tracking when request completes (success or failure)
        if (typeof apiRequest.finally === 'function') {
          apiRequest.finally(() => {
            inFlightRequests.delete(keyStr);
          });
        }
      }
    } else {
      logger.debug('Using in-flight request for key', { key });
    }

    ret = await apiRequest;
    if (ret) {
      cacheMap.set(ret.key, ret);

      // Set TTL metadata for the newly cached item
      const keyStr = JSON.stringify(ret.key);
      ttlManager.onItemAdded(keyStr, cacheMap);

      // Handle eviction for the newly cached item
      const evictedKeys = context.evictionManager.onItemAdded(keyStr, ret, cacheMap);
      // Remove evicted items from cache
      evictedKeys.forEach(evictedKey => {
        const parsedKey = JSON.parse(evictedKey);
        cacheMap.delete(parsedKey);
      });

      // Emit event for item retrieved from API
      const event = CacheEventFactory.itemRetrieved(ret.key, ret as V, 'api');
      context.eventEmitter.emit(event);
    }
  } catch (e: any) {
    // Ensure we clean up the in-flight request on error
    inFlightRequests.delete(keyStr);
    logger.error("Error getting item for key", { key, message: e.message, stack: e.stack });
    throw e;
  }

  return [
    context,
    ret ?
      validatePK(ret, pkType) as V :
      null
  ];
};
