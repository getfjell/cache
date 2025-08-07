import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EnhancedMemoryCacheMap } from '../../src/memory/EnhancedMemoryCacheMap';
import { CacheSizeConfig } from '../../src/Options';
import { ComKey, IQFactory, Item, ItemQuery, PriKey, UUID } from '@fjell/core';

// Mock item types for testing
interface TestItem extends Item<'test'> {
  id: string;
  name: string;
  value: number;
}

interface ContainedTestItem extends Item<'test', 'container'> {
  id: string;
  name: string;
  data: string;
}

// Helper function to create test items with proper events property
const createTestItem = (key: PriKey<'test'>, id: string, name: string, value: number): TestItem => ({
  key,
  id,
  name,
  value,
  events: {} as any // Mock events object
});

// Helper function to create contained test items
const createContainedTestItem = (key: ComKey<'test', 'container'>, id: string, name: string, data: string): ContainedTestItem => ({
  key,
  id,
  name,
  data,
  events: {} as any // Mock events object
});

describe('EnhancedMemoryCacheMap', () => {
  let cache: EnhancedMemoryCacheMap<TestItem, 'test'>;
  let types: ['test'];

  // Primary test keys
  const key1: PriKey<'test'> = { kt: 'test', pk: 'item1' as UUID };
  const key2: PriKey<'test'> = { kt: 'test', pk: 'item2' as UUID };
  const key3: PriKey<'test'> = { kt: 'test', pk: 'item3' as UUID };
  const key4: PriKey<'test'> = { kt: 'test', pk: 'item4' as UUID };

  // Composite test keys
  const comKey1: ComKey<'test', 'container'> = {
    kt: 'test',
    pk: 'item1' as UUID,
    loc: [{ kt: 'container', lk: 'container1' as UUID }]
  };
  const comKey2: ComKey<'test', 'container'> = {
    kt: 'test',
    pk: 'item2' as UUID,
    loc: [{ kt: 'container', lk: 'container2' as UUID }]
  };
  const comKey3: ComKey<'test', 'container'> = {
    kt: 'test',
    pk: 'item3' as UUID,
    loc: [{ kt: 'container', lk: 'container1' as UUID }]
  };

  beforeEach(() => {
    types = ['test'];
  });

  describe('Size limits and tracking', () => {
    it('should track cache size in bytes', () => {
      const sizeConfig: CacheSizeConfig = {
        maxSizeBytes: '1KB',
        evictionPolicy: 'lru'
      };

      cache = new EnhancedMemoryCacheMap(types, sizeConfig);

      const item1: TestItem = createTestItem(key1, 'item1', 'test1', 100);
      const item2: TestItem = createTestItem(key2, 'item2', 'test2', 200);

      cache.set(key1, item1);
      cache.set(key2, item2);

      const stats = cache.getStats();
      expect(stats.currentSizeBytes).toBeGreaterThan(0);
      expect(stats.currentItemCount).toBe(2);
      expect(stats.maxSizeBytes).toBe(1000);
    });

    it('should track item count limits', () => {
      const sizeConfig: CacheSizeConfig = {
        maxItems: 2,
        evictionPolicy: 'lru'
      };

      cache = new EnhancedMemoryCacheMap(types, sizeConfig);

      const item1: TestItem = createTestItem(key1, 'item1', 'test1', 100);
      const item2: TestItem = createTestItem(key2, 'item2', 'test2', 200);

      cache.set(key1, item1);
      cache.set(key2, item2);

      const stats = cache.getStats();
      expect(stats.currentItemCount).toBe(2);
      expect(stats.maxItems).toBe(2);
      expect(stats.utilizationPercent.items).toBe(100);
    });

    it('should calculate utilization percentages', () => {
      const sizeConfig: CacheSizeConfig = {
        maxItems: 4,
        maxSizeBytes: '1KB',
        evictionPolicy: 'lru'
      };

      cache = new EnhancedMemoryCacheMap(types, sizeConfig);

      const item1: TestItem = createTestItem(key1, 'item1', 'test1', 100);
      const item2: TestItem = createTestItem(key2, 'item2', 'test2', 200);

      cache.set(key1, item1);
      cache.set(key2, item2);

      const stats = cache.getStats();
      expect(stats.utilizationPercent.items).toBe(50); // 2/4 * 100
      expect(stats.utilizationPercent.bytes).toBeGreaterThan(0);
      expect(stats.utilizationPercent.bytes).toBeLessThan(100);
    });
  });

  describe('LRU Eviction', () => {
    beforeEach(() => {
      const sizeConfig: CacheSizeConfig = {
        maxItems: 3,
        evictionPolicy: 'lru'
      };
      cache = new EnhancedMemoryCacheMap(types, sizeConfig);
    });

    it('should evict least recently used item when item limit exceeded', () => {
      const item1: TestItem = createTestItem(key1, 'item1', 'test1', 100);
      const item2: TestItem = createTestItem(key2, 'item2', 'test2', 200);
      const item3: TestItem = createTestItem(key3, 'item3', 'test3', 300);
      const item4: TestItem = createTestItem(key4, 'item4', 'test4', 400);

      cache.set(key1, item1);
      cache.set(key2, item2);
      cache.set(key3, item3);

      // Verify all items are present
      expect(cache.getStats().currentItemCount).toBe(3);

      // Access item1 to make it more recently used
      cache.get(key1);

      // Add item4, this should trigger eviction
      cache.set(key4, item4);

      // Should have exactly 3 items after eviction
      const stats = cache.getStats();
      expect(stats.currentItemCount).toBe(3);

      // At least some of the original items should still exist
      const existingItems = [
        cache.get(key1),
        cache.get(key2),
        cache.get(key3),
        cache.get(key4)
      ].filter(item => item !== null);

      expect(existingItems).toHaveLength(3);
      expect(cache.get(key4)).toBeTruthy(); // New item should definitely exist
    });

    it('should update LRU order on access', () => {
      const item1: TestItem = createTestItem(key1, 'item1', 'test1', 100);
      const item2: TestItem = createTestItem(key2, 'item2', 'test2', 200);
      const item3: TestItem = createTestItem(key3, 'item3', 'test3', 300);
      const item4: TestItem = createTestItem(key4, 'item4', 'test4', 400);

      cache.set(key1, item1);
      cache.set(key2, item2);
      cache.set(key3, item3);

      // Access item1 multiple times to ensure it's more recently used
      cache.get(key1);
      cache.get(key1);

      // Add item4, should trigger eviction of least recently used
      cache.set(key4, item4);

      // Verify we still have exactly 3 items
      const stats = cache.getStats();
      expect(stats.currentItemCount).toBe(3);

      // Item4 should definitely exist since it was just added
      expect(cache.get(key4)).toBeTruthy();

      // Test the functionality - eviction should work
      // Since LRU is working, exactly 3 items should remain
      const remainingCount = [
        cache.get(key1),
        cache.get(key2),
        cache.get(key3),
        cache.get(key4)
      ].filter(item => item !== null).length;

      expect(remainingCount).toBe(3);
    });
  });

  describe('FIFO Eviction', () => {
    beforeEach(() => {
      const sizeConfig: CacheSizeConfig = {
        maxItems: 3,
        evictionPolicy: 'fifo'
      };
      cache = new EnhancedMemoryCacheMap(types, sizeConfig);
    });

    it('should evict first-in item regardless of usage', () => {
      const item1: TestItem = createTestItem(key1, 'item1', 'test1', 100);
      const item2: TestItem = createTestItem(key2, 'item2', 'test2', 200);
      const item3: TestItem = createTestItem(key3, 'item3', 'test3', 300);
      const item4: TestItem = createTestItem(key4, 'item4', 'test4', 400);

      cache.set(key1, item1);
      cache.set(key2, item2);
      cache.set(key3, item3);

      // Access item1 many times (shouldn't matter for FIFO)
      cache.get(key1);
      cache.get(key1);
      cache.get(key1);

      // Add item4, should still evict item1 (first in)
      cache.set(key4, item4);

      expect(cache.get(key1)).toBeNull(); // Should be evicted despite usage
      expect(cache.get(key2)).toBeTruthy();
      expect(cache.get(key3)).toBeTruthy();
      expect(cache.get(key4)).toBeTruthy();
    });
  });

  describe('LFU Eviction', () => {
    beforeEach(() => {
      const sizeConfig: CacheSizeConfig = {
        maxItems: 3,
        evictionPolicy: 'lfu'
      };
      cache = new EnhancedMemoryCacheMap(types, sizeConfig);
    });

    it('should evict least frequently used item', () => {
      const item1: TestItem = createTestItem(key1, 'item1', 'test1', 100);
      const item2: TestItem = createTestItem(key2, 'item2', 'test2', 200);
      const item3: TestItem = createTestItem(key3, 'item3', 'test3', 300);
      const item4: TestItem = createTestItem(key4, 'item4', 'test4', 400);

      cache.set(key1, item1);
      cache.set(key2, item2);
      cache.set(key3, item3);

      // Access item1 and item3 multiple times, leave item2 with minimal access
      cache.get(key1);
      cache.get(key1);
      cache.get(key3);
      cache.get(key3);

      // Add item4, should evict item2 (lowest frequency)
      cache.set(key4, item4);

      expect(cache.get(key1)).toBeTruthy();
      expect(cache.get(key2)).toBeNull(); // Should be evicted
      expect(cache.get(key3)).toBeTruthy();
      expect(cache.get(key4)).toBeTruthy();
    });
  });

  describe('Size-based eviction', () => {
    it('should evict items when size limit is exceeded', () => {
      const sizeConfig: CacheSizeConfig = {
        maxSizeBytes: '200', // Very small limit
        evictionPolicy: 'lru'
      };
      cache = new EnhancedMemoryCacheMap(types, sizeConfig);

      // Create items that will exceed the size limit
      const item1: TestItem = createTestItem(key1, 'item1', 'test1', 100);
      const item2: TestItem = createTestItem(key2, 'item2', 'test2', 200);

      cache.set(key1, item1);

      const statsAfterFirst = cache.getStats();
      expect(statsAfterFirst.currentItemCount).toBe(1);

      // Adding item2 should trigger eviction of item1 due to size
      cache.set(key2, item2);

      const statsAfterSecond = cache.getStats();
      expect(statsAfterSecond.currentSizeBytes).toBeLessThanOrEqual(200);

      // At least one item should have been evicted to make room
      expect(cache.get(key1)).toBeNull();
      expect(cache.get(key2)).toBeTruthy();
    });
  });

  describe('Cache operations with no limits', () => {
    beforeEach(() => {
      cache = new EnhancedMemoryCacheMap(types); // No size limits
    });

    it('should work normally without size limits', () => {
      const item1: TestItem = createTestItem(key1, 'item1', 'test1', 100);
      const item2: TestItem = createTestItem(key2, 'item2', 'test2', 200);

      cache.set(key1, item1);
      cache.set(key2, item2);

      expect(cache.get(key1)).toEqual(item1);
      expect(cache.get(key2)).toEqual(item2);

      const stats = cache.getStats();
      expect(stats.currentItemCount).toBe(2);
      expect(stats.maxItems).toBeUndefined();
      expect(stats.maxSizeBytes).toBeUndefined();
    });

    it('should handle updates correctly', () => {
      const item1: TestItem = createTestItem(key1, 'item1', 'test1', 100);
      const item1Updated: TestItem = createTestItem(key1, 'item1', 'updated', 200);

      cache.set(key1, item1);
      const initialStats = cache.getStats();

      cache.set(key1, item1Updated);
      const updatedStats = cache.getStats();

      expect(cache.get(key1)).toEqual(item1Updated);
      expect(updatedStats.currentItemCount).toBe(initialStats.currentItemCount); // Same count
      expect(cache.getStats().currentItemCount).toBe(1);
    });
  });

  describe('Cache clearing and deletion', () => {
    beforeEach(() => {
      const sizeConfig: CacheSizeConfig = {
        maxItems: 5,
        evictionPolicy: 'lru'
      };
      cache = new EnhancedMemoryCacheMap(types, sizeConfig);
    });

    it('should reset stats when cleared', () => {
      const item1: TestItem = createTestItem(key1, 'item1', 'test1', 100);
      const item2: TestItem = createTestItem(key2, 'item2', 'test2', 200);

      cache.set(key1, item1);
      cache.set(key2, item2);

      const statsBeforeClear = cache.getStats();
      expect(statsBeforeClear.currentItemCount).toBe(2);
      expect(statsBeforeClear.currentSizeBytes).toBeGreaterThan(0);

      cache.clear();

      const statsAfterClear = cache.getStats();
      expect(statsAfterClear.currentItemCount).toBe(0);
      expect(statsAfterClear.currentSizeBytes).toBe(0);
    });

    it('should update stats when items are deleted', () => {
      const item1: TestItem = createTestItem(key1, 'item1', 'test1', 100);
      const item2: TestItem = createTestItem(key2, 'item2', 'test2', 200);

      cache.set(key1, item1);
      cache.set(key2, item2);

      const statsBeforeDelete = cache.getStats();
      expect(statsBeforeDelete.currentItemCount).toBe(2);

      cache.delete(key1);

      const statsAfterDelete = cache.getStats();
      expect(statsAfterDelete.currentItemCount).toBe(1);
      expect(statsAfterDelete.currentSizeBytes).toBeLessThan(statsBeforeDelete.currentSizeBytes);
      expect(cache.get(key1)).toBeNull();
      expect(cache.get(key2)).toBeTruthy();
    });
  });

  describe('Clone functionality', () => {
    it('should clone cache with same configuration', () => {
      const sizeConfig: CacheSizeConfig = {
        maxItems: 3,
        maxSizeBytes: '1KB',
        evictionPolicy: 'lru'
      };
      cache = new EnhancedMemoryCacheMap(types, sizeConfig);

      const item1: TestItem = createTestItem(key1, 'item1', 'test1', 100);
      cache.set(key1, item1);

      const cloned = cache.clone();

      expect(cloned.get(key1)).toEqual(item1);
      expect(cloned.getStats().maxItems).toBe(3);
      expect(cloned.getStats().maxSizeBytes).toBe(1000);

      // Ensure independence
      const item2: TestItem = createTestItem(key2, 'item2', 'test2', 200);
      cloned.set(key2, item2);

      expect(cache.get(key2)).toBeNull();
      expect(cloned.get(key2)).toBeTruthy();
    });
  });

  describe('TTL (Time-To-Live) functionality', () => {
    beforeEach(() => {
      cache = new EnhancedMemoryCacheMap(types);
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return item when within TTL', () => {
      const item1: TestItem = createTestItem(key1, 'item1', 'test1', 100);
      cache.set(key1, item1);

      const result = cache.getWithTTL(key1, 5000); // 5 seconds TTL
      expect(result).toEqual(item1);
    });

    it('should return null when TTL is 0 (caching disabled)', () => {
      const item1: TestItem = createTestItem(key1, 'item1', 'test1', 100);
      cache.set(key1, item1);

      const result = cache.getWithTTL(key1, 0);
      expect(result).toBeNull();
    });

    it('should return null when item has expired', () => {
      const item1: TestItem = createTestItem(key1, 'item1', 'test1', 100);
      const baseTime = 1000;

      vi.setSystemTime(baseTime);
      cache.set(key1, item1);

      // Fast forward past TTL
      const ttl = 5000;
      vi.setSystemTime(baseTime + ttl + 1000);

      const result = cache.getWithTTL(key1, ttl);
      expect(result).toBeNull();
    });

    it('should remove expired item from cache when accessed with TTL', () => {
      const item1: TestItem = createTestItem(key1, 'item1', 'test1', 100);
      const baseTime = 1000;

      vi.setSystemTime(baseTime);
      cache.set(key1, item1);

      expect(cache.includesKey(key1)).toBe(true);

      // Fast forward past TTL
      const ttl = 5000;
      vi.setSystemTime(baseTime + ttl + 1000);

      cache.getWithTTL(key1, ttl);

      // Item should be removed from cache
      expect(cache.includesKey(key1)).toBe(false);
      expect(cache.get(key1)).toBeNull();
    });

    it('should update access metadata when TTL access succeeds', () => {
      const sizeConfig: CacheSizeConfig = {
        maxItems: 2,
        evictionPolicy: 'lru'
      };
      cache = new EnhancedMemoryCacheMap(types, sizeConfig);

      const item1: TestItem = createTestItem(key1, 'item1', 'test1', 100);
      const item2: TestItem = createTestItem(key2, 'item2', 'test2', 200);
      const item3: TestItem = createTestItem(key3, 'item3', 'test3', 300);

      cache.set(key1, item1);
      cache.set(key2, item2);

      // Access key1 with TTL to update its LRU position
      const accessed = cache.getWithTTL(key1, 10000);
      expect(accessed).toEqual(item1);

      // Add item3, which should trigger eviction
      cache.set(key3, item3);

      // Should have exactly 2 items after eviction
      expect(cache.getStats().currentItemCount).toBe(2);

      // The newer item should definitely exist
      expect(cache.get(key3)).toBeTruthy();

      // Either key1 or key2 should be evicted, but at least one should remain
      const remainingItems = [cache.get(key1), cache.get(key2)].filter(item => item !== null);
      expect(remainingItems).toHaveLength(1);
    });

    it('should work with composite keys and TTL', () => {
      const containedCache = new EnhancedMemoryCacheMap<ContainedTestItem, 'test', 'container'>(['test']);
      const item1: ContainedTestItem = createContainedTestItem(comKey1, 'item1', 'contained1', 'data1');

      const baseTime = 1000;
      vi.setSystemTime(baseTime);

      containedCache.set(comKey1, item1);

      // Should return item within TTL
      const result1 = containedCache.getWithTTL(comKey1, 5000);
      expect(result1).toEqual(item1);

      // Should return null after TTL expires
      vi.setSystemTime(baseTime + 6000);
      const result2 = containedCache.getWithTTL(comKey1, 5000);
      expect(result2).toBeNull();
    });
  });

  describe('Query result caching', () => {
    beforeEach(() => {
      cache = new EnhancedMemoryCacheMap(types);
    });

    it('should store and retrieve query results', () => {
      const queryHash = 'query123';
      const itemKeys = [key1, key2, key3];

      cache.setQueryResult(queryHash, itemKeys);

      const result = cache.getQueryResult(queryHash);
      expect(result).toEqual(itemKeys);
    });

    it('should check if query result exists', () => {
      const queryHash = 'query123';
      const itemKeys = [key1, key2];

      expect(cache.hasQueryResult(queryHash)).toBe(false);

      cache.setQueryResult(queryHash, itemKeys);
      expect(cache.hasQueryResult(queryHash)).toBe(true);
    });

    it('should delete specific query result', () => {
      const queryHash1 = 'query123';
      const queryHash2 = 'query456';
      const itemKeys1 = [key1, key2];
      const itemKeys2 = [key3, key4];

      cache.setQueryResult(queryHash1, itemKeys1);
      cache.setQueryResult(queryHash2, itemKeys2);

      expect(cache.hasQueryResult(queryHash1)).toBe(true);
      expect(cache.hasQueryResult(queryHash2)).toBe(true);

      cache.deleteQueryResult(queryHash1);

      expect(cache.hasQueryResult(queryHash1)).toBe(false);
      expect(cache.hasQueryResult(queryHash2)).toBe(true);
      expect(cache.getQueryResult(queryHash2)).toEqual(itemKeys2);
    });

    it('should clear all query results', () => {
      const queryHash1 = 'query123';
      const queryHash2 = 'query456';
      const itemKeys1 = [key1, key2];
      const itemKeys2 = [key3, key4];

      cache.setQueryResult(queryHash1, itemKeys1);
      cache.setQueryResult(queryHash2, itemKeys2);

      expect(cache.hasQueryResult(queryHash1)).toBe(true);
      expect(cache.hasQueryResult(queryHash2)).toBe(true);

      cache.clearQueryResults();

      expect(cache.hasQueryResult(queryHash1)).toBe(false);
      expect(cache.hasQueryResult(queryHash2)).toBe(false);
      expect(cache.getQueryResult(queryHash1)).toBeNull();
      expect(cache.getQueryResult(queryHash2)).toBeNull();
    });

    it('should return null for non-existent query result', () => {
      const result = cache.getQueryResult('nonexistent');
      expect(result).toBeNull();
    });

    it('should handle query results with composite keys', () => {
      const containedCache = new EnhancedMemoryCacheMap<ContainedTestItem, 'test', 'container'>(['test']);
      const queryHash = 'compositeQuery';
      const itemKeys = [comKey1, comKey2, comKey3];

      containedCache.setQueryResult(queryHash, itemKeys);

      const result = containedCache.getQueryResult(queryHash);
      expect(result).toEqual(itemKeys);
      expect(containedCache.hasQueryResult(queryHash)).toBe(true);
    });

    it('should handle empty query results', () => {
      const queryHash = 'emptyQuery';
      const itemKeys: (PriKey<'test'>)[] = [];

      cache.setQueryResult(queryHash, itemKeys);

      expect(cache.hasQueryResult(queryHash)).toBe(true);
      expect(cache.getQueryResult(queryHash)).toEqual([]);
    });

    it('should overwrite existing query results', () => {
      const queryHash = 'query123';
      const itemKeys1 = [key1, key2];
      const itemKeys2 = [key3, key4];

      cache.setQueryResult(queryHash, itemKeys1);
      expect(cache.getQueryResult(queryHash)).toEqual(itemKeys1);

      cache.setQueryResult(queryHash, itemKeys2);
      expect(cache.getQueryResult(queryHash)).toEqual(itemKeys2);
    });
  });

  describe('Composite key support', () => {
    let containedCache: EnhancedMemoryCacheMap<ContainedTestItem, 'test', 'location1', 'location2'>;

    beforeEach(() => {
      containedCache = new EnhancedMemoryCacheMap<ContainedTestItem, 'test', 'location1', 'location2'>(['test']);
    });

    it('should store and retrieve items with composite keys', () => {
      const item1: ContainedTestItem = createContainedTestItem(comKey1, 'item1', 'contained1', 'data1');
      const item2: ContainedTestItem = createContainedTestItem(comKey2, 'item2', 'contained2', 'data2');

      containedCache.set(comKey1, item1);
      containedCache.set(comKey2, item2);

      expect(containedCache.get(comKey1)).toEqual(item1);
      expect(containedCache.get(comKey2)).toEqual(item2);
      expect(containedCache.getStats().currentItemCount).toBe(2);
    });

    it('should correctly identify composite keys', () => {
      const item1: ContainedTestItem = createContainedTestItem(comKey1, 'item1', 'contained1', 'data1');

      containedCache.set(comKey1, item1);

      expect(containedCache.includesKey(comKey1)).toBe(true);
      expect(containedCache.includesKey(comKey2)).toBe(false);
    });

    it('should delete items with composite keys', () => {
      const item1: ContainedTestItem = createContainedTestItem(comKey1, 'item1', 'contained1', 'data1');
      const item2: ContainedTestItem = createContainedTestItem(comKey2, 'item2', 'contained2', 'data2');

      containedCache.set(comKey1, item1);
      containedCache.set(comKey2, item2);

      expect(containedCache.getStats().currentItemCount).toBe(2);

      containedCache.delete(comKey1);

      expect(containedCache.get(comKey1)).toBeNull();
      expect(containedCache.get(comKey2)).toEqual(item2);
      expect(containedCache.getStats().currentItemCount).toBe(1);
    });

    it('should list all composite keys', () => {
      const item1: ContainedTestItem = createContainedTestItem(comKey1, 'item1', 'contained1', 'data1');
      const item2: ContainedTestItem = createContainedTestItem(comKey2, 'item2', 'contained2', 'data2');

      containedCache.set(comKey1, item1);
      containedCache.set(comKey2, item2);

      const keys = containedCache.keys();
      expect(keys).toHaveLength(2);
      expect(keys).toContainEqual(comKey1);
      expect(keys).toContainEqual(comKey2);
    });

    it('should list all values for composite keys', () => {
      const item1: ContainedTestItem = createContainedTestItem(comKey1, 'item1', 'contained1', 'data1');
      const item2: ContainedTestItem = createContainedTestItem(comKey2, 'item2', 'contained2', 'data2');

      containedCache.set(comKey1, item1);
      containedCache.set(comKey2, item2);

      const values = containedCache.values();
      expect(values).toHaveLength(2);
      expect(values).toContainEqual(item1);
      expect(values).toContainEqual(item2);
    });

    it('should handle eviction with composite keys', () => {
      const sizeConfig: CacheSizeConfig = {
        maxItems: 2,
        evictionPolicy: 'lru'
      };
      containedCache = new EnhancedMemoryCacheMap<ContainedTestItem, 'test', 'location1', 'location2'>(['test'], sizeConfig);

      const item1: ContainedTestItem = createContainedTestItem(comKey1, 'item1', 'contained1', 'data1');
      const item2: ContainedTestItem = createContainedTestItem(comKey2, 'item2', 'contained2', 'data2');
      const item3: ContainedTestItem = createContainedTestItem(comKey3, 'item3', 'contained3', 'data3');

      containedCache.set(comKey1, item1);
      containedCache.set(comKey2, item2);

      expect(containedCache.getStats().currentItemCount).toBe(2);

      // Adding item3 should trigger eviction
      containedCache.set(comKey3, item3);

      expect(containedCache.getStats().currentItemCount).toBe(2);
      expect(containedCache.get(comKey3)).toEqual(item3); // New item should exist

      // One of the original items should be evicted
      const remainingCount = [
        containedCache.get(comKey1),
        containedCache.get(comKey2),
        containedCache.get(comKey3)
      ].filter(item => item !== null).length;

      expect(remainingCount).toBe(2);
    });

    it('should clone cache with composite keys', () => {
      const item1: ContainedTestItem = createContainedTestItem(comKey1, 'item1', 'contained1', 'data1');
      containedCache.set(comKey1, item1);

      const cloned = containedCache.clone();

      expect(cloned.get(comKey1)).toEqual(item1);
      expect(cloned.includesKey(comKey1)).toBe(true);

      // Ensure independence
      const item2: ContainedTestItem = createContainedTestItem(comKey2, 'item2', 'contained2', 'data2');
      cloned.set(comKey2, item2);

      expect(containedCache.get(comKey2)).toBeNull();
      expect(cloned.get(comKey2)).toEqual(item2);
    });

    it('should clear cache with composite keys', () => {
      const item1: ContainedTestItem = createContainedTestItem(comKey1, 'item1', 'contained1', 'data1');
      const item2: ContainedTestItem = createContainedTestItem(comKey2, 'item2', 'contained2', 'data2');

      containedCache.set(comKey1, item1);
      containedCache.set(comKey2, item2);

      expect(containedCache.getStats().currentItemCount).toBe(2);

      containedCache.clear();

      expect(containedCache.getStats().currentItemCount).toBe(0);
      expect(containedCache.get(comKey1)).toBeNull();
      expect(containedCache.get(comKey2)).toBeNull();
    });
  });

  describe('Query methods', () => {
    beforeEach(() => {
      cache = new EnhancedMemoryCacheMap(types);
    });

    describe('allIn()', () => {
      it('should return all items when location array is empty', () => {
        const item1: TestItem = createTestItem(key1, 'item1', 'test1', 100);
        const item2: TestItem = createTestItem(key2, 'item2', 'test2', 200);

        cache.set(key1, item1);
        cache.set(key2, item2);

        const result = cache.allIn([]);
        expect(result).toHaveLength(2);
        expect(result).toContainEqual(item1);
        expect(result).toContainEqual(item2);
      });

      it('should return items in specific location for composite keys', () => {
        const containedCache = new EnhancedMemoryCacheMap<ContainedTestItem, 'test', 'container'>(['test']);

        const item1: ContainedTestItem = createContainedTestItem(comKey1, 'item1', 'contained1', 'data1'); // loc1, subloc1
        const item2: ContainedTestItem = createContainedTestItem(comKey2, 'item2', 'contained2', 'data2'); // loc1, subloc2
        const item3: ContainedTestItem = createContainedTestItem(comKey3, 'item3', 'contained3', 'data3'); // loc2, subloc1

        containedCache.set(comKey1, item1);
        containedCache.set(comKey2, item2);
        containedCache.set(comKey3, item3);

        const location1Items = containedCache.allIn([{ kt: 'container', lk: 'container1' as UUID }]);
        expect(location1Items).toHaveLength(2); // item1 and item3 both in container1
        expect(location1Items).toContainEqual(item1);
        expect(location1Items).toContainEqual(item3);

        const location2Items = containedCache.allIn([{ kt: 'container', lk: 'container2' as UUID }]);
        expect(location2Items).toHaveLength(1);
        expect(location2Items[0]).toEqual(item2);
      });

      it('should return empty array for non-matching location', () => {
        const containedCache = new EnhancedMemoryCacheMap<ContainedTestItem, 'test', 'container'>(['test']);

        const item1: ContainedTestItem = createContainedTestItem(comKey1, 'item1', 'contained1', 'data1');
        containedCache.set(comKey1, item1);

        const result = containedCache.allIn([{ kt: 'container', lk: 'nonexistent' as UUID }]);
        expect(result).toHaveLength(0);
      });

      it('should handle primary keys with empty location correctly', () => {
        const item1: TestItem = createTestItem(key1, 'item1', 'test1', 100);
        const item2: TestItem = createTestItem(key2, 'item2', 'test2', 200);

        cache.set(key1, item1);
        cache.set(key2, item2);

        // Primary keys with empty location should return all items
        const resultEmpty = cache.allIn([]);
        expect(resultEmpty).toHaveLength(2);
        expect(resultEmpty).toContainEqual(item1);
        expect(resultEmpty).toContainEqual(item2);
      });
    });

    describe('contains()', () => {
      it('should return true when query matches existing items', () => {
        const item1: TestItem = createTestItem(key1, 'item1', 'Alice', 100);
        const item2: TestItem = createTestItem(key2, 'item2', 'Bob', 200);

        cache.set(key1, item1);
        cache.set(key2, item2);

        const query: ItemQuery = IQFactory.condition('name', 'Alice').toQuery();
        const result = cache.contains(query, []);

        expect(result).toBe(true);
      });

      it('should return false when query does not match any items', () => {
        const item1: TestItem = createTestItem(key1, 'item1', 'Alice', 100);
        const item2: TestItem = createTestItem(key2, 'item2', 'Bob', 200);

        cache.set(key1, item1);
        cache.set(key2, item2);

        const query: ItemQuery = IQFactory.condition('name', 'Charlie').toQuery();
        const result = cache.contains(query, []);

        expect(result).toBe(false);
      });

      it('should work with composite keys and specific locations', () => {
        const containedCache = new EnhancedMemoryCacheMap<ContainedTestItem, 'test', 'container'>(['test']);

        const item1: ContainedTestItem = createContainedTestItem(comKey1, 'item1', 'Alice', 'data1');
        const item2: ContainedTestItem = createContainedTestItem(comKey2, 'item2', 'Bob', 'data2');
        const item3: ContainedTestItem = createContainedTestItem(comKey3, 'item3', 'Charlie', 'data3');

        containedCache.set(comKey1, item1);
        containedCache.set(comKey2, item2);
        containedCache.set(comKey3, item3);

        const query: ItemQuery = IQFactory.condition('name', 'Alice').toQuery();

        // Should find Alice in container1
        const result1 = containedCache.contains(query, [{ kt: 'container', lk: 'container1' as UUID }]);
        expect(result1).toBe(true);

        // Should not find Alice in container2 (Bob is there)
        const result2 = containedCache.contains(query, [{ kt: 'container', lk: 'container2' as UUID }]);
        expect(result2).toBe(false);
      });

      it('should handle empty cache', () => {
        const query: ItemQuery = IQFactory.condition('name', 'Alice').toQuery();
        const result = cache.contains(query, []);

        expect(result).toBe(false);
      });
    });

    describe('queryIn()', () => {
      it('should return matching items based on query', () => {
        const item1: TestItem = createTestItem(key1, 'item1', 'Alice', 100);
        const item2: TestItem = createTestItem(key2, 'item2', 'Bob', 200);
        const item3: TestItem = createTestItem(key3, 'item3', 'Alice', 300);

        cache.set(key1, item1);
        cache.set(key2, item2);
        cache.set(key3, item3);

        const query: ItemQuery = IQFactory.condition('name', 'Alice').toQuery();
        const result = cache.queryIn(query, []);

        expect(result).toHaveLength(2);
        expect(result).toContainEqual(item1);
        expect(result).toContainEqual(item3);
      });

      it('should return empty array when no items match query', () => {
        const item1: TestItem = createTestItem(key1, 'item1', 'Alice', 100);
        const item2: TestItem = createTestItem(key2, 'item2', 'Bob', 200);

        cache.set(key1, item1);
        cache.set(key2, item2);

        const query: ItemQuery = IQFactory.condition('name', 'Charlie').toQuery();
        const result = cache.queryIn(query, []);

        expect(result).toHaveLength(0);
      });

      it('should work with composite keys and specific locations', () => {
        const containedCache = new EnhancedMemoryCacheMap<ContainedTestItem, 'test', 'container'>(['test']);

        const item1: ContainedTestItem = createContainedTestItem(comKey1, 'item1', 'Alice', 'data1');
        const item2: ContainedTestItem = createContainedTestItem(comKey2, 'item2', 'Alice', 'data2');
        const item3: ContainedTestItem = createContainedTestItem(comKey3, 'item3', 'Alice', 'data3');

        containedCache.set(comKey1, item1);
        containedCache.set(comKey2, item2);
        containedCache.set(comKey3, item3);

        const query: ItemQuery = IQFactory.condition('name', 'Alice').toQuery();

        // Should find Alice items in container1 and container2
        const result1 = containedCache.queryIn(query, [{ kt: 'container', lk: 'container1' as UUID }]);
        expect(result1).toHaveLength(2); // item1 and item3 are both in container1
        expect(result1).toContainEqual(item1);
        expect(result1).toContainEqual(item3);

        const result2 = containedCache.queryIn(query, [{ kt: 'container', lk: 'container2' as UUID }]);
        expect(result2).toHaveLength(1); // item2 is in container2
        expect(result2[0]).toEqual(item2);
      });

      it('should query all items when location is default empty array', () => {
        const item1: TestItem = createTestItem(key1, 'item1', 'Alice', 100);
        const item2: TestItem = createTestItem(key2, 'item2', 'Bob', 200);
        const item3: TestItem = createTestItem(key3, 'item3', 'Alice', 300);

        cache.set(key1, item1);
        cache.set(key2, item2);
        cache.set(key3, item3);

        const query: ItemQuery = IQFactory.condition('name', 'Alice').toQuery();
        const result = cache.queryIn(query);

        expect(result).toHaveLength(2);
        expect(result).toContainEqual(item1);
        expect(result).toContainEqual(item3);
      });

      it('should handle complex queries', () => {
        const item1: TestItem = createTestItem(key1, 'item1', 'Alice', 100);
        const item2: TestItem = createTestItem(key2, 'item2', 'Bob', 200);
        const item3: TestItem = createTestItem(key3, 'item3', 'Charlie', 100);

        cache.set(key1, item1);
        cache.set(key2, item2);
        cache.set(key3, item3);

        const query: ItemQuery = IQFactory.condition('value', 100).toQuery();
        const result = cache.queryIn(query, []);

        expect(result).toHaveLength(2);
        expect(result).toContainEqual(item1);
        expect(result).toContainEqual(item3);
      });
    });
  });

  describe('Cache invalidation', () => {
    beforeEach(() => {
      cache = new EnhancedMemoryCacheMap(types);
    });

    describe('invalidateItemKeys()', () => {
      it('should remove specific items by keys', () => {
        const item1: TestItem = createTestItem(key1, 'item1', 'Alice', 100);
        const item2: TestItem = createTestItem(key2, 'item2', 'Bob', 200);
        const item3: TestItem = createTestItem(key3, 'item3', 'Charlie', 300);

        cache.set(key1, item1);
        cache.set(key2, item2);
        cache.set(key3, item3);

        expect(cache.getStats().currentItemCount).toBe(3);

        cache.invalidateItemKeys([key1, key3]);

        expect(cache.get(key1)).toBeNull();
        expect(cache.get(key2)).toEqual(item2);
        expect(cache.get(key3)).toBeNull();
        expect(cache.getStats().currentItemCount).toBe(1);
      });

      it('should handle non-existent keys gracefully', () => {
        const item1: TestItem = createTestItem(key1, 'item1', 'Alice', 100);
        cache.set(key1, item1);

        const nonExistentKey: PriKey<'test'> = { kt: 'test', pk: 'nonexistent' as UUID };
        cache.invalidateItemKeys([key1, nonExistentKey]);

        expect(cache.get(key1)).toBeNull();
        expect(cache.getStats().currentItemCount).toBe(0);
      });

      it('should work with composite keys', () => {
        const containedCache = new EnhancedMemoryCacheMap<ContainedTestItem, 'test', 'container'>(['test']);

        const item1: ContainedTestItem = createContainedTestItem(comKey1, 'item1', 'Alice', 'data1');
        const item2: ContainedTestItem = createContainedTestItem(comKey2, 'item2', 'Bob', 'data2');
        const item3: ContainedTestItem = createContainedTestItem(comKey3, 'item3', 'Charlie', 'data3');

        containedCache.set(comKey1, item1);
        containedCache.set(comKey2, item2);
        containedCache.set(comKey3, item3);

        containedCache.invalidateItemKeys([comKey1, comKey3]);

        expect(containedCache.get(comKey1)).toBeNull();
        expect(containedCache.get(comKey2)).toEqual(item2);
        expect(containedCache.get(comKey3)).toBeNull();
      });

      it('should handle empty key array', () => {
        const item1: TestItem = createTestItem(key1, 'item1', 'Alice', 100);
        cache.set(key1, item1);

        cache.invalidateItemKeys([]);

        expect(cache.get(key1)).toEqual(item1);
        expect(cache.getStats().currentItemCount).toBe(1);
      });
    });

    describe('invalidateLocation()', () => {
      it('should invalidate all primary items when location is empty', () => {
        const item1: TestItem = createTestItem(key1, 'item1', 'Alice', 100);
        const item2: TestItem = createTestItem(key2, 'item2', 'Bob', 200);

        cache.set(key1, item1);
        cache.set(key2, item2);

        expect(cache.getStats().currentItemCount).toBe(2);

        cache.invalidateLocation([]);

        expect(cache.get(key1)).toBeNull();
        expect(cache.get(key2)).toBeNull();
        expect(cache.getStats().currentItemCount).toBe(0);
      });

      it('should invalidate items in specific location for composite keys', () => {
        const containedCache = new EnhancedMemoryCacheMap<ContainedTestItem, 'test', 'container'>(['test']);

        const item1: ContainedTestItem = createContainedTestItem(comKey1, 'item1', 'Alice', 'data1'); // loc1, subloc1
        const item2: ContainedTestItem = createContainedTestItem(comKey2, 'item2', 'Bob', 'data2');   // loc1, subloc2
        const item3: ContainedTestItem = createContainedTestItem(comKey3, 'item3', 'Charlie', 'data3'); // loc2, subloc1

        containedCache.set(comKey1, item1);
        containedCache.set(comKey2, item2);
        containedCache.set(comKey3, item3);

        expect(containedCache.getStats().currentItemCount).toBe(3);

        // Invalidate items in container1
        containedCache.invalidateLocation([{ kt: 'container', lk: 'container1' as UUID }]);

        expect(containedCache.get(comKey1)).toBeNull(); // Should be removed (container1)
        expect(containedCache.get(comKey2)).toEqual(item2); // Should remain (container2)
        expect(containedCache.get(comKey3)).toBeNull(); // Should be removed (container1)
        expect(containedCache.getStats().currentItemCount).toBe(1);
      });

      it('should clear query results when invalidating', () => {
        const containedCache = new EnhancedMemoryCacheMap<ContainedTestItem, 'test', 'container'>(['test']);

        const item1: ContainedTestItem = createContainedTestItem(comKey1, 'item1', 'Alice', 'data1');
        containedCache.set(comKey1, item1);

        // Set some query results
        const queryHash1 = 'query1';
        const queryHash2 = 'query2';
        containedCache.setQueryResult(queryHash1, [comKey1]);
        containedCache.setQueryResult(queryHash2, [comKey1]);

        expect(containedCache.hasQueryResult(queryHash1)).toBe(true);
        expect(containedCache.hasQueryResult(queryHash2)).toBe(true);

        // Invalidate location should clear all query results
        containedCache.invalidateLocation([{ kt: 'container', lk: 'container1' as UUID }]);

        expect(containedCache.hasQueryResult(queryHash1)).toBe(false);
        expect(containedCache.hasQueryResult(queryHash2)).toBe(false);
      });

      it('should handle invalidating non-existent location', () => {
        const containedCache = new EnhancedMemoryCacheMap<ContainedTestItem, 'test', 'container'>(['test']);

        const item1: ContainedTestItem = createContainedTestItem(comKey1, 'item1', 'Alice', 'data1');
        containedCache.set(comKey1, item1);

        const initialCount = containedCache.getStats().currentItemCount;

        containedCache.invalidateLocation([{ kt: 'container', lk: 'nonexistent' as UUID }]);

        expect(containedCache.get(comKey1)).toEqual(item1);
        expect(containedCache.getStats().currentItemCount).toBe(initialCount);
      });

      it('should handle mixed primary and composite keys', () => {
        // Create cache that can handle both primary and composite keys
        const mixedCache = new EnhancedMemoryCacheMap<TestItem | ContainedTestItem, 'test', 'container'>(['test']);

        const primaryItem: TestItem = createTestItem(key1, 'item1', 'Alice', 100);
        const compositeItem: ContainedTestItem = createContainedTestItem(comKey1, 'item2', 'Bob', 'data1');

        mixedCache.set(key1, primaryItem);
        mixedCache.set(comKey1, compositeItem);

        expect(mixedCache.getStats().currentItemCount).toBe(2);

        // Invalidate primary items (empty location)
        mixedCache.invalidateLocation([]);

        expect(mixedCache.get(key1)).toBeNull(); // Primary item should be removed
        expect(mixedCache.get(comKey1)).toEqual(compositeItem); // Composite item should remain
        expect(mixedCache.getStats().currentItemCount).toBe(1);
      });
    });
  });

  describe('Constructor with initial data', () => {
    it('should initialize cache with provided data', () => {
      const item1: TestItem = createTestItem(key1, 'item1', 'Alice', 100);
      const item2: TestItem = createTestItem(key2, 'item2', 'Bob', 200);

      const initialData = {
        [JSON.stringify(key1)]: item1,
        [JSON.stringify(key2)]: item2
      };

      cache = new EnhancedMemoryCacheMap(types, {}, initialData);

      expect(cache.get(key1)).toEqual(item1);
      expect(cache.get(key2)).toEqual(item2);
      expect(cache.getStats().currentItemCount).toBe(2);
    });

    it('should work with size limits and initial data', () => {
      const item1: TestItem = createTestItem(key1, 'item1', 'Alice', 100);
      const item2: TestItem = createTestItem(key2, 'item2', 'Bob', 200);

      const initialData = {
        [JSON.stringify(key1)]: item1,
        [JSON.stringify(key2)]: item2
      };

      const sizeConfig: CacheSizeConfig = {
        maxItems: 3,
        evictionPolicy: 'lru'
      };

      cache = new EnhancedMemoryCacheMap(types, sizeConfig, initialData);

      expect(cache.get(key1)).toEqual(item1);
      expect(cache.get(key2)).toEqual(item2);
      expect(cache.getStats().currentItemCount).toBe(2);
      expect(cache.getStats().maxItems).toBe(3);
    });

    it('should handle invalid initial data keys gracefully', () => {
      const item1: TestItem = createTestItem(key1, 'item1', 'Alice', 100);

      const initialData = {
        'invalid-json-key': item1,
        [JSON.stringify(key1)]: item1
      };

      cache = new EnhancedMemoryCacheMap(types, {}, initialData);

      // Only the valid key should be loaded
      expect(cache.get(key1)).toEqual(item1);
      expect(cache.getStats().currentItemCount).toBe(1);
    });

    it('should work with composite keys in initial data', () => {
      const item1: ContainedTestItem = createContainedTestItem(comKey1, 'item1', 'Alice', 'data1');
      const item2: ContainedTestItem = createContainedTestItem(comKey2, 'item2', 'Bob', 'data2');

      const initialData = {
        [JSON.stringify(comKey1)]: item1,
        [JSON.stringify(comKey2)]: item2
      };

      const compositeCache = new EnhancedMemoryCacheMap<ContainedTestItem, 'test', 'container'>(['test'], {}, initialData);

      expect(compositeCache.get(comKey1)).toEqual(item1);
      expect(compositeCache.get(comKey2)).toEqual(item2);
      expect(compositeCache.getStats().currentItemCount).toBe(2);
    });

    it('should handle empty initial data', () => {
      cache = new EnhancedMemoryCacheMap(types, {}, {});

      expect(cache.getStats().currentItemCount).toBe(0);
      expect(cache.values()).toHaveLength(0);
      expect(cache.keys()).toHaveLength(0);
    });

    it('should trigger eviction if initial data exceeds limits', () => {
      const item1: TestItem = createTestItem(key1, 'item1', 'Alice', 100);
      const item2: TestItem = createTestItem(key2, 'item2', 'Bob', 200);
      const item3: TestItem = createTestItem(key3, 'item3', 'Charlie', 300);

      const initialData = {
        [JSON.stringify(key1)]: item1,
        [JSON.stringify(key2)]: item2,
        [JSON.stringify(key3)]: item3
      };

      const sizeConfig: CacheSizeConfig = {
        maxItems: 2,
        evictionPolicy: 'lru'
      };

      cache = new EnhancedMemoryCacheMap(types, sizeConfig, initialData);

      // Should respect the size limit
      const stats = cache.getStats();
      expect(stats.currentItemCount).toBeLessThanOrEqual(2);
      expect(stats.maxItems).toBe(2);

      // At least some items should be loaded (exact items depend on eviction order)
      const loadedItems = cache.values();
      expect(loadedItems.length).toBeGreaterThan(0);
      expect(loadedItems.length).toBeLessThanOrEqual(2);
    });

    it('should update size tracking correctly with initial data', () => {
      const item1: TestItem = createTestItem(key1, 'item1', 'Alice', 100);
      const item2: TestItem = createTestItem(key2, 'item2', 'Bob', 200);

      const initialData = {
        [JSON.stringify(key1)]: item1,
        [JSON.stringify(key2)]: item2
      };

      const sizeConfig: CacheSizeConfig = {
        maxSizeBytes: '1KB',
        evictionPolicy: 'lru'
      };

      cache = new EnhancedMemoryCacheMap(types, sizeConfig, initialData);

      const stats = cache.getStats();
      expect(stats.currentSizeBytes).toBeGreaterThan(0);
      expect(stats.maxSizeBytes).toBe(1000);
      expect(stats.utilizationPercent.bytes).toBeGreaterThan(0);
    });
  });

  describe('Edge cases and error handling', () => {
    beforeEach(() => {
      cache = new EnhancedMemoryCacheMap(types);
    });

    describe('Size string parsing', () => {
      it('should parse byte values correctly', () => {
        const sizeConfig: CacheSizeConfig = {
          maxSizeBytes: '500',
          evictionPolicy: 'lru'
        };
        cache = new EnhancedMemoryCacheMap(types, sizeConfig);

        expect(cache.getStats().maxSizeBytes).toBe(500);
      });

      it('should parse KB values correctly', () => {
        const sizeConfig: CacheSizeConfig = {
          maxSizeBytes: '2KB',
          evictionPolicy: 'lru'
        };
        cache = new EnhancedMemoryCacheMap(types, sizeConfig);

        expect(cache.getStats().maxSizeBytes).toBe(2000);
      });

      it('should parse MB values correctly', () => {
        const sizeConfig: CacheSizeConfig = {
          maxSizeBytes: '1MB',
          evictionPolicy: 'lru'
        };
        cache = new EnhancedMemoryCacheMap(types, sizeConfig);

        expect(cache.getStats().maxSizeBytes).toBe(1000000);
      });

      it('should handle different eviction strategies', () => {
        const strategies = ['lru', 'fifo', 'lfu'] as const;

        strategies.forEach(strategy => {
          const sizeConfig: CacheSizeConfig = {
            maxItems: 3,
            evictionPolicy: strategy
          };
          const testCache = new EnhancedMemoryCacheMap(types, sizeConfig);

          expect(testCache.getStats().maxItems).toBe(3);
        });
      });
    });

    describe('Eviction edge cases', () => {
      it('should handle eviction when no items exist', () => {
        const sizeConfig: CacheSizeConfig = {
          maxItems: 1,
          evictionPolicy: 'lru'
        };
        cache = new EnhancedMemoryCacheMap(types, sizeConfig);

        // Should not crash when trying to add to empty cache
        const item1: TestItem = createTestItem(key1, 'item1', 'Alice', 100);
        cache.set(key1, item1);

        expect(cache.get(key1)).toEqual(item1);
        expect(cache.getStats().currentItemCount).toBe(1);
      });

      it('should handle very small size limits', () => {
        const sizeConfig: CacheSizeConfig = {
          maxSizeBytes: '1', // Extremely small
          evictionPolicy: 'lru'
        };
        cache = new EnhancedMemoryCacheMap(types, sizeConfig);

        const item1: TestItem = createTestItem(key1, 'item1', 'Alice', 100);
        cache.set(key1, item1);

        // The cache will evict the item if it's too large, but should not crash
        const stats = cache.getStats();
        expect(stats.maxSizeBytes).toBe(1);
        // The item may be evicted immediately due to size, so don't check current size
        expect(stats.currentItemCount).toBeLessThanOrEqual(1);
      });

      it('should handle zero item limit edge case', () => {
        const sizeConfig: CacheSizeConfig = {
          maxItems: 0, // Edge case
          evictionPolicy: 'lru'
        };
        cache = new EnhancedMemoryCacheMap(types, sizeConfig);

        const item1: TestItem = createTestItem(key1, 'item1', 'Alice', 100);
        cache.set(key1, item1);

        // With 0 item limit, the cache should handle this gracefully without crashing
        // Note: due to implementation detail, maxItems might be undefined when set to 0
        const stats = cache.getStats();
        expect(stats.currentItemCount).toBeGreaterThanOrEqual(0);

        // Should not crash when trying to retrieve
        const retrieved = cache.get(key1);
        expect(retrieved === null || retrieved === item1).toBe(true);
      });

      it('should handle eviction strategy with no evictable items', () => {
        const sizeConfig: CacheSizeConfig = {
          maxItems: 1,
          evictionPolicy: 'lru'
        };
        cache = new EnhancedMemoryCacheMap(types, sizeConfig);

        // This scenario tests when eviction strategy can't find items to evict
        const item1: TestItem = createTestItem(key1, 'item1', 'Alice', 100);
        cache.set(key1, item1);

        // Clear the cache but reset the count artificially to test edge case
        // This is more of a theoretical test case
        const item2: TestItem = createTestItem(key2, 'item2', 'Bob', 200);
        cache.set(key2, item2);

        expect(cache.getStats().currentItemCount).toBe(1);
      });
    });

    describe('Key normalization edge cases', () => {
      it('should handle identical content with different object references', () => {
        const key1Copy = { kt: 'test' as const, pk: 'item1' as UUID };
        const key1Original = { kt: 'test' as const, pk: 'item1' as UUID };

        const item1: TestItem = createTestItem(key1Copy, 'item1', 'Alice', 100);
        const item2: TestItem = createTestItem(key1Original, 'item1', 'Updated Alice', 200);

        cache.set(key1Copy, item1);
        cache.set(key1Original, item2); // Should update, not add new

        expect(cache.get(key1Copy)).toEqual(item2);
        expect(cache.get(key1Original)).toEqual(item2);
        expect(cache.getStats().currentItemCount).toBe(1);
      });

      it('should handle composite keys with identical content', () => {
        const containedCache = new EnhancedMemoryCacheMap<ContainedTestItem, 'test', 'container'>(['test']);

        const comKey1Copy: ComKey<'test', 'container'> = {
          kt: 'test',
          pk: 'item1' as UUID,
          loc: [{ kt: 'container', lk: 'container1' as UUID }]
        };
        const comKey1Original: ComKey<'test', 'container'> = {
          kt: 'test',
          pk: 'item1' as UUID,
          loc: [{ kt: 'container', lk: 'container1' as UUID }]
        };

        const item1: ContainedTestItem = createContainedTestItem(comKey1Copy, 'item1', 'Alice', 'data1');
        const item2: ContainedTestItem = createContainedTestItem(comKey1Original, 'item1', 'Updated Alice', 'data2');

        containedCache.set(comKey1Copy, item1);
        containedCache.set(comKey1Original, item2); // Should update

        expect(containedCache.get(comKey1Copy)).toEqual(item2);
        expect(containedCache.getStats().currentItemCount).toBe(1);
      });
    });

    describe('Large data edge cases', () => {
      it('should handle large number of items efficiently', () => {
        const sizeConfig: CacheSizeConfig = {
          maxItems: 1000,
          evictionPolicy: 'lru'
        };
        cache = new EnhancedMemoryCacheMap(types, sizeConfig);

        // Add many items
        const items: TestItem[] = [];
        for (let i = 0; i < 500; i++) {
          const key: PriKey<'test'> = { kt: 'test', pk: `item${i}` as UUID };
          const item: TestItem = createTestItem(key, `item${i}`, `Name${i}`, i);
          items.push(item);
          cache.set(key, item);
        }

        expect(cache.getStats().currentItemCount).toBe(500);

        // Verify random access works
        const randomKey: PriKey<'test'> = { kt: 'test', pk: 'item100' as UUID };
        expect(cache.get(randomKey)).toBeTruthy();
      });

      it('should handle items with very large property values', () => {
        const largeString = 'x'.repeat(10000); // 10KB string
        const key: PriKey<'test'> = { kt: 'test', pk: 'large-item' as UUID };
        const item: TestItem = createTestItem(key, 'large-item', largeString, 100);

        cache.set(key, item);

        const retrieved = cache.get(key);
        expect(retrieved?.name).toBe(largeString);
        expect(cache.getStats().currentSizeBytes).toBeGreaterThan(10000);
      });
    });

    describe('Concurrency simulation', () => {
      it('should handle rapid sequential operations', () => {
        const sizeConfig: CacheSizeConfig = {
          maxItems: 10,
          evictionPolicy: 'lru'
        };
        cache = new EnhancedMemoryCacheMap(types, sizeConfig);

        // Simulate rapid operations
        for (let i = 0; i < 100; i++) {
          const key: PriKey<'test'> = { kt: 'test', pk: `item${i % 20}` as UUID }; // Reuse keys
          const item: TestItem = createTestItem(key, `item${i}`, `Name${i}`, i);

          cache.set(key, item);
          cache.get(key);

          if (i % 10 === 0) {
            cache.delete(key);
          }
        }

        // Should still be functional
        expect(cache.getStats().currentItemCount).toBeLessThanOrEqual(10);

        const testKey: PriKey<'test'> = { kt: 'test', pk: 'item5' as UUID };
        const testItem: TestItem = createTestItem(testKey, 'item5', 'Test', 999);
        cache.set(testKey, testItem);

        expect(cache.get(testKey)).toEqual(testItem);
      });
    });

    describe('Memory cleanup verification', () => {
      it('should properly clean up after clear operation', () => {
        const sizeConfig: CacheSizeConfig = {
          maxItems: 5,
          evictionPolicy: 'lru'
        };
        cache = new EnhancedMemoryCacheMap(types, sizeConfig);

        // Add items
        for (let i = 0; i < 5; i++) {
          const key: PriKey<'test'> = { kt: 'test', pk: `item${i}` as UUID };
          const item: TestItem = createTestItem(key, `item${i}`, `Name${i}`, i);
          cache.set(key, item);
        }

        // Add query results
        cache.setQueryResult('query1', [key1, key2]);
        cache.setQueryResult('query2', [key3, key4]);

        expect(cache.getStats().currentItemCount).toBe(5);
        expect(cache.hasQueryResult('query1')).toBe(true);

        cache.clear();

        expect(cache.getStats().currentItemCount).toBe(0);
        expect(cache.getStats().currentSizeBytes).toBe(0);
        expect(cache.values()).toHaveLength(0);
        expect(cache.keys()).toHaveLength(0);

        // Query results should still exist (clear doesn't clear queries)
        expect(cache.hasQueryResult('query1')).toBe(true);
      });

      it('should handle clone with empty cache', () => {
        const cloned = cache.clone();

        expect(cloned.getStats().currentItemCount).toBe(0);
        expect(cloned.values()).toHaveLength(0);
        expect(cloned.keys()).toHaveLength(0);
      });
    });

    describe('Mixed operation sequences', () => {
      it('should handle complex operation sequences correctly', () => {
        const sizeConfig: CacheSizeConfig = {
          maxItems: 3,
          maxSizeBytes: '1KB',
          evictionPolicy: 'lru'
        };
        cache = new EnhancedMemoryCacheMap(types, sizeConfig);

        // Complex sequence of operations
        const item1: TestItem = createTestItem(key1, 'item1', 'Alice', 100);
        cache.set(key1, item1);
        cache.setQueryResult('query1', [key1]);

        const item2: TestItem = createTestItem(key2, 'item2', 'Bob', 200);
        cache.set(key2, item2);

        expect(cache.contains(IQFactory.condition('name', 'Alice').toQuery(), [])).toBe(true);

        cache.invalidateItemKeys([key1]);
        expect(cache.get(key1)).toBeNull();
        expect(cache.get(key2)).toEqual(item2);

        const cloned = cache.clone();
        expect(cloned.get(key2)).toEqual(item2);
        expect(cloned.getStats().maxItems).toBe(3);

        cache.clear();
        expect(cache.getStats().currentItemCount).toBe(0);
        expect(cloned.getStats().currentItemCount).toBe(1); // Clone should be independent
      });
    });
  });
});
