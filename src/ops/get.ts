import {
  ComKey,
  Item,
  PriKey
} from "@fjell/types";
import {
  createGetWrapper,
  isValidItemKey,
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
  const { api, cacheMap, pkType, ttlManager, statsManager, coordinate } = context;
  logger.default('get', { key, defaultTTL: ttlManager.getDefaultTTL() });

  // Use wrapper for validation
  const wrappedGet = createGetWrapper(
    coordinate,
    async (k) => {
      return await executeGetLogic(k, context);
    }
  );

  const result = await wrappedGet(key);
  return [context, result];
};

async function executeGetLogic<
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
): Promise<V | null> {
  const startTime = Date.now();
  const { api, cacheMap, pkType, ttlManager, statsManager } = context;
  const keyStr = JSON.stringify(key);

  logger.debug('CACHE_OP: get() started', {
    key: keyStr,
    ttlEnabled: ttlManager.isTTLEnabled(),
    defaultTTL: ttlManager.getDefaultTTL(),
    cacheType: cacheMap.implementationType
  });

  // Track cache request
  statsManager.incrementRequests();

  if (key === null) {
    throw new Error('Key cannot be null');
  }

  if (!isValidItemKey(key)) {
    logger.error('CACHE_OP: Invalid key for get operation', {
      key: keyStr,
      keyType: typeof key,
      reason: 'Key validation failed - must be a valid PriKey or ComKey',
      suggestion: 'Ensure the key has the correct structure: PriKey { kt, pk } or ComKey { kt, sk, lk }',
      itemType: pkType,
      coordinate: JSON.stringify(context.coordinate)
    });
    throw new Error(`Invalid key for get operation: ${keyStr}. Expected valid PriKey or ComKey structure.`);
  }

  // Check if cache bypass is enabled
  if (context.options?.bypassCache) {
    logger.debug('CACHE_OP: Cache bypass enabled, fetching directly from API', { key: keyStr });
    statsManager.incrementMisses();

    try {
      const apiStartTime = Date.now();
      const ret = await api.get(key);
      const apiDuration = Date.now() - apiStartTime;
      
      if (ret) {
        // Don't cache the result when bypass is enabled
        logger.debug('CACHE_OP: API response received (bypass mode, not cached)', {
          key: keyStr,
          apiDuration,
          totalDuration: Date.now() - startTime
        });
        return ret;
      } else {
        logger.debug('CACHE_OP: API returned null (bypass mode)', {
          key: keyStr,
          apiDuration
        });
        return null;
      }
    } catch (error: any) {
      logger.error('CACHE_OP: API request failed in bypass mode', {
        operation: 'get',
        mode: 'bypass',
        key: keyStr,
        itemType: pkType,
        duration: Date.now() - startTime,
        errorType: error.constructor?.name || typeof error,
        errorMessage: error.message,
        errorCode: error.code || error.errorInfo?.code,
        suggestion: 'Verify API endpoint is accessible and key exists. Cache bypass mode does not retry.',
        error
      });
      throw error;
    }
  }

  // Check cache first if TTL is enabled
  if (ttlManager.isTTLEnabled()) {
    const cacheCheckStart = Date.now();
    const cachedItem = await cacheMap.get(key);
    const cacheCheckDuration = Date.now() - cacheCheckStart;
    
    if (cachedItem) {
      logger.debug('CACHE_OP: Item found in cache, checking TTL validity', {
        key: keyStr,
        cacheCheckDuration,
        defaultTTL: ttlManager.getDefaultTTL()
      });
      
      // Check TTL validity using TTLManager
      const ttlCheckStart = Date.now();
      const isValid = await ttlManager.validateItem(keyStr, cacheMap);
      const ttlCheckDuration = Date.now() - ttlCheckStart;
      
      if (isValid) {
        const totalDuration = Date.now() - startTime;
        logger.debug('CACHE_OP: Cache HIT with valid TTL', {
          key: keyStr,
          cacheCheckDuration,
          ttlCheckDuration,
          totalDuration,
          defaultTTL: ttlManager.getDefaultTTL()
        });
        statsManager.incrementHits();
        return cachedItem;
      } else {
        // Item expired, remove it from cache
        logger.debug('CACHE_OP: Cache item EXPIRED, removing from cache', {
          key: keyStr,
          cacheCheckDuration,
          ttlCheckDuration
        });
        cacheMap.delete(key);
        statsManager.incrementMisses();
      }
    } else {
      // No cached item found
      logger.debug('CACHE_OP: Cache MISS (no item found)', {
        key: keyStr,
        cacheCheckDuration
      });
      statsManager.incrementMisses();
    }
    logger.debug('CACHE_OP: Proceeding to API fetch (TTL-enabled cache miss or expired)', {
      key: keyStr,
      defaultTTL: ttlManager.getDefaultTTL()
    });
  } else {
    // TTL not enabled, check cache directly
    const cacheCheckStart = Date.now();
    const cachedItem = await cacheMap.get(key);
    const cacheCheckDuration = Date.now() - cacheCheckStart;
    
    if (cachedItem) {
      const totalDuration = Date.now() - startTime;
      logger.debug('CACHE_OP: Cache HIT (TTL disabled)', {
        key: keyStr,
        cacheCheckDuration,
        totalDuration
      });
      statsManager.incrementHits();
      return cachedItem;
    } else {
      logger.debug('CACHE_OP: Cache MISS (TTL disabled)', {
        key: keyStr,
        cacheCheckDuration
      });
      statsManager.incrementMisses();
    }
  }

  // If TTL is 0 or cache miss/expired, fetch from API
  let ret: V | null;
  const requestKeyStr = keyToString(key);

  try {
    // Check if there's already an in-flight request for this key
    const requestEntry = inFlightRequests.get(requestKeyStr);
    let apiRequest: Promise<any>;
    const apiStartTime = Date.now();

    if (!requestEntry) {
      logger.debug('CACHE_OP: Creating new API request', { key: keyStr });
      // Create new API request
      apiRequest = api.get(key);

      // Only track successful promise creation
      if (apiRequest && typeof apiRequest.then === 'function') {
        const timestamp = Date.now();
        inFlightRequests.set(requestKeyStr, { promise: apiRequest, timestamp });

        // Clean up the tracking when request completes (success or failure)
        const cleanup = () => inFlightRequests.delete(requestKeyStr);

        if (typeof apiRequest.finally === 'function') {
          apiRequest.finally(cleanup);
        } else {
          // Fallback cleanup for promises without .finally()
          apiRequest.then(cleanup, cleanup);
        }
      }
    } else {
      logger.debug('CACHE_OP: Using existing in-flight request', {
        key: keyStr,
        requestAge: Date.now() - requestEntry.timestamp
      });
      apiRequest = requestEntry.promise;
    }

    ret = await apiRequest;
    const apiDuration = Date.now() - apiStartTime;
    
    if (ret) {
      logger.debug('CACHE_OP: API request successful, caching result', {
        key: keyStr,
        apiDuration,
        itemKeyMatches: JSON.stringify(ret.key) === keyStr
      });
      
      const cacheSetStart = Date.now();
      await cacheMap.set(ret.key, ret);
      const cacheSetDuration = Date.now() - cacheSetStart;

      const itemKeyStr = JSON.stringify(ret.key);

      // Create base metadata if it doesn't exist (needed for TTL and eviction)
      const metadataStart = Date.now();
      const metadata = await cacheMap.getMetadata(itemKeyStr);
      if (!metadata) {
        const now = Date.now();
        const estimatedSize = estimateValueSize(ret);
        const baseMetadata = {
          key: itemKeyStr,
          addedAt: now,
          lastAccessedAt: now,
          accessCount: 1,
          estimatedSize
        };
        await cacheMap.setMetadata(itemKeyStr, baseMetadata);
        logger.debug('CACHE_OP: Created base metadata for cached item', {
          key: itemKeyStr,
          estimatedSize
        });
      }
      const metadataDuration = Date.now() - metadataStart;

      // Handle eviction for the newly cached item
      const evictionStart = Date.now();
      const evictedKeys = await context.evictionManager.onItemAdded(itemKeyStr, ret, cacheMap);
      const evictionDuration = Date.now() - evictionStart;

      if (evictedKeys.length > 0) {
        logger.debug('CACHE_OP: Eviction triggered by new item', {
          key: itemKeyStr,
          evictedCount: evictedKeys.length,
          evictedKeys: evictedKeys
        });
      }

      // Set TTL metadata for the newly cached item
      const ttlStart = Date.now();
      await ttlManager.onItemAdded(itemKeyStr, cacheMap);
      const ttlDuration = Date.now() - ttlStart;

      // Remove evicted items from cache
      for (const evictedKey of evictedKeys) {
        const parsedKey = JSON.parse(evictedKey);
        await cacheMap.delete(parsedKey);
        logger.debug('CACHE_OP: Removed evicted item', { evictedKey });
      }

      // Emit event for item retrieved from API
      const event = CacheEventFactory.itemRetrieved(ret.key, ret as V, 'api');
      context.eventEmitter.emit(event);

      const totalDuration = Date.now() - startTime;
      logger.debug('CACHE_OP: get() completed successfully (cache miss)', {
        key: keyStr,
        apiDuration,
        cacheSetDuration,
        metadataDuration,
        evictionDuration,
        ttlDuration,
        totalDuration,
        evictedCount: evictedKeys.length
      });
    } else {
      logger.debug('CACHE_OP: API returned null', {
        key: keyStr,
        apiDuration,
        totalDuration: Date.now() - startTime
      });
    }
  } catch (e: any) {
    // Ensure we clean up the in-flight request on error
    inFlightRequests.delete(requestKeyStr);
    const duration = Date.now() - startTime;
    logger.error("CACHE_OP: get() operation failed", {
      operation: 'get',
      key: keyStr,
      itemType: pkType,
      duration,
      errorType: e.constructor?.name || typeof e,
      errorMessage: e.message,
      errorCode: e.code || e.errorInfo?.code,
      cacheType: cacheMap.implementationType,
      ttlEnabled: ttlManager.isTTLEnabled(),
      bypassMode: context.options?.bypassCache || false,
      inFlightRequestsCount: inFlightRequests.size,
      suggestion: 'Check API connectivity, key validity, and cache configuration',
      stack: e.stack
    });
    throw e;
  }

  return ret || null;
};
