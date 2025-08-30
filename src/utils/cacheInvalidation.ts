import { ComKey, LocKeyArray, PriKey, toKeyTypeArray } from "@fjell/core";
import { Registry } from "@fjell/registry";
import { Cache } from "../Cache";
import LibLogger from "../logger";

const logger = LibLogger.get('cache', 'utils', 'cacheInvalidation');

/**
 * Extracts the actual keys and key type arrays from action return values for cache invalidation
 */
export const extractKeysAndKeyTypesFromActionResult = (
  affectedItems: Array<PriKey<any> | ComKey<any, any, any, any, any, any> | LocKeyArray<any, any, any, any, any>>
): {
  keys: Array<PriKey<any> | ComKey<any, any, any, any, any, any>>;
  keyTypeArrays: string[][];
} => {
  const keys: Array<PriKey<any> | ComKey<any, any, any, any, any, any>> = [];
  const keyTypeArrays: string[][] = [];

  for (const item of affectedItems) {
    if (Array.isArray(item)) {
      // This is a LocKeyArray - we can't invalidate individual items from this
      // but we can track the key types for potential location-based invalidation
      const keyTypes = item.map(locKey => locKey.kt);
      keyTypeArrays.push(keyTypes);
    } else if ('kt' in item && 'pk' in item) {
      // This is a PriKey or ComKey - we can invalidate the specific item
      keys.push(item);

      // Use the existing core utility to extract key types
      const keyTypes = toKeyTypeArray(item);
      keyTypeArrays.push(keyTypes);
    }
  }

  return { keys, keyTypeArrays };
};

/**
 * Locates cache instances in the registry and invalidates specific items and related data
 */
export const invalidateCachesByKeysAndKeyTypes = async (
  registry: Registry,
  keys: Array<PriKey<any> | ComKey<any, any, any, any, any, any>>,
  keyTypeArrays: string[][]
): Promise<void> => {
  logger.debug('Invalidating caches by keys and key types', {
    keysCount: keys.length,
    keyTypeArrays
  });

  // Group keys by their key types to find the appropriate cache instances
  const keysByKeyTypes = new Map<string, Array<PriKey<any> | ComKey<any, any, any, any, any, any>>>();

  for (const key of keys) {
    const keyTypes = 'loc' in key
      ? [key.kt, ...key.loc.map(locKey => locKey.kt)]
      : [key.kt];

    const keyTypesKey = keyTypes.join('|');
    if (!keysByKeyTypes.has(keyTypesKey)) {
      keysByKeyTypes.set(keyTypesKey, []);
    }
    keysByKeyTypes.get(keyTypesKey)!.push(key);
  }

  // Invalidate specific items in each cache
  for (const [keyTypesKey, cacheKeys] of keysByKeyTypes) {
    const keyTypes = keyTypesKey.split('|');

    try {
      // Try to get the cache instance from the registry
      const cacheInstance = registry.get(keyTypes as any);

      if (cacheInstance && isCache(cacheInstance)) {
        logger.debug('Found cache instance for targeted invalidation', {
          keyTypes,
          cacheType: cacheInstance.coordinate.kta,
          keysToInvalidate: cacheKeys.length
        });

        // Invalidate only the specific items that were affected
        await cacheInstance.cacheMap.invalidateItemKeys(cacheKeys);

        // Also clear query results since the data has changed
        await cacheInstance.cacheMap.clearQueryResults();

        logger.debug('Successfully invalidated specific items in cache', {
          keyTypes,
          invalidatedCount: cacheKeys.length
        });
      } else {
        logger.debug('No cache instance found for key types', { keyTypes });
      }
    } catch (error) {
      logger.warning('Failed to invalidate cache for key types', {
        keyTypes,
        error: error instanceof Error ? error.message : String(error)
      });
      // Continue with other key types rather than failing completely
    }
  }

  // Handle location-based invalidation for LocKeyArray items
  for (const keyTypes of keyTypeArrays) {
    try {
      const cacheInstance = registry.get(keyTypes as any);

      if (cacheInstance && isCache(cacheInstance)) {
        logger.debug('Handling location-based invalidation', { keyTypes });

        // For location-based invalidation, we clear query results since
        // the location data has changed
        await cacheInstance.cacheMap.clearQueryResults();

        logger.debug('Successfully cleared query results for location', { keyTypes });
      }
    } catch (error) {
      logger.warning('Failed to handle location-based invalidation', {
        keyTypes,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
};

/**
 * Type guard to check if an instance is a Cache
 */
function isCache(instance: any): instance is Cache<any, any, any, any, any, any, any> {
  return instance !== null &&
    typeof instance === 'object' &&
    'operations' in instance &&
    'cacheMap' in instance &&
    typeof (instance as any).cacheMap.invalidateItemKeys === 'function';
}

/**
 * Main function to handle cache invalidation from action results
 */
export const handleActionCacheInvalidation = async (
  registry: Registry,
  affectedItems: Array<PriKey<any> | ComKey<any, any, any, any, any, any> | LocKeyArray<any, any, any, any, any>>
): Promise<void> => {
  logger.debug('Handling action cache invalidation', {
    affectedItemsCount: affectedItems.length
  });

  const { keys, keyTypeArrays } = extractKeysAndKeyTypesFromActionResult(affectedItems);
  await invalidateCachesByKeysAndKeyTypes(registry, keys, keyTypeArrays);
};
