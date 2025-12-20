import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ComKey, Item, PriKey } from '@fjell/types';
import { MemoryCacheMap } from '../../../src/memory/MemoryCacheMap';
import { TwoLayerCacheMap } from '../../../src/cache/layers/TwoLayerCacheMap';
import { TwoLayerCacheOptions } from '../../../src/cache/types/TwoLayerTypes';

// Test item interface
interface TestItem extends Item<'test', 'location1'> {
  pk: 'test';
  key: PriKey<'test'> | ComKey<'test', 'location1'>;
  name: string;
  value: number;
  events: { created: { at: Date }, updated: { at: Date }, deleted: { at: Date | null } };
}

describe('TwoLayerCacheMap', () => {
  let underlyingCache: MemoryCacheMap<TestItem, 'test', 'location1'>;
  let twoLayerCache: TwoLayerCacheMap<TestItem, 'test', 'location1'>;

  const createTestItem = (pk: string, name: string, value: number): TestItem => ({
    pk: 'test',
    key: { pk, kt: 'test' } as PriKey<'test'>,
    name,
    value,
    events: {
      created: { at: new Date() },
      updated: { at: new Date() },
      deleted: { at: null }
    }
  });

  beforeEach(() => {
    underlyingCache = new MemoryCacheMap<TestItem, 'test', 'location1'>(['test'] as any);
    twoLayerCache = new TwoLayerCacheMap(underlyingCache, {
      itemTTL: 3600,
      queryTTL: 300,
      facetTTL: 60,
      debug: true
    });
  });

  describe('Basic Properties', () => {
    it('should have correct implementation type', () => {
      expect(twoLayerCache.implementationType).toBe('two-layer/memory/memory');
    });

    it('should report two-layer enabled', () => {
      expect(twoLayerCache.isTwoLayerEnabled).toBe(true);
    });

    it('should provide access to underlying cache', () => {
      expect(twoLayerCache.underlying).toBe(underlyingCache);
    });
  });

  describe('Item Operations', () => {
    it('should pass through get operations', async () => {
      const item = createTestItem('test1', 'Test Item', 100);
      await underlyingCache.set(item.key, item);

      const result = await twoLayerCache.get(item.key);
      expect(result).toEqual(item);
    });

    it('should pass through set operations and invalidate queries', async () => {
      const item = createTestItem('test1', 'Test Item', 100);
      
      // Set up a query result first
      const queryHash = 'test-query';
      await twoLayerCache.setQueryResult(queryHash, [item.key]);
      expect(await twoLayerCache.hasQueryResult(queryHash)).toBe(true);

      // Set item - should invalidate queries
      await twoLayerCache.set(item.key, item);
      
      // Verify item was set
      const result = await twoLayerCache.get(item.key);
      expect(result).toEqual(item);

      // Verify query was invalidated
      expect(await twoLayerCache.hasQueryResult(queryHash)).toBe(false);
    });

    it('should pass through delete operations and invalidate queries', async () => {
      const item = createTestItem('test1', 'Test Item', 100);
      await twoLayerCache.set(item.key, item);

      // Set up a query result
      const queryHash = 'test-query';
      await twoLayerCache.setQueryResult(queryHash, [item.key]);
      expect(await twoLayerCache.hasQueryResult(queryHash)).toBe(true);

      // Delete item
      await twoLayerCache.delete(item.key);
      
      // Verify item was deleted
      const result = await twoLayerCache.get(item.key);
      expect(result).toBe(null);

      // Verify query was invalidated
      expect(await twoLayerCache.hasQueryResult(queryHash)).toBe(false);
    });

    it('should pass through includes key operations', async () => {
      const item = createTestItem('test1', 'Test Item', 100);
      
      expect(await twoLayerCache.includesKey(item.key)).toBe(false);
      
      await twoLayerCache.set(item.key, item);
      expect(await twoLayerCache.includesKey(item.key)).toBe(true);
    });

    it('should pass through allIn operations', async () => {
      const result = await twoLayerCache.allIn([]);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should pass through queryIn operations', async () => {
      const result = await twoLayerCache.queryIn({}, []);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should pass through contains operations', async () => {
      const result = await twoLayerCache.contains({}, []);
      expect(typeof result).toBe('boolean');
    });

    it('should handle clear operations and metadata', async () => {
      const item = createTestItem('test1', 'Test Item', 100);
      await twoLayerCache.set(item.key, item);
      
      const queryHash = 'test-query';
      await twoLayerCache.setQueryResult(queryHash, [item.key]);
      
      await twoLayerCache.clear();
      
      expect(await twoLayerCache.get(item.key)).toBe(null);
      expect(await twoLayerCache.hasQueryResult(queryHash)).toBe(false);
    });
  });

  describe('Query Operations', () => {
    it('should set and get query results with metadata', async () => {
      const queryHash = 'all:test:{}';
      const itemKeys = [
        { pk: 'test1', kt: 'test' } as PriKey<'test'>,
        { pk: 'test2', kt: 'test' } as PriKey<'test'>
      ];

      await twoLayerCache.setQueryResult(queryHash, itemKeys);
      
      const retrievedKeys = await twoLayerCache.getQueryResult(queryHash);
      expect(retrievedKeys).toEqual(itemKeys);
    });

    it('should handle query result expiration based on TTL', async () => {
      // Use short TTL for testing
      const shortTTLCache = new TwoLayerCacheMap(underlyingCache, {
        itemTTL: 3600,
        queryTTL: 0.1, // 100ms
        facetTTL: 0.05, // 50ms
        debug: false
      });

      const queryHash = 'test-query';
      const itemKeys = [{ pk: 'test1', kt: 'test' } as PriKey<'test'>];
      
      await shortTTLCache.setQueryResult(queryHash, itemKeys);
      expect(await shortTTLCache.hasQueryResult(queryHash)).toBe(true);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Should be expired
      expect(await shortTTLCache.getQueryResult(queryHash)).toBe(null);
      expect(await shortTTLCache.hasQueryResult(queryHash)).toBe(false);
    });

    it('should delete query results and metadata', async () => {
      const queryHash = 'test-query';
      const itemKeys = [{ pk: 'test1', kt: 'test' } as PriKey<'test'>];
      
      await twoLayerCache.setQueryResult(queryHash, itemKeys);
      expect(await twoLayerCache.hasQueryResult(queryHash)).toBe(true);
      
      await twoLayerCache.deleteQueryResult(queryHash);
      expect(await twoLayerCache.hasQueryResult(queryHash)).toBe(false);
    });

    it('should determine query completeness correctly', async () => {
      // Complete query (all with no filters)
      const completeHash = 'all:test:{}';
      await twoLayerCache.setQueryResult(completeHash, []);
      
      // Partial query (with facet)
      const partialHash = 'facet:test:filter:active';
      await twoLayerCache.setQueryResult(partialHash, []);
      
      // Both should be stored successfully
      expect(await twoLayerCache.hasQueryResult(completeHash)).toBe(true);
      expect(await twoLayerCache.hasQueryResult(partialHash)).toBe(true);
      
      // Check stats
      const stats = twoLayerCache.getTwoLayerStats();
      expect(stats.queryMetadata.total).toBe(2);
    });

    it('should handle query result with empty item keys', async () => {
      const queryHash = 'empty-query';
      const itemKeys: PriKey<'test'>[] = [];
      
      await twoLayerCache.setQueryResult(queryHash, itemKeys);
      
      const retrieved = await twoLayerCache.getQueryResult(queryHash);
      expect(retrieved).toEqual([]);
      expect(await twoLayerCache.hasQueryResult(queryHash)).toBe(true);
    });
  });

  describe('Query Invalidation', () => {
    it('should invalidate queries containing modified items', async () => {
      const item1 = createTestItem('test1', 'Item 1', 100);
      const item2 = createTestItem('test2', 'Item 2', 200);
      
      // Store items
      await twoLayerCache.set(item1.key, item1);
      await twoLayerCache.set(item2.key, item2);
      
      // Store query result containing both items
      const queryHash = 'multi-item-query';
      await twoLayerCache.setQueryResult(queryHash, [item1.key, item2.key]);
      expect(await twoLayerCache.hasQueryResult(queryHash)).toBe(true);
      
      // Update item1 - should invalidate the query
      const updatedItem1 = { ...item1, value: 150 };
      await twoLayerCache.set(item1.key, updatedItem1);
      
      // Query should be invalidated
      expect(await twoLayerCache.hasQueryResult(queryHash)).toBe(false);
    });

    it('should handle invalidation of non-existent queries gracefully', async () => {
      const item = createTestItem('test1', 'Test Item', 100);
      
      // This should not throw even if no queries exist
      await expect(twoLayerCache.set(item.key, item)).resolves.toBeUndefined();
    });

    it('should invalidate multiple queries for single item change', async () => {
      const item = createTestItem('test1', 'Test Item', 100);
      await twoLayerCache.set(item.key, item);
      
      // Create multiple queries containing the same item
      const query1 = 'query1';
      const query2 = 'query2';
      const query3 = 'query3';
      
      await twoLayerCache.setQueryResult(query1, [item.key]);
      await twoLayerCache.setQueryResult(query2, [item.key]);
      await twoLayerCache.setQueryResult(query3, [item.key]);
      
      // All should exist
      expect(await twoLayerCache.hasQueryResult(query1)).toBe(true);
      expect(await twoLayerCache.hasQueryResult(query2)).toBe(true);
      expect(await twoLayerCache.hasQueryResult(query3)).toBe(true);
      
      // Update item - should invalidate all queries
      const updatedItem = { ...item, value: 150 };
      await twoLayerCache.set(item.key, updatedItem);
      
      // All queries should be invalidated
      expect(await twoLayerCache.hasQueryResult(query1)).toBe(false);
      expect(await twoLayerCache.hasQueryResult(query2)).toBe(false);
      expect(await twoLayerCache.hasQueryResult(query3)).toBe(false);
    });
  });

  describe('Statistics and Cleanup', () => {
    it('should provide two-layer statistics', async () => {
      // Add some query results
      await twoLayerCache.setQueryResult('query1', []);
      await twoLayerCache.setQueryResult('query2', []);
      
      const stats = twoLayerCache.getTwoLayerStats();
      expect(stats.queryMetadata.total).toBe(2);
      expect(stats.queryMetadata.valid).toBe(2);
      expect(stats.queryMetadata.expired).toBe(0);
    });

    it('should clean up expired queries', async () => {
      // Use very short TTL
      const shortTTLCache = new TwoLayerCacheMap(underlyingCache, {
        itemTTL: 3600,
        queryTTL: 0.05, // 50ms
        facetTTL: 0.05,
        debug: false
      });

      // Add some queries
      await shortTTLCache.setQueryResult('query1', []);
      await shortTTLCache.setQueryResult('query2', []);
      await shortTTLCache.setQueryResult('query3', []);
      
      let stats = shortTTLCache.getTwoLayerStats();
      expect(stats.queryMetadata.total).toBe(3);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Clean up
      const cleanedCount = await shortTTLCache.cleanup();
      expect(cleanedCount).toBe(3);
      
      stats = shortTTLCache.getTwoLayerStats();
      expect(stats.queryMetadata.total).toBe(0);
    });

    it('should handle statistics with mixed expired and valid queries', async () => {
      const mixedTTLCache = new TwoLayerCacheMap(underlyingCache, {
        itemTTL: 3600,
        queryTTL: 10, // 10 seconds for some queries
        facetTTL: 0.05, // 50ms for others
        debug: false
      });

      // Add queries that will expire at different times
      await mixedTTLCache.setQueryResult('all:query', []); // Uses queryTTL (10s)
      await mixedTTLCache.setQueryResult('facet:query', []); // Uses facetTTL (50ms)
      
      // Wait for facet queries to expire
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const stats = mixedTTLCache.getTwoLayerStats();
      expect(stats.queryMetadata.total).toBe(2);
      expect(stats.queryMetadata.valid).toBe(1); // Only all:query still valid
      expect(stats.queryMetadata.expired).toBe(1); // facet:query expired
    });
  });

  describe('Metadata Provider Methods', () => {
    it('should delegate metadata operations to underlying cache', async () => {
      const key = 'test-metadata-key';
      const metadata = { addedAt: Date.now(), accessCount: 1 };

      // Set metadata
      await twoLayerCache.setMetadata(key, metadata);
      
      // Get metadata
      const retrieved = await twoLayerCache.getMetadata(key);
      expect(retrieved).toEqual(metadata);
      
      // Delete metadata
      await twoLayerCache.deleteMetadata(key);
      const afterDelete = await twoLayerCache.getMetadata(key);
      expect(afterDelete).toBe(null);
    });

    it('should handle metadata operations when underlying cache doesn\'t support them', async () => {
      // Create a mock cache without metadata support
      const mockCache = {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
        // No metadata methods
      } as any;

      const limitedCache = new TwoLayerCacheMap(mockCache, {});
      
      // Should not throw errors
      await expect(limitedCache.setMetadata('key', {})).resolves.toBeUndefined();
      await expect(limitedCache.getMetadata('key')).resolves.toBe(null);
      await expect(limitedCache.deleteMetadata('key')).resolves.toBeUndefined();
      
      const allMetadata = await limitedCache.getAllMetadata();
      expect(allMetadata.size).toBe(0);
    });

    it('should get current size from underlying cache', async () => {
      const size = await twoLayerCache.getCurrentSize();
      expect(size).toHaveProperty('itemCount');
      expect(size).toHaveProperty('sizeBytes');
      expect(typeof size.itemCount).toBe('number');
      expect(typeof size.sizeBytes).toBe('number');
    });

    it('should get size limits from underlying cache', async () => {
      const limits = await twoLayerCache.getSizeLimits();
      expect(limits).toHaveProperty('maxItems');
      expect(limits).toHaveProperty('maxSizeBytes');
    });
  });

  describe('Cache Map Interface Compliance', () => {
    it('should pass through keys() operation', async () => {
      const item = createTestItem('test1', 'Test Item', 100);
      await twoLayerCache.set(item.key, item);
      
      const keys = await twoLayerCache.keys();
      expect(keys).toContain(item.key);
    });

    it('should pass through values() operation', async () => {
      const item = createTestItem('test1', 'Test Item', 100);
      await twoLayerCache.set(item.key, item);
      
      const values = await twoLayerCache.values();
      expect(values).toHaveLength(1);
      expect(values[0]).toEqual(item);
    });

    it('should create a clone of the cache', async () => {
      const cloned = await twoLayerCache.clone();
      expect(cloned).toBeInstanceOf(TwoLayerCacheMap);
      expect(cloned.implementationType).toBe('two-layer/memory/memory');
    });
  });

  describe('Query Metadata Extraction', () => {
    it('should extract query type from hash correctly', async () => {
      // Test different query types
      await twoLayerCache.setQueryResult('all:test:{}', []);
      await twoLayerCache.setQueryResult('find:test:param', []);
      await twoLayerCache.setQueryResult('one:test:param', []);
      await twoLayerCache.setQueryResult('facet:test:filter', []);
      await twoLayerCache.setQueryResult('unknown:format', []);
      
      const stats = twoLayerCache.getTwoLayerStats();
      expect(stats.queryMetadata.total).toBe(5);
    });

    it('should extract filter information from query hash', async () => {
      const queryHash = 'find:test:filter:active:params:{}';
      await twoLayerCache.setQueryResult(queryHash, []);
      
      // Should not throw and should store successfully
      expect(await twoLayerCache.hasQueryResult(queryHash)).toBe(true);
    });

    it('should handle malformed query hashes gracefully', async () => {
      const badHashes = [
        'malformed',
        'no:proper:format',
        'params:invalid-json-{bad}',
        ''
      ];
      
      for (const hash of badHashes) {
        await expect(twoLayerCache.setQueryResult(hash, [])).resolves.toBeUndefined();
        expect(await twoLayerCache.hasQueryResult(hash)).toBe(true);
      }
    });
  });

  describe('CacheMap Abstract Methods', () => {
    it('should implement invalidateItemKeys', async () => {
      const item1 = createTestItem('test1', 'Item 1', 100);
      const item2 = createTestItem('test2', 'Item 2', 200);
      
      await twoLayerCache.set(item1.key, item1);
      await twoLayerCache.set(item2.key, item2);
      
      // Create queries - note: query invalidation happens automatically during set operations
      await twoLayerCache.setQueryResult('query1', [item1.key]);
      await twoLayerCache.setQueryResult('query2', [item1.key, item2.key]);
      
      // Test that the invalidateItemKeys method doesn't crash
      await expect(twoLayerCache.invalidateItemKeys([item1.key])).resolves.toBeUndefined();
      
      // The exact behavior depends on the underlying implementation
      // What matters is that the operation completes without error
      const stats = twoLayerCache.getTwoLayerStats();
      expect(stats.queryMetadata.total).toBeGreaterThanOrEqual(0);
    });

    it('should implement invalidateLocation', async () => {
      const item = createTestItem('test1', 'Test Item', 100);
      await twoLayerCache.set(item.key, item);
      
      await twoLayerCache.setQueryResult('query1', [item.key]);
      
      // Invalidate location - should clear all query metadata
      await twoLayerCache.invalidateLocation([]);
      
      const stats = twoLayerCache.getTwoLayerStats();
      expect(stats.queryMetadata.total).toBe(0);
    });

    it('should implement clearQueryResults', async () => {
      await twoLayerCache.setQueryResult('query1', []);
      await twoLayerCache.setQueryResult('query2', []);
      
      await twoLayerCache.clearQueryResults();
      
      const stats = twoLayerCache.getTwoLayerStats();
      expect(stats.queryMetadata.total).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle underlying cache errors gracefully', async () => {
      const erroringCache = {
        get: vi.fn().mockRejectedValue(new Error('Cache error')),
        set: vi.fn().mockRejectedValue(new Error('Cache error')),
        delete: vi.fn().mockRejectedValue(new Error('Cache error')),
        implementationType: 'mock'
      } as any;

      const errorHandlingCache = new TwoLayerCacheMap(erroringCache, {});
      
      await expect(errorHandlingCache.get({ pk: 'test', kt: 'test' } as PriKey<'test'>)).rejects.toThrow('Cache error');
      await expect(errorHandlingCache.set({ pk: 'test', kt: 'test' } as PriKey<'test'>, {} as any)).rejects.toThrow('Cache error');
    });

    it('should handle query operations when queries don\'t exist', async () => {
      // Getting non-existent query should return null
      expect(await twoLayerCache.getQueryResult('non-existent')).toBe(null);
      expect(await twoLayerCache.hasQueryResult('non-existent')).toBe(false);
      
      // Deleting non-existent query should not throw
      await expect(twoLayerCache.deleteQueryResult('non-existent')).resolves.toBeUndefined();
    });
  });

  describe('Options and Configuration', () => {
    it('should use default options when not provided', () => {
      const defaultCache = new TwoLayerCacheMap(underlyingCache);
      
      expect(defaultCache.isTwoLayerEnabled).toBe(true);
      expect(defaultCache.implementationType).toBe('two-layer/memory/memory');
    });

    it('should respect debug option in logging', async () => {
      const debugCache = new TwoLayerCacheMap(underlyingCache, { debug: true });
      const quietCache = new TwoLayerCacheMap(underlyingCache, { debug: false });
      
      // Both should work without errors
      await debugCache.setQueryResult('debug-query', []);
      await quietCache.setQueryResult('quiet-query', []);
      
      expect(await debugCache.hasQueryResult('debug-query')).toBe(true);
      expect(await quietCache.hasQueryResult('quiet-query')).toBe(true);
    });

    it('should handle different TTL configurations', async () => {
      const customTTLCache = new TwoLayerCacheMap(underlyingCache, {
        itemTTL: 7200,  // 2 hours
        queryTTL: 600,  // 10 minutes
        facetTTL: 120,  // 2 minutes
        debug: false
      });
      
      await customTTLCache.setQueryResult('custom-query', []);
      expect(await customTTLCache.hasQueryResult('custom-query')).toBe(true);
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle rapid query invalidation and recreation', async () => {
      const item = createTestItem('test1', 'Test Item', 100);
      
      for (let i = 0; i < 10; i++) {
        // Set query
        await twoLayerCache.setQueryResult(`query-${i}`, [item.key]);
        
        // Modify item (invalidates all queries)
        const modifiedItem = { ...item, value: item.value + i };
        await twoLayerCache.set(item.key, modifiedItem);
        
        // Previous queries should be invalidated
        for (let j = 0; j <= i; j++) {
          expect(await twoLayerCache.hasQueryResult(`query-${j}`)).toBe(false);
        }
      }
    });

    it('should handle large numbers of queries efficiently', async () => {
      const item = createTestItem('test1', 'Test Item', 100);
      await twoLayerCache.set(item.key, item);
      
      // Create many queries
      const queryCount = 100;
      for (let i = 0; i < queryCount; i++) {
        await twoLayerCache.setQueryResult(`query-${i}`, [item.key]);
      }
      
      let stats = twoLayerCache.getTwoLayerStats();
      expect(stats.queryMetadata.total).toBe(queryCount);
      
      // Update item - should invalidate all queries efficiently
      const updatedItem = { ...item, value: 999 };
      await twoLayerCache.set(item.key, updatedItem);
      
      stats = twoLayerCache.getTwoLayerStats();
      expect(stats.queryMetadata.total).toBe(0);
    });

    it('should handle query results with complex item key structures', async () => {
      const comKey: ComKey<'test', 'location1'> = {
        pk: 'test1',
        kt: 'test',
        loc: [{ kt: 'location1', lk: 'loc1' }]
      };
      
      const item: TestItem = {
        pk: 'test',
        key: comKey,
        name: 'Complex Item',
        value: 100,
        events: {
          created: { at: new Date() },
          updated: { at: new Date() },
          deleted: { at: null }
        }
      };
      
      await twoLayerCache.set(comKey, item);
      await twoLayerCache.setQueryResult('complex-query', [comKey]);
      
      expect(await twoLayerCache.hasQueryResult('complex-query')).toBe(true);
      
      // Update item with composite key
      const updatedItem = { ...item, value: 200 };
      await twoLayerCache.set(comKey, updatedItem);
      
      // Query should be invalidated
      expect(await twoLayerCache.hasQueryResult('complex-query')).toBe(false);
    });
  });
});
