import {
  ComKey,
  isValidItemKey,
  Item,
  PriKey,
  validatePK
} from "@fjell/core";
import { ClientApi } from "@fjell/client-api";
import { CacheMap } from "../CacheMap";
import LibLogger from "../logger";

const logger = LibLogger.get('action');

export const action = async <
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
>(
  api: ClientApi<V, S, L1, L2, L3, L4, L5>,
  cacheMap: CacheMap<V, S, L1, L2, L3, L4, L5>,
  pkType: S,
  key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
  action: string,
  body: any = {}
): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V]> => {
  logger.default('action', { key, action, body });

  if (!isValidItemKey(key)) {
    logger.error('Key for Action is not a valid ItemKey: %j', key);
    throw new Error('Key for Action is not a valid ItemKey');
  }

  const updated = await api.action(key, action, body);
  cacheMap.set(updated.key, updated);
  return [cacheMap, validatePK(updated, pkType) as V];
};
