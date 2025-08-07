import {
  ComKey,
  isValidItemKey,
  Item,
  PriKey,
  validatePK
} from "@fjell/core";
import { CacheContext } from "../CacheContext";
import { CacheEventFactory } from "../events/CacheEventFactory";
import LibLogger from "../logger";

const logger = LibLogger.get('get');

// Track in-flight API requests to prevent duplicate calls for the same key
const inFlightRequests = new Map<string, Promise<any>>();

// Simple key stringification for tracking purposes
const keyToString = (key: any): string => {
  return JSON.stringify(key);
};

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
  const { api, cacheMap, pkType, itemTtl } = context;
  logger.default('get', { key, itemTtl });

  if (!isValidItemKey(key)) {
    logger.error('Key for Get is not a valid ItemKey: %j', key);
    throw new Error('Key for Get is not a valid ItemKey');
  }

  // If TTL is defined and greater than 0, check cache first
  if (typeof itemTtl === 'number' && itemTtl > 0) {
    const cachedItem = cacheMap.getWithTTL(key, itemTtl);
    if (cachedItem) {
      logger.debug('Cache hit with TTL', { key, itemTtl });
      return [context, validatePK(cachedItem, pkType) as V];
    }
    logger.debug('Cache miss or expired', { key, itemTtl });
  }

  // If TTL is 0 or cache miss/expired, fetch from API
  let ret: V | null;
  const keyStr = keyToString(key);

  try {
    // Check if there's already an in-flight request for this key
    let apiRequest = inFlightRequests.get(keyStr);

    if (!apiRequest) {
      // Create new API request and track it
      apiRequest = api.get(key);
      inFlightRequests.set(keyStr, apiRequest);

      // Clean up the tracking when request completes (success or failure)
      // Only add finally handler if the request is actually a Promise
      if (apiRequest && typeof apiRequest.finally === 'function') {
        apiRequest.finally(() => {
          inFlightRequests.delete(keyStr);
        });
      } else {
        // For non-promise return values (like in tests), clean up immediately
        inFlightRequests.delete(keyStr);
      }
    } else {
      logger.debug('Using in-flight request for key', { key });
    }

    ret = await apiRequest;
    if (ret) {
      cacheMap.set(ret.key, ret);

      // Emit event for item retrieved from API
      const event = CacheEventFactory.itemRetrieved(ret.key, ret as V, 'api');
      context.eventEmitter.emit(event);
    }
  } catch (e: any) {
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
