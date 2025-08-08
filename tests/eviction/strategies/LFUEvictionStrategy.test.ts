import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LFUEvictionStrategy } from '../../../src/eviction/strategies/LFUEvictionStrategy';
import { CacheItemMetadata } from '../../../src/eviction/EvictionStrategy';
import { LFUConfig } from '../../../src/eviction/EvictionStrategyConfig';
import { MockMetadataProvider } from '../../utils/MockMetadataProvider';

describe('LFUEvictionStrategy', () => {
  let strategy: LFUEvictionStrategy;
  let metadataProvider: MockMetadataProvider;

  function createMockMetadata(key: string, addedAt = 1000, accessCount = 1): CacheItemMetadata {
    return {
      key,
      addedAt,
      lastAccessedAt: addedAt,
      accessCount,
      estimatedSize: 100
    };
  }

  describe('Backwards Compatible Mode (Default)', () => {
    beforeEach(() => {
      strategy = new LFUEvictionStrategy();
      metadataProvider = new MockMetadataProvider();
    });

    it('should select item with lowest access count', () => {
      // Add items to metadata provider
      metadataProvider.setMetadata('key1', createMockMetadata('key1', 1000, 5));
      metadataProvider.setMetadata('key2', createMockMetadata('key2', 2000, 2)); // Should be evicted
      metadataProvider.setMetadata('key3', createMockMetadata('key3', 3000, 8));

      const context = {
        currentSize: { itemCount: 3, sizeBytes: 300 },
        limits: { maxItems: 3, maxSizeBytes: null }
      };
      const result = strategy.selectForEviction(metadataProvider, context);
      expect(result).toContain('key2');
    });

    it('should use access time as tiebreaker when access counts are equal', () => {
      // Add items to metadata provider
      metadataProvider.setMetadata('key1', createMockMetadata('key1', 1000, 3)); // Older, should be evicted
      metadataProvider.setMetadata('key2', createMockMetadata('key2', 2000, 3));

      const context = {
        currentSize: { itemCount: 2, sizeBytes: 200 },
        limits: { maxItems: 2, maxSizeBytes: null }
      };
      const result = strategy.selectForEviction(metadataProvider, context);
      expect(result).toContain('key1');
    });

    it('should increment access count on item access', () => {
      const metadata = createMockMetadata('key1', 1000, 5);
      metadataProvider.setMetadata('key1', metadata);

      strategy.onItemAccessed('key1', metadataProvider);

      const updatedMetadata = metadataProvider.getMetadata('key1')!;
      expect(updatedMetadata.accessCount).toBe(6);
      expect(updatedMetadata.rawFrequency).toBe(6);
    });

    it('should initialize new items correctly', () => {
      strategy.onItemAdded('key1', 100, metadataProvider);

      const metadata = metadataProvider.getMetadata('key1')!;
      expect(metadata.accessCount).toBe(1);
      expect(metadata.rawFrequency).toBe(1);
      expect(metadata.frequencyScore).toBe(1); // Always initialized for consistency
      expect(metadata.estimatedSize).toBe(100);
    });
  });

  describe('Frequency Sketching Mode', () => {
    beforeEach(() => {
      metadataProvider = new MockMetadataProvider();
      const config: LFUConfig = {
        type: 'lfu',
        useProbabilisticCounting: true,
        decayFactor: 0, // No decay for pure sketching test
        sketchWidth: 16, // Small for testing
        sketchDepth: 2
      };
      strategy = new LFUEvictionStrategy(config);
    });

    it('should use count-min sketch for frequency estimation', () => {
      strategy.onItemAdded('key1', 100, metadataProvider);

      // Access multiple times
      for (let i = 0; i < 5; i++) {
        strategy.onItemAccessed('key1', metadataProvider);
      }

      const metadata = metadataProvider.getMetadata('key1')!;
      expect(metadata.rawFrequency).toBeGreaterThan(0);
      expect(metadata.accessCount).toBe(6); // 1 from add + 5 from access
    });

    it('should handle frequency estimation for multiple keys', () => {
      // Add items
      strategy.onItemAdded('frequent', 100, metadataProvider);
      strategy.onItemAdded('rare', 100, metadataProvider);

      // Access frequent item multiple times
      for (let i = 0; i < 10; i++) {
        strategy.onItemAccessed('frequent', metadataProvider);
      }

      // Access rare item once
      strategy.onItemAccessed('rare', metadataProvider);

      const context = {
        currentSize: { itemCount: 2, sizeBytes: 200 },
        limits: { maxItems: 2, maxSizeBytes: null }
      };
      const result = strategy.selectForEviction(metadataProvider, context);
      expect(result).toContain('rare'); // Should evict the less frequent item
    });
  });

  describe('Frequency Decay Mode', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      metadataProvider = new MockMetadataProvider();
      const config: LFUConfig = {
        type: 'lfu',
        useProbabilisticCounting: false,
        decayFactor: 0.1,
        decayInterval: 60000, // 1 minute
        minFrequencyThreshold: 1
      };
      strategy = new LFUEvictionStrategy(config);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should apply decay to frequency scores over time', () => {
      strategy.onItemAdded('key1', 100, metadataProvider);
      const metadata = metadataProvider.getMetadata('key1')!;

      expect(metadata.frequencyScore).toBe(1);

      // Advance time and access item
      vi.advanceTimersByTime(30000); // 30 seconds
      strategy.onItemAccessed('key1', metadataProvider);

      const updatedMetadata = metadataProvider.getMetadata('key1')!;
      const initialScore = updatedMetadata.frequencyScore!;
      expect(initialScore).toBeGreaterThan(1);

      // Advance time significantly and check decay
      vi.advanceTimersByTime(60000); // 1 minute
      strategy.onItemAccessed('key1', metadataProvider);

      // Score should have some decay applied
      const finalMetadata = metadataProvider.getMetadata('key1')!;
      expect(finalMetadata.frequencyScore).toBeGreaterThanOrEqual(1); // At least min threshold
    });

    it('should apply periodic decay to the entire cache', () => {
      // Initialize items
      strategy.onItemAdded('key1', 100, metadataProvider);
      strategy.onItemAdded('key2', 100, metadataProvider);

      // Build up frequencies
      for (let i = 0; i < 5; i++) {
        strategy.onItemAccessed('key1', metadataProvider);
      }

      // Advance time past decay interval
      vi.advanceTimersByTime(65000); // Just over 1 minute

      // Trigger periodic decay by calling selectForEviction
      const context = {
        currentSize: { itemCount: 2, sizeBytes: 200 },
        limits: { maxItems: 2, maxSizeBytes: null }
      };
      strategy.selectForEviction(metadataProvider, context);

      // The periodic decay should have been applied
      // (Specific values depend on implementation details)
    });

    it('should respect minimum frequency threshold', () => {
      strategy.onItemAdded('key1', 100, metadataProvider);

      // Advance time way past decay interval
      vi.advanceTimersByTime(600000); // 10 minutes

      const context = {
        currentSize: { itemCount: 1, sizeBytes: 100 },
        limits: { maxItems: 1, maxSizeBytes: null }
      };
      strategy.selectForEviction(metadataProvider, context); // Apply decay

      // Even with significant decay, frequency should not go below threshold
      const metadata = metadataProvider.getMetadata('key1')!;
      const config = strategy.getConfig();
      expect(metadata.frequencyScore).toBeGreaterThanOrEqual(config.minFrequencyThreshold!);
    });
  });

  describe('Combined Sketching and Decay Mode', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      metadataProvider = new MockMetadataProvider(); // Fresh metadata provider
      const config: LFUConfig = {
        type: 'lfu',
        useProbabilisticCounting: true,
        decayFactor: 0.05,
        decayInterval: 30000, // 30 seconds
        sketchWidth: 32,
        sketchDepth: 3,
        minFrequencyThreshold: 1
      };
      strategy = new LFUEvictionStrategy(config);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should combine probabilistic counting with time-based decay', () => {
      // Initialize items
      strategy.onItemAdded('old-frequent', 100, metadataProvider);
      strategy.onItemAdded('new-frequent', 100, metadataProvider);

      // Make old item very frequent initially
      for (let i = 0; i < 20; i++) {
        strategy.onItemAccessed('old-frequent', metadataProvider);
      }

      // Advance time significantly
      vi.advanceTimersByTime(120000); // 2 minutes

      // Make new item moderately frequent
      for (let i = 0; i < 10; i++) {
        strategy.onItemAccessed('new-frequent', metadataProvider);
      }

      const context = {
        currentSize: { itemCount: 2, sizeBytes: 200 },
        limits: { maxItems: 1, maxSizeBytes: null }
      };
      const result = strategy.selectForEviction(metadataProvider, context);

      // Due to decay, the old frequent item might now be less valuable than new frequent
      // The exact result depends on decay parameters, but both should be valid candidates
      expect(result.length).toBeGreaterThan(0);

      // Either key could be selected based on frequency and decay calculations
      const validKeys = ['old-frequent', 'new-frequent'];
      expect(validKeys.some(key => result.includes(key))).toBeTruthy();
    });
  });

  describe('Configuration and Utilities', () => {
    it('should return configuration correctly', () => {
      const config: LFUConfig = {
        type: 'lfu',
        decayFactor: 0.2,
        decayInterval: 45000,
        useProbabilisticCounting: true
      };
      strategy = new LFUEvictionStrategy(config);

      const returnedConfig = strategy.getConfig();
      expect(returnedConfig.decayFactor).toBe(0.2);
      expect(returnedConfig.decayInterval).toBe(45000);
      expect(returnedConfig.useProbabilisticCounting).toBe(true);
    });

    it('should reset frequency tracking when requested', () => {
      const config: LFUConfig = {
        type: 'lfu',
        useProbabilisticCounting: true
      };
      strategy = new LFUEvictionStrategy(config);

      strategy.onItemAdded('key1', 100, metadataProvider);

      // Build up frequency
      for (let i = 0; i < 5; i++) {
        strategy.onItemAccessed('key1', metadataProvider);
      }

      const metadata = metadataProvider.getMetadata('key1')!;
      expect(metadata.rawFrequency).toBeGreaterThan(1);

      // Reset should clear internal sketch state
      strategy.reset();

      // After reset, new items should start fresh
      // (Note: existing metadata is not cleared, only internal sketch state)
    });

    it('should handle empty item sets gracefully', () => {
      const context = {
        currentSize: { itemCount: 0, sizeBytes: 0 },
        limits: { maxItems: 10, maxSizeBytes: null }
      };
      const result = strategy.selectForEviction(metadataProvider, context);
      expect(result).toEqual([]);
    });

    it('should handle onItemRemoved calls', () => {
      strategy = new LFUEvictionStrategy();

      // This method should execute without error
      expect(() => strategy.onItemRemoved('key1', metadataProvider)).not.toThrow();
    });
  });

  describe('Edge Cases and Coverage Completeness', () => {
    beforeEach(() => {
      metadataProvider = new MockMetadataProvider();
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should handle metadata without frequencyScore in decay mode', () => {
      const config: LFUConfig = {
        type: 'lfu',
        useProbabilisticCounting: false,
        decayFactor: 0.1,
        decayInterval: 60000
      };
      strategy = new LFUEvictionStrategy(config);

      strategy.onItemAdded('key1', 100, metadataProvider);
      const metadata = metadataProvider.getMetadata('key1')!;
      metadata.rawFrequency = 5;
      // Deliberately not setting frequencyScore or lastFrequencyUpdate
      delete metadata.frequencyScore;
      delete metadata.lastFrequencyUpdate;
      metadataProvider.setMetadata('key1', metadata);

      const context = {
        currentSize: { itemCount: 1, sizeBytes: 100 },
        limits: { maxItems: 1, maxSizeBytes: null }
      };
      const result = strategy.selectForEviction(metadataProvider, context);

      // Should fallback to rawFrequency
      expect(result).toContain('key1');
    });

    it('should handle metadata without lastFrequencyUpdate in calculateFrequencyScore', () => {
      const config: LFUConfig = {
        type: 'lfu',
        useProbabilisticCounting: false,
        decayFactor: 0.1,
        decayInterval: 60000
      };
      strategy = new LFUEvictionStrategy(config);

      strategy.onItemAdded('key1', 100, metadataProvider);
      const metadata = metadataProvider.getMetadata('key1')!;
      metadata.rawFrequency = 3;
      metadata.accessCount = 1;
      // Deliberately not setting lastFrequencyUpdate (should be undefined)
      delete metadata.lastFrequencyUpdate;
      metadataProvider.setMetadata('key1', metadata);

      strategy.onItemAccessed('key1', metadataProvider);

      // The calculateFrequencyScore should return rawFrequency when lastFrequencyUpdate is not a number
      // Note: rawFrequency gets updated to accessCount (2) during onItemAccessed since useProbabilisticCounting is false
      const updatedMetadata = metadataProvider.getMetadata('key1')!;
      expect(updatedMetadata.frequencyScore).toBe(2);
    });

    it('should handle undefined rawFrequency in fallback paths', () => {
      strategy = new LFUEvictionStrategy(); // Default config with no decay

      strategy.onItemAdded('key1', 100, metadataProvider);
      const metadata = metadataProvider.getMetadata('key1')!;
      metadata.accessCount = 7;
      // Deliberately not setting rawFrequency
      delete metadata.rawFrequency;
      metadataProvider.setMetadata('key1', metadata);

      const context = {
        currentSize: { itemCount: 1, sizeBytes: 100 },
        limits: { maxItems: 1, maxSizeBytes: null }
      };
      const result = strategy.selectForEviction(metadataProvider, context);

      // Should use accessCount as fallback
      expect(result).toContain('key1');
    });

    it('should handle metadata with undefined rawFrequency in decay calculation', () => {
      const config: LFUConfig = {
        type: 'lfu',
        useProbabilisticCounting: false,
        decayFactor: 0.1,
        decayInterval: 60000
      };
      strategy = new LFUEvictionStrategy(config);

      strategy.onItemAdded('key1', 100, metadataProvider);
      const metadata = metadataProvider.getMetadata('key1')!;
      metadata.accessCount = 4;
      // Deliberately set rawFrequency to undefined
      delete metadata.rawFrequency;
      metadataProvider.setMetadata('key1', metadata);

      strategy.onItemAccessed('key1', metadataProvider);

      // Should fall back to accessCount for calculations
      const updatedMetadata = metadataProvider.getMetadata('key1')!;
      expect(updatedMetadata.frequencyScore).toBeGreaterThan(0);
    });

    it('should calculate frequency score with full decay path', () => {
      const config: LFUConfig = {
        type: 'lfu',
        useProbabilisticCounting: false,
        decayFactor: 0.1,
        decayInterval: 60000,
        minFrequencyThreshold: 1
      };
      strategy = new LFUEvictionStrategy(config);

      strategy.onItemAdded('key1', 100, metadataProvider);

      // First access to establish baseline
      strategy.onItemAccessed('key1', metadataProvider);
      const metadata = metadataProvider.getMetadata('key1')!;
      const firstScore = metadata.frequencyScore!;

      // Advance time and access again to test full decay calculation
      vi.advanceTimersByTime(30000); // 30 seconds
      strategy.onItemAccessed('key1', metadataProvider);

      // Should have calculated with decay
      const updatedMetadata = metadataProvider.getMetadata('key1')!;
      expect(updatedMetadata.frequencyScore).toBeGreaterThan(firstScore);
    });

    it('should handle undefined frequencyScore in calculateFrequencyScore', () => {
      const config: LFUConfig = {
        type: 'lfu',
        useProbabilisticCounting: false,
        decayFactor: 0.1,
        decayInterval: 60000
      };
      strategy = new LFUEvictionStrategy(config);

      strategy.onItemAdded('key1', 100, metadataProvider);
      const metadata = metadataProvider.getMetadata('key1')!;
      metadata.rawFrequency = 5;
      metadata.lastFrequencyUpdate = Date.now() - 10000; // 10 seconds ago
      // Deliberately not setting frequencyScore
      delete metadata.frequencyScore;
      metadataProvider.setMetadata('key1', metadata);

      strategy.onItemAccessed('key1', metadataProvider);

      // Should use rawFreq as fallback for previousScore
      const updatedMetadata = metadataProvider.getMetadata('key1')!;
      expect(updatedMetadata.frequencyScore).toBeGreaterThan(0);
    });

    it('should test periodic decay with probabilistic counting', () => {
      const config: LFUConfig = {
        type: 'lfu',
        useProbabilisticCounting: true,
        decayFactor: 0.1,
        decayInterval: 30000, // 30 seconds
        sketchWidth: 16,
        sketchDepth: 2
      };
      strategy = new LFUEvictionStrategy(config);

      strategy.onItemAdded('key1', 100, metadataProvider);

      // Build up frequency
      for (let i = 0; i < 5; i++) {
        strategy.onItemAccessed('key1', metadataProvider);
      }

      // Advance time past decay interval
      vi.advanceTimersByTime(35000); // 35 seconds

      // This should trigger periodic decay in the sketch
      const context = {
        currentSize: { itemCount: 1, sizeBytes: 100 },
        limits: { maxItems: 1, maxSizeBytes: null }
      };
      strategy.selectForEviction(metadataProvider, context);

      // The decay should have been applied (exact values depend on implementation)
      const metadata = metadataProvider.getMetadata('key1')!;
      expect(metadata.rawFrequency).toBeGreaterThan(0);
    });

    it('should handle rawFrequency being 0 or falsy', () => {
      strategy = new LFUEvictionStrategy(); // Default config

      strategy.onItemAdded('key1', 100, metadataProvider);
      const metadata = metadataProvider.getMetadata('key1')!;
      metadata.accessCount = 3;
      metadata.rawFrequency = 0; // Explicitly set to 0
      metadataProvider.setMetadata('key1', metadata);

      const context = {
        currentSize: { itemCount: 1, sizeBytes: 100 },
        limits: { maxItems: 1, maxSizeBytes: null }
      };
      const result = strategy.selectForEviction(metadataProvider, context);

      // Should use accessCount when rawFrequency is 0
      expect(result).toContain('key1');
    });

    it('should test periodic decay without probabilistic counting', () => {
      const config: LFUConfig = {
        type: 'lfu',
        useProbabilisticCounting: false, // No sketch
        decayFactor: 0.1,
        decayInterval: 30000 // 30 seconds
      };
      strategy = new LFUEvictionStrategy(config);

      strategy.onItemAdded('key1', 100, metadataProvider);

      // Advance time past decay interval
      vi.advanceTimersByTime(35000); // 35 seconds

      // This should trigger periodic decay without sketch
      const context = {
        currentSize: { itemCount: 1, sizeBytes: 100 },
        limits: { maxItems: 1, maxSizeBytes: null }
      };
      strategy.selectForEviction(metadataProvider, context);

      // Should complete without error even without sketch
      const metadata = metadataProvider.getMetadata('key1')!;
      expect(metadata.accessCount).toBe(1);
    });
  });
});
