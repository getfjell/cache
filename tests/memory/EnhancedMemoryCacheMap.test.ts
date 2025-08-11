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

  describe('Constructor and basic properties', () => {
    it('should have correct implementationType', () => {
      cache = new EnhancedMemoryCacheMap(types);
      expect(cache.implementationType).toBe('memory/enhanced');
    });

    it('should have correct implementationType with default configuration', () => {
      cache = new EnhancedMemoryCacheMap(types);
      expect(cache.implementationType).toBe('memory/enhanced');
    });

    it('should have correct implementationType with size limits', () => {
      const sizeConfig: CacheSizeConfig = {
        maxItems: 100
      };
      cache = new EnhancedMemoryCacheMap(types, sizeConfig);
      expect(cache.implementationType).toBe('memory/enhanced');
    });
  });

  describe('Size limits and tracking', () => {
    it('should track cache size in bytes', () => {
      const sizeConfig: CacheSizeConfig = {
        maxSizeBytes: '1KB'
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
        maxItems: 2
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
        maxSizeBytes: '1KB'
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

  // NOTE: Eviction tests are now disabled for EnhancedMemoryCacheMap
  // Eviction is handled at the Cache level via EvictionManager
  // These tests are now covered in integration tests
  describe.skip('LRU Eviction (now handled at Cache level)', () => {
    beforeEach(() => {
      const sizeConfig: CacheSizeConfig = {
        maxItems: 3
      };
      cache = new EnhancedMemoryCacheMap(types, sizeConfig);
    });

    it('should evict least recently used item when item limit exceeded', async () => {
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
      await cache.get(key1);

      // Add item4, this should trigger eviction
      cache.set(key4, item4);

      // Should have exactly 3 items after eviction
      const stats = cache.getStats();
      expect(stats.currentItemCount).toBe(3);

      // At least some of the original items should still exist
      const existingItems = [
        await cache.get(key1),
        await cache.get(key2),
        await cache.get(key3),
        await cache.get(key4)
      ].filter(item => item !== null);

      expect(existingItems).toHaveLength(3);
      expect(await cache.get(key4)).toBeTruthy(); // New item should definitely exist
    });

    it('should update LRU order on access', async () => {
      const item1: TestItem = createTestItem(key1, 'item1', 'test1', 100);
      const item2: TestItem = createTestItem(key2, 'item2', 'test2', 200);
      const item3: TestItem = createTestItem(key3, 'item3', 'test3', 300);
      const item4: TestItem = createTestItem(key4, 'item4', 'test4', 400);

      cache.set(key1, item1);
      cache.set(key2, item2);
      cache.set(key3, item3);

      // Access item1 multiple times to ensure it's more recently used
      await cache.get(key1);
      await cache.get(key1);

      // Add item4, should trigger eviction of least recently used
      cache.set(key4, item4);

      // Verify we still have exactly 3 items
      const stats = cache.getStats();
      expect(stats.currentItemCount).toBe(3);

      // Item4 should definitely exist since it was just added
      expect(await cache.get(key4)).toBeTruthy();

      // Test the functionality - eviction should work
      // Since LRU is working, exactly 3 items should remain
      const remainingCount = [
        await cache.get(key1),
        await cache.get(key2),
        await cache.get(key3),
        await cache.get(key4)
      ].filter(item => item !== null).length;

      expect(remainingCount).toBe(3);
    });
  });

  describe.skip('FIFO Eviction (now handled at Cache level)', () => {
    beforeEach(() => {
      const sizeConfig: CacheSizeConfig = {
        maxItems: 3
      };
      cache = new EnhancedMemoryCacheMap(types, sizeConfig);
    });

    it('should evict first-in item regardless of usage', async () => {
      const item1: TestItem = createTestItem(key1, 'item1', 'test1', 100);
      const item2: TestItem = createTestItem(key2, 'item2', 'test2', 200);
      const item3: TestItem = createTestItem(key3, 'item3', 'test3', 300);
      const item4: TestItem = createTestItem(key4, 'item4', 'test4', 400);

      cache.set(key1, item1);
      cache.set(key2, item2);
      cache.set(key3, item3);

      // Access item1 many times (shouldn't matter for FIFO)
      await cache.get(key1);
      await cache.get(key1);
      await cache.get(key1);

      // Add item4, should still evict item1 (first in)
      cache.set(key4, item4);

      expect(await cache.get(key1)).toBeNull(); // Should be evicted despite usage
      expect(await cache.get(key2)).toBeTruthy();
      expect(await cache.get(key3)).toBeTruthy();
      expect(await cache.get(key4)).toBeTruthy();
    });
  });

  describe.skip('LFU Eviction (now handled at Cache level)', () => {
    beforeEach(() => {
      const sizeConfig: CacheSizeConfig = {
        maxItems: 3
      };
      cache = new EnhancedMemoryCacheMap(types, sizeConfig);
    });

    it('should evict least frequently used item', async () => {
      const item1: TestItem = createTestItem(key1, 'item1', 'test1', 100);
      const item2: TestItem = createTestItem(key2, 'item2', 'test2', 200);
      const item3: TestItem = createTestItem(key3, 'item3', 'test3', 300);
      const item4: TestItem = createTestItem(key4, 'item4', 'test4', 400);

      cache.set(key1, item1);
      cache.set(key2, item2);
      cache.set(key3, item3);

      // Access item1 and item3 multiple times, leave item2 with minimal access
      await cache.get(key1);
      await cache.get(key1);
      await cache.get(key3);
      await cache.get(key3);

      // Add item4, should evict item2 (lowest frequency)
      cache.set(key4, item4);

      expect(await cache.get(key1)).toBeTruthy();
      expect(await cache.get(key2)).toBeNull(); // Should be evicted
      expect(await cache.get(key3)).toBeTruthy();
      expect(await cache.get(key4)).toBeTruthy();
    });
  });

  describe.skip('Size-based eviction (now handled at Cache level)', () => {
    it('should evict items when size limit is exceeded', async () => {
      const sizeConfig: CacheSizeConfig = {
        maxSizeBytes: '200' // Very small limit
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
      expect(await cache.get(key1)).toBeNull();
      expect(await cache.get(key2)).toBeTruthy();
    });
  });

  describe('Cache operations with no limits', () => {
    beforeEach(() => {
      cache = new EnhancedMemoryCacheMap(types); // No size limits
    });

    it('should work normally without size limits', async () => {
      const item1: TestItem = createTestItem(key1, 'item1', 'test1', 100);
      const item2: TestItem = createTestItem(key2, 'item2', 'test2', 200);

      cache.set(key1, item1);
      cache.set(key2, item2);

      expect(await cache.get(key1)).toEqual(item1);
      expect(await cache.get(key2)).toEqual(item2);

      const stats = cache.getStats();
      expect(stats.currentItemCount).toBe(2);
      expect(stats.maxItems).toBeUndefined();
      expect(stats.maxSizeBytes).toBeUndefined();
    });

    it('should handle updates correctly', async () => {
      const item1: TestItem = createTestItem(key1, 'item1', 'test1', 100);
      const item1Updated: TestItem = createTestItem(key1, 'item1', 'updated', 200);

      cache.set(key1, item1);
      const initialStats = cache.getStats();

      cache.set(key1, item1Updated);
      const updatedStats = cache.getStats();

      expect(await cache.get(key1)).toEqual(item1Updated);
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

    it('should preserve query results when cache is cleared', async () => {
      const item1: TestItem = createTestItem(key1, 'item1', 'test1', 100);
      await cache.set(key1, item1);
      await cache.setQueryResult('query1', [key1]);
      expect(await cache.hasQueryResult('query1')).toBe(true);

      await cache.clear();

      // Query results should still exist (clear doesn't clear queries)
      expect(await cache.hasQueryResult('query1')).toBe(true);
    });

    it('should update stats when items are deleted', async () => {
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
      expect(await cache.get(key1)).toBeNull();
      expect(await cache.get(key2)).toBeTruthy();
    });

    it('should remove deleted items from cached query results', async () => {
      const item1: TestItem = createTestItem(key1, 'item1', 'test1', 100);
      const item2: TestItem = createTestItem(key2, 'item2', 'test2', 200);

      cache.set(key1, item1);
      cache.set(key2, item2);
      const queryHash = 'query1';
      cache.setQueryResult(queryHash, [key1, key2]);

      cache.delete(key1);
      expect(await cache.getQueryResult(queryHash)).toEqual([key2]);

      cache.delete(key2);
      expect(await cache.hasQueryResult(queryHash)).toBe(false);
    });
  });

  describe('Clone functionality', () => {
    it('should clone cache with same configuration', async () => {
      const sizeConfig: CacheSizeConfig = {
        maxItems: 3,
        maxSizeBytes: '1KB',
        evictionPolicy: 'lru'
      };
      cache = new EnhancedMemoryCacheMap(types, sizeConfig);

      const item1: TestItem = createTestItem(key1, 'item1', 'test1', 100);
      cache.set(key1, item1);

      const cloned = await cache.clone();

      expect(await cloned.get(key1)).toEqual(item1);
      expect((cloned as EnhancedMemoryCacheMap<TestItem, 'test'>).getStats().maxItems).toBe(3);
      expect((cloned as EnhancedMemoryCacheMap<TestItem, 'test'>).getStats().maxSizeBytes).toBe(1000);

      // Ensure independence
      const item2: TestItem = createTestItem(key2, 'item2', 'test2', 200);
      cloned.set(key2, item2);

      expect(await cache.get(key2)).toBeNull();
      expect(await cloned.get(key2)).toBeTruthy();
    });
  });

  describe('Query result caching', () => {
    beforeEach(() => {
      cache = new EnhancedMemoryCacheMap(types);
    });

    it('should store and retrieve query results', async () => {
      const queryHash = 'query123';
      const itemKeys = [key1, key2, key3];

      cache.setQueryResult(queryHash, itemKeys);

      const result = await cache.getQueryResult(queryHash);
      expect(result).toEqual(itemKeys);
    });

    it('should check if query result exists', async () => {
      const queryHash = 'query123';
      const itemKeys = [key1, key2];

      expect(await cache.hasQueryResult(queryHash)).toBe(false);

      cache.setQueryResult(queryHash, itemKeys);
      expect(await cache.hasQueryResult(queryHash)).toBe(true);
    });

    it('should delete specific query result', async () => {
      const queryHash1 = 'query123';
      const queryHash2 = 'query456';
      const itemKeys1 = [key1, key2];
      const itemKeys2 = [key3, key4];

      cache.setQueryResult(queryHash1, itemKeys1);
      cache.setQueryResult(queryHash2, itemKeys2);

      expect(await cache.hasQueryResult(queryHash1)).toBe(true);
      expect(await cache.hasQueryResult(queryHash2)).toBe(true);

      cache.deleteQueryResult(queryHash1);

      expect(await cache.hasQueryResult(queryHash1)).toBe(false);
      expect(await cache.hasQueryResult(queryHash2)).toBe(true);
      expect(await cache.getQueryResult(queryHash2)).toEqual(itemKeys2);
    });

    it('should clear all query results', async () => {
      const queryHash1 = 'query123';
      const queryHash2 = 'query456';
      const itemKeys1 = [key1, key2];
      const itemKeys2 = [key3, key4];

      cache.setQueryResult(queryHash1, itemKeys1);
      cache.setQueryResult(queryHash2, itemKeys2);

      expect(await cache.hasQueryResult(queryHash1)).toBe(true);
      expect(await cache.hasQueryResult(queryHash2)).toBe(true);

      cache.clearQueryResults();

      expect(await cache.hasQueryResult(queryHash1)).toBe(false);
      expect(await cache.hasQueryResult(queryHash2)).toBe(false);
      expect(await cache.getQueryResult(queryHash1)).toBeNull();
      expect(await cache.getQueryResult(queryHash2)).toBeNull();
    });

    it('should return null for non-existent query result', async () => {
      const result = await cache.getQueryResult('nonexistent');
      expect(result).toBeNull();
    });

    it('should handle query results with composite keys', async () => {
      const containedCache = new EnhancedMemoryCacheMap<ContainedTestItem, 'test', 'container'>(['test']);
      const queryHash = 'compositeQuery';
      const itemKeys = [comKey1, comKey2, comKey3];

      containedCache.setQueryResult(queryHash, itemKeys);

      const result = await containedCache.getQueryResult(queryHash);
      expect(result).toEqual(itemKeys);
      expect(await containedCache.hasQueryResult(queryHash)).toBe(true);
    });

    it('should handle empty query results', async () => {
      const queryHash = 'emptyQuery';
      const itemKeys: (PriKey<'test'>)[] = [];

      cache.setQueryResult(queryHash, itemKeys);

      expect(await cache.hasQueryResult(queryHash)).toBe(true);
      expect(await cache.getQueryResult(queryHash)).toEqual([]);
    });

    it('should overwrite existing query results', async () => {
      const queryHash = 'query123';
      const itemKeys1 = [key1, key2];
      const itemKeys2 = [key3, key4];

      cache.setQueryResult(queryHash, itemKeys1);
      expect(await cache.getQueryResult(queryHash)).toEqual(itemKeys1);

      cache.setQueryResult(queryHash, itemKeys2);
      expect(await cache.getQueryResult(queryHash)).toEqual(itemKeys2);
    });
  });

  describe('Composite key support', () => {
    let containedCache: EnhancedMemoryCacheMap<ContainedTestItem, 'test', 'location1', 'location2'>;

    beforeEach(() => {
      containedCache = new EnhancedMemoryCacheMap<ContainedTestItem, 'test', 'location1', 'location2'>(['test']);
    });

    it('should store and retrieve items with composite keys', async () => {
      const item1: ContainedTestItem = createContainedTestItem(comKey1, 'item1', 'contained1', 'data1');
      const item2: ContainedTestItem = createContainedTestItem(comKey2, 'item2', 'contained2', 'data2');

      containedCache.set(comKey1, item1);
      containedCache.set(comKey2, item2);

      expect(await containedCache.get(comKey1)).toEqual(item1);
      expect(await containedCache.get(comKey2)).toEqual(item2);
      expect(containedCache.getStats().currentItemCount).toBe(2);
    });

    it('should correctly identify composite keys', async () => {
      const item1: ContainedTestItem = createContainedTestItem(comKey1, 'item1', 'contained1', 'data1');

      containedCache.set(comKey1, item1);

      expect(await containedCache.includesKey(comKey1)).toBe(true);
      expect(await containedCache.includesKey(comKey2)).toBe(false);
    });

    it('should delete items with composite keys', async () => {
      const item1: ContainedTestItem = createContainedTestItem(comKey1, 'item1', 'contained1', 'data1');
      const item2: ContainedTestItem = createContainedTestItem(comKey2, 'item2', 'contained2', 'data2');

      containedCache.set(comKey1, item1);
      containedCache.set(comKey2, item2);

      expect(containedCache.getStats().currentItemCount).toBe(2);

      containedCache.delete(comKey1);

      expect(await containedCache.get(comKey1)).toBeNull();
      expect(await containedCache.get(comKey2)).toEqual(item2);
      expect(containedCache.getStats().currentItemCount).toBe(1);
    });

    it('should list all composite keys', async () => {
      const item1: ContainedTestItem = createContainedTestItem(comKey1, 'item1', 'contained1', 'data1');
      const item2: ContainedTestItem = createContainedTestItem(comKey2, 'item2', 'contained2', 'data2');

      containedCache.set(comKey1, item1);
      containedCache.set(comKey2, item2);

      const keys = await containedCache.keys();
      expect(keys).toHaveLength(2);
      expect(keys).toContainEqual(comKey1);
      expect(keys).toContainEqual(comKey2);
    });

    it('should list all values for composite keys', async () => {
      const item1: ContainedTestItem = createContainedTestItem(comKey1, 'item1', 'contained1', 'data1');
      const item2: ContainedTestItem = createContainedTestItem(comKey2, 'item2', 'contained2', 'data2');

      containedCache.set(comKey1, item1);
      containedCache.set(comKey2, item2);

      const values = await containedCache.values();
      expect(values).toHaveLength(2);
      expect(values).toContainEqual(item1);
      expect(values).toContainEqual(item2);
    });

    it.skip('should handle eviction with composite keys (now handled at Cache level)', async () => {
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
      expect(await containedCache.get(comKey3)).toEqual(item3); // New item should exist

      // One of the original items should be evicted
      const remainingCount = [
        await containedCache.get(comKey1),
        await containedCache.get(comKey2),
        await containedCache.get(comKey3)
      ].filter(item => item !== null).length;

      expect(remainingCount).toBe(2);
    });

    it('should clone cache with composite keys', async () => {
      const item1: ContainedTestItem = createContainedTestItem(comKey1, 'item1', 'contained1', 'data1');
      containedCache.set(comKey1, item1);

      const cloned = await containedCache.clone();

      expect(await cloned.get(comKey1)).toEqual(item1);
      expect(await cloned.includesKey(comKey1)).toBe(true);

      // Ensure independence
      const item2: ContainedTestItem = createContainedTestItem(comKey2, 'item2', 'contained2', 'data2');
      cloned.set(comKey2, item2);

      expect(await containedCache.get(comKey2)).toBeNull();
      expect(await cloned.get(comKey2)).toEqual(item2);
    });

    it('should clear cache with composite keys', async () => {
      const item1: ContainedTestItem = createContainedTestItem(comKey1, 'item1', 'contained1', 'data1');
      const item2: ContainedTestItem = createContainedTestItem(comKey2, 'item2', 'contained2', 'data2');

      containedCache.set(comKey1, item1);
      containedCache.set(comKey2, item2);

      expect(containedCache.getStats().currentItemCount).toBe(2);

      containedCache.clear();

      expect(containedCache.getStats().currentItemCount).toBe(0);
      expect(await containedCache.get(comKey1)).toBeNull();
      expect(await containedCache.get(comKey2)).toBeNull();
    });
  });

  describe('Query methods', () => {
    beforeEach(() => {
      cache = new EnhancedMemoryCacheMap(types);
    });

    describe('allIn()', () => {
      it('should return all items when location array is empty', async () => {
        const item1: TestItem = createTestItem(key1, 'item1', 'test1', 100);
        const item2: TestItem = createTestItem(key2, 'item2', 'test2', 200);

        cache.set(key1, item1);
        cache.set(key2, item2);

        const result = await cache.allIn([]);
        expect(result).toHaveLength(2);
        expect(result).toContainEqual(item1);
        expect(result).toContainEqual(item2);
      });

      it('should return items in specific location for composite keys', async () => {
        const containedCache = new EnhancedMemoryCacheMap<ContainedTestItem, 'test', 'container'>(['test']);

        const item1: ContainedTestItem = createContainedTestItem(comKey1, 'item1', 'contained1', 'data1'); // loc1, subloc1
        const item2: ContainedTestItem = createContainedTestItem(comKey2, 'item2', 'contained2', 'data2'); // loc1, subloc2
        const item3: ContainedTestItem = createContainedTestItem(comKey3, 'item3', 'contained3', 'data3'); // loc2, subloc1

        containedCache.set(comKey1, item1);
        containedCache.set(comKey2, item2);
        containedCache.set(comKey3, item3);

        const location1Items = await containedCache.allIn([{ kt: 'container', lk: 'container1' as UUID }]);
        expect(location1Items).toHaveLength(2); // item1 and item3 both in container1
        expect(location1Items).toContainEqual(item1);
        expect(location1Items).toContainEqual(item3);

        const location2Items = await containedCache.allIn([{ kt: 'container', lk: 'container2' as UUID }]);
        expect(location2Items).toHaveLength(1);
        expect(location2Items[0]).toEqual(item2);
      });

      it('should return empty array for non-matching location', async () => {
        const containedCache = new EnhancedMemoryCacheMap<ContainedTestItem, 'test', 'container'>(['test']);

        const item1: ContainedTestItem = createContainedTestItem(comKey1, 'item1', 'contained1', 'data1');
        containedCache.set(comKey1, item1);

        const result = await containedCache.allIn([{ kt: 'container', lk: 'nonexistent' as UUID }]);
        expect(result).toHaveLength(0);
      });

      it('should handle primary keys with empty location correctly', async () => {
        const item1: TestItem = createTestItem(key1, 'item1', 'test1', 100);
        const item2: TestItem = createTestItem(key2, 'item2', 'test2', 200);

        cache.set(key1, item1);
        cache.set(key2, item2);

        // Primary keys with empty location should return all items
        const resultEmpty = await cache.allIn([]);
        expect(resultEmpty).toHaveLength(2);
        expect(resultEmpty).toContainEqual(item1);
        expect(resultEmpty).toContainEqual(item2);
      });
    });

    describe('contains()', () => {
      it('should return true when query matches existing items', async () => {
        const item1: TestItem = createTestItem(key1, 'item1', 'Alice', 100);
        const item2: TestItem = createTestItem(key2, 'item2', 'Bob', 200);

        cache.set(key1, item1);
        cache.set(key2, item2);

        const query: ItemQuery = IQFactory.condition('name', 'Alice').toQuery();
        const result = await cache.contains(query, []);

        expect(result).toBe(true);
      });

      it('should return false when query does not match any items', async () => {
        const item1: TestItem = createTestItem(key1, 'item1', 'Alice', 100);
        const item2: TestItem = createTestItem(key2, 'item2', 'Bob', 200);

        cache.set(key1, item1);
        cache.set(key2, item2);

        const query: ItemQuery = IQFactory.condition('name', 'Charlie').toQuery();
        const result = await cache.contains(query, []);

        expect(result).toBe(false);
      });

      it('should work with composite keys and specific locations', async () => {
        const containedCache = new EnhancedMemoryCacheMap<ContainedTestItem, 'test', 'container'>(['test']);

        const item1: ContainedTestItem = createContainedTestItem(comKey1, 'item1', 'Alice', 'data1');
        const item2: ContainedTestItem = createContainedTestItem(comKey2, 'item2', 'Bob', 'data2');
        const item3: ContainedTestItem = createContainedTestItem(comKey3, 'item3', 'Charlie', 'data3');

        containedCache.set(comKey1, item1);
        containedCache.set(comKey2, item2);
        containedCache.set(comKey3, item3);

        const query: ItemQuery = IQFactory.condition('name', 'Alice').toQuery();

        // Should find Alice in container1
        const result1 = await containedCache.contains(query, [{ kt: 'container', lk: 'container1' as UUID }]);
        expect(result1).toBe(true);

        // Should not find Alice in container2 (Bob is there)
        const result2 = await containedCache.contains(query, [{ kt: 'container', lk: 'container2' as UUID }]);
        expect(result2).toBe(false);
      });

      it('should handle empty cache', async () => {
        const query: ItemQuery = IQFactory.condition('name', 'Alice').toQuery();
        const result = await cache.contains(query, []);

        expect(result).toBe(false);
      });
    });

    describe('queryIn()', () => {
      it('should return matching items based on query', async () => {
        const item1: TestItem = createTestItem(key1, 'item1', 'Alice', 100);
        const item2: TestItem = createTestItem(key2, 'item2', 'Bob', 200);
        const item3: TestItem = createTestItem(key3, 'item3', 'Alice', 300);

        cache.set(key1, item1);
        cache.set(key2, item2);
        cache.set(key3, item3);

        const query: ItemQuery = IQFactory.condition('name', 'Alice').toQuery();
        const result = await cache.queryIn(query, []);

        expect(result).toHaveLength(2);
        expect(result).toContainEqual(item1);
        expect(result).toContainEqual(item3);
      });

      it('should return empty array when no items match query', async () => {
        const item1: TestItem = createTestItem(key1, 'item1', 'Alice', 100);
        const item2: TestItem = createTestItem(key2, 'item2', 'Bob', 200);

        cache.set(key1, item1);
        cache.set(key2, item2);

        const query: ItemQuery = IQFactory.condition('name', 'Charlie').toQuery();
        const result = await cache.queryIn(query, []);

        expect(result).toHaveLength(0);
      });

      it('should work with composite keys and specific locations', async () => {
        const containedCache = new EnhancedMemoryCacheMap<ContainedTestItem, 'test', 'container'>(['test']);

        const item1: ContainedTestItem = createContainedTestItem(comKey1, 'item1', 'Alice', 'data1');
        const item2: ContainedTestItem = createContainedTestItem(comKey2, 'item2', 'Alice', 'data2');
        const item3: ContainedTestItem = createContainedTestItem(comKey3, 'item3', 'Alice', 'data3');

        containedCache.set(comKey1, item1);
        containedCache.set(comKey2, item2);
        containedCache.set(comKey3, item3);

        const query: ItemQuery = IQFactory.condition('name', 'Alice').toQuery();

        // Should find Alice items in container1 and container2
        const result1 = await containedCache.queryIn(query, [{ kt: 'container', lk: 'container1' as UUID }]);
        expect(result1).toHaveLength(2); // item1 and item3 are both in container1
        expect(result1).toContainEqual(item1);
        expect(result1).toContainEqual(item3);

        const result2 = await containedCache.queryIn(query, [{ kt: 'container', lk: 'container2' as UUID }]);
        expect(result2).toHaveLength(1); // item2 is in container2
        expect(result2[0]).toEqual(item2);
      });

      it('should query all items when location is default empty array', async () => {
        const item1: TestItem = createTestItem(key1, 'item1', 'Alice', 100);
        const item2: TestItem = createTestItem(key2, 'item2', 'Bob', 200);
        const item3: TestItem = createTestItem(key3, 'item3', 'Alice', 300);

        cache.set(key1, item1);
        cache.set(key2, item2);
        cache.set(key3, item3);

        const query: ItemQuery = IQFactory.condition('name', 'Alice').toQuery();
        const result = await cache.queryIn(query);

        expect(result).toHaveLength(2);
        expect(result).toContainEqual(item1);
        expect(result).toContainEqual(item3);
      });

      it('should handle complex queries', async () => {
        const item1: TestItem = createTestItem(key1, 'item1', 'Alice', 100);
        const item2: TestItem = createTestItem(key2, 'item2', 'Bob', 200);
        const item3: TestItem = createTestItem(key3, 'item3', 'Charlie', 100);

        cache.set(key1, item1);
        cache.set(key2, item2);
        cache.set(key3, item3);

        const query: ItemQuery = IQFactory.condition('value', 100).toQuery();
        const result = await cache.queryIn(query, []);

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
      it('should remove specific items by keys', async () => {
        const item1: TestItem = createTestItem(key1, 'item1', 'Alice', 100);
        const item2: TestItem = createTestItem(key2, 'item2', 'Bob', 200);
        const item3: TestItem = createTestItem(key3, 'item3', 'Charlie', 300);

        cache.set(key1, item1);
        cache.set(key2, item2);
        cache.set(key3, item3);

        expect(cache.getStats().currentItemCount).toBe(3);

        cache.invalidateItemKeys([key1, key3]);

        expect(await cache.get(key1)).toBeNull();
        expect(await cache.get(key2)).toEqual(item2);
        expect(await cache.get(key3)).toBeNull();
        expect(cache.getStats().currentItemCount).toBe(1);
      });

      it('should handle non-existent keys gracefully', async () => {
        const item1: TestItem = createTestItem(key1, 'item1', 'Alice', 100);
        cache.set(key1, item1);

        const nonExistentKey: PriKey<'test'> = { kt: 'test', pk: 'nonexistent' as UUID };
        cache.invalidateItemKeys([key1, nonExistentKey]);

        expect(await cache.get(key1)).toBeNull();
        expect(cache.getStats().currentItemCount).toBe(0);
      });

      it('should work with composite keys', async () => {
        const containedCache = new EnhancedMemoryCacheMap<ContainedTestItem, 'test', 'container'>(['test']);

        const item1: ContainedTestItem = createContainedTestItem(comKey1, 'item1', 'Alice', 'data1');
        const item2: ContainedTestItem = createContainedTestItem(comKey2, 'item2', 'Bob', 'data2');
        const item3: ContainedTestItem = createContainedTestItem(comKey3, 'item3', 'Charlie', 'data3');

        containedCache.set(comKey1, item1);
        containedCache.set(comKey2, item2);
        containedCache.set(comKey3, item3);

        containedCache.invalidateItemKeys([comKey1, comKey3]);

        expect(await containedCache.get(comKey1)).toBeNull();
        expect(await containedCache.get(comKey2)).toEqual(item2);
        expect(await containedCache.get(comKey3)).toBeNull();
      });

      it('should handle empty key array', async () => {
        const item1: TestItem = createTestItem(key1, 'item1', 'Alice', 100);
        cache.set(key1, item1);

        cache.invalidateItemKeys([]);

        expect(await cache.get(key1)).toEqual(item1);
        expect(cache.getStats().currentItemCount).toBe(1);
      });
    });

    describe('invalidateLocation()', () => {
      it('should invalidate all primary items when location is empty', async () => {
        const item1: TestItem = createTestItem(key1, 'item1', 'Alice', 100);
        const item2: TestItem = createTestItem(key2, 'item2', 'Bob', 200);

        cache.set(key1, item1);
        cache.set(key2, item2);

        expect(cache.getStats().currentItemCount).toBe(2);

        await cache.invalidateLocation([]);

        expect(await cache.get(key1)).toBeNull();
        expect(await cache.get(key2)).toBeNull();
        expect(cache.getStats().currentItemCount).toBe(0);
      });

      it('should invalidate items in specific location for composite keys', async () => {
        const containedCache = new EnhancedMemoryCacheMap<ContainedTestItem, 'test', 'container'>(['test']);

        const item1: ContainedTestItem = createContainedTestItem(comKey1, 'item1', 'Alice', 'data1'); // loc1, subloc1
        const item2: ContainedTestItem = createContainedTestItem(comKey2, 'item2', 'Bob', 'data2');   // loc1, subloc2
        const item3: ContainedTestItem = createContainedTestItem(comKey3, 'item3', 'Charlie', 'data3'); // loc2, subloc1

        containedCache.set(comKey1, item1);
        containedCache.set(comKey2, item2);
        containedCache.set(comKey3, item3);

        expect(containedCache.getStats().currentItemCount).toBe(3);

        // Invalidate items in container1
        await containedCache.invalidateLocation([{ kt: 'container', lk: 'container1' as UUID }]);

        expect(await containedCache.get(comKey1)).toBeNull(); // Should be removed (container1)
        expect(await containedCache.get(comKey2)).toEqual(item2); // Should remain (container2)
        expect(await containedCache.get(comKey3)).toBeNull(); // Should be removed (container1)
        expect(containedCache.getStats().currentItemCount).toBe(1);
      });

      it('should clear query results when invalidating', async () => {
        const containedCache = new EnhancedMemoryCacheMap<ContainedTestItem, 'test', 'container'>(['test']);

        const item1: ContainedTestItem = createContainedTestItem(comKey1, 'item1', 'Alice', 'data1');
        containedCache.set(comKey1, item1);

        // Set some query results
        const queryHash1 = 'query1';
        const queryHash2 = 'query2';
        containedCache.setQueryResult(queryHash1, [comKey1]);
        containedCache.setQueryResult(queryHash2, [comKey1]);

        expect(await containedCache.hasQueryResult(queryHash1)).toBe(true);
        expect(await containedCache.hasQueryResult(queryHash2)).toBe(true);

        // Invalidate location should clear all query results
        await containedCache.invalidateLocation([{ kt: 'container', lk: 'container1' as UUID }]);

        expect(await containedCache.hasQueryResult(queryHash1)).toBe(false);
        expect(await containedCache.hasQueryResult(queryHash2)).toBe(false);
      });

      it('should handle invalidating non-existent location', async () => {
        const containedCache = new EnhancedMemoryCacheMap<ContainedTestItem, 'test', 'container'>(['test']);

        const item1: ContainedTestItem = createContainedTestItem(comKey1, 'item1', 'Alice', 'data1');
        containedCache.set(comKey1, item1);

        const initialCount = containedCache.getStats().currentItemCount;

        await containedCache.invalidateLocation([{ kt: 'container', lk: 'nonexistent' as UUID }]);

        expect(await containedCache.get(comKey1)).toEqual(item1);
        expect(containedCache.getStats().currentItemCount).toBe(initialCount);
      });

      it('should handle mixed primary and composite keys', async () => {
        // Create cache that can handle both primary and composite keys
        const mixedCache = new EnhancedMemoryCacheMap<TestItem | ContainedTestItem, 'test', 'container'>(['test']);

        const primaryItem: TestItem = createTestItem(key1, 'item1', 'Alice', 100);
        const compositeItem: ContainedTestItem = createContainedTestItem(comKey1, 'item2', 'Bob', 'data1');

        mixedCache.set(key1, primaryItem);
        mixedCache.set(comKey1, compositeItem);

        expect(mixedCache.getStats().currentItemCount).toBe(2);

        // Invalidate primary items (empty location)
        await mixedCache.invalidateLocation([]);

        expect(await mixedCache.get(key1)).toBeNull(); // Primary item should be removed
        expect(await mixedCache.get(comKey1)).toEqual(compositeItem); // Composite item should remain
        expect(mixedCache.getStats().currentItemCount).toBe(1);
      });
    });
  });

  describe('Constructor with initial data', () => {
    it('should initialize cache with provided data', async () => {
      const item1: TestItem = createTestItem(key1, 'item1', 'Alice', 100);
      const item2: TestItem = createTestItem(key2, 'item2', 'Bob', 200);

      const initialData = {
        [JSON.stringify(key1)]: item1,
        [JSON.stringify(key2)]: item2
      };

      cache = new EnhancedMemoryCacheMap(types, {}, initialData);

      expect(await cache.get(key1)).toEqual(item1);
      expect(await cache.get(key2)).toEqual(item2);
      expect(cache.getStats().currentItemCount).toBe(2);
    });

    it('should work with size limits and initial data', async () => {
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

      expect(await cache.get(key1)).toEqual(item1);
      expect(await cache.get(key2)).toEqual(item2);
      expect(cache.getStats().currentItemCount).toBe(2);
      expect(cache.getStats().maxItems).toBe(3);
    });

    it('should handle invalid initial data keys gracefully', async () => {
      const item1: TestItem = createTestItem(key1, 'item1', 'Alice', 100);

      const initialData = {
        'invalid-json-key': item1,
        [JSON.stringify(key1)]: item1
      };

      cache = new EnhancedMemoryCacheMap(types, {}, initialData);

      // Only the valid key should be loaded
      expect(await cache.get(key1)).toEqual(item1);
      expect(cache.getStats().currentItemCount).toBe(1);
    });

    it('should work with composite keys in initial data', async () => {
      const item1: ContainedTestItem = createContainedTestItem(comKey1, 'item1', 'Alice', 'data1');
      const item2: ContainedTestItem = createContainedTestItem(comKey2, 'item2', 'Bob', 'data2');

      const initialData = {
        [JSON.stringify(comKey1)]: item1,
        [JSON.stringify(comKey2)]: item2
      };

      const compositeCache = new EnhancedMemoryCacheMap<ContainedTestItem, 'test', 'container'>(['test'], {}, initialData);

      expect(await compositeCache.get(comKey1)).toEqual(item1);
      expect(await compositeCache.get(comKey2)).toEqual(item2);
      expect(compositeCache.getStats().currentItemCount).toBe(2);
    });

    it('should handle empty initial data', async () => {
      cache = new EnhancedMemoryCacheMap(types, {}, {});

      expect(cache.getStats().currentItemCount).toBe(0);
      expect(await cache.values()).toHaveLength(0);
      expect(await cache.keys()).toHaveLength(0);
    });

    it.skip('should trigger eviction if initial data exceeds limits (now handled at Cache level)', async () => {
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
      const loadedItems = await cache.values();
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

    describe.skip('Eviction edge cases (now handled at Cache level)', () => {
      it('should handle eviction when no items exist', async () => {
        const sizeConfig: CacheSizeConfig = {
          maxItems: 1
        };
        cache = new EnhancedMemoryCacheMap(types, sizeConfig);

        // Should not crash when trying to add to empty cache
        const item1: TestItem = createTestItem(key1, 'item1', 'Alice', 100);
        cache.set(key1, item1);

        expect(await cache.get(key1)).toEqual(item1);
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

      it('should handle zero item limit edge case', async () => {
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
        const retrieved = await cache.get(key1);
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
      it('should handle identical content with different object references', async () => {
        const key1Copy = { kt: 'test' as const, pk: 'item1' as UUID };
        const key1Original = { kt: 'test' as const, pk: 'item1' as UUID };

        const item1: TestItem = createTestItem(key1Copy, 'item1', 'Alice', 100);
        const item2: TestItem = createTestItem(key1Original, 'item1', 'Updated Alice', 200);

        cache.set(key1Copy, item1);
        cache.set(key1Original, item2); // Should update, not add new

        expect(await cache.get(key1Copy)).toEqual(item2);
        expect(await cache.get(key1Original)).toEqual(item2);
        expect(cache.getStats().currentItemCount).toBe(1);
      });

      it('should handle composite keys with identical content', async () => {
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

        expect(await containedCache.get(comKey1Copy)).toEqual(item2);
        expect(containedCache.getStats().currentItemCount).toBe(1);
      });
    });

    describe('Large data edge cases', () => {
      it('should handle large number of items efficiently', async () => {
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
        expect(await cache.get(randomKey)).toBeTruthy();
      });

      it('should handle items with very large property values', async () => {
        const largeString = 'x'.repeat(10000); // 10KB string
        const key: PriKey<'test'> = { kt: 'test', pk: 'large-item' as UUID };
        const item: TestItem = createTestItem(key, 'large-item', largeString, 100);

        cache.set(key, item);

        const retrieved = await cache.get(key);
        expect(retrieved?.name).toBe(largeString);
        expect(cache.getStats().currentSizeBytes).toBeGreaterThan(10000);
      });
    });

    describe('Concurrency simulation', () => {
      it.skip('should handle rapid sequential operations (now handled at Cache level)', async () => {
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
          await cache.get(key);

          if (i % 10 === 0) {
            cache.delete(key);
          }
        }

        // Should still be functional
        expect(cache.getStats().currentItemCount).toBeLessThanOrEqual(10);

        const testKey: PriKey<'test'> = { kt: 'test', pk: 'item5' as UUID };
        const testItem: TestItem = createTestItem(testKey, 'item5', 'Test', 999);
        cache.set(testKey, testItem);

        expect(await cache.get(testKey)).toEqual(testItem);
      });
    });

    describe('Memory cleanup verification', () => {
      it('should properly clean up after clear operation', async () => {
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
        expect(await cache.hasQueryResult('query1')).toBe(true);

        cache.clear();

        expect(cache.getStats().currentItemCount).toBe(0);
        expect(cache.getStats().currentSizeBytes).toBe(0);
        expect(await cache.values()).toHaveLength(0);
        expect(await cache.keys()).toHaveLength(0);

        // Query results should still exist (clear doesn't clear queries)
        expect(await cache.hasQueryResult('query1')).toBe(true);
      });

      it('should handle clone with empty cache', async () => {
        const cloned = await cache.clone();

        expect((cloned as EnhancedMemoryCacheMap<TestItem, 'test'>).getStats().currentItemCount).toBe(0);
        expect(await cloned.values()).toHaveLength(0);
        expect(await cloned.keys()).toHaveLength(0);
      });
    });

    describe('Mixed operation sequences', () => {
      it('should handle complex operation sequences correctly', async () => {
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

        expect(await cache.contains(IQFactory.condition('name', 'Alice').toQuery(), [])).toBe(true);

        cache.invalidateItemKeys([key1]);
        expect(await cache.get(key1)).toBeNull();
        expect(await cache.get(key2)).toEqual(item2);

        const cloned = await cache.clone();
        expect(await cloned.get(key2)).toEqual(item2);
        expect((cloned as EnhancedMemoryCacheMap<TestItem, 'test'>).getStats().maxItems).toBe(3);

        cache.clear();
        expect(cache.getStats().currentItemCount).toBe(0);
        expect((cloned as EnhancedMemoryCacheMap<TestItem, 'test'>).getStats().currentItemCount).toBe(1); // Clone should be independent
      });
    });
  });

  // Additional comprehensive tests for enhanced function coverage
  describe('Advanced metadata management functions', () => {
    beforeEach(() => {
      cache = new EnhancedMemoryCacheMap(types);
    });

    it('should get metadata for specific keys', async () => {
      const item1: TestItem = createTestItem(key1, 'item1', 'test1', 100);
      cache.set(key1, item1);

      const metadata = await cache.getMetadata('{"kt":"test","pk":"item1"}');
      expect(metadata).toBeDefined();
      expect(metadata?.key).toBe('{"kt":"test","pk":"item1"}');
      expect(metadata?.addedAt).toBeTypeOf('number');
      expect(metadata?.lastAccessedAt).toBeTypeOf('number');
      expect(metadata?.accessCount).toBe(0);
      expect(metadata?.estimatedSize).toBeGreaterThan(0);
    });

    it('should return null for non-existent metadata keys', async () => {
      const metadata = await cache.getMetadata('non-existent-key');
      expect(metadata).toBeNull();
    });

    it('should set metadata for specific keys', async () => {
      const item1: TestItem = createTestItem(key1, 'item1', 'test1', 100);
      cache.set(key1, item1);

      const customMetadata = {
        addedAt: Date.now() - 10000,
        lastAccessedAt: Date.now() - 5000,
        accessCount: 42,
        estimatedSize: 999,
        key: '{"kt":"test","pk":"item1"}'
      };

      cache.setMetadata('{"kt":"test","pk":"item1"}', customMetadata);
      const retrievedMetadata = await cache.getMetadata('{"kt":"test","pk":"item1"}');

      expect(retrievedMetadata).toEqual(customMetadata);
    });

    it('should handle setting metadata for non-existent keys', async () => {
      const customMetadata = {
        addedAt: Date.now(),
        lastAccessedAt: Date.now(),
        accessCount: 1,
        estimatedSize: 100,
        key: 'non-existent-key'
      };

      // Should not throw an error
      expect(() => {
        cache.setMetadata('non-existent-key', customMetadata);
      }).not.toThrow();

      // Should be able to retrieve the metadata
      const retrievedMetadata = await cache.getMetadata('non-existent-key');
      expect(retrievedMetadata).toEqual(customMetadata);
    });

    it('should delete metadata for specific keys', async () => {
      const item1: TestItem = createTestItem(key1, 'item1', 'test1', 100);
      cache.set(key1, item1);

      // Verify metadata exists
      const metadata = await cache.getMetadata('{"kt":"test","pk":"item1"}');
      expect(metadata).toBeDefined();

      // Delete metadata
      cache.deleteMetadata('{"kt":"test","pk":"item1"}');

      // Should still exist since deleteMetadata is a no-op in this implementation
      const afterDeleteMetadata = await cache.getMetadata('{"kt":"test","pk":"item1"}');
      expect(afterDeleteMetadata).toBeDefined(); // deleteMetadata doesn't actually delete in this implementation
    });

    it('should get all metadata as a Map', async () => {
      const item1: TestItem = createTestItem(key1, 'item1', 'test1', 100);
      const item2: TestItem = createTestItem(key2, 'item2', 'test2', 200);

      cache.set(key1, item1);
      cache.set(key2, item2);

      const allMetadata = await cache.getAllMetadata();

      expect(allMetadata).toBeInstanceOf(Map);
      expect(allMetadata.size).toBe(2);

      const key1Hash = '{"kt":"test","pk":"item1"}';
      const key2Hash = '{"kt":"test","pk":"item2"}';

      expect(allMetadata.has(key1Hash)).toBe(true);
      expect(allMetadata.has(key2Hash)).toBe(true);

      const metadata1 = allMetadata.get(key1Hash);
      const metadata2 = allMetadata.get(key2Hash);

      expect(metadata1?.key).toBe(key1Hash);
      expect(metadata2?.key).toBe(key2Hash);
    });

    it('should clear all metadata', async () => {
      const item1: TestItem = createTestItem(key1, 'item1', 'test1', 100);
      const item2: TestItem = createTestItem(key2, 'item2', 'test2', 200);

      cache.set(key1, item1);
      cache.set(key2, item2);

      // Verify metadata exists
      const allMetadataBefore = await cache.getAllMetadata();
      expect(allMetadataBefore.size).toBe(2);

      // Clear metadata
      cache.clearMetadata();

      // All metadata should be cleared
      const allMetadataAfter = await cache.getAllMetadata();
      expect(allMetadataAfter.size).toBe(0);

      // But the cache entries should still exist
      expect(await cache.get(key1)).toBeDefined();
      expect(await cache.get(key2)).toBeDefined();
    });
  });

  describe('Size management and tracking functions', () => {
    beforeEach(() => {
      const sizeConfig: CacheSizeConfig = {
        maxSizeBytes: '2KB',
        maxItems: 10
      };
      cache = new EnhancedMemoryCacheMap(types, sizeConfig);
    });

    it('should get current size information', async () => {
      const item1: TestItem = createTestItem(key1, 'item1', 'test1', 100);
      const item2: TestItem = createTestItem(key2, 'item2', 'test2', 200);

      const initialSize = await cache.getCurrentSize();
      expect(initialSize.itemCount).toBe(0);
      expect(initialSize.sizeBytes).toBe(0);

      cache.set(key1, item1);
      const afterFirstItem = await cache.getCurrentSize();
      expect(afterFirstItem.itemCount).toBe(1);
      expect(afterFirstItem.sizeBytes).toBeGreaterThan(0);

      cache.set(key2, item2);
      const afterSecondItem = await cache.getCurrentSize();
      expect(afterSecondItem.itemCount).toBe(2);
      expect(afterSecondItem.sizeBytes).toBeGreaterThan(afterFirstItem.sizeBytes);
    });

    it('should get size limits', async () => {
      const limits = await cache.getSizeLimits();
      expect(limits.maxItems).toBe(10);
      expect(limits.maxSizeBytes).toBe(2000); // 2KB in bytes (decimal)
    });

    it('should get size limits when not configured', async () => {
      const unlimitedCache = new EnhancedMemoryCacheMap(types);
      const limits = await unlimitedCache.getSizeLimits();
      expect(limits.maxItems).toBeNull();
      expect(limits.maxSizeBytes).toBeNull();
    });

    it('should get total size in bytes', () => {
      const item1: TestItem = createTestItem(key1, 'item1', 'test1', 100);
      const item2: TestItem = createTestItem(key2, 'item2', 'test2', 200);

      expect(cache.getTotalSizeBytes()).toBe(0);

      cache.set(key1, item1);
      const sizeAfterFirst = cache.getTotalSizeBytes();
      expect(sizeAfterFirst).toBeGreaterThan(0);

      cache.set(key2, item2);
      const sizeAfterSecond = cache.getTotalSizeBytes();
      expect(sizeAfterSecond).toBeGreaterThan(sizeAfterFirst);

      // Add some query results to test query cache size tracking
      cache.setQueryResult('query1', [key1, key2]);
      const sizeWithQuery = cache.getTotalSizeBytes();
      expect(sizeWithQuery).toBeGreaterThan(sizeAfterSecond);
    });
  });

  describe('Query result caching advanced scenarios', () => {
    beforeEach(() => {
      cache = new EnhancedMemoryCacheMap(types);
    });

    it('should handle setting query results with empty arrays', async () => {
      cache.setQueryResult('empty-query', []);

      const result = await cache.getQueryResult('empty-query');
      expect(result).toEqual([]);

      expect(await cache.hasQueryResult('empty-query')).toBe(true);
    });

    it('should handle setting query results with duplicate keys', async () => {
      cache.setQueryResult('duplicate-query', [key1, key1, key2, key1]);

      const result = await cache.getQueryResult('duplicate-query');
      expect(result).toEqual([key1, key1, key2, key1]); // Should preserve duplicates
    });

    it('should overwrite existing query results', async () => {
      cache.setQueryResult('overwrite-query', [key1]);
      cache.setQueryResult('overwrite-query', [key2, key3]);

      const result = await cache.getQueryResult('overwrite-query');
      expect(result).toEqual([key2, key3]);
    });

    it('should handle very long query hashes', async () => {
      const longQueryHash = 'very-long-query-hash-'.repeat(100);
      cache.setQueryResult(longQueryHash, [key1, key2]);

      expect(await cache.hasQueryResult(longQueryHash)).toBe(true);
      const result = await cache.getQueryResult(longQueryHash);
      expect(result).toEqual([key1, key2]);
    });

    it('should handle special characters in query hashes', async () => {
      const specialQueryHash = 'query-with-!@#$%^&*()_+{}|:"<>?[];,./`~特殊字符';
      cache.setQueryResult(specialQueryHash, [key1]);

      expect(await cache.hasQueryResult(specialQueryHash)).toBe(true);
      const result = await cache.getQueryResult(specialQueryHash);
      expect(result).toEqual([key1]);
    });

    it('should properly track query result cache size', () => {
      const initialTotalSize = cache.getTotalSizeBytes();

      cache.setQueryResult('size-test-1', [key1, key2]);
      const sizeAfterFirst = cache.getTotalSizeBytes();
      expect(sizeAfterFirst).toBeGreaterThan(initialTotalSize);

      cache.setQueryResult('size-test-2', [key3, key4]);
      const sizeAfterSecond = cache.getTotalSizeBytes();
      expect(sizeAfterSecond).toBeGreaterThan(sizeAfterFirst);

      cache.deleteQueryResult('size-test-1');
      const sizeAfterDelete = cache.getTotalSizeBytes();
      expect(sizeAfterDelete).toBeLessThan(sizeAfterSecond);
    });
  });

  describe('Clone functionality enhancement', () => {
    beforeEach(() => {
      const sizeConfig: CacheSizeConfig = {
        maxSizeBytes: '1KB',
        maxItems: 5
      };
      cache = new EnhancedMemoryCacheMap(types, sizeConfig);
    });

    it('should clone cache with all data and configuration', async () => {
      const item1: TestItem = createTestItem(key1, 'item1', 'test1', 100);
      const item2: TestItem = createTestItem(key2, 'item2', 'test2', 200);

      cache.set(key1, item1);
      cache.set(key2, item2);
      cache.setQueryResult('test-query', [key1, key2]);

      const cloned = await cache.clone() as EnhancedMemoryCacheMap<TestItem, 'test'>;

      // Should have same implementation type
      expect(cloned.implementationType).toBe('memory/enhanced');

      // Should have same data
      expect(await cloned.get(key1)).toEqual(item1);
      expect(await cloned.get(key2)).toEqual(item2);

      // Should have same query results
      expect(await cloned.getQueryResult('test-query')).toEqual([key1, key2]);

      // Should have same size limits
      const originalLimits = cache.getSizeLimits();
      const clonedLimits = cloned.getSizeLimits();
      expect(clonedLimits).toEqual(originalLimits);

      // Should be independent instances
      const item3: TestItem = createTestItem(key3, 'item3', 'test3', 300);
      cloned.set(key3, item3);

      expect(await cloned.get(key3)).toEqual(item3);
      expect(await cache.get(key3)).toBeNull();
    });

    it('should clone empty cache correctly', async () => {
      const cloned = await cache.clone() as EnhancedMemoryCacheMap<TestItem, 'test'>;

      expect(cloned.implementationType).toBe('memory/enhanced');
      expect(await cloned.keys()).toEqual([]);
      expect(await cloned.values()).toEqual([]);
      expect((await cloned.getCurrentSize()).itemCount).toBe(0);
      expect((await cloned.getCurrentSize()).sizeBytes).toBe(0);
    });
  });

  describe('Complex invalidation scenarios', () => {
    beforeEach(() => {
      cache = new EnhancedMemoryCacheMap(types);
    });

    it('should handle invalidation of non-existent items gracefully', async () => {
      cache.setQueryResult('test-query', [key1, key2]);

      // Invalidate keys that don't exist in cache
      expect(() => {
        cache.invalidateItemKeys([key1, key2]);
      }).not.toThrow();

      // Query result should be cleared
      expect(await cache.hasQueryResult('test-query')).toBe(false);
    });

    it('should handle invalidation with empty key arrays', async () => {
      cache.setQueryResult('test-query', [key1, key2]);

      expect(() => {
        cache.invalidateItemKeys([]);
      }).not.toThrow();

      // Query result should still exist since no keys were invalidated
      expect(await cache.hasQueryResult('test-query')).toBe(true);
    });

    it('should handle complex location invalidation scenarios', async () => {
      // Create contained cache
      const containedCache = new EnhancedMemoryCacheMap<ContainedTestItem, 'test', 'container'>(['test', 'container']);

      const item1 = createContainedTestItem(comKey1, 'item1', 'test1', 'data1');
      const item2 = createContainedTestItem(comKey2, 'item2', 'test2', 'data2');
      const item3 = createContainedTestItem(comKey3, 'item3', 'test3', 'data3');

      containedCache.set(comKey1, item1);
      containedCache.set(comKey2, item2);
      containedCache.set(comKey3, item3);

      // Set query results that include items in container1
      containedCache.setQueryResult('container1-query', [comKey1, comKey3]);
      containedCache.setQueryResult('container2-query', [comKey2]);
      containedCache.setQueryResult('mixed-query', [comKey1, comKey2, comKey3]);

      // Invalidate container1
      await containedCache.invalidateLocation([{ kt: 'container', lk: 'container1' as UUID }]);

      // Queries involving container1 should be cleared
      expect(await containedCache.hasQueryResult('container1-query')).toBe(false);
      expect(await containedCache.hasQueryResult('mixed-query')).toBe(false);

      // Queries not involving container1 should remain
      expect(await containedCache.hasQueryResult('container2-query')).toBe(true);
    });
  });

  describe('Edge cases and error handling', () => {
    beforeEach(() => {
      cache = new EnhancedMemoryCacheMap(types);
    });

    it('should handle extremely large values gracefully', async () => {
      // Create a large item
      const largeData = 'x'.repeat(100000);
      const largeItem: TestItem = createTestItem(key1, 'item1', largeData, 100);

      expect(() => {
        cache.set(key1, largeItem);
      }).not.toThrow();

      const retrieved = await cache.get(key1);
      expect(retrieved?.name).toBe(largeData);
    });

    it('should handle items with circular references in metadata tracking', async () => {
      // Create item with potential circular reference
      const circularItem: any = createTestItem(key1, 'item1', 'test1', 100);
      circularItem.self = circularItem; // Create circular reference

      expect(() => {
        cache.set(key1, circularItem);
      }).not.toThrow();

      const retrieved = await cache.get(key1);
      expect(retrieved?.id).toBe('item1');
    });

    it('should handle concurrent operations gracefully', async () => {
      // Simulate concurrent operations
      const promises: Promise<void>[] = [];

      for (let i = 0; i < 100; i++) {
        const key: PriKey<'test'> = { kt: 'test', pk: `item${i}` as UUID };
        const item: TestItem = createTestItem(key, `item${i}`, `test${i}`, i);

        promises.push(
          Promise.resolve().then(async () => {
            cache.set(key, item);
            await cache.get(key);
            if (i % 10 === 0) {
              cache.setQueryResult(`query${i}`, [key]);
            }
          })
        );
      }

      await Promise.all(promises);

      expect((await cache.getCurrentSize()).itemCount).toBe(100);
      expect((await cache.keys()).length).toBe(100);
    });

    it('should maintain consistency during mixed operations', async () => {
      const item1: TestItem = createTestItem(key1, 'item1', 'test1', 100);
      const item2: TestItem = createTestItem(key2, 'item2', 'test2', 200);

      // Perform mixed operations
      cache.set(key1, item1);
      cache.setQueryResult('query1', [key1]);
      cache.set(key2, item2);
      cache.setQueryResult('query2', [key1, key2]);

      const initialSize = await cache.getCurrentSize();
      const hasQuery1 = await cache.hasQueryResult('query1');
      const hasQuery2 = await cache.hasQueryResult('query2');
      const initialQueryCount = (hasQuery1 ? 1 : 0) + (hasQuery2 ? 1 : 0);

      cache.delete(key1);

      const afterDeleteSize = await cache.getCurrentSize();
      expect(afterDeleteSize.itemCount).toBe(initialSize.itemCount - 1);

      // Query1 should be completely removed (it only contained key1)
      expect(await cache.hasQueryResult('query1')).toBe(false);
      // Query2 should be filtered to only contain key2
      expect(await cache.hasQueryResult('query2')).toBe(true);
      expect(await cache.getQueryResult('query2')).toEqual([key2]);
    });
  });

  describe('Memory efficiency and performance', () => {
    it('should efficiently handle many small items', async () => {
      const startTime = Date.now();

      for (let i = 0; i < 1000; i++) {
        const key: PriKey<'test'> = { kt: 'test', pk: `item${i}` as UUID };
        const item: TestItem = createTestItem(key, `item${i}`, `test${i}`, i);
        cache.set(key, item);
      }

      const endTime = Date.now();
      expect(endTime - startTime).toBeLessThan(1000); // Should complete in reasonable time

      expect((await cache.getCurrentSize()).itemCount).toBe(1000);
      expect((await cache.keys()).length).toBe(1000);
    });

    it('should handle frequent updates efficiently', async () => {
      const item: TestItem = createTestItem(key1, 'item1', 'test1', 100);
      cache.set(key1, item);

      const initialSize = (await cache.getCurrentSize()).sizeBytes;

      // Perform many updates
      for (let i = 0; i < 100; i++) {
        const updatedItem: TestItem = createTestItem(key1, 'item1', `updated${i}`, 100 + i);
        cache.set(key1, updatedItem);
      }

      const finalItem = await cache.get(key1);
      expect(finalItem?.name).toBe('updated99');
      expect(finalItem?.value).toBe(199);

      // Size should reflect the final item
      const finalSize = (await cache.getCurrentSize()).sizeBytes;
      expect(finalSize).toBeGreaterThan(0);
    });

    it('should handle query result cache size tracking accurately', () => {
      const keys = [key1, key2, key3, key4];

      // Set multiple query results with overlapping keys
      cache.setQueryResult('query1', [key1, key2]);
      cache.setQueryResult('query2', [key2, key3]);
      cache.setQueryResult('query3', [key3, key4]);
      cache.setQueryResult('query4', [key1, key2, key3, key4]);

      const sizeWithQueries = cache.getTotalSizeBytes();
      expect(sizeWithQueries).toBeGreaterThan(0);

      // Clear all query results
      cache.clearQueryResults();

      const sizeWithoutQueries = cache.getTotalSizeBytes();
      expect(sizeWithoutQueries).toBeLessThan(sizeWithQueries);
    });
  });
});
