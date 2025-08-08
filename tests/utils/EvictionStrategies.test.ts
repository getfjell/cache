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

describe('Eviction Strategies', () => {
  let mockMetadata: Map<string, CacheItemMetadata>;
  let mockMetadataProvider: CacheMapMetadataProvider;
  let mockContext: EvictionContext;
  const baseTime = Date.now();

  beforeEach(() => {
    mockMetadata = new Map();
    mockMetadataProvider = {
      getMetadata: (key: string) => mockMetadata.get(key) || null,
      setMetadata: (key: string, metadata: CacheItemMetadata) => mockMetadata.set(key, metadata),
      deleteMetadata: (key: string) => mockMetadata.delete(key),
      getAllMetadata: () => mockMetadata,
      clearMetadata: () => mockMetadata.clear(),
      getCurrentSize: () => ({ itemCount: mockMetadata.size, sizeBytes: Array.from(mockMetadata.values()).reduce((sum, m) => sum + m.estimatedSize, 0) }),
      getSizeLimits: () => ({ maxItems: 100, maxSizeBytes: 10000 })
    };
    mockContext = {
      currentSize: { itemCount: mockMetadata.size, sizeBytes: 0 },
      limits: { maxItems: 100, maxSizeBytes: 10000 },
      newItemSize: 100
    };
  });

  const createMockMetadata = (
    key: string,
    addedAt: number,
    lastAccessedAt: number,
    accessCount: number
  ): CacheItemMetadata => ({
    addedAt: baseTime + addedAt,
    lastAccessedAt: baseTime + lastAccessedAt,
    accessCount,
    estimatedSize: 100,
    key
  });

  describe('LRUEvictionStrategy', () => {
    let strategy: LRUEvictionStrategy;

    beforeEach(() => {
      strategy = new LRUEvictionStrategy();
    });

    it('should select least recently used item', () => {
      mockMetadata.set('item1', createMockMetadata('item1', 0, 100, 5));
      mockMetadata.set('item2', createMockMetadata('item2', 50, 50, 3)); // Oldest access
      mockMetadata.set('item3', createMockMetadata('item3', 100, 200, 1));

      // Update context to require eviction
      mockContext.currentSize.itemCount = 3;
      mockContext.limits.maxItems = 2;

      const result = strategy.selectForEviction(mockMetadataProvider, mockContext);
      expect(result).toContain('item2');
    });

    it('should return empty array for empty map', () => {
      const result = strategy.selectForEviction(mockMetadataProvider, mockContext);
      expect(result).toEqual([]);
    });

    it('should update metadata on access', () => {
      const metadata = createMockMetadata('item1', 0, 100, 5);
      mockMetadata.set('item1', metadata);

      strategy.onItemAccessed('item1', mockMetadataProvider);

      const updatedMetadata = mockMetadataProvider.getMetadata('item1')!;
      expect(updatedMetadata.accessCount).toBe(6);
      expect(typeof updatedMetadata.lastAccessedAt).toBe('number');
    });

    it('should initialize metadata on add', () => {
      strategy.onItemAdded('item1', 100, mockMetadataProvider);

      const metadata = mockMetadataProvider.getMetadata('item1')!;
      expect(metadata.accessCount).toBe(1);
      expect(metadata.addedAt).toBeGreaterThan(0);
      expect(metadata.lastAccessedAt).toBe(metadata.addedAt);
      expect(metadata.estimatedSize).toBe(100);
    });
  });

  describe('LFUEvictionStrategy', () => {
    let strategy: LFUEvictionStrategy;

    beforeEach(() => {
      strategy = new LFUEvictionStrategy();
    });

    it('should select least frequently used item', () => {
      mockMetadata.set('item1', createMockMetadata('item1', 0, 100, 5));
      mockMetadata.set('item2', createMockMetadata('item2', 50, 200, 2)); // Lowest frequency
      mockMetadata.set('item3', createMockMetadata('item3', 100, 150, 10));

      // Update context to require eviction
      mockContext.currentSize.itemCount = 3;
      mockContext.limits.maxItems = 2;

      const result = strategy.selectForEviction(mockMetadataProvider, mockContext);
      expect(result).toContain('item2');
    });
  });

  describe('FIFOEvictionStrategy', () => {
    let strategy: FIFOEvictionStrategy;

    beforeEach(() => {
      strategy = new FIFOEvictionStrategy();
    });

    it('should select first-in item regardless of usage', () => {
      mockMetadata.set('item1', createMockMetadata('item1', 0, 300, 1)); // Oldest added
      mockMetadata.set('item2', createMockMetadata('item2', 50, 50, 100));
      mockMetadata.set('item3', createMockMetadata('item3', 100, 100, 50));

      // Update context to require eviction
      mockContext.currentSize.itemCount = 3;
      mockContext.limits.maxItems = 2;

      const result = strategy.selectForEviction(mockMetadataProvider, mockContext);
      expect(result).toContain('item1');
    });
  });

  describe('MRUEvictionStrategy', () => {
    let strategy: MRUEvictionStrategy;

    beforeEach(() => {
      strategy = new MRUEvictionStrategy();
    });

    it('should select most recently used item', () => {
      mockMetadata.set('item1', createMockMetadata('item1', 0, 100, 5));
      mockMetadata.set('item2', createMockMetadata('item2', 50, 50, 3));
      mockMetadata.set('item3', createMockMetadata('item3', 100, 300, 1)); // Most recent access

      // Update context to require eviction
      mockContext.currentSize.itemCount = 3;
      mockContext.limits.maxItems = 2;

      const result = strategy.selectForEviction(mockMetadataProvider, mockContext);
      expect(result).toContain('item3');
    });
  });

  describe('RandomEvictionStrategy', () => {
    let strategy: RandomEvictionStrategy;

    beforeEach(() => {
      strategy = new RandomEvictionStrategy();
    });

    it('should select a valid item randomly', () => {
      mockMetadata.set('item1', createMockMetadata('item1', 0, 100, 5));
      mockMetadata.set('item2', createMockMetadata('item2', 50, 50, 3));
      mockMetadata.set('item3', createMockMetadata('item3', 100, 300, 1));

      // Update context to require eviction
      mockContext.currentSize.itemCount = 3;
      mockContext.limits.maxItems = 2;

      const result = strategy.selectForEviction(mockMetadataProvider, mockContext);
      expect(result.length).toBeGreaterThan(0);
      expect(['item1', 'item2', 'item3']).toContain(result[0]);
    });

    it('should eventually select all items over multiple calls', () => {
      mockMetadata.set('item1', createMockMetadata('item1', 0, 100, 5));
      mockMetadata.set('item2', createMockMetadata('item2', 50, 50, 3));
      mockMetadata.set('item3', createMockMetadata('item3', 100, 300, 1));

      // Update context to require eviction
      mockContext.currentSize.itemCount = 3;
      mockContext.limits.maxItems = 2;

      const selected = new Set<string>();

      // Run multiple times to increase chance of hitting all items
      for (let i = 0; i < 100; i++) {
        const result = strategy.selectForEviction(mockMetadataProvider, mockContext);
        if (result.length > 0) selected.add(result[0]);
      }

      // Should have selected at least 2 different items with high probability
      expect(selected.size).toBeGreaterThanOrEqual(2);
    });
  });

  describe('ARCEvictionStrategy', () => {
    let strategy: ARCEvictionStrategy;

    beforeEach(() => {
      strategy = new ARCEvictionStrategy(4);
    });

    it('should adapt between recency and frequency', () => {
      // Recent items (accessed once)
      mockMetadata.set('item1', createMockMetadata('item1', 0, 100, 1));
      mockMetadata.set('item2', createMockMetadata('item2', 50, 150, 1));

      // Frequent items (accessed multiple times)
      mockMetadata.set('item3', createMockMetadata('item3', 25, 75, 5));
      mockMetadata.set('item4', createMockMetadata('item4', 75, 125, 3));

      // Update context to require eviction
      mockContext.currentSize.itemCount = 4;
      mockContext.limits.maxItems = 3;

      const result = strategy.selectForEviction(mockMetadataProvider, mockContext);
      expect(result.length).toBeGreaterThan(0);
      expect(['item1', 'item2', 'item3', 'item4']).toContain(result[0]);
    });

    it('should handle ghost list updates', () => {
      const metadata = createMockMetadata('item1', 0, 100, 1);
      mockMetadata.set('item1', metadata);

      strategy.onItemRemoved('item1', mockMetadataProvider);
      strategy.onItemAccessed('item1', mockMetadataProvider);

      // Should not throw and should handle ghost list logic
      const updatedMetadata = mockMetadataProvider.getMetadata('item1');
      if (updatedMetadata) {
        expect(updatedMetadata.accessCount).toBe(2);
      }
    });
  });

  describe('TwoQueueEvictionStrategy', () => {
    let strategy: TwoQueueEvictionStrategy;

    beforeEach(() => {
      strategy = new TwoQueueEvictionStrategy(4);
    });

    it('should promote items from recent to hot queue on re-access', () => {
      // Add items (go to recent queue)
      strategy.onItemAdded('item1', 100, mockMetadataProvider);
      strategy.onItemAdded('item2', 100, mockMetadataProvider);

      // Access item1 again (should move to hot queue)
      strategy.onItemAccessed('item1', mockMetadataProvider);

      // Update context to require eviction
      mockContext.currentSize.itemCount = 2;
      mockContext.limits.maxItems = 1;

      // When evicting, should prefer item2 from recent queue
      const result = strategy.selectForEviction(mockMetadataProvider, mockContext);
      expect(result).toContain('item2'); // Should evict from recent queue first
    });

    it('should handle ghost queue promotions', () => {
      // Simulate item being evicted to ghost queue
      strategy.onItemAdded('item1', 100, mockMetadataProvider);
      strategy.onItemRemoved('item1', mockMetadataProvider);

      // Re-add same item (should be promoted from ghost)
      strategy.onItemAdded('item1', 100, mockMetadataProvider);

      const metadata = mockMetadataProvider.getMetadata('item1')!;
      expect(metadata.accessCount).toBe(1);
    });
  });

  describe('createEvictionStrategy factory', () => {
    it('should create correct strategy instances', () => {
      expect(createEvictionStrategy('lru')).toBeInstanceOf(LRUEvictionStrategy);
      expect(createEvictionStrategy('lfu')).toBeInstanceOf(LFUEvictionStrategy);
      expect(createEvictionStrategy('fifo')).toBeInstanceOf(FIFOEvictionStrategy);
      expect(createEvictionStrategy('mru')).toBeInstanceOf(MRUEvictionStrategy);
      expect(createEvictionStrategy('random')).toBeInstanceOf(RandomEvictionStrategy);
      expect(createEvictionStrategy('arc')).toBeInstanceOf(ARCEvictionStrategy);
      expect(createEvictionStrategy('2q')).toBeInstanceOf(TwoQueueEvictionStrategy);
    });

    it('should pass maxCacheSize to strategies that need it', () => {
      const arcStrategy = createEvictionStrategy('arc', 500);
      const twoQStrategy = createEvictionStrategy('2q', 500);

      expect(arcStrategy).toBeInstanceOf(ARCEvictionStrategy);
      expect(twoQStrategy).toBeInstanceOf(TwoQueueEvictionStrategy);
    });

    it('should accept configuration objects for enhanced strategies', () => {
      // LFU with enhanced configuration
      const lfuConfig = {
        type: 'lfu' as const,
        useProbabilisticCounting: true,
        decayFactor: 0, // Disable decay to avoid timing-dependent behavior
        sketchWidth: 512
      };
      const lfuStrategy = createEvictionStrategy('lfu', 1000, lfuConfig);
      expect(lfuStrategy).toBeInstanceOf(LFUEvictionStrategy);
      expect((lfuStrategy as any).getConfig().useProbabilisticCounting).toBe(true);

      // ARC with enhanced configuration
      const arcConfig = {
        type: 'arc' as const,
        frequencyThreshold: 3,
        useEnhancedFrequency: true,
        frequencyDecayFactor: 0 // Disable decay to avoid timing-dependent behavior
      };
      const arcStrategy = createEvictionStrategy('arc', 1000, arcConfig);
      expect(arcStrategy).toBeInstanceOf(ARCEvictionStrategy);
      expect((arcStrategy as any).getConfig().frequencyThreshold).toBe(3);

      // 2Q with enhanced configuration
      const twoQConfig = {
        type: '2q' as const,
        useFrequencyPromotion: true,
        promotionThreshold: 4,
        hotQueueDecayFactor: 0 // Disable decay to avoid timing-dependent behavior
      };
      const twoQStrategy = createEvictionStrategy('2q', 1000, twoQConfig);
      expect(twoQStrategy).toBeInstanceOf(TwoQueueEvictionStrategy);
      expect((twoQStrategy as any).getConfig().promotionThreshold).toBe(4);
    });

    it('should use default configurations when none provided', () => {
      const lfuStrategy = createEvictionStrategy('lfu');
      const arcStrategy = createEvictionStrategy('arc');
      const twoQStrategy = createEvictionStrategy('2q');

      expect(lfuStrategy).toBeInstanceOf(LFUEvictionStrategy);
      expect(arcStrategy).toBeInstanceOf(ARCEvictionStrategy);
      expect(twoQStrategy).toBeInstanceOf(TwoQueueEvictionStrategy);

      // Should have default configurations
      expect((lfuStrategy as any).getConfig()).toBeDefined();
      expect((arcStrategy as any).getConfig()).toBeDefined();
      expect((twoQStrategy as any).getConfig()).toBeDefined();
    });

    it('should handle mismatched config types gracefully', () => {
      // Wrong config type for LFU should use defaults
      const wrongConfig = { type: 'arc' as const };
      const lfuStrategy = createEvictionStrategy('lfu', 1000, wrongConfig as any);
      expect(lfuStrategy).toBeInstanceOf(LFUEvictionStrategy);

      // Should fall back to default LFU config
      const config = (lfuStrategy as any).getConfig();
      expect(config.type).toBe('lfu');
    });

    it('should throw for unknown strategy', () => {
      expect(() => createEvictionStrategy('unknown' as any)).toThrow('Unsupported eviction policy');
    });
  });
});
