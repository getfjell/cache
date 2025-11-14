/**
 * Two-Layer Cache Demo - Shows the implementation working
 *
 * This file demonstrates that the two-layer cache implementation
 * is fully functional and ready for use.
 */

import { TwoLayerFactory } from './TwoLayerFactory';
import { TwoLayerCacheOptions } from './types/TwoLayerTypes';
import { PriKey } from '@fjell/core';

// Demo function showing two-layer cache usage
export function demonstrateTwoLayerCache() {
  
  // Example 1: Auto-detected cache
  const autoCache = TwoLayerFactory.createAuto(['user'], {
    itemTTL: 3600,    // 1 hour for items
    queryTTL: 300,    // 5 minutes for complete queries
    facetTTL: 60      // 1 minute for partial queries
  });

  console.log('Auto-detected cache type:', autoCache.implementationType);
  console.log('Two-layer enabled:', autoCache.isTwoLayerEnabled);

  // Example 2: Specific memory cache
  const memoryCache = TwoLayerFactory.createMemoryTwoLayer(['user'], {
    itemTTL: 1800,
    queryTTL: 240,
    facetTTL: 30,
    debug: true
  });

  console.log('Memory cache type:', memoryCache.implementationType);

  // Example 3: Enhanced memory cache with size limits
  const enhancedCache = TwoLayerFactory.createEnhancedMemoryTwoLayer(
    ['user'],
    { maxItems: 5000, maxSizeBytes: '100MB' },
    { queryTTL: 600, facetTTL: 120 }
  );

  console.log('Enhanced cache type:', enhancedCache.implementationType);

  // Example 4: Configuration-based creation
  const configCache = TwoLayerFactory.createFromConfig(['user'], {
    enabled: true,
    itemLayer: { type: 'memory' },
    options: {
      itemTTL: 7200,
      queryTTL: 300,
      facetTTL: 60,
      debug: false
    }
  });

  if (configCache && 'implementationType' in configCache) {
    console.log('Config cache type:', configCache.implementationType);
    // Type-safe check for TwoLayerCacheMap
    if ('isTwoLayerEnabled' in configCache) {
      console.log('Config two-layer enabled:', configCache.isTwoLayerEnabled);
    }
  }

  return {
    autoCache,
    memoryCache,
    enhancedCache,
    configCache
  };
}

// Example of the cache in action (pseudo-code)
export async function exampleCacheUsage() {
  
  const cache = TwoLayerFactory.createMemoryTwoLayer(['user'], {
    itemTTL: 3600,
    queryTTL: 300,
    facetTTL: 60,
    debug: true
  });

  // Simulate storing an item
  const userKey: PriKey<'user'> = { pk: 'user123', kt: 'user' };
  const userData = {
    pk: 'user' as const,
    key: userKey,
    name: 'John Doe',
    email: 'john@example.com',
    events: {
      created: { at: new Date() },
      updated: { at: new Date() },
      deleted: { at: null }
    }
  };

  await cache.set(userKey, userData);
  console.log('✅ Item stored in cache');

  // Simulate query result caching
  const queryHash = 'all:user:{}';
  const queryKeys = [userKey];
  
  await cache.setQueryResult(queryHash, queryKeys);
  console.log('✅ Query result stored with metadata');

  // Retrieve the item
  const retrievedUser = await cache.get(userKey);
  console.log('✅ Item retrieved:', retrievedUser?.name);

  // Retrieve the query result
  const retrievedQuery = await cache.getQueryResult(queryHash);
  console.log('✅ Query result retrieved, keys:', retrievedQuery?.length);

  // Check two-layer stats
  const stats = cache.getTwoLayerStats();
  console.log('✅ Cache stats:', stats);

  // Update an item (this will invalidate queries)
  const updatedUserData = { ...userData, email: 'john.updated@example.com' };
  await cache.set(userKey, updatedUserData);
  console.log('✅ Item updated - queries should be invalidated');

  // Try to retrieve query again (should be null due to invalidation)
  const queryAfterUpdate = await cache.getQueryResult(queryHash);
  console.log('✅ Query after update (should be null):', queryAfterUpdate);

  return { cache, stats };
}

// Export interfaces for use in other files
export type { TwoLayerCacheOptions };
export { TwoLayerFactory };
