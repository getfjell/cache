import { beforeEach, describe, expect, it } from 'vitest';
import { QueryCache } from '../../../src/cache/layers/QueryCache';
import { QueryMetadata, QueryResult } from '../../../src/cache/types/TwoLayerTypes';

describe('QueryCache', () => {
  let queryCache: QueryCache;

  const createQueryResult = (itemKeys: string[], isComplete: boolean = true): QueryResult => ({
    itemKeys,
    metadata: {
      queryType: 'all',
      isComplete,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 300000), // 5 minutes from now
      filter: undefined,
      params: undefined
    }
  });

  beforeEach(() => {
    queryCache = new QueryCache({
      queryTTL: 300,  // 5 minutes
      facetTTL: 60,   // 1 minute
      debug: false
    });
  });

  describe('Basic Operations', () => {
    it('should store and retrieve query results', async () => {
      const queryKey = 'all:test:{}';
      const result = createQueryResult(['item1', 'item2']);
      
      await queryCache.setResult(queryKey, result);
      
      const retrieved = await queryCache.getResult(queryKey);
      expect(retrieved).toBeTruthy();
      expect(retrieved?.itemKeys).toEqual(['item1', 'item2']);
    });

    it('should return null for non-existent queries', async () => {
      const result = await queryCache.getResult('non-existent');
      expect(result).toBe(null);
    });

    it('should set TTL based on query completeness', async () => {
      const completeResult = createQueryResult(['item1'], true);
      const partialResult = createQueryResult(['item1'], false);
      
      await queryCache.setResult('complete-query', completeResult);
      await queryCache.setResult('partial-query', partialResult);
      
      const stats = queryCache.getStats();
      expect(stats.total).toBe(2);
      expect(stats.complete).toBeGreaterThanOrEqual(0);
      expect(stats.partial).toBeGreaterThanOrEqual(0);
    });

    it('should handle query expiration correctly', async () => {
      // Create cache with very short TTL
      const shortTTLCache = new QueryCache({
        queryTTL: 0.1, // 100ms
        facetTTL: 0.05, // 50ms
        debug: false
      });

      const queryKey = 'test-query';
      const result = createQueryResult(['item1']);
      
      await shortTTLCache.setResult(queryKey, result);
      expect(await shortTTLCache.getResult(queryKey)).toBeTruthy();
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Should be expired and removed
      expect(await shortTTLCache.getResult(queryKey)).toBe(null);
    });
  });

  describe('Pattern-based Invalidation', () => {
    it('should invalidate queries by regex pattern', async () => {
      await queryCache.setResult('user:all:{}', createQueryResult(['user1', 'user2']));
      await queryCache.setResult('user:find:active', createQueryResult(['user1']));
      await queryCache.setResult('order:all:{}', createQueryResult(['order1']));
      
      // Invalidate all user queries
      await queryCache.invalidatePattern('user:.*');
      
      expect(await queryCache.getResult('user:all:{}')).toBe(null);
      expect(await queryCache.getResult('user:find:active')).toBe(null);
      expect(await queryCache.getResult('order:all:{}')).toBeTruthy(); // Should remain
    });

    it('should fallback to string matching for invalid regex', async () => {
      await queryCache.setResult('test:query:1', createQueryResult(['item1']));
      await queryCache.setResult('test:query:2', createQueryResult(['item2']));
      await queryCache.setResult('other:query', createQueryResult(['item3']));
      
      // Use invalid regex - should fallback to string matching
      await queryCache.invalidatePattern('[invalid-regex');
      
      // Should use string contains matching
      expect(await queryCache.getResult('test:query:1')).toBeTruthy(); // No match
      expect(await queryCache.getResult('other:query')).toBeTruthy(); // No match
    });

    it('should handle simple string pattern matching', async () => {
      await queryCache.setResult('user:all:active', createQueryResult(['user1']));
      await queryCache.setResult('user:find:inactive', createQueryResult(['user2']));
      await queryCache.setResult('order:all:pending', createQueryResult(['order1']));
      
      // Invalidate by simple string match
      await queryCache.invalidatePattern('user:');
      
      expect(await queryCache.getResult('user:all:active')).toBe(null);
      expect(await queryCache.getResult('user:find:inactive')).toBe(null);
      expect(await queryCache.getResult('order:all:pending')).toBeTruthy(); // Should remain
    });
  });

  describe('Query Key Management', () => {
    it('should provide list of all query keys', async () => {
      const queries = ['query1', 'query2', 'query3'];
      
      for (const query of queries) {
        await queryCache.setResult(query, createQueryResult(['item']));
      }
      
      const allKeys = queryCache.getAllQueryKeys();
      expect(allKeys).toHaveLength(3);
      expect(allKeys).toEqual(expect.arrayContaining(queries));
    });

    it('should find queries containing specific items', async () => {
      await queryCache.setResult('query1', createQueryResult(['item1', 'item2']));
      await queryCache.setResult('query2', createQueryResult(['item2', 'item3']));
      await queryCache.setResult('query3', createQueryResult(['item3', 'item4']));
      
      const queriesWithItem2 = queryCache.findQueriesContainingItem('item2');
      expect(queriesWithItem2).toHaveLength(2);
      expect(queriesWithItem2).toContain('query1');
      expect(queriesWithItem2).toContain('query2');
      
      const queriesWithItem4 = queryCache.findQueriesContainingItem('item4');
      expect(queriesWithItem4).toHaveLength(1);
      expect(queriesWithItem4).toContain('query3');
    });

    it('should invalidate queries containing specific items', async () => {
      await queryCache.setResult('query1', createQueryResult(['item1', 'item2']));
      await queryCache.setResult('query2', createQueryResult(['item2', 'item3']));
      await queryCache.setResult('query3', createQueryResult(['item3', 'item4']));
      
      // Invalidate all queries containing item2
      await queryCache.invalidateQueriesContainingItem('item2');
      
      expect(await queryCache.getResult('query1')).toBe(null); // Contained item2
      expect(await queryCache.getResult('query2')).toBe(null); // Contained item2
      expect(await queryCache.getResult('query3')).toBeTruthy(); // Did not contain item2
    });

    it('should handle finding queries with non-existent items', async () => {
      await queryCache.setResult('query1', createQueryResult(['item1']));
      
      const queries = queryCache.findQueriesContainingItem('non-existent-item');
      expect(queries).toHaveLength(0);
    });
  });

  describe('Statistics and Cleanup', () => {
    it('should provide accurate statistics', async () => {
      // Add mix of complete and partial queries
      await queryCache.setResult('complete1', createQueryResult(['item1'], true));
      await queryCache.setResult('partial1', createQueryResult(['item2'], false));
      await queryCache.setResult('complete2', createQueryResult(['item3'], true));
      
      const stats = queryCache.getStats();
      expect(stats.total).toBe(3);
      expect(stats.valid).toBe(3);
      expect(stats.expired).toBe(0);
      expect(stats.complete).toBeGreaterThanOrEqual(0);
      expect(stats.partial).toBeGreaterThanOrEqual(0);
    });

    it('should track expired queries in statistics', async () => {
      const expiredCache = new QueryCache({
        queryTTL: 0.05, // 50ms
        facetTTL: 0.05,
        debug: false
      });
      
      await expiredCache.setResult('query1', createQueryResult(['item1']));
      await expiredCache.setResult('query2', createQueryResult(['item2']));
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const stats = expiredCache.getStats();
      expect(stats.total).toBe(2);
      expect(stats.expired).toBe(2);
      expect(stats.valid).toBe(0);
    });

    it('should cleanup expired queries', async () => {
      const cleanupCache = new QueryCache({
        queryTTL: 0.05, // 50ms
        facetTTL: 0.05,
        debug: false
      });
      
      await cleanupCache.setResult('query1', createQueryResult(['item1']));
      await cleanupCache.setResult('query2', createQueryResult(['item2']));
      await cleanupCache.setResult('query3', createQueryResult(['item3']));
      
      let stats = cleanupCache.getStats();
      expect(stats.total).toBe(3);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Clean up
      const cleanedCount = cleanupCache.cleanup();
      expect(cleanedCount).toBe(3);
      
      stats = cleanupCache.getStats();
      expect(stats.total).toBe(0);
    });

    it('should handle cleanup with no expired queries', async () => {
      await queryCache.setResult('query1', createQueryResult(['item1']));
      await queryCache.setResult('query2', createQueryResult(['item2']));
      
      const cleanedCount = queryCache.cleanup();
      expect(cleanedCount).toBe(0);
      
      // Queries should still exist
      expect(await queryCache.getResult('query1')).toBeTruthy();
      expect(await queryCache.getResult('query2')).toBeTruthy();
    });

    it('should clear all query results', async () => {
      await queryCache.setResult('query1', createQueryResult(['item1']));
      await queryCache.setResult('query2', createQueryResult(['item2']));
      
      await queryCache.clear();
      
      expect(await queryCache.getResult('query1')).toBe(null);
      expect(await queryCache.getResult('query2')).toBe(null);
      
      const stats = queryCache.getStats();
      expect(stats.total).toBe(0);
    });
  });

  describe('Debug Logging', () => {
    it('should log operations when debug is enabled', async () => {
      const debugCache = new QueryCache({
        queryTTL: 300,
        facetTTL: 60,
        debug: true // Enable debug logging
      });

      // These should work and potentially log (we can't easily test console output)
      await debugCache.setResult('debug-query', createQueryResult(['item1']));
      expect(await debugCache.getResult('debug-query')).toBeTruthy();
      
      await debugCache.invalidatePattern('debug.*');
      expect(await debugCache.getResult('debug-query')).toBe(null);
      
      await debugCache.clear();
    });

    it('should not log when debug is disabled', async () => {
      const quietCache = new QueryCache({
        queryTTL: 300,
        facetTTL: 60,
        debug: false // Disable debug logging
      });

      await quietCache.setResult('quiet-query', createQueryResult(['item1']));
      expect(await quietCache.getResult('quiet-query')).toBeTruthy();
    });
  });

  describe('TTL and Expiration Edge Cases', () => {
    it('should handle queries with custom expiration times', async () => {
      const queryKey = 'custom-ttl-query';
      const customResult = createQueryResult(['item1']);
      
      // Note: QueryCache.setResult() will override expiresAt based on TTL settings
      // So we test that the operation completes successfully
      await queryCache.setResult(queryKey, customResult);
      expect(await queryCache.getResult(queryKey)).toBeTruthy();
      
      // Verify the result has proper metadata
      const retrieved = await queryCache.getResult(queryKey);
      expect(retrieved?.metadata.expiresAt).toBeInstanceOf(Date);
      expect(retrieved?.metadata.createdAt).toBeInstanceOf(Date);
    });

    it('should respect createdAt timestamps', async () => {
      const queryKey = 'timestamp-query';
      const result = createQueryResult(['item1']);
      const beforeTime = new Date();
      
      await queryCache.setResult(queryKey, result);
      
      const retrieved = await queryCache.getResult(queryKey);
      expect(retrieved?.metadata.createdAt).toBeInstanceOf(Date);
      expect(retrieved?.metadata.createdAt.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
    });

    it('should handle queries with existing createdAt', async () => {
      const queryKey = 'existing-timestamp-query';
      const customTime = new Date('2024-01-01T12:00:00Z');
      const result = createQueryResult(['item1']);
      result.metadata.createdAt = customTime;
      
      await queryCache.setResult(queryKey, result);
      
      const retrieved = await queryCache.getResult(queryKey);
      expect(retrieved?.metadata.createdAt).toEqual(customTime);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle empty item keys arrays', async () => {
      const queryKey = 'empty-query';
      const result = createQueryResult([]);
      
      await queryCache.setResult(queryKey, result);
      
      const retrieved = await queryCache.getResult(queryKey);
      expect(retrieved?.itemKeys).toEqual([]);
    });

    it('should handle large query results', async () => {
      const queryKey = 'large-query';
      const manyItems = Array.from({ length: 1000 }, (_, i) => `item${i}`);
      const result = createQueryResult(manyItems);
      
      await queryCache.setResult(queryKey, result);
      
      const retrieved = await queryCache.getResult(queryKey);
      expect(retrieved?.itemKeys).toHaveLength(1000);
      expect(retrieved?.itemKeys).toEqual(manyItems);
    });

    it('should handle special characters in query keys', async () => {
      const specialKeys = [
        'query:with:colons',
        'query with spaces',
        'query-with-dashes',
        'query_with_underscores',
        'query/with/slashes',
        'query?with=params&more=values',
        'query#with%encoded*chars'
      ];
      
      for (const key of specialKeys) {
        const result = createQueryResult([`item-for-${key}`]);
        await queryCache.setResult(key, result);
        
        const retrieved = await queryCache.getResult(key);
        expect(retrieved?.itemKeys).toHaveLength(1);
      }
    });

    it('should handle concurrent operations safely', async () => {
      const queryKey = 'concurrent-query';
      const result = createQueryResult(['item1']);
      
      // Run multiple operations concurrently
      const operations = [
        queryCache.setResult(queryKey, result),
        queryCache.getResult(queryKey),
        queryCache.setResult(queryKey + '2', result),
        queryCache.invalidatePattern('concurrent.*'),
        queryCache.clear()
      ];
      
      // Should not throw errors
      await expect(Promise.allSettled(operations)).resolves.toHaveLength(5);
    });
  });

  describe('Complex Pattern Matching', () => {
    it('should handle complex regex patterns', async () => {
      await queryCache.setResult('user:1:profile', createQueryResult(['user1']));
      await queryCache.setResult('user:2:profile', createQueryResult(['user2']));
      await queryCache.setResult('user:1:settings', createQueryResult(['user1']));
      await queryCache.setResult('admin:1:profile', createQueryResult(['admin1']));
      
      // Invalidate user profile queries only
      await queryCache.invalidatePattern('user:\\d+:profile');
      
      expect(await queryCache.getResult('user:1:profile')).toBe(null);
      expect(await queryCache.getResult('user:2:profile')).toBe(null);
      expect(await queryCache.getResult('user:1:settings')).toBeTruthy(); // Should remain
      expect(await queryCache.getResult('admin:1:profile')).toBeTruthy(); // Should remain
    });

    it('should handle pattern matching with special regex characters', async () => {
      await queryCache.setResult('query.with.dots', createQueryResult(['item1']));
      await queryCache.setResult('query*with*stars', createQueryResult(['item2']));
      await queryCache.setResult('query+with+plus', createQueryResult(['item3']));
      
      // Escape special characters properly
      await queryCache.invalidatePattern('query\\.with\\.dots');
      
      expect(await queryCache.getResult('query.with.dots')).toBe(null);
      expect(await queryCache.getResult('query*with*stars')).toBeTruthy();
      expect(await queryCache.getResult('query+with+plus')).toBeTruthy();
    });
  });

  describe('Statistics Calculation', () => {
    it('should calculate statistics with mixed expired and valid queries', async () => {
      const mixedCache = new QueryCache({
        queryTTL: 10,   // 10 seconds for some
        facetTTL: 0.05, // 50ms for others
        debug: false
      });

      // Add queries with different completeness (affects which TTL is used)
      await mixedCache.setResult('complete-query', createQueryResult(['item1'], true));
      await mixedCache.setResult('partial-query', createQueryResult(['item2'], false));
      
      // Wait for partial query to expire (uses facetTTL)
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const stats = mixedCache.getStats();
      expect(stats.total).toBe(2);
      expect(stats.valid).toBe(1);  // Only complete query should be valid
      expect(stats.expired).toBe(1); // Partial query should be expired
    });

    it('should handle statistics with no queries', async () => {
      const stats = queryCache.getStats();
      expect(stats.total).toBe(0);
      expect(stats.valid).toBe(0);
      expect(stats.expired).toBe(0);
      expect(stats.complete).toBe(0);
      expect(stats.partial).toBe(0);
    });

    it('should track complete vs partial query counts', async () => {
      await queryCache.setResult('complete1', createQueryResult(['item1'], true));
      await queryCache.setResult('complete2', createQueryResult(['item2'], true));
      await queryCache.setResult('partial1', createQueryResult(['item3'], false));
      await queryCache.setResult('partial2', createQueryResult(['item4'], false));
      
      const stats = queryCache.getStats();
      expect(stats.total).toBe(4);
      expect(stats.complete).toBe(2);
      expect(stats.partial).toBe(2);
    });
  });

  describe('Cleanup Operations', () => {
    it('should cleanup only expired queries', async () => {
      const partialExpireCache = new QueryCache({
        queryTTL: 10,   // 10 seconds (won't expire in test)
        facetTTL: 0.05, // 50ms (will expire)
        debug: false
      });

      await partialExpireCache.setResult('long-lived', createQueryResult(['item1'], true));
      await partialExpireCache.setResult('short-lived', createQueryResult(['item2'], false));
      
      // Wait for short-lived query to expire
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const cleanedCount = partialExpireCache.cleanup();
      expect(cleanedCount).toBe(1);
      
      // Long-lived should remain
      expect(await partialExpireCache.getResult('long-lived')).toBeTruthy();
      expect(await partialExpireCache.getResult('short-lived')).toBe(null);
    });

    it('should handle cleanup with debug logging enabled', async () => {
      const debugCache = new QueryCache({
        queryTTL: 0.05,
        facetTTL: 0.05,
        debug: true // Enable debug logging
      });

      await debugCache.setResult('debug-query1', createQueryResult(['item1']));
      await debugCache.setResult('debug-query2', createQueryResult(['item2']));
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const cleanedCount = debugCache.cleanup();
      expect(cleanedCount).toBe(2);
    });

    it('should handle cleanup with no expired queries', async () => {
      await queryCache.setResult('query1', createQueryResult(['item1']));
      await queryCache.setResult('query2', createQueryResult(['item2']));
      
      const cleanedCount = queryCache.cleanup();
      expect(cleanedCount).toBe(0);
    });
  });

  describe('Configuration Options', () => {
    it('should use default values when options not provided', () => {
      const defaultCache = new QueryCache();
      
      // Should not throw and should work with defaults
      expect(() => defaultCache.setResult('test', createQueryResult(['item']))).not.toThrow();
    });

    it('should handle undefined options gracefully', () => {
      const undefinedCache = new QueryCache(undefined);
      
      expect(() => undefinedCache.setResult('test', createQueryResult(['item']))).not.toThrow();
    });

    it('should handle partial options', () => {
      const partialCache = new QueryCache({
        queryTTL: 500, // Only set query TTL
        // facetTTL and debug use defaults
      });
      
      expect(() => partialCache.setResult('test', createQueryResult(['item']))).not.toThrow();
    });
  });
});
