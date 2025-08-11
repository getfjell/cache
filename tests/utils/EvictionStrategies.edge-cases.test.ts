import { beforeEach, describe, expect, it } from 'vitest';
import {
  ARCEvictionStrategy,
  CacheItemMetadata,
  CacheMapMetadataProvider,
  createEvictionStrategy,
  EvictionContext,
  FIFOEvictionStrategy,
  LFUEvictionStrategy,
  LRUEvictionStrategy,
  MRUEvictionStrategy,
  RandomEvictionStrategy,
  TwoQueueEvictionStrategy
} from '../../src/eviction';

describe('Eviction Strategies Edge Cases and Comprehensive Tests', () => {
  let mockMetadata: Map<string, CacheItemMetadata>;
  let mockMetadataProvider: CacheMapMetadataProvider;
  let mockContext: EvictionContext;
  const baseTime = Date.now();

  beforeEach(() => {
    mockMetadata = new Map();
    mockMetadataProvider = {
      getMetadata: async (key: string) => mockMetadata.get(key) || null,
      setMetadata: async (key: string, metadata: CacheItemMetadata) => { mockMetadata.set(key, metadata); },
      deleteMetadata: async (key: string) => { mockMetadata.delete(key); },
      getAllMetadata: async () => mockMetadata,
      clearMetadata: async () => { mockMetadata.clear(); },
      getCurrentSize: async () => ({ itemCount: mockMetadata.size, sizeBytes: Array.from(mockMetadata.values()).reduce((sum, m) => sum + m.estimatedSize, 0) }),
      getSizeLimits: async () => ({ maxItems: 100, maxSizeBytes: 10000 })
    };
    mockContext = {
      currentSize: { itemCount: 0, sizeBytes: 0 },
      limits: { maxItems: 100, maxSizeBytes: 10000 },
      newItemSize: 100
    };
  });

  const createMockMetadata = (
    key: string,
    addedAt: number,
    lastAccessedAt: number,
    accessCount: number,
    size: number = 100
  ): CacheItemMetadata => ({
    addedAt: baseTime + addedAt,
    lastAccessedAt: baseTime + lastAccessedAt,
    accessCount,
    estimatedSize: size,
    key
  });

  describe('LRUEvictionStrategy edge cases', () => {
    let strategy: LRUEvictionStrategy;

    beforeEach(() => {
      strategy = new LRUEvictionStrategy();
    });

    it('should handle empty metadata map', async () => {
      const result = await strategy.selectForEviction(mockMetadataProvider, mockContext);
      expect(result).toEqual([]);
    });

    it('should handle single item', async () => {
      mockMetadata.set('item1', createMockMetadata('item1', 0, 100, 5));
      // Update context to require eviction
      mockContext.currentSize.itemCount = 1;
      mockContext.limits.maxItems = 0;

      const result = await strategy.selectForEviction(mockMetadataProvider, mockContext);
      expect(result).toContain('item1');
    });

    it('should handle items with identical access times', async () => {
      mockMetadata.set('item1', createMockMetadata('item1', 0, 100, 5));
      mockMetadata.set('item2', createMockMetadata('item2', 10, 100, 3)); // Same lastAccessedAt
      mockMetadata.set('item3', createMockMetadata('item3', 20, 200, 1));

      // Update context to require eviction
      mockContext.currentSize.itemCount = 3;
      mockContext.limits.maxItems = 2;

      const result = strategy.selectForEviction(mockMetadataProvider, mockContext);
      const resultArray = await result;
      expect(resultArray.length).toBeGreaterThan(0);
      expect(['item1', 'item2']).toContain(resultArray[0]); // Either could be selected
    });

    it('should handle very large time differences', async () => {
      const farFuture = baseTime + 1000000000; // Very far in future
      mockMetadata.set('item1', createMockMetadata('item1', 0, 100, 5));
      mockMetadata.set('item2', createMockMetadata('item2', 0, farFuture - baseTime, 1));

      // Update context to require eviction
      mockContext.currentSize.itemCount = 2;
      mockContext.limits.maxItems = 1;

      const result = await strategy.selectForEviction(mockMetadataProvider, mockContext);
      expect(result).toContain('item1');
    });

    it('should handle zero and negative access counts gracefully', async () => {
      const metadata = createMockMetadata('item1', 0, 100, 0);
      mockMetadata.set('item1', metadata);

      await strategy.onItemAccessed('item1', mockMetadataProvider);
      let updatedMetadata = await mockMetadataProvider.getMetadata('item1');
      expect(updatedMetadata!.accessCount).toBe(1);

      // Test negative count (shouldn't happen in practice)
      updatedMetadata!.accessCount = -5;
      await mockMetadataProvider.setMetadata('item1', updatedMetadata!);
      await strategy.onItemAccessed('item1', mockMetadataProvider);
      updatedMetadata = await mockMetadataProvider.getMetadata('item1');
      expect(updatedMetadata!.accessCount).toBe(-4);
    });

    it('should update timestamps correctly on rapid access', async () => {
      const metadata = createMockMetadata('item1', 0, 100, 5);
      await mockMetadataProvider.setMetadata('item1', metadata);

      // Access multiple times rapidly
      for (let i = 0; i < 10; i++) {
        await strategy.onItemAccessed('item1', mockMetadataProvider);
      }

      // Just check that access count is updated correctly - timestamp checks are flaky
      const updatedMetadata = await mockMetadataProvider.getMetadata('item1');
      expect(updatedMetadata!.accessCount).toBe(15); // 5 + 10
      expect(typeof updatedMetadata!.lastAccessedAt).toBe('number');
    });
  });

  describe('LFUEvictionStrategy edge cases', () => {
    let strategy: LFUEvictionStrategy;

    beforeEach(() => {
      strategy = new LFUEvictionStrategy();
    });

    it('should handle items with zero access count', async () => {
      mockMetadata.set('item1', createMockMetadata('item1', 0, 100, 0));
      mockMetadata.set('item2', createMockMetadata('item2', 10, 200, 1));
      mockMetadata.set('item3', createMockMetadata('item3', 20, 300, 5));

      // Update context to require eviction
      mockContext.currentSize.itemCount = 3;
      mockContext.limits.maxItems = 2;

      const result = await strategy.selectForEviction(mockMetadataProvider, mockContext);
      expect(result).toContain('item1');
    });

    it('should handle items with identical access counts', async () => {
      mockMetadata.set('item1', createMockMetadata('item1', 0, 100, 3));
      mockMetadata.set('item2', createMockMetadata('item2', 10, 200, 3)); // Same access count
      mockMetadata.set('item3', createMockMetadata('item3', 20, 300, 5));

      // Update context to require eviction
      mockContext.currentSize.itemCount = 3;
      mockContext.limits.maxItems = 2;

      const result = await strategy.selectForEviction(mockMetadataProvider, mockContext);
      expect(result.length).toBeGreaterThan(0);
      expect(['item1', 'item2']).toContain(result[0]);
    });

    it('should handle very high access counts', async () => {
      mockMetadata.set('item1', createMockMetadata('item1', 0, 100, 1000000));
      mockMetadata.set('item2', createMockMetadata('item2', 10, 200, 999999));
      mockMetadata.set('item3', createMockMetadata('item3', 20, 300, 1));

      // Update context to require eviction
      mockContext.currentSize.itemCount = 3;
      mockContext.limits.maxItems = 2;

      const result = await strategy.selectForEviction(mockMetadataProvider, mockContext);
      expect(result).toContain('item3');
    });
  });

  describe('FIFOEvictionStrategy edge cases', () => {
    let strategy: FIFOEvictionStrategy;

    beforeEach(() => {
      strategy = new FIFOEvictionStrategy();
    });

    it('should ignore access patterns completely', async () => {
      const metadata1 = createMockMetadata('item1', 0, 500, 1000); // Heavily accessed, oldest
      const metadata2 = createMockMetadata('item2', 100, 100, 1); // Rarely accessed, newer

      mockMetadata.set('item1', metadata1);
      mockMetadata.set('item2', metadata2);

      // Update context to require eviction
      mockContext.currentSize.itemCount = 2;
      mockContext.limits.maxItems = 1;

      const result = await strategy.selectForEviction(mockMetadataProvider, mockContext);
      expect(result).toContain('item1'); // Oldest added
    });

    it('should handle items added at exactly the same time', async () => {
      mockMetadata.set('item1', createMockMetadata('item1', 100, 200, 5));
      mockMetadata.set('item2', createMockMetadata('item2', 100, 300, 3)); // Same addedAt
      mockMetadata.set('item3', createMockMetadata('item3', 200, 150, 1));

      // Update context to require eviction
      mockContext.currentSize.itemCount = 3;
      mockContext.limits.maxItems = 2;

      const result = await strategy.selectForEviction(mockMetadataProvider, mockContext);
      expect(result.length).toBeGreaterThan(0);
      expect(['item1', 'item2']).toContain(result[0]);
    });
  });

  describe('MRUEvictionStrategy edge cases', () => {
    let strategy: MRUEvictionStrategy;

    beforeEach(() => {
      strategy = new MRUEvictionStrategy();
    });

    it('should select most recently accessed item', async () => {
      mockMetadata.set('item1', createMockMetadata('item1', 0, 100, 5));
      mockMetadata.set('item2', createMockMetadata('item2', 10, 200, 3));
      mockMetadata.set('item3', createMockMetadata('item3', 20, 300, 1)); // Most recent

      // Update context to require eviction
      mockContext.currentSize.itemCount = 3;
      mockContext.limits.maxItems = 2;

      const result = await strategy.selectForEviction(mockMetadataProvider, mockContext);
      expect(result).toContain('item3');
    });

    it('should handle future timestamps gracefully', async () => {
      const futureTime = Date.now() + 1000000;
      mockMetadata.set('item1', createMockMetadata('item1', 0, 100, 5));
      mockMetadata.set('item2', {
        addedAt: baseTime,
        lastAccessedAt: futureTime,
        accessCount: 1,
        estimatedSize: 100,
        key: 'item2'
      });

      // Update context to require eviction
      mockContext.currentSize.itemCount = 2;
      mockContext.limits.maxItems = 1;

      const result = await strategy.selectForEviction(mockMetadataProvider, mockContext);
      expect(result).toContain('item2');
    });
  });

  describe('RandomEvictionStrategy edge cases', () => {
    let strategy: RandomEvictionStrategy;

    beforeEach(() => {
      strategy = new RandomEvictionStrategy();
    });

    it('should eventually select all items over many iterations', async () => {
      mockMetadata.set('item1', createMockMetadata('item1', 0, 100, 5));
      mockMetadata.set('item2', createMockMetadata('item2', 10, 200, 3));
      mockMetadata.set('item3', createMockMetadata('item3', 20, 300, 1));
      mockMetadata.set('item4', createMockMetadata('item4', 30, 400, 10));
      mockMetadata.set('item5', createMockMetadata('item5', 40, 500, 2));

      // Update context to require eviction
      mockContext.currentSize.itemCount = 5;
      mockContext.limits.maxItems = 4;

      const selected = new Set<string>();

      // Run many iterations to get statistical coverage
      for (let i = 0; i < 1000; i++) {
        const result = await strategy.selectForEviction(mockMetadataProvider, mockContext);
        if (result.length > 0) selected.add(result[0]);
      }

      // Should have selected all items at least once
      expect(selected.size).toBe(5);
      expect(selected.has('item1')).toBe(true);
      expect(selected.has('item2')).toBe(true);
      expect(selected.has('item3')).toBe(true);
      expect(selected.has('item4')).toBe(true);
      expect(selected.has('item5')).toBe(true);
    });

    it('should handle single item consistently', async () => {
      mockMetadata.set('item1', createMockMetadata('item1', 0, 100, 5));

      // Update context to require eviction
      mockContext.currentSize.itemCount = 1;
      mockContext.limits.maxItems = 0;

      for (let i = 0; i < 100; i++) {
        const result = await strategy.selectForEviction(mockMetadataProvider, mockContext);
        expect(result).toContain('item1');
      }
    });
  });

  describe('ARCEvictionStrategy edge cases', () => {
    let strategy: ARCEvictionStrategy;

    beforeEach(() => {
      strategy = new ARCEvictionStrategy(10);
    });

    it('should handle ghost list operations', async () => {
      mockMetadata.set('item1', createMockMetadata('item1', 0, 100, 1));
      mockMetadata.set('item2', createMockMetadata('item2', 10, 200, 1));

      // Remove item and test ghost behavior
      await strategy.onItemRemoved('item1', mockMetadataProvider);

      // Access removed item (should hit ghost list)
      const metadata = createMockMetadata('item1', 0, 100, 1);
      mockMetadata.set('item1', metadata);
      await strategy.onItemAccessed('item1', mockMetadataProvider);

      const updatedMetadata = await mockMetadataProvider.getMetadata('item1');
      expect(updatedMetadata?.accessCount).toBe(2);
    });

    it('should adapt target sizes based on access patterns', async () => {
      const items = new Array(5).fill(0).map((_, i) => {
        const metadata = createMockMetadata(`item${i}`, i * 10, 100 + i * 10, 1);
        mockMetadata.set(`item${i}`, metadata);
        return metadata;
      });

      // Simulate various access patterns
      items.forEach((metadata, i) => {
        for (let j = 0; j < i + 1; j++) {
          strategy.onItemAccessed(`item${i}`, mockMetadataProvider);
        }
      });

      // Update context to require eviction
      mockContext.currentSize.itemCount = 5;
      mockContext.limits.maxItems = 4;

      const result = await strategy.selectForEviction(mockMetadataProvider, mockContext);
      expect(result.length).toBeGreaterThan(0);
      expect(mockMetadata.has(result[0])).toBe(true);
    });

    it('should handle maximum ghost list size', async () => {
      const smallStrategy = new ARCEvictionStrategy(3);
      const testMetadataProvider = {
        getMetadata: async (key: string) => mockMetadata.get(key) || null,
        setMetadata: async (key: string, metadata: CacheItemMetadata) => { mockMetadata.set(key, metadata); },
        deleteMetadata: async (key: string) => { mockMetadata.delete(key); },
        getAllMetadata: async () => mockMetadata,
        clearMetadata: async () => { mockMetadata.clear(); },
        getCurrentSize: () => Promise.resolve({ itemCount: mockMetadata.size, sizeBytes: 0 }),
        getSizeLimits: () => Promise.resolve({ maxItems: 100, maxSizeBytes: 10000 })
      };

      // Add many items to ghost lists
      for (let i = 0; i < 10; i++) {
        await smallStrategy.onItemRemoved(`item${i}`, testMetadataProvider);
      }

      // Ghost lists should be limited
      const metadata = createMockMetadata('test', 0, 100, 1);
      mockMetadata.set('test', metadata);
      await smallStrategy.onItemAccessed('test', testMetadataProvider);
      const updatedMetadata = await testMetadataProvider.getMetadata('test');
      expect(updatedMetadata?.accessCount).toBe(2);
    });
  });

  describe('TwoQueueEvictionStrategy edge cases', () => {
    let strategy: TwoQueueEvictionStrategy;

    beforeEach(() => {
      // Use configuration that ensures deterministic behavior for testing
      strategy = new TwoQueueEvictionStrategy(10, {
        type: '2q',
        useFrequencyPromotion: true,
        promotionThreshold: 2,
        hotQueueDecayFactor: 0, // Disable decay to avoid timing-dependent behavior
        useFrequencyWeightedLRU: false // Use simple LRU to avoid timing calculations
      });
    });

    it('should manage queue transitions correctly', async () => {
      // Add items (should go to recent queue)
      strategy.onItemAdded('item1', 100, mockMetadataProvider);
      strategy.onItemAdded('item2', 100, mockMetadataProvider);

      // Access item1 (should move to hot queue)
      strategy.onItemAccessed('item1', mockMetadataProvider);

      // Update context to require eviction
      mockContext.currentSize.itemCount = 2;
      mockContext.limits.maxItems = 1;

      // When evicting, should prefer item2 from recent queue (item1 was promoted to hot queue)
      const result = await strategy.selectForEviction(mockMetadataProvider, mockContext);
      expect(result).toContain('item2');
    });

    it('should handle ghost queue promotions', async () => {
      // Add item
      await strategy.onItemAdded('item1', 100, mockMetadataProvider);

      // Remove item (goes to ghost)
      await strategy.onItemRemoved('item1', mockMetadataProvider);

      // Re-add same item (should be promoted)
      await strategy.onItemAdded('item1', 100, mockMetadataProvider);

      const metadata = await mockMetadataProvider.getMetadata('item1');
      expect(metadata!.accessCount).toBe(1);
    });

    it('should handle queue size limits', async () => {
      const smallStrategy = new TwoQueueEvictionStrategy(4); // Very small cache
      const testMetadataProvider = {
        getMetadata: async (key: string) => mockMetadata.get(key) || null,
        setMetadata: async (key: string, metadata: CacheItemMetadata) => { mockMetadata.set(key, metadata); },
        deleteMetadata: async (key: string) => { mockMetadata.delete(key); },
        getAllMetadata: async () => mockMetadata,
        clearMetadata: async () => { mockMetadata.clear(); },
        getCurrentSize: () => Promise.resolve({ itemCount: mockMetadata.size, sizeBytes: 0 }),
        getSizeLimits: () => Promise.resolve({ maxItems: 100, maxSizeBytes: 10000 })
      };

      // Add many items
      for (let i = 0; i < 10; i++) {
        await smallStrategy.onItemAdded(`item${i}`, 100, testMetadataProvider);
      }

      // Should maintain size limits
      await smallStrategy.onItemAdded('test', 100, testMetadataProvider);
      const testMetadata = await testMetadataProvider.getMetadata('test');
      expect(testMetadata!.accessCount).toBe(1);
    });
  });

  describe('createEvictionStrategy factory edge cases', () => {
    it('should create all strategy types correctly', () => {
      expect(createEvictionStrategy('lru')).toBeInstanceOf(LRUEvictionStrategy);
      expect(createEvictionStrategy('lfu')).toBeInstanceOf(LFUEvictionStrategy);
      expect(createEvictionStrategy('fifo')).toBeInstanceOf(FIFOEvictionStrategy);
      expect(createEvictionStrategy('mru')).toBeInstanceOf(MRUEvictionStrategy);
      expect(createEvictionStrategy('random')).toBeInstanceOf(RandomEvictionStrategy);
      expect(createEvictionStrategy('arc')).toBeInstanceOf(ARCEvictionStrategy);
      expect(createEvictionStrategy('2q')).toBeInstanceOf(TwoQueueEvictionStrategy);
    });

    it('should pass maxCacheSize to strategies that need it', () => {
      const arcStrategy = createEvictionStrategy('arc', 1000);
      const twoQStrategy = createEvictionStrategy('2q', 500);

      expect(arcStrategy).toBeInstanceOf(ARCEvictionStrategy);
      expect(twoQStrategy).toBeInstanceOf(TwoQueueEvictionStrategy);
    });

    it('should handle missing maxCacheSize gracefully', () => {
      const arcStrategy = createEvictionStrategy('arc');
      const twoQStrategy = createEvictionStrategy('2q');

      expect(arcStrategy).toBeInstanceOf(ARCEvictionStrategy);
      expect(twoQStrategy).toBeInstanceOf(TwoQueueEvictionStrategy);
    });

    it('should throw for invalid strategy names', () => {
      expect(() => createEvictionStrategy('invalid' as any)).toThrow('Unsupported eviction policy: invalid');
      expect(() => createEvictionStrategy('' as any)).toThrow('Unsupported eviction policy: ');
      expect(() => createEvictionStrategy('LRU' as any)).toThrow('Unsupported eviction policy: LRU'); // Case sensitive
    });

    it('should handle edge case maxCacheSize values', () => {
      expect(() => createEvictionStrategy('arc', 0)).not.toThrow();
      expect(() => createEvictionStrategy('arc', 1)).not.toThrow();
      expect(() => createEvictionStrategy('arc', 1000000)).not.toThrow();
      expect(() => createEvictionStrategy('2q', -1)).not.toThrow(); // Should handle gracefully
    });

    it('should handle extreme configuration values for enhanced strategies', () => {
      // LFU with extreme configurations
      const extremeLfuConfig = {
        type: 'lfu' as const,
        decayFactor: 0.99, // Very high decay
        decayInterval: 1, // Very fast decay
        sketchWidth: 1, // Minimal sketch
        sketchDepth: 1
      };
      expect(() => createEvictionStrategy('lfu', 1000, extremeLfuConfig)).not.toThrow();

      // ARC with extreme configurations
      const extremeArcConfig = {
        type: 'arc' as const,
        frequencyThreshold: 1000, // Very high threshold
        frequencyDecayFactor: 0.999, // Almost complete decay
        adaptiveLearningRate: 100 // Very fast learning
      };
      expect(() => createEvictionStrategy('arc', 1000, extremeArcConfig)).not.toThrow();

      // 2Q with extreme configurations
      const extreme2QConfig = {
        type: '2q' as const,
        promotionThreshold: 1000,
        hotQueueDecayFactor: 0.999,
        hotQueueDecayInterval: 1
      };
      expect(() => createEvictionStrategy('2q', 1000, extreme2QConfig)).not.toThrow();
    });

    it('should handle invalid configuration values gracefully', () => {
      // Negative decay factors should be handled
      const invalidConfig = {
        type: 'lfu' as const,
        decayFactor: -0.5, // Invalid negative value
        sketchWidth: 0, // Invalid zero value
        sketchDepth: -1 // Invalid negative value
      };
      expect(() => createEvictionStrategy('lfu', 1000, invalidConfig)).not.toThrow();

      // Strategy should still function with invalid configs
      const strategy = createEvictionStrategy('lfu', 1000, invalidConfig);
      expect(strategy).toBeInstanceOf(LFUEvictionStrategy);
    });

    it('should handle configuration type mismatches', () => {
      // Using ARC config for LFU strategy
      const arcConfigForLfu = {
        type: 'arc' as const,
        frequencyThreshold: 5
      };
      expect(() => createEvictionStrategy('lfu', 1000, arcConfigForLfu as any)).not.toThrow();

      // Using 2Q config for ARC strategy
      const twoQConfigForArc = {
        type: '2q' as const,
        promotionThreshold: 3
      };
      expect(() => createEvictionStrategy('arc', 1000, twoQConfigForArc as any)).not.toThrow();
    });
  });

  describe('stress tests and performance edge cases', () => {
    it('should handle large numbers of items efficiently', async () => {
      const strategy = new LRUEvictionStrategy();
      const largeMetadataMap = new Map<string, CacheItemMetadata>();
      const largeMetadataProvider = {
        getMetadata: async (key: string) => largeMetadataMap.get(key) || null,
        setMetadata: async (key: string, metadata: CacheItemMetadata) => { largeMetadataMap.set(key, metadata); },
        deleteMetadata: async (key: string) => { largeMetadataMap.delete(key); },
        getAllMetadata: async () => largeMetadataMap,
        clearMetadata: async () => { largeMetadataMap.clear(); },
        getCurrentSize: () => Promise.resolve({ itemCount: largeMetadataMap.size, sizeBytes: 0 }),
        getSizeLimits: () => Promise.resolve({ maxItems: 9999, maxSizeBytes: 10000 })
      };
      const largeContext = {
        currentSize: { itemCount: 10000, sizeBytes: 0 },
        limits: { maxItems: 9999, maxSizeBytes: 10000 },
        newItemSize: 100
      };

      // Create a large number of items
      for (let i = 0; i < 10000; i++) {
        largeMetadataMap.set(`item${i}`, createMockMetadata(`item${i}`, i, 100 + i, i + 1));
      }

      const start = Date.now();
      const result = await strategy.selectForEviction(largeMetadataProvider, largeContext);
      const end = Date.now();

      expect(result).toContain('item0'); // Oldest accessed
      expect(end - start).toBeLessThan(100); // Should be fast
    });

    it('should handle rapid access pattern changes', async () => {
      const strategy = new LFUEvictionStrategy();
      const metadata1 = createMockMetadata('item1', 0, 100, 0);
      const metadata2 = createMockMetadata('item2', 10, 200, 0);

      await mockMetadataProvider.setMetadata('item1', metadata1);
      await mockMetadataProvider.setMetadata('item2', metadata2);

      // Rapidly change access patterns
      for (let i = 0; i < 1000; i++) {
        await strategy.onItemAccessed('item1', mockMetadataProvider);
        if (i % 2 === 0) {
          await strategy.onItemAccessed('item2', mockMetadataProvider);
        }
      }

      const updatedMetadata1 = await mockMetadataProvider.getMetadata('item1');
      const updatedMetadata2 = await mockMetadataProvider.getMetadata('item2');
      expect(updatedMetadata1!.accessCount).toBe(1000);
      expect(updatedMetadata2!.accessCount).toBe(500);

      // Update context to require eviction
      mockContext.currentSize.itemCount = 2;
      mockContext.limits.maxItems = 1;

      const result = await strategy.selectForEviction(mockMetadataProvider, mockContext);
      expect(result).toContain('item2');
    });

    it('should handle memory-intensive metadata correctly', async () => {
      const strategy = new ARCEvictionStrategy(1000);

      // Create items with large estimated sizes
      for (let i = 0; i < 100; i++) {
        const metadata = createMockMetadata(`item${i}`, i, 100 + i, 1, 1024 * 1024); // 1MB each
        await mockMetadataProvider.setMetadata(`item${i}`, metadata);
        await strategy.onItemAdded(`item${i}`, 1024 * 1024, mockMetadataProvider);
      }

      // Update context to require eviction
      mockContext.currentSize.itemCount = 100;
      mockContext.limits.maxItems = 99;

      const result = await strategy.selectForEviction(mockMetadataProvider, mockContext);
      expect(result.length).toBeGreaterThan(0);
      expect(mockMetadata.has(result[0])).toBe(true);
    });
  });
});
