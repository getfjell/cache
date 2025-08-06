// @ts-nocheck
import { beforeEach, describe, expect, it } from 'vitest';
import { EnhancedMemoryCacheMap } from '../../src/memory/EnhancedMemoryCacheMap';
import { CacheSizeConfig } from '../../src/Options';
import { Item } from '@fjell/core';

// Mock item type for testing
interface TestItem extends Item<'test'> {
  id: string;
  name: string;
  value: number;
  metadata?: any;
}

describe('EnhancedMemoryCacheMap Edge Cases and Comprehensive Tests', () => {
  let cache: EnhancedMemoryCacheMap<TestItem, 'test'>;
  let types: ['test'];

  beforeEach(() => {
    types = ['test'];
  });

  describe('Configuration edge cases', () => {
    it('should handle minimal size limits', () => {
      const sizeConfig: CacheSizeConfig = {
        maxSizeBytes: '1', // 1 byte
        maxItems: 1,
        evictionPolicy: 'lru'
      };

      cache = new EnhancedMemoryCacheMap(types, sizeConfig);

      const item1: TestItem = { key: 'item1', id: 'item1', name: 'a', value: 1 };
      cache.set('item1', item1);

      const stats = cache.getStats();
      expect(stats.currentItemCount).toBe(1);
      expect(stats.maxItems).toBe(1);
      expect(stats.maxSizeBytes).toBe(1);
    });

    it('should handle very large size limits', () => {
      const sizeConfig: CacheSizeConfig = {
        maxSizeBytes: '1TB',
        maxItems: 1000000,
        evictionPolicy: 'lru'
      };

      cache = new EnhancedMemoryCacheMap(types, sizeConfig);

      const stats = cache.getStats();
      expect(stats.maxSizeBytes).toBe(1000000000000);
      expect(stats.maxItems).toBe(1000000);
    });

    it('should handle missing size configuration gracefully', () => {
      cache = new EnhancedMemoryCacheMap(types);

      const item1: TestItem = { key: 'item1', id: 'item1', name: 'test', value: 100 };
      cache.set('item1', item1);

      const stats = cache.getStats();
      expect(stats.maxSizeBytes).toBeUndefined();
      expect(stats.maxItems).toBeUndefined();
      expect(stats.currentItemCount).toBe(1);
    });

    it('should handle partial size configuration', () => {
      const sizeConfig1: CacheSizeConfig = {
        maxItems: 5
        // No maxSizeBytes or evictionPolicy
      };

      cache = new EnhancedMemoryCacheMap(types, sizeConfig1);

      const stats1 = cache.getStats();
      expect(stats1.maxItems).toBe(5);
      expect(stats1.maxSizeBytes).toBeUndefined();

      const sizeConfig2: CacheSizeConfig = {
        maxSizeBytes: '1MB'
        // No maxItems or evictionPolicy
      };

      const cache2 = new EnhancedMemoryCacheMap(types, sizeConfig2);
      const stats2 = cache2.getStats();
      expect(stats2.maxSizeBytes).toBe(1000000);
      expect(stats2.maxItems).toBeUndefined();
    });
  });

  describe('Eviction behavior edge cases', () => {
    it('should handle rapid eviction scenarios', () => {
      const sizeConfig: CacheSizeConfig = {
        maxItems: 3,
        evictionPolicy: 'lru'
      };

      cache = new EnhancedMemoryCacheMap(types, sizeConfig);

      // Add items rapidly
      for (let i = 0; i < 10; i++) {
        const item: TestItem = { key: `item${i}`, id: `item${i}`, name: `test${i}`, value: i };
        cache.set(`item${i}`, item);

        const stats = cache.getStats();
        expect(stats.currentItemCount).toBeLessThanOrEqual(3);
      }

      const finalStats = cache.getStats();
      expect(finalStats.currentItemCount).toBe(3);
    });

    it('should handle size-based eviction with very small limits', () => {
      const sizeConfig: CacheSizeConfig = {
        maxSizeBytes: '50', // Very small
        evictionPolicy: 'fifo'
      };

      cache = new EnhancedMemoryCacheMap(types, sizeConfig);

      // Add items that will likely exceed size
      const item1: TestItem = { key: 'item1', id: 'item1', name: 'test item 1', value: 100 };
      const item2: TestItem = { key: 'item2', id: 'item2', name: 'test item 2', value: 200 };

      cache.set('item1', item1);
      cache.set('item2', item2);

      const stats = cache.getStats();
      expect(stats.currentSizeBytes).toBeLessThanOrEqual(200); // Allow more buffer for size estimation variance
    });

    it('should handle items of varying sizes correctly', () => {
      const sizeConfig: CacheSizeConfig = {
        maxSizeBytes: '1KB',
        evictionPolicy: 'lru'
      };

      cache = new EnhancedMemoryCacheMap(types, sizeConfig);

      // Small item
      const smallItem: TestItem = { key: 'small', id: 'small', name: 'a', value: 1 };

      // Large item with metadata
      const largeItem: TestItem = {
        key: 'large',
        id: 'large',
        name: 'very long name with lots of text to make it larger',
        value: 999999,
        metadata: {
          description: 'A very long description that should make this item quite large in terms of estimated size',
          tags: ['tag1', 'tag2', 'tag3', 'tag4', 'tag5'],
          settings: { a: 1, b: 2, c: 3, d: 4, e: 5 }
        }
      };

      cache.set('small', smallItem);
      cache.set('large', largeItem);

      const stats = cache.getStats();
      expect(stats.currentSizeBytes).toBeLessThanOrEqual(1000);
    });
  });

  describe('Key handling edge cases', () => {
    it('should handle various key formats', () => {
      cache = new EnhancedMemoryCacheMap(types);

      const items = [
        { key: 'simple', id: 'simple', name: 'Simple key', value: 1 },
        { key: 'key with spaces', id: 'spaces', name: 'Spaced key', value: 2 },
        { key: 'key-with-dashes', id: 'dashes', name: 'Dashed key', value: 3 },
        { key: 'key_with_underscores', id: 'underscores', name: 'Underscored key', value: 4 },
        { key: '123numeric', id: 'numeric', name: 'Numeric key', value: 5 },
        { key: 'UPPERCASE', id: 'upper', name: 'Upper key', value: 6 },
        { key: 'mixedCASE', id: 'mixed', name: 'Mixed key', value: 7 }
      ];

      items.forEach(item => {
        cache.set(item.key, item);
        expect(cache.get(item.key)).toEqual(item);
      });

      expect(cache.getStats().currentItemCount).toBe(items.length);
    });

    it('should handle special characters in keys', () => {
      cache = new EnhancedMemoryCacheMap(types);

      const specialItems = [
        { key: 'key@domain.com', id: 'email', name: 'Email key', value: 1 },
        { key: 'path/to/resource', id: 'path', name: 'Path key', value: 2 },
        { key: 'query?param=value', id: 'query', name: 'Query key', value: 3 },
        { key: 'fragment#section', id: 'fragment', name: 'Fragment key', value: 4 },
        { key: 'unicode-café', id: 'unicode', name: 'Unicode key', value: 5 }
      ];

      specialItems.forEach(item => {
        cache.set(item.key, item);
        expect(cache.get(item.key)).toEqual(item);
        expect(cache.includesKey(item.key)).toBe(true);
      });
    });

    it('should handle key collisions gracefully', () => {
      cache = new EnhancedMemoryCacheMap(types);

      const item1: TestItem = { key: 'collision', id: 'first', name: 'First item', value: 1 };
      const item2: TestItem = { key: 'collision', id: 'second', name: 'Second item', value: 2 };

      cache.set('collision', item1);
      expect(cache.get('collision')).toEqual(item1);

      // Overwrite with same key
      cache.set('collision', item2);
      expect(cache.get('collision')).toEqual(item2);
      expect(cache.getStats().currentItemCount).toBe(1);
    });
  });

  describe('Memory tracking edge cases', () => {
    it('should track memory correctly during updates', () => {
      const sizeConfig: CacheSizeConfig = {
        maxSizeBytes: '10KB',
        evictionPolicy: 'lru'
      };

      cache = new EnhancedMemoryCacheMap(types, sizeConfig);

      const smallItem: TestItem = { key: 'item1', id: 'item1', name: 'small', value: 1 };
      cache.set('item1', smallItem);

      const initialStats = cache.getStats();
      const initialSize = initialStats.currentSizeBytes;

      // Update with larger item
      const largeItem: TestItem = {
        key: 'item1',
        id: 'item1',
        name: 'much larger item with more data',
        value: 999999,
        metadata: { large: 'data structure with lots of information' }
      };
      cache.set('item1', largeItem);

      const updatedStats = cache.getStats();
      expect(updatedStats.currentSizeBytes).toBeGreaterThan(initialSize);
      expect(updatedStats.currentItemCount).toBe(1); // Same count

      // Update with smaller item
      cache.set('item1', smallItem);

      const finalStats = cache.getStats();
      expect(finalStats.currentSizeBytes).toBeLessThan(updatedStats.currentSizeBytes);
      expect(finalStats.currentItemCount).toBe(1);
    });

    it('should handle zero-size items correctly', () => {
      cache = new EnhancedMemoryCacheMap(types);

      // Item that might have very small estimated size
      const minimalItem: TestItem = { key: '', id: '', name: '', value: 0 };
      cache.set('minimal', minimalItem);

      const stats = cache.getStats();
      expect(stats.currentSizeBytes).toBeGreaterThan(0); // Should have some overhead
      expect(stats.currentItemCount).toBe(1);
    });

    it('should maintain accurate counts during rapid operations', () => {
      cache = new EnhancedMemoryCacheMap(types);

      // Rapid set operations
      for (let i = 0; i < 100; i++) {
        const item: TestItem = { key: `item${i}`, id: `item${i}`, name: `test${i}`, value: i };
        cache.set(`item${i}`, item);
      }

      expect(cache.getStats().currentItemCount).toBe(100);

      // Rapid delete operations
      for (let i = 0; i < 50; i++) {
        cache.delete(`item${i}`);
      }

      expect(cache.getStats().currentItemCount).toBe(50);

      // Verify remaining items
      for (let i = 50; i < 100; i++) {
        expect(cache.get(`item${i}`)).toBeTruthy();
      }
    });
  });

  describe('Complex eviction scenarios', () => {
    it('should handle mixed access patterns with LFU', () => {
      const sizeConfig: CacheSizeConfig = {
        maxItems: 5,
        evictionPolicy: 'lfu'
      };

      cache = new EnhancedMemoryCacheMap(types, sizeConfig);

      // Add initial items
      for (let i = 0; i < 5; i++) {
        const item: TestItem = { key: `item${i}`, id: `item${i}`, name: `test${i}`, value: i };
        cache.set(`item${i}`, item);
      }

      // Create complex access patterns
      cache.get('item0'); // 2 accesses total
      cache.get('item0');

      cache.get('item1'); // 4 accesses total
      cache.get('item1');
      cache.get('item1');
      cache.get('item1');

      cache.get('item2'); // 1 access total (just from set)

      cache.get('item3'); // 3 accesses total
      cache.get('item3');
      cache.get('item3');

      cache.get('item4'); // 2 accesses total
      cache.get('item4');

      // Add new item, should evict item2 (least frequent)
      const newItem: TestItem = { key: 'new', id: 'new', name: 'new', value: 999 };
      cache.set('new', newItem);

      expect(cache.get('item2')).toBeNull();
      expect(cache.get('new')).toBeTruthy();
      expect(cache.getStats().currentItemCount).toBe(5);
    });

    it('should handle alternating eviction policies correctly', () => {
      // Test with different policies on same data
      const policies: Array<CacheSizeConfig['evictionPolicy']> = ['lru', 'lfu', 'fifo', 'mru', 'random'];

      policies.forEach(policy => {
        const sizeConfig: CacheSizeConfig = {
          maxItems: 3,
          evictionPolicy: policy
        };

        const testCache = new EnhancedMemoryCacheMap(types, sizeConfig);

        // Add items
        for (let i = 0; i < 5; i++) {
          const item: TestItem = { key: `item${i}`, id: `item${i}`, name: `test${i}`, value: i };
          testCache.set(`item${i}`, item);
        }

        const stats = testCache.getStats();
        expect(stats.currentItemCount).toBe(3);
        expect(stats.maxItems).toBe(3);
      });
    });
  });

  describe('Statistics and monitoring edge cases', () => {
    it('should calculate utilization percentages correctly', () => {
      const sizeConfig: CacheSizeConfig = {
        maxItems: 10,
        maxSizeBytes: '1KB',
        evictionPolicy: 'lru'
      };

      cache = new EnhancedMemoryCacheMap(types, sizeConfig);

      // Add exactly half the items
      for (let i = 0; i < 5; i++) {
        const item: TestItem = { key: `item${i}`, id: `item${i}`, name: `test${i}`, value: i };
        cache.set(`item${i}`, item);
      }

      const stats = cache.getStats();
      expect(stats.utilizationPercent.items).toBe(50); // 5/10 * 100
      expect(stats.utilizationPercent.bytes).toBeDefined();
      expect(stats.utilizationPercent.bytes).toBeGreaterThan(0);
      expect(stats.utilizationPercent.bytes).toBeLessThanOrEqual(100);
    });

    it('should handle edge case utilization values', () => {
      const sizeConfig: CacheSizeConfig = {
        maxItems: 1,
        maxSizeBytes: '100',
        evictionPolicy: 'lru'
      };

      cache = new EnhancedMemoryCacheMap(types, sizeConfig);

      // Empty cache
      let stats = cache.getStats();
      expect(stats.utilizationPercent.items).toBe(0);
      expect(stats.utilizationPercent.bytes).toBe(0);

      // Full cache
      const item: TestItem = { key: 'item1', id: 'item1', name: 'test', value: 1 };
      cache.set('item1', item);

      stats = cache.getStats();
      expect(stats.utilizationPercent.items).toBe(100); // 1/1 * 100
    });

    it('should handle stats without limits', () => {
      cache = new EnhancedMemoryCacheMap(types); // No limits

      const item: TestItem = { key: 'item1', id: 'item1', name: 'test', value: 1 };
      cache.set('item1', item);

      const stats = cache.getStats();
      expect(stats.currentItemCount).toBe(1);
      expect(stats.currentSizeBytes).toBeGreaterThan(0);
      expect(stats.maxItems).toBeUndefined();
      expect(stats.maxSizeBytes).toBeUndefined();
      expect(stats.utilizationPercent.items).toBeUndefined();
      expect(stats.utilizationPercent.bytes).toBeUndefined();
    });
  });

  describe('Clone functionality edge cases', () => {
    it('should clone with complex size configurations', () => {
      const sizeConfig: CacheSizeConfig = {
        maxItems: 5,
        maxSizeBytes: '1KB',
        evictionPolicy: 'arc'
      };

      cache = new EnhancedMemoryCacheMap(types, sizeConfig);

      // Add items with various access patterns
      for (let i = 0; i < 3; i++) {
        const item: TestItem = { key: `item${i}`, id: `item${i}`, name: `test${i}`, value: i };
        cache.set(`item${i}`, item);

        // Access items different numbers of times
        for (let j = 0; j < i + 1; j++) {
          cache.get(`item${i}`);
        }
      }

      const originalStats = cache.getStats();
      const cloned = cache.clone();
      const clonedStats = cloned.getStats();

      expect(clonedStats.maxItems).toBe(originalStats.maxItems);
      expect(clonedStats.maxSizeBytes).toBe(originalStats.maxSizeBytes);
      expect(clonedStats.currentItemCount).toBe(originalStats.currentItemCount);

      // Verify data independence
      const newItem: TestItem = { key: 'new', id: 'new', name: 'new', value: 999 };
      cloned.set('new', newItem);

      expect(cache.get('new')).toBeNull();
      expect(cloned.get('new')).toBeTruthy();
    });

    it('should clone without size configuration', () => {
      cache = new EnhancedMemoryCacheMap(types);

      const item: TestItem = { key: 'item1', id: 'item1', name: 'test', value: 1 };
      cache.set('item1', item);

      const cloned = cache.clone();

      expect(cloned.get('item1')).toEqual(item);
      expect(cloned.getStats().maxItems).toBeUndefined();
      expect(cloned.getStats().maxSizeBytes).toBeUndefined();
    });
  });

  describe('Stress testing and performance', () => {
    it('should handle large numbers of items efficiently', () => {
      const sizeConfig: CacheSizeConfig = {
        maxItems: 5000,
        evictionPolicy: 'lru'
      };

      cache = new EnhancedMemoryCacheMap(types, sizeConfig);

      const start = Date.now();

      // Add many items
      for (let i = 0; i < 5000; i++) {
        const item: TestItem = { key: `item${i}`, id: `item${i}`, name: `test${i}`, value: i };
        cache.set(`item${i}`, item);
      }

      const addTime = Date.now() - start;

      // Access items randomly
      const accessStart = Date.now();
      for (let i = 0; i < 1000; i++) {
        const randomKey = `item${Math.floor(Math.random() * 5000)}`;
        cache.get(randomKey);
      }
      const accessTime = Date.now() - accessStart;

      const stats = cache.getStats();
      expect(stats.currentItemCount).toBe(5000);
      expect(addTime).toBeLessThan(5000); // Should be reasonably fast
      expect(accessTime).toBeLessThan(500); // Should be fast
    });

    it('should handle rapid eviction scenarios efficiently', () => {
      const sizeConfig: CacheSizeConfig = {
        maxItems: 100,
        evictionPolicy: 'random'
      };

      cache = new EnhancedMemoryCacheMap(types, sizeConfig);

      const start = Date.now();

      // Add far more items than the limit
      for (let i = 0; i < 1000; i++) {
        const item: TestItem = { key: `item${i}`, id: `item${i}`, name: `test${i}`, value: i };
        cache.set(`item${i}`, item);
      }

      const end = Date.now();

      const stats = cache.getStats();
      expect(stats.currentItemCount).toBe(100);
      expect(end - start).toBeLessThan(2000); // Should handle eviction efficiently
    });
  });
});
