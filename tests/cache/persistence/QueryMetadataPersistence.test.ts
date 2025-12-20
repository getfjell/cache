import { beforeEach, describe, expect, it } from 'vitest';
import { AsyncIndexDBCacheMap } from '../../../src/browser/AsyncIndexDBCacheMap';
import { TwoLayerCacheMap } from '../../../src/cache/layers/TwoLayerCacheMap';
import { AllItemTypeArrays, ComKey, PriKey } from '@fjell/types';

interface TestItem {
  key: PriKey<'test'>;
  name: string;
  value: number;
}

describe('Query Metadata Persistence', () => {
  const types: AllItemTypeArrays<'test'> = {
    typesArray: ['test'],
    l1TypesArray: [],
    l2TypesArray: [],
    l3TypesArray: [],
    l4TypesArray: [],
    l5TypesArray: []
  };

  let dbName: string;
  let storeName: string;

  beforeEach(() => {
    // Use unique database name for each test to avoid conflicts
    dbName = `test-query-metadata-${Date.now()}-${Math.random()}`;
    storeName = 'cache';
  });

  it('should persist query metadata to IndexedDB', async () => {
    // Create an IndexedDB-backed two-layer cache
    const asyncCache = new AsyncIndexDBCacheMap<TestItem, 'test'>(types, dbName, storeName);
    const cache = new TwoLayerCacheMap(asyncCache, {
      itemTTL: 3600,
      queryTTL: 300, // 5 minutes for complete queries
      facetTTL: 60,  // 1 minute for partial queries
      debug: false
    });

    // Set some items
    const item1: TestItem = { key: { kt: 'test', pk: '1' }, name: 'Item 1', value: 100 };
    const item2: TestItem = { key: { kt: 'test', pk: '2' }, name: 'Item 2', value: 200 };
    
    await cache.set(item1.key, item1);
    await cache.set(item2.key, item2);

    // Store a query result
    const queryHash = 'all:locations:[]|query:{}';
    const itemKeys = [item1.key, item2.key];
    await cache.setQueryResult(queryHash, itemKeys);

    // Verify query is cached
    const result1 = await cache.getQueryResult(queryHash);
    expect(result1).toHaveLength(2);

    // Get statistics
    const stats1 = cache.getTwoLayerStats();
    expect(stats1.queryMetadata.total).toBe(1);
    expect(stats1.queryMetadata.valid).toBe(1);

    // Now simulate a page reload by creating a NEW cache instance
    // with the same database (simulating browser reload)
    const asyncCache2 = new AsyncIndexDBCacheMap<TestItem, 'test'>(types, dbName, storeName);
    const cache2 = new TwoLayerCacheMap(asyncCache2, {
      itemTTL: 3600,
      queryTTL: 300,
      facetTTL: 60,
      debug: false
    });

    // Query metadata should be loaded from IndexedDB on first access
    const result2 = await cache2.getQueryResult(queryHash);
    expect(result2).not.toBeNull();
    expect(result2).toHaveLength(2);

    // Verify the metadata was restored
    const stats2 = cache2.getTwoLayerStats();
    expect(stats2.queryMetadata.total).toBe(1);
    expect(stats2.queryMetadata.valid).toBe(1);
  });

  it('should restore query expiration from IndexedDB', async () => {
    // Create an IndexedDB-backed two-layer cache with short TTL
    const asyncCache = new AsyncIndexDBCacheMap<TestItem, 'test'>(types, dbName, storeName);
    const cache = new TwoLayerCacheMap(asyncCache, {
      itemTTL: 3600,
      queryTTL: 1, // 1 second TTL
      facetTTL: 1,
      debug: false
    });

    // Set some items
    const item1: TestItem = { key: { kt: 'test', pk: '1' }, name: 'Item 1', value: 100 };
    await cache.set(item1.key, item1);

    // Store a query result
    const queryHash = 'all:locations:[]|query:{}';
    await cache.setQueryResult(queryHash, [item1.key]);

    // Verify query is cached
    const result1 = await cache.getQueryResult(queryHash);
    expect(result1).toHaveLength(1);

    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 1100));

    // Create a new cache instance (simulating reload)
    const asyncCache2 = new AsyncIndexDBCacheMap<TestItem, 'test'>(types, dbName, storeName);
    const cache2 = new TwoLayerCacheMap(asyncCache2, {
      itemTTL: 3600,
      queryTTL: 1,
      facetTTL: 1,
      debug: false
    });

    // Query should be expired (metadata restored with expiration time)
    const result2 = await cache2.getQueryResult(queryHash);
    expect(result2).toBeNull();

    // Statistics should show the query was expired
    const stats2 = cache2.getTwoLayerStats();
    expect(stats2.queryMetadata.total).toBe(0);
  });

  it('should handle completeness metadata across reloads', async () => {
    // Create an IndexedDB-backed two-layer cache
    const asyncCache = new AsyncIndexDBCacheMap<TestItem, 'test'>(types, dbName, storeName);
    const cache = new TwoLayerCacheMap(asyncCache, {
      itemTTL: 3600,
      queryTTL: 300, // 5 minutes for complete queries
      facetTTL: 60,  // 1 minute for partial queries
      debug: false
    });

    // Set some items
    const item1: TestItem = { key: { kt: 'test', pk: '1' }, name: 'Item 1', value: 100 };
    await cache.set(item1.key, item1);

    // Store a complete query (empty query = all items)
    const completeQueryHash = 'all:locations:[]|query:{}';
    await cache.setQueryResult(completeQueryHash, [item1.key]);

    // Store a partial query (faceted query)
    const partialQueryHash = 'facet:name:Item 1';
    await cache.setQueryResult(partialQueryHash, [item1.key]);

    // Verify both queries are cached
    expect(await cache.getQueryResult(completeQueryHash)).toHaveLength(1);
    expect(await cache.getQueryResult(partialQueryHash)).toHaveLength(1);

    // Check stats - should show 1 complete and 1 partial
    const stats1 = cache.getTwoLayerStats();
    expect(stats1.queryMetadata.total).toBe(2);
    expect(stats1.queryMetadata.complete).toBe(1);
    expect(stats1.queryMetadata.partial).toBe(1);

    // Simulate page reload
    const asyncCache2 = new AsyncIndexDBCacheMap<TestItem, 'test'>(types, dbName, storeName);
    const cache2 = new TwoLayerCacheMap(asyncCache2, {
      itemTTL: 3600,
      queryTTL: 300,
      facetTTL: 60,
      debug: false
    });

    // Both queries should be available
    expect(await cache2.getQueryResult(completeQueryHash)).toHaveLength(1);
    expect(await cache2.getQueryResult(partialQueryHash)).toHaveLength(1);

    // Stats should show the same completeness metadata
    const stats2 = cache2.getTwoLayerStats();
    expect(stats2.queryMetadata.total).toBe(2);
    expect(stats2.queryMetadata.complete).toBe(1);
    expect(stats2.queryMetadata.partial).toBe(1);
  });

  it('should work with other cache implementations (memory fallback)', async () => {
    // Import MemoryCacheMap for comparison
    const { MemoryCacheMap } = await import('../../../src/memory/MemoryCacheMap');
    
    // Create a memory-backed two-layer cache (no persistence)
    const memoryCache = new MemoryCacheMap<TestItem, 'test'>(types);
    const cache = new TwoLayerCacheMap(memoryCache, {
      itemTTL: 3600,
      queryTTL: 300,
      facetTTL: 60,
      debug: false
    });

    // Set some items
    const item1: TestItem = { key: { kt: 'test', pk: '1' }, name: 'Item 1', value: 100 };
    await cache.set(item1.key, item1);

    // Store a query result
    const queryHash = 'all:locations:[]|query:{}';
    await cache.setQueryResult(queryHash, [item1.key]);

    // Verify query is cached
    const result1 = await cache.getQueryResult(queryHash);
    expect(result1).toHaveLength(1);

    // Create a new cache instance (simulating reload with memory cache)
    const memoryCache2 = new MemoryCacheMap<TestItem, 'test'>(types);
    const cache2 = new TwoLayerCacheMap(memoryCache2, {
      itemTTL: 3600,
      queryTTL: 300,
      facetTTL: 60,
      debug: false
    });

    // With memory cache, query should NOT be available (not persisted)
    const result2 = await cache2.getQueryResult(queryHash);
    expect(result2).toBeNull();
  });
});

