import {
  ComKey,
  isValidItemKey,
  Item,
  PriKey,
  validatePK
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
  const { cacheMap, pkType, statsManager } = context;
  logger.default('retrieve', { key });

  // Track cache request
  statsManager.incrementRequests();

  if (!isValidItemKey(key)) {
    logger.error('Key for Retrieve is not a valid ItemKey: %j', key);
    throw new Error('Key for Retrieve is not a valid ItemKey');
  }

  const containsItemKey = await cacheMap.includesKey(key);

  let retrieved: V | null;
  let contextToReturn: CacheContext<V, S, L1, L2, L3, L4, L5> | null;

  if (containsItemKey) {
    logger.default('Looking for Object in Cache', key);
    retrieved = await cacheMap.get(key);
    contextToReturn = null;
    statsManager.incrementHits();
  } else {
    logger.default('Object Not Found in Cache, Retrieving from Server API', { key });
    statsManager.incrementMisses();
    [contextToReturn, retrieved] = await get(key, context);
  }

  const retValue: [CacheContext<V, S, L1, L2, L3, L4, L5> | null, V | null] = [
    contextToReturn,
    retrieved ?
      validatePK(retrieved, pkType) as V :
      null
  ];

  return retValue;
};
