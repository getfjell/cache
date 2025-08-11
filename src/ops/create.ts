import {
  Item,
  LocKeyArray,
  validatePK
} from "@fjell/core";
import { CacheContext } from "../CacheContext";
import { CacheEventFactory } from "../events/CacheEventFactory";
import LibLogger from "../logger";

const logger = LibLogger.get('create');

export const create = async <
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
>(
  v: Partial<Item<S, L1, L2, L3, L4, L5>>,
  locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = [],
  context: CacheContext<V, S, L1, L2, L3, L4, L5>
): Promise<[CacheContext<V, S, L1, L2, L3, L4, L5>, V]> => {
  const { api, cacheMap, pkType, eventEmitter, ttlManager, evictionManager } = context;
  logger.default('create', { v, locations });
  const created = await api.create(v, locations);
  cacheMap.set(created.key, created);

  // Set TTL metadata for the newly cached item
  const keyStr = JSON.stringify(created.key);
  ttlManager.onItemAdded(keyStr, cacheMap);

  // Handle eviction for the newly cached item
  const evictedKeys = await evictionManager.onItemAdded(keyStr, created, cacheMap);
  // Remove evicted items from cache
  for (const evictedKey of evictedKeys) {
    const parsedKey = JSON.parse(evictedKey);
    await cacheMap.delete(parsedKey);
  }

  // Emit event
  const event = CacheEventFactory.itemCreated(created.key, created as V, 'api');
  eventEmitter.emit(event);

  return [context, validatePK(created, pkType) as V];
};
