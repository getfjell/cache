import {
  ComKey,
  isValidItemKey,
  Item,
  PriKey,
  validatePK
} from "@fjell/core";
import { CacheContext } from "../CacheContext";
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
  key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
  action: string,
  body: any = {},
  context: CacheContext<V, S, L1, L2, L3, L4, L5>
): Promise<[CacheContext<V, S, L1, L2, L3, L4, L5>, V]> => {
  const { api, cacheMap, pkType } = context;
  logger.default('action', { key, action, body });

  if (!isValidItemKey(key)) {
    logger.error('Key for Action is not a valid ItemKey: %j', key);
    throw new Error('Key for Action is not a valid ItemKey');
  }

  // Invalidate the item key before executing the action
  logger.debug('Invalidating item key before action', { key });
  cacheMap.invalidateItemKeys([key]);

  const updated = await api.action(key, action, body);

  // Cache the result after the action
  logger.debug('Caching action result', { updatedKey: updated.key });
  cacheMap.set(updated.key, updated);

  return [context, validatePK(updated, pkType) as V];
};
