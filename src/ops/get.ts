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
import { estimateValueSize } from "../utils/CacheSize";
import LibLogger from "../logger";

const logger = LibLogger.get('get');

// Track in-flight API requests to prevent duplicate calls for the same key
const inFlightRequests = new Map<string, { promise: Promise<any>; timestamp: number }>();

// Cleanup timeout for hanging requests (default 5 minutes)
const CLEANUP_TIMEOUT = 5 * 60 * 1000; // 5 minutes

// Periodic cleanup of stale in-flight requests
const cleanupStaleRequests = () => {
  const now = Date.now();
  const keysToDelete: string[] = [];

  inFlightRequests.forEach((request, key) => {
    if (now - request.timestamp > CLEANUP_TIMEOUT) {
      keysToDelete.push(key);
    }
  });

  keysToDelete.forEach(key => {
    logger.debug('Cleaning up stale in-flight request', { key });
    inFlightRequests.delete(key);
  });
};

// Run cleanup every minute
const cleanupInterval = setInterval(cleanupStaleRequests, 60 * 1000);

// Export cleanup function for graceful shutdown
export const cleanup = () => {
  clearInterval(cleanupInterval);
  inFlightRequests.clear();
};

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
  const { api, cacheMap, pkType, ttlManager, statsManager } = context;
  logger.default('get', { key, defaultTTL: ttlManager.getDefaultTTL() });

  // Track cache request
  statsManager.incrementRequests();

  if (!isValidItemKey(key)) {
    logger.error('Key for Get is not a valid ItemKey: %j', key);
    throw new Error('Key for Get is not a valid ItemKey');
  }

  // Check cache first if TTL is enabled
  if (ttlManager.isTTLEnabled()) {
    const keyStr = JSON.stringify(key);
    const cachedItem = await cacheMap.get(key);
    if (cachedItem) {
      // Check TTL validity using TTLManager
      const isValid = await ttlManager.validateItem(keyStr, cacheMap);
      if (isValid) {
        logger.debug('Cache hit with valid TTL', { key, defaultTTL: ttlManager.getDefaultTTL() });
        statsManager.incrementHits();
        return [context, validatePK(cachedItem, pkType) as V];
      } else {
        // Item expired, remove it from cache
        logger.debug('Cache item expired, removing', { key });
        cacheMap.delete(key);
        statsManager.incrementMisses();
      }
    } else {
      // No cached item found
      statsManager.incrementMisses();
    }
    logger.debug('Cache miss or expired', { key, defaultTTL: ttlManager.getDefaultTTL() });
  } else {
    // TTL not enabled, check cache directly
    const cachedItem = await cacheMap.get(key);
    if (cachedItem) {
      logger.debug('Cache hit (TTL disabled)', { key });
      statsManager.incrementHits();
      return [context, validatePK(cachedItem, pkType) as V];
    } else {
      statsManager.incrementMisses();
    }
  }

  // If TTL is 0 or cache miss/expired, fetch from API
  let ret: V | null;
  const keyStr = keyToString(key);

  try {
    // Check if there's already an in-flight request for this key
    const requestEntry = inFlightRequests.get(keyStr);
    let apiRequest: Promise<any>;

    if (!requestEntry) {
      // Create new API request
      apiRequest = api.get(key);

      // Only track successful promise creation
      if (apiRequest && typeof apiRequest.then === 'function') {
        const timestamp = Date.now();
        inFlightRequests.set(keyStr, { promise: apiRequest, timestamp });

        // Clean up the tracking when request completes (success or failure)
        const cleanup = () => inFlightRequests.delete(keyStr);

        if (typeof apiRequest.finally === 'function') {
          apiRequest.finally(cleanup);
        } else {
          // Fallback cleanup for promises without .finally()
          apiRequest.then(cleanup, cleanup);
        }
      }
    } else {
      logger.debug('Using in-flight request for key', { key });
      apiRequest = requestEntry.promise;
    }

    ret = await apiRequest;
    if (ret) {
      await cacheMap.set(ret.key, ret);

      const keyStr = JSON.stringify(ret.key);

      // Create base metadata if it doesn't exist (needed for TTL and eviction)
      const metadata = await cacheMap.getMetadata(keyStr);
      if (!metadata) {
        const now = Date.now();
        const baseMetadata = {
          key: keyStr,
          addedAt: now,
          lastAccessedAt: now,
          accessCount: 1,
          estimatedSize: estimateValueSize(ret)
        };
        await cacheMap.setMetadata(keyStr, baseMetadata);
      }

      // Handle eviction for the newly cached item
      const evictedKeys = await context.evictionManager.onItemAdded(keyStr, ret, cacheMap);

      // Set TTL metadata for the newly cached item
      await ttlManager.onItemAdded(keyStr, cacheMap);

      // Remove evicted items from cache
      for (const evictedKey of evictedKeys) {
        const parsedKey = JSON.parse(evictedKey);
        await cacheMap.delete(parsedKey);
      }

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
