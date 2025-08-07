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
  const { cacheMap, pkType } = context;
  logger.default('retrieve', { key });

  if (!isValidItemKey(key)) {
    logger.error('Key for Retrieve is not a valid ItemKey: %j', key);
    throw new Error('Key for Retrieve is not a valid ItemKey');
  }

  const containsItemKey = cacheMap.includesKey(key);

  let retrieved: V | null;
  if (containsItemKey) {
    logger.default('Looking for Object in Cache', key);
    retrieved = cacheMap.get(key);
  } else {
    logger.default('Object Not Found in Cache, Retrieving from Server API', { key });
    [, retrieved] = await get(key, context);
  }

  const retValue: [CacheContext<V, S, L1, L2, L3, L4, L5> | null, V | null] = [
    containsItemKey ? null : context,
    retrieved ?
      validatePK(retrieved, pkType) as V :
      null
  ];

  return retValue;
};
