import {
  ComKey,
  isItemKeyEqual,
  isValidItemKey,
  Item,
  PriKey,
  validatePK
} from "@fjell/core";
import { CacheContext } from "../CacheContext";
import { CacheEventFactory } from "../events/CacheEventFactory";
import LibLogger from "../logger";

const logger = LibLogger.get('set');

// Normalize a key value to string for consistent comparison
const normalizeKeyValue = (value: string | number): string => {
  return String(value);
};

// Normalized key comparison function that handles string/number differences
const isItemKeyEqualNormalized = <
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
>(a: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>, b: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): boolean => {
  // For now, just normalize the keys to strings and use the original comparison
  const normalizedA = normalizeKey(a);
  const normalizedB = normalizeKey(b);
  return isItemKeyEqual(normalizedA as ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>, normalizedB as ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>);
};

// Helper function to normalize a key efficiently without deep cloning
const normalizeKey = (key: any): any => {
  if (typeof key === 'object' && key !== null) {
    let needsNormalization = false;
    let normalizedKey = key;

    // Check if pk needs normalization
    if ('pk' in key && key.pk !== null && typeof key.pk !== 'string') {
      needsNormalization = true;
    }

    // Check if lk needs normalization
    if ('lk' in key && key.lk !== null && typeof key.lk !== 'string') {
      needsNormalization = true;
    }

    // Check if loc array has lk values that need normalization
    if ('loc' in key && Array.isArray(key.loc)) {
      for (const locItem of key.loc) {
        if (locItem && 'lk' in locItem && locItem.lk !== null && typeof locItem.lk !== 'string') {
          needsNormalization = true;
          break;
        }
      }
    }

    // Only create a new object if normalization is actually needed
    if (needsNormalization) {
      normalizedKey = { ...key };

      // Normalize pk values
      if ('pk' in normalizedKey && normalizedKey.pk !== null) {
        normalizedKey.pk = normalizeKeyValue(normalizedKey.pk);
      }

      // Normalize lk values
      if ('lk' in normalizedKey && normalizedKey.lk !== null) {
        normalizedKey.lk = normalizeKeyValue(normalizedKey.lk);
      }

      // Normalize loc array lk values
      if ('loc' in normalizedKey && Array.isArray(normalizedKey.loc)) {
        normalizedKey.loc = normalizedKey.loc.map((locItem: any) => {
          if (locItem && 'lk' in locItem && locItem.lk !== null && typeof locItem.lk !== 'string') {
            return { ...locItem, lk: normalizeKeyValue(locItem.lk) };
          }
          return locItem;
        });
      }
    }

    return normalizedKey;
  }
  return key;
};

export const set = async <
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
>(
  key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
  v: Item<S, L1, L2, L3, L4, L5>,
  context: CacheContext<V, S, L1, L2, L3, L4, L5>
): Promise<[CacheContext<V, S, L1, L2, L3, L4, L5>, V]> => {
  const { cacheMap, pkType, ttlManager, evictionManager, eventEmitter } = context;
  logger.default('set', { key, v });

  if (!isValidItemKey(key)) {
    logger.error('Key for Set is not a valid ItemKey: %j', key);
    throw new Error('Key for Set is not a valid ItemKey');
  }

  // Validate the item's primary key
  validatePK(v, pkType);

  if (!isItemKeyEqualNormalized(key, v.key)) {
    logger.error('Key does not match item key: %j != %j', key, v.key);
    throw new Error('Key does not match item key');
  }

  // Get previous item if it exists
  const previousItem = cacheMap.get(key);

  cacheMap.set(key, v as V);

  // Set TTL metadata for the newly cached item
  const keyStr = JSON.stringify(key);
  ttlManager.onItemAdded(keyStr, cacheMap);

  // Handle eviction for the newly cached item
  const evictedKeys = evictionManager.onItemAdded(keyStr, v, cacheMap);
  // Remove evicted items from cache
  evictedKeys.forEach(evictedKey => {
    const parsedKey = JSON.parse(evictedKey);
    cacheMap.delete(parsedKey);
  });

  // Emit event
  const event = CacheEventFactory.itemSet(key, v as V, previousItem);
  eventEmitter.emit(event);

  return [context, validatePK(v, pkType) as V];
};
