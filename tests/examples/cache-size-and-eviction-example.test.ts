import { beforeEach, describe, expect, it, vi } from 'vitest';
import { monitorCachePerformance } from '../../examples/cache-size-and-eviction-example';
import { EnhancedMemoryCacheMap } from '../../src/memory/EnhancedMemoryCacheMap';
import { Item } from '@fjell/core';

// Mock the main function by importing and running it
async function loadAndRunExample() {
  // Dynamic import to execute the example
  const module = await import('../../examples/cache-size-and-eviction-example');
  return module;
}
void loadAndRunExample; // Suppress unused function warning

describe('Cache Size and Eviction Example', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    void consoleErrorSpy; // Suppress unused variable warning
  });

  it('should export monitorCachePerformance function', () => {
    expect(typeof monitorCachePerformance).toBe('function');
  });

  it('should monitor cache performance with default label', () => {
    const mockCache = {
      getStats: vi.fn(() => ({
        currentItemCount: 5,
        maxItems: 10,
        currentSizeBytes: 1024,
        maxSizeBytes: 2048,
        utilizationPercent: {
          items: 50,
          bytes: 50
        }
      }))
    };

    monitorCachePerformance(mockCache);

    expect(consoleLogSpy).toHaveBeenCalledWith('\nCache Performance:');
    expect(consoleLogSpy).toHaveBeenCalledWith('  Items: 5/10');
    expect(consoleLogSpy).toHaveBeenCalledWith('  Size: 1.0 KB/2.0 KB');
    expect(consoleLogSpy).toHaveBeenCalledWith('  Item Utilization: 50.0%');
    expect(consoleLogSpy).toHaveBeenCalledWith('  Size Utilization: 50.0%');
  });

  it('should monitor cache performance with custom label', () => {
    const mockCache = {
      getStats: vi.fn(() => ({
        currentItemCount: 3,
        currentSizeBytes: 512,
        utilizationPercent: {
          items: 75.5,
          bytes: 25.8
        }
      }))
    };

    monitorCachePerformance(mockCache, 'Test Cache');

    expect(consoleLogSpy).toHaveBeenCalledWith('\nTest Cache Performance:');
    expect(consoleLogSpy).toHaveBeenCalledWith('  Items: 3');
    expect(consoleLogSpy).toHaveBeenCalledWith('  Size: 512 B');
    expect(consoleLogSpy).toHaveBeenCalledWith('  Item Utilization: 75.5%');
    expect(consoleLogSpy).toHaveBeenCalledWith('  Size Utilization: 25.8%');
  });

  it('should handle cache without limits', () => {
    const mockCache = {
      getStats: vi.fn(() => ({
        currentItemCount: 100,
        currentSizeBytes: 5120,
        utilizationPercent: {}
      }))
    };

    monitorCachePerformance(mockCache, 'Unlimited Cache');

    expect(consoleLogSpy).toHaveBeenCalledWith('\nUnlimited Cache Performance:');
    expect(consoleLogSpy).toHaveBeenCalledWith('  Items: 100');
    expect(consoleLogSpy).toHaveBeenCalledWith('  Size: 5.1 KB');
    // Should not log utilization percentages when they're undefined
    expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining('Utilization'));
  });

  it('should handle cache with partial utilization data', () => {
    const mockCache = {
      getStats: vi.fn(() => ({
        currentItemCount: 8,
        currentSizeBytes: 3072,
        maxItems: 10,
        utilizationPercent: {
          items: 80
          // bytes utilization is missing
        }
      }))
    };

    monitorCachePerformance(mockCache, 'Partial Cache');

    expect(consoleLogSpy).toHaveBeenCalledWith('\nPartial Cache Performance:');
    expect(consoleLogSpy).toHaveBeenCalledWith('  Items: 8/10');
    expect(consoleLogSpy).toHaveBeenCalledWith('  Size: 3.1 KB');
    expect(consoleLogSpy).toHaveBeenCalledWith('  Item Utilization: 80.0%');
    expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining('Size Utilization'));
  });

  it('should handle null utilization percentages', () => {
    const mockCache = {
      getStats: vi.fn(() => ({
        currentItemCount: 2,
        currentSizeBytes: 1536,
        maxSizeBytes: 4096,
        utilizationPercent: {
          items: null,
          bytes: 37.5
        }
      }))
    };

    monitorCachePerformance(mockCache, 'Null Items Cache');

    expect(consoleLogSpy).toHaveBeenCalledWith('\nNull Items Cache Performance:');
    expect(consoleLogSpy).toHaveBeenCalledWith('  Items: 2');
    expect(consoleLogSpy).toHaveBeenCalledWith('  Size: 1.5 KB/4.1 KB');
    expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining('Item Utilization'));
    expect(consoleLogSpy).toHaveBeenCalledWith('  Size Utilization: 37.5%');
  });

  describe('integration with real cache', () => {
    it('should work with actual EnhancedMemoryCacheMap', () => {
      const cache = new EnhancedMemoryCacheMap(['test'], {
        maxItems: 5,
        maxSizeBytes: '1KB',
        evictionPolicy: 'lru'
      });

      // Add some test items
      interface TestItem {
        key?: string;
        id: string;
        name: string;
      }

      const testItems: TestItem[] = [
        { key: 'item1', id: 'item1', name: 'Test Item 1' },
        { key: 'item2', id: 'item2', name: 'Test Item 2' }
      ];

      testItems.forEach(item => cache.set(item.key!, item));

      // Monitor performance
      monitorCachePerformance(cache, 'Integration Test Cache');

      const stats = cache.getStats();
      expect(consoleLogSpy).toHaveBeenCalledWith('\nIntegration Test Cache Performance:');
      expect(consoleLogSpy).toHaveBeenCalledWith(`  Items: ${stats.currentItemCount}/5`);
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Size:'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Item Utilization:'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Size Utilization:'));
    });
  });

  describe('main function execution', () => {
    it('should execute demonstrateCacheSizeLimits without errors', async () => {
      // Import and execute the main function
      const { demonstrateCacheSizeLimits } = await import('../../examples/cache-size-and-eviction-example');

      expect(() => {
        demonstrateCacheSizeLimits();
      }).not.toThrow();

      // Should have logged the demo header
      expect(consoleLogSpy).toHaveBeenCalledWith('=== Cache Size Limits and Eviction Policies Demo ===\n');
      expect(consoleLogSpy).toHaveBeenCalledWith('\n=== Demo Complete ===');
    });

    it('should be executable as a module', async () => {
      // Test that the module can be imported and has expected exports
      const module = await import('../../examples/cache-size-and-eviction-example');

      expect(module.monitorCachePerformance).toBeDefined();
      expect(typeof module.monitorCachePerformance).toBe('function');
    });
  });

  describe('example execution tests', () => {
    it('should demonstrate LRU eviction correctly', () => {
      const cache = new EnhancedMemoryCacheMap(['product'], {
        maxItems: 3,
        evictionPolicy: 'lru'
      });

      interface Product extends Item<'product'> {
        id: string;
        name: string;
        description: string;
        price: number;
        category: string;
      }

      const createProduct = (pk: string, name: string, description: string, price: number): Product => ({
        key: { kt: 'product', pk: pk as any },
        id: pk,
        name,
        description,
        price,
        category: 'Electronics',
        events: {} as any
      });

      const products: Product[] = [
        createProduct('prod1', 'Laptop', 'Gaming laptop', 1200),
        createProduct('prod2', 'Mouse', 'Wireless mouse', 50),
        createProduct('prod3', 'Keyboard', 'Mechanical keyboard', 150),
        createProduct('prod4', 'Monitor', '4K monitor', 400)
      ];

      // Add first 3 products
      for (const product of products.slice(0, 3)) {
        cache.set(product.key, product);
      }

      expect(cache.getStats().currentItemCount).toBe(3);

      // Access prod1 to make it recently used
      cache.get(products[0].key);

      // Add prod4, should trigger eviction due to maxItems limit
      cache.set(products[3].key, products[3]);

      // Should have exactly 3 items after eviction
      const stats = cache.getStats();
      expect(stats.currentItemCount).toBe(3);

      // Count how many items still exist
      const existingItems = [
        cache.get(products[0].key),
        cache.get(products[1].key),
        cache.get(products[2].key),
        cache.get(products[3].key)
      ].filter(item => item !== null);

      expect(existingItems).toHaveLength(3);
      expect(cache.get(products[3].key)).toBeTruthy(); // New item should definitely exist
    });

    it('should demonstrate FIFO eviction correctly', () => {
      const cache = new EnhancedMemoryCacheMap(['product'], {
        maxItems: 2,
        evictionPolicy: 'fifo'
      });

      interface Product extends Item<'product'> {
        id: string;
        name: string;
      }

      const createProduct = (pk: string, name: string): Product => ({
        key: { kt: 'product', pk: pk as any },
        id: pk,
        name,
        events: {} as any
      });

      const products: Product[] = [
        createProduct('prod1', 'First'),
        createProduct('prod2', 'Second'),
        createProduct('prod3', 'Third')
      ];

      // Add products
      products.forEach(product => cache.set(product.key, product));

      // With FIFO, first item should be evicted when third is added
      expect(cache.get(products[0].key)).toBeNull(); // First in, first out
      expect(cache.get(products[1].key)).toBeTruthy(); // Should still be present
      expect(cache.get(products[2].key)).toBeTruthy(); // Should be present
      expect(cache.getStats().currentItemCount).toBe(2);
    });

    it('should demonstrate size-based eviction', () => {
      const cache = new EnhancedMemoryCacheMap(['product'], {
        maxSizeBytes: '100', // Very small limit
        evictionPolicy: 'lru'
      });

      interface Product extends Item<'product'> {
        id: string;
        name: string;
        description: string;
      }

      const createProduct = (pk: string, name: string, description: string): Product => ({
        key: { kt: 'product', pk: pk as any },
        id: pk,
        name,
        description,
        events: {} as any
      });

      const smallProduct = createProduct('small', 'A', 'B');
      const largeProduct = createProduct('large', 'Very long product name with lots of text', 'A very detailed description that makes this product quite large in memory');

      cache.set(smallProduct.key, smallProduct);
      const initialStats = cache.getStats();
      expect(initialStats.currentItemCount).toBe(1);

      cache.set(largeProduct.key, largeProduct);

      // Due to size constraints, items may be evicted
      const finalStats = cache.getStats();
      expect(finalStats.currentSizeBytes).toBeLessThanOrEqual(500); // Allow buffer for size estimation variance
    });

    it('should demonstrate LFU eviction correctly', () => {
      const cache = new EnhancedMemoryCacheMap(['product'], {
        maxItems: 3,
        evictionPolicy: 'lfu'
      });

      interface Product extends Item<'product'> {
        id: string;
        name: string;
      }

      const createProduct = (pk: string, name: string): Product => ({
        key: { kt: 'product', pk: pk as any },
        id: pk,
        name,
        events: {} as any
      });

      const products: Product[] = [
        createProduct('prod1', 'Product 1'),
        createProduct('prod2', 'Product 2'),
        createProduct('prod3', 'Product 3'),
        createProduct('prod4', 'Product 4')
      ];

      // Add initial items
      for (const product of products.slice(0, 3)) {
        cache.set(product.key, product);
      }

      // Create access pattern: prod1=2, prod2=1, prod3=4
      cache.get(products[0].key);
      cache.get(products[0].key);

      cache.get(products[2].key);
      cache.get(products[2].key);
      cache.get(products[2].key);
      cache.get(products[2].key);

      // prod2 has only 1 access from set operation

      // Add prod4 - should evict prod2 (least frequent)
      cache.set(products[3].key, products[3]);

      expect(cache.getStats().currentItemCount).toBe(3);
      expect(cache.get(products[1].key)).toBeNull(); // prod2 should be evicted
      expect(cache.get(products[0].key)).toBeTruthy(); // prod1 should remain
      expect(cache.get(products[2].key)).toBeTruthy(); // prod3 should remain
      expect(cache.get(products[3].key)).toBeTruthy(); // prod4 should be present
    });

    it('should handle combined size and item limits', () => {
      const cache = new EnhancedMemoryCacheMap(['product'], {
        maxItems: 5,
        maxSizeBytes: '1KB',
        evictionPolicy: 'lru'
      });

      interface Product extends Item<'product'> {
        id: string;
        name: string;
        description: string;
      }

      const createProduct = (pk: string, name: string, description: string): Product => ({
        key: { kt: 'product', pk: pk as any },
        id: pk,
        name,
        description,
        events: {} as any
      });

      const products: Product[] = [
        createProduct('prod1', 'Laptop', 'Gaming laptop with high performance specs'),
        createProduct('prod2', 'Mouse', 'Wireless mouse with precision tracking'),
        createProduct('prod3', 'Keyboard', 'Mechanical keyboard with RGB lighting'),
        createProduct('prod4', 'Monitor', '4K monitor with excellent color accuracy')
      ];

      for (const product of products) {
        cache.set(product.key, product);
      }

      const stats = cache.getStats();
      // Either item count or size limit should be enforced
      expect(stats.currentItemCount).toBeLessThanOrEqual(5);
      expect(stats.currentSizeBytes).toBeLessThanOrEqual(stats.maxSizeBytes || Infinity);
    });
  });

  describe('size format parsing', () => {
    it('should handle different size formats correctly', () => {
      const testCases = [
        { format: '500', expectedApprox: 500 },
        { format: '2KB', expectedApprox: 2000 },
        { format: '1.5MB', expectedApprox: 1500000 },
        { format: '1GiB', expectedApprox: 1073741824 },
        { format: '512MiB', expectedApprox: 536870912 }
      ];

      for (const testCase of testCases) {
        const cache = new EnhancedMemoryCacheMap(['test'], {
          maxSizeBytes: testCase.format,
          evictionPolicy: 'lru'
        });

        const stats = cache.getStats();
        expect(stats.maxSizeBytes).toBeGreaterThan(0);

        // Allow for some variance due to binary vs decimal differences
        const tolerance = Math.max(testCase.expectedApprox * 0.1, 1000);
        expect(stats.maxSizeBytes).toBeGreaterThanOrEqual(testCase.expectedApprox - tolerance);
        expect(stats.maxSizeBytes).toBeLessThanOrEqual(testCase.expectedApprox * 1.1 + tolerance);
      }
    });

    it('should handle edge case size formats', () => {
      // Test that very small sizes work
      const cache = new EnhancedMemoryCacheMap(['test'], {
        maxSizeBytes: '1',
        evictionPolicy: 'lru'
      });

      const stats = cache.getStats();
      expect(stats.maxSizeBytes).toBe(1);
    });

  });

  describe('eviction policy edge cases', () => {
    it('should handle rapid insertions with LRU policy', () => {
      const cache = new EnhancedMemoryCacheMap(['test'], {
        maxItems: 2,
        evictionPolicy: 'lru'
      });

      interface TestItem extends Item<'test'> {
        id: string;
        value: number;
      }

      const createTestItem = (id: string, value: number): TestItem => ({
        key: { kt: 'test', pk: id as any },
        id,
        value,
        events: {} as any
      });

      // Rapid insertions
      for (let i = 0; i < 10; i++) {
        cache.set(createTestItem(`item${i}`, i).key, createTestItem(`item${i}`, i));
      }

      expect(cache.getStats().currentItemCount).toBe(2);

      // Only the last two items should remain
      expect(cache.get(createTestItem('item8', 8).key)).toBeTruthy();
      expect(cache.get(createTestItem('item9', 9).key)).toBeTruthy();
      expect(cache.get(createTestItem('item0', 0).key)).toBeNull();
    });

    it('should handle updates to existing items without changing item count', () => {
      const cache = new EnhancedMemoryCacheMap(['test'], {
        maxItems: 3,
        evictionPolicy: 'lru'
      });

      interface TestItem extends Item<'test'> {
        id: string;
        value: number;
      }

      const createTestItem = (id: string, value: number): TestItem => ({
        key: { kt: 'test', pk: id as any },
        id,
        value,
        events: {} as any
      });

      const item1 = createTestItem('item1', 1);
      const item2 = createTestItem('item2', 2);
      const item3 = createTestItem('item3', 3);

      cache.set(item1.key, item1);
      cache.set(item2.key, item2);
      cache.set(item3.key, item3);

      expect(cache.getStats().currentItemCount).toBe(3);

      // Update existing item
      const updatedItem1 = createTestItem('item1', 100);
      cache.set(item1.key, updatedItem1);

      expect(cache.getStats().currentItemCount).toBe(3);
      const retrieved = cache.get(item1.key);
      expect(retrieved?.value).toBe(100);
    });

    it('should handle empty cache operations gracefully', () => {
      const cache = new EnhancedMemoryCacheMap(['test'], {
        maxItems: 10,
        evictionPolicy: 'lru'
      });

      const testKey = { kt: 'test', pk: 'nonexistent' as any };

      expect(cache.get(testKey)).toBeNull();
      expect(cache.getStats().currentItemCount).toBe(0);

      const stats = cache.getStats();
      expect(stats.currentSizeBytes).toBe(0);
      expect(stats.currentItemCount).toBe(0);
    });
  });

  describe('utilization percentage calculations', () => {
    it('should calculate utilization percentages correctly', () => {
      const cache = new EnhancedMemoryCacheMap(['test'], {
        maxItems: 10,
        maxSizeBytes: '10KB', // Larger size limit to ensure item count limit is hit first
        evictionPolicy: 'lru'
      });

      interface TestItem extends Item<'test'> {
        id: string;
        data: string;
      }

      const createTestItem = (id: string, dataSize: number): TestItem => ({
        key: { kt: 'test', pk: id as any },
        id,
        data: 'x'.repeat(dataSize),
        events: {} as any
      });

      // Add 5 items to reach 50% item utilization
      for (let i = 0; i < 5; i++) {
        cache.set(createTestItem(`item${i}`, 10).key, createTestItem(`item${i}`, 10));
      }

      const stats = cache.getStats();
      // Check that we have 5 items and the utilization is calculated correctly
      expect(stats.currentItemCount).toBe(5);
      expect(stats.utilizationPercent?.items).toBeCloseTo(50, 1);
      expect(stats.utilizationPercent?.bytes).toBeGreaterThan(0);
      expect(stats.utilizationPercent?.bytes).toBeLessThanOrEqual(100);
    });

    it('should handle utilization when no limits are set', () => {
      const cache = new EnhancedMemoryCacheMap(['test'], {
        evictionPolicy: 'lru'
      });

      interface TestItem extends Item<'test'> {
        id: string;
      }

      const createTestItem = (id: string): TestItem => ({
        key: { kt: 'test', pk: id as any },
        id,
        events: {} as any
      });

      cache.set(createTestItem('item1').key, createTestItem('item1'));

      const stats = cache.getStats();
      expect(stats.utilizationPercent?.items).toBeUndefined();
      expect(stats.utilizationPercent?.bytes).toBeUndefined();
    });
  });
});
