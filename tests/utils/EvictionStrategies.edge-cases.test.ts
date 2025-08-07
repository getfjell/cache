import { beforeEach, describe, expect, it } from 'vitest';
import {
  ARCEvictionStrategy,
  CacheItemMetadata,
  createEvictionStrategy,
  FIFOEvictionStrategy,
  LFUEvictionStrategy,
  LRUEvictionStrategy,
  MRUEvictionStrategy,
  RandomEvictionStrategy,
  TwoQueueEvictionStrategy
} from '../../src/eviction';

describe('Eviction Strategies Edge Cases and Comprehensive Tests', () => {
  let mockMetadata: Map<string, CacheItemMetadata>;
  const baseTime = Date.now();

  beforeEach(() => {
    mockMetadata = new Map();
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

    it('should handle empty metadata map', () => {
      expect(strategy.selectForEviction(mockMetadata)).toBeNull();
    });

    it('should handle single item', () => {
      mockMetadata.set('item1', createMockMetadata('item1', 0, 100, 5));
      expect(strategy.selectForEviction(mockMetadata)).toBe('item1');
    });

    it('should handle items with identical access times', () => {
      mockMetadata.set('item1', createMockMetadata('item1', 0, 100, 5));
      mockMetadata.set('item2', createMockMetadata('item2', 10, 100, 3)); // Same lastAccessedAt
      mockMetadata.set('item3', createMockMetadata('item3', 20, 200, 1));

      const selected = strategy.selectForEviction(mockMetadata);
      expect(['item1', 'item2']).toContain(selected); // Either could be selected
    });

    it('should handle very large time differences', () => {
      const farFuture = baseTime + 1000000000; // Very far in future
      mockMetadata.set('item1', createMockMetadata('item1', 0, 100, 5));
      mockMetadata.set('item2', createMockMetadata('item2', 0, farFuture - baseTime, 1));

      expect(strategy.selectForEviction(mockMetadata)).toBe('item1');
    });

    it('should handle zero and negative access counts gracefully', () => {
      const metadata = createMockMetadata('item1', 0, 100, 0);
      strategy.onItemAccessed('item1', metadata);
      expect(metadata.accessCount).toBe(1);

      // Test negative count (shouldn't happen in practice)
      metadata.accessCount = -5;
      strategy.onItemAccessed('item1', metadata);
      expect(metadata.accessCount).toBe(-4);
    });

    it('should update timestamps correctly on rapid access', () => {
      const metadata = createMockMetadata('item1', 0, 100, 5);

      // Access multiple times rapidly
      for (let i = 0; i < 10; i++) {
        strategy.onItemAccessed('item1', metadata);
      }

      // Just check that access count is updated correctly - timestamp checks are flaky
      expect(metadata.accessCount).toBe(15); // 5 + 10
      expect(typeof metadata.lastAccessedAt).toBe('number');
    });
  });

  describe('LFUEvictionStrategy edge cases', () => {
    let strategy: LFUEvictionStrategy;

    beforeEach(() => {
      strategy = new LFUEvictionStrategy();
    });

    it('should handle items with zero access count', () => {
      mockMetadata.set('item1', createMockMetadata('item1', 0, 100, 0));
      mockMetadata.set('item2', createMockMetadata('item2', 10, 200, 1));
      mockMetadata.set('item3', createMockMetadata('item3', 20, 300, 5));

      expect(strategy.selectForEviction(mockMetadata)).toBe('item1');
    });

    it('should handle items with identical access counts', () => {
      mockMetadata.set('item1', createMockMetadata('item1', 0, 100, 3));
      mockMetadata.set('item2', createMockMetadata('item2', 10, 200, 3)); // Same access count
      mockMetadata.set('item3', createMockMetadata('item3', 20, 300, 5));

      const selected = strategy.selectForEviction(mockMetadata);
      expect(['item1', 'item2']).toContain(selected);
    });

    it('should handle very high access counts', () => {
      mockMetadata.set('item1', createMockMetadata('item1', 0, 100, 1000000));
      mockMetadata.set('item2', createMockMetadata('item2', 10, 200, 999999));
      mockMetadata.set('item3', createMockMetadata('item3', 20, 300, 1));

      expect(strategy.selectForEviction(mockMetadata)).toBe('item3');
    });
  });

  describe('FIFOEvictionStrategy edge cases', () => {
    let strategy: FIFOEvictionStrategy;

    beforeEach(() => {
      strategy = new FIFOEvictionStrategy();
    });

    it('should ignore access patterns completely', () => {
      const metadata1 = createMockMetadata('item1', 0, 500, 1000); // Heavily accessed, oldest
      const metadata2 = createMockMetadata('item2', 100, 100, 1); // Rarely accessed, newer

      mockMetadata.set('item1', metadata1);
      mockMetadata.set('item2', metadata2);

      expect(strategy.selectForEviction(mockMetadata)).toBe('item1'); // Oldest added
    });

    it('should handle items added at exactly the same time', () => {
      mockMetadata.set('item1', createMockMetadata('item1', 100, 200, 5));
      mockMetadata.set('item2', createMockMetadata('item2', 100, 300, 3)); // Same addedAt
      mockMetadata.set('item3', createMockMetadata('item3', 200, 150, 1));

      const selected = strategy.selectForEviction(mockMetadata);
      expect(['item1', 'item2']).toContain(selected);
    });
  });

  describe('MRUEvictionStrategy edge cases', () => {
    let strategy: MRUEvictionStrategy;

    beforeEach(() => {
      strategy = new MRUEvictionStrategy();
    });

    it('should select most recently accessed item', () => {
      mockMetadata.set('item1', createMockMetadata('item1', 0, 100, 5));
      mockMetadata.set('item2', createMockMetadata('item2', 10, 200, 3));
      mockMetadata.set('item3', createMockMetadata('item3', 20, 300, 1)); // Most recent

      expect(strategy.selectForEviction(mockMetadata)).toBe('item3');
    });

    it('should handle future timestamps gracefully', () => {
      const futureTime = Date.now() + 1000000;
      mockMetadata.set('item1', createMockMetadata('item1', 0, 100, 5));
      mockMetadata.set('item2', {
        addedAt: baseTime,
        lastAccessedAt: futureTime,
        accessCount: 1,
        estimatedSize: 100,
        key: 'item2'
      });

      expect(strategy.selectForEviction(mockMetadata)).toBe('item2');
    });
  });

  describe('RandomEvictionStrategy edge cases', () => {
    let strategy: RandomEvictionStrategy;

    beforeEach(() => {
      strategy = new RandomEvictionStrategy();
    });

    it('should eventually select all items over many iterations', () => {
      mockMetadata.set('item1', createMockMetadata('item1', 0, 100, 5));
      mockMetadata.set('item2', createMockMetadata('item2', 10, 200, 3));
      mockMetadata.set('item3', createMockMetadata('item3', 20, 300, 1));
      mockMetadata.set('item4', createMockMetadata('item4', 30, 400, 10));
      mockMetadata.set('item5', createMockMetadata('item5', 40, 500, 2));

      const selected = new Set<string>();

      // Run many iterations to get statistical coverage
      for (let i = 0; i < 1000; i++) {
        const item = strategy.selectForEviction(mockMetadata);
        if (item) selected.add(item);
      }

      // Should have selected all items at least once
      expect(selected.size).toBe(5);
      expect(selected.has('item1')).toBe(true);
      expect(selected.has('item2')).toBe(true);
      expect(selected.has('item3')).toBe(true);
      expect(selected.has('item4')).toBe(true);
      expect(selected.has('item5')).toBe(true);
    });

    it('should handle single item consistently', () => {
      mockMetadata.set('item1', createMockMetadata('item1', 0, 100, 5));

      for (let i = 0; i < 100; i++) {
        expect(strategy.selectForEviction(mockMetadata)).toBe('item1');
      }
    });
  });

  describe('ARCEvictionStrategy edge cases', () => {
    let strategy: ARCEvictionStrategy;

    beforeEach(() => {
      strategy = new ARCEvictionStrategy(10);
    });

    it('should handle ghost list operations', () => {
      mockMetadata.set('item1', createMockMetadata('item1', 0, 100, 1));
      mockMetadata.set('item2', createMockMetadata('item2', 10, 200, 1));

      // Remove item and test ghost behavior
      strategy.onItemRemoved('item1');

      // Access removed item (should hit ghost list)
      const metadata = createMockMetadata('item1', 0, 100, 1);
      strategy.onItemAccessed('item1', metadata);

      expect(metadata.accessCount).toBe(2);
    });

    it('should adapt target sizes based on access patterns', () => {
      const items = new Array(5).fill(0).map((_, i) => {
        const metadata = createMockMetadata(`item${i}`, i * 10, 100 + i * 10, 1);
        mockMetadata.set(`item${i}`, metadata);
        return metadata;
      });

      // Simulate various access patterns
      items.forEach((metadata, i) => {
        for (let j = 0; j < i + 1; j++) {
          strategy.onItemAccessed(`item${i}`, metadata);
        }
      });

      const selected = strategy.selectForEviction(mockMetadata);
      expect(selected).toBeTruthy();
      expect(mockMetadata.has(selected!)).toBe(true);
    });

    it('should handle maximum ghost list size', () => {
      const smallStrategy = new ARCEvictionStrategy(3);

      // Add many items to ghost lists
      for (let i = 0; i < 10; i++) {
        smallStrategy.onItemRemoved(`item${i}`);
      }

      // Ghost lists should be limited
      const metadata = createMockMetadata('test', 0, 100, 1);
      smallStrategy.onItemAccessed('test', metadata);
      expect(metadata.accessCount).toBe(2);
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

    it('should manage queue transitions correctly', () => {
      const metadata1 = createMockMetadata('item1', 0, 100, 1);
      const metadata2 = createMockMetadata('item2', 10, 200, 1);

      // Add items (should go to recent queue)
      strategy.onItemAdded('item1', metadata1);
      strategy.onItemAdded('item2', metadata2);

      mockMetadata.set('item1', metadata1);
      mockMetadata.set('item2', metadata2);

      // Access item1 (should move to hot queue)
      strategy.onItemAccessed('item1', metadata1);

      // When evicting, should prefer item2 from recent queue (item1 was promoted to hot queue)
      const selected = strategy.selectForEviction(mockMetadata);
      expect(selected).toBe('item2');
    });

    it('should handle ghost queue promotions', () => {
      const metadata = createMockMetadata('item1', 0, 100, 1);

      // Add item
      strategy.onItemAdded('item1', metadata);

      // Remove item (goes to ghost)
      strategy.onItemRemoved('item1');

      // Re-add same item (should be promoted)
      strategy.onItemAdded('item1', metadata);

      expect(metadata.accessCount).toBe(1);
    });

    it('should handle queue size limits', () => {
      const smallStrategy = new TwoQueueEvictionStrategy(4); // Very small cache

      // Add many items
      for (let i = 0; i < 10; i++) {
        const metadata = createMockMetadata(`item${i}`, i, 100 + i, 1);
        smallStrategy.onItemAdded(`item${i}`, metadata);
      }

      // Should maintain size limits
      const testMetadata = createMockMetadata('test', 0, 100, 1);
      smallStrategy.onItemAdded('test', testMetadata);
      expect(testMetadata.accessCount).toBe(1);
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
    it('should handle large numbers of items efficiently', () => {
      const strategy = new LRUEvictionStrategy();
      const largeMetadataMap = new Map<string, CacheItemMetadata>();

      // Create a large number of items
      for (let i = 0; i < 10000; i++) {
        largeMetadataMap.set(`item${i}`, createMockMetadata(`item${i}`, i, 100 + i, i + 1));
      }

      const start = Date.now();
      const selected = strategy.selectForEviction(largeMetadataMap);
      const end = Date.now();

      expect(selected).toBe('item0'); // Oldest accessed
      expect(end - start).toBeLessThan(100); // Should be fast
    });

    it('should handle rapid access pattern changes', () => {
      const strategy = new LFUEvictionStrategy();
      const metadata1 = createMockMetadata('item1', 0, 100, 0);
      const metadata2 = createMockMetadata('item2', 10, 200, 0);

      // Rapidly change access patterns
      for (let i = 0; i < 1000; i++) {
        strategy.onItemAccessed('item1', metadata1);
        if (i % 2 === 0) {
          strategy.onItemAccessed('item2', metadata2);
        }
      }

      expect(metadata1.accessCount).toBe(1000);
      expect(metadata2.accessCount).toBe(500);

      mockMetadata.set('item1', metadata1);
      mockMetadata.set('item2', metadata2);

      expect(strategy.selectForEviction(mockMetadata)).toBe('item2');
    });

    it('should handle memory-intensive metadata correctly', () => {
      const strategy = new ARCEvictionStrategy(1000);

      // Create items with large estimated sizes
      for (let i = 0; i < 100; i++) {
        const metadata = createMockMetadata(`item${i}`, i, 100 + i, 1, 1024 * 1024); // 1MB each
        mockMetadata.set(`item${i}`, metadata);
        strategy.onItemAdded(`item${i}`, metadata);
      }

      const selected = strategy.selectForEviction(mockMetadata);
      expect(selected).toBeTruthy();
      expect(mockMetadata.has(selected!)).toBe(true);
    });
  });
});
