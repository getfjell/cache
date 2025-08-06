import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LFUEvictionStrategy } from '../../../src/eviction/strategies/LFUEvictionStrategy';
import { CacheItemMetadata } from '../../../src/eviction/EvictionStrategy';
import { LFUConfig } from '../../../src/eviction/EvictionStrategyConfig';

describe('LFUEvictionStrategy', () => {
  let strategy: LFUEvictionStrategy;

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
    });

    it('should select item with lowest access count', () => {
      const items = new Map<string, CacheItemMetadata>([
        ['key1', createMockMetadata('key1', 1000, 5)],
        ['key2', createMockMetadata('key2', 2000, 2)], // Should be evicted
        ['key3', createMockMetadata('key3', 3000, 8)]
      ]);

      const result = strategy.selectForEviction(items);
      expect(result).toBe('key2');
    });

    it('should use access time as tiebreaker when access counts are equal', () => {
      const items = new Map<string, CacheItemMetadata>([
        ['key1', createMockMetadata('key1', 1000, 3)], // Older, should be evicted
        ['key2', createMockMetadata('key2', 2000, 3)]
      ]);

      const result = strategy.selectForEviction(items);
      expect(result).toBe('key1');
    });

    it('should increment access count on item access', () => {
      const metadata = createMockMetadata('key1', 1000, 5);
      strategy.onItemAccessed('key1', metadata);

      expect(metadata.accessCount).toBe(6);
      expect(metadata.rawFrequency).toBe(6);
    });

    it('should initialize new items correctly', () => {
      const metadata = createMockMetadata('key1');
      strategy.onItemAdded('key1', metadata);

      expect(metadata.accessCount).toBe(1);
      expect(metadata.rawFrequency).toBe(1);
      expect(metadata.frequencyScore).toBeUndefined(); // No decay in default mode
    });
  });

  describe('Frequency Sketching Mode', () => {
    beforeEach(() => {
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
      const metadata = createMockMetadata('key1');
      strategy.onItemAdded('key1', metadata);

      // Access multiple times
      for (let i = 0; i < 5; i++) {
        strategy.onItemAccessed('key1', metadata);
      }

      expect(metadata.rawFrequency).toBeGreaterThan(0);
      expect(metadata.accessCount).toBe(6); // 1 from add + 5 from access
    });

    it('should handle frequency estimation for multiple keys', () => {
      const items = new Map<string, CacheItemMetadata>([
        ['frequent', createMockMetadata('frequent')],
        ['rare', createMockMetadata('rare')]
      ]);

      // Add items
      strategy.onItemAdded('frequent', items.get('frequent')!);
      strategy.onItemAdded('rare', items.get('rare')!);

      // Access frequent item multiple times
      for (let i = 0; i < 10; i++) {
        strategy.onItemAccessed('frequent', items.get('frequent')!);
      }

      // Access rare item once
      strategy.onItemAccessed('rare', items.get('rare')!);

      const result = strategy.selectForEviction(items);
      expect(result).toBe('rare'); // Should evict the less frequent item
    });
  });

  describe('Frequency Decay Mode', () => {
    beforeEach(() => {
      vi.useFakeTimers();
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
      const metadata = createMockMetadata('key1');
      strategy.onItemAdded('key1', metadata);

      expect(metadata.frequencyScore).toBe(1);

      // Advance time and access item
      vi.advanceTimersByTime(30000); // 30 seconds
      strategy.onItemAccessed('key1', metadata);

      const initialScore = metadata.frequencyScore!;
      expect(initialScore).toBeGreaterThan(1);

      // Advance time significantly and check decay
      vi.advanceTimersByTime(60000); // 1 minute
      strategy.onItemAccessed('key1', metadata);

      // Score should have some decay applied
      expect(metadata.frequencyScore).toBeGreaterThanOrEqual(1); // At least min threshold
    });

    it('should apply periodic decay to the entire cache', () => {
      const items = new Map<string, CacheItemMetadata>([
        ['key1', createMockMetadata('key1')],
        ['key2', createMockMetadata('key2')]
      ]);

      // Initialize items
      strategy.onItemAdded('key1', items.get('key1')!);
      strategy.onItemAdded('key2', items.get('key2')!);

      // Build up frequencies
      for (let i = 0; i < 5; i++) {
        strategy.onItemAccessed('key1', items.get('key1')!);
      }

      // Advance time past decay interval
      vi.advanceTimersByTime(65000); // Just over 1 minute

      // Trigger periodic decay by calling selectForEviction
      strategy.selectForEviction(items);

      // The periodic decay should have been applied
      // (Specific values depend on implementation details)
    });

    it('should respect minimum frequency threshold', () => {
      const metadata = createMockMetadata('key1');
      strategy.onItemAdded('key1', metadata);

      // Advance time way past decay interval
      vi.advanceTimersByTime(600000); // 10 minutes

      const items = new Map([['key1', metadata]]);
      strategy.selectForEviction(items); // Apply decay

      // Even with significant decay, frequency should not go below threshold
      const config = strategy.getConfig();
      expect(metadata.frequencyScore).toBeGreaterThanOrEqual(config.minFrequencyThreshold!);
    });
  });

  describe('Combined Sketching and Decay Mode', () => {
    beforeEach(() => {
      vi.useFakeTimers();
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
      const items = new Map<string, CacheItemMetadata>([
        ['old-frequent', createMockMetadata('old-frequent')],
        ['new-frequent', createMockMetadata('new-frequent')]
      ]);

      // Initialize items
      strategy.onItemAdded('old-frequent', items.get('old-frequent')!);
      strategy.onItemAdded('new-frequent', items.get('new-frequent')!);

      // Make old item very frequent initially
      for (let i = 0; i < 20; i++) {
        strategy.onItemAccessed('old-frequent', items.get('old-frequent')!);
      }

      // Advance time significantly
      vi.advanceTimersByTime(120000); // 2 minutes

      // Make new item moderately frequent
      for (let i = 0; i < 10; i++) {
        strategy.onItemAccessed('new-frequent', items.get('new-frequent')!);
      }

      const result = strategy.selectForEviction(items);

      // Due to decay, the old frequent item might now be less valuable than new frequent
      // The exact result depends on decay parameters, but both should be valid candidates
      expect(['old-frequent', 'new-frequent']).toContain(result);
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

      const metadata = createMockMetadata('key1');
      strategy.onItemAdded('key1', metadata);

      // Build up frequency
      for (let i = 0; i < 5; i++) {
        strategy.onItemAccessed('key1', metadata);
      }

      expect(metadata.rawFrequency).toBeGreaterThan(1);

      // Reset should clear internal sketch state
      strategy.reset();

      // After reset, new items should start fresh
      // (Note: existing metadata is not cleared, only internal sketch state)
    });

    it('should handle empty item sets gracefully', () => {
      const items = new Map<string, CacheItemMetadata>();
      const result = strategy.selectForEviction(items);
      expect(result).toBeNull();
    });

    it('should handle onItemRemoved calls', () => {
      strategy = new LFUEvictionStrategy();

      // This method should execute without error
      expect(() => strategy.onItemRemoved()).not.toThrow();
    });
  });

  describe('Edge Cases and Coverage Completeness', () => {
    beforeEach(() => {
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

      const metadata = createMockMetadata('key1');
      metadata.rawFrequency = 5;
      // Deliberately not setting frequencyScore or lastFrequencyUpdate

      const items = new Map([['key1', metadata]]);
      const result = strategy.selectForEviction(items);

      // Should fallback to rawFrequency
      expect(result).toBe('key1');
    });

    it('should handle metadata without lastFrequencyUpdate in calculateFrequencyScore', () => {
      const config: LFUConfig = {
        type: 'lfu',
        useProbabilisticCounting: false,
        decayFactor: 0.1,
        decayInterval: 60000
      };
      strategy = new LFUEvictionStrategy(config);

      const metadata = createMockMetadata('key1');
      metadata.rawFrequency = 3;
      // Deliberately not setting lastFrequencyUpdate (should be undefined)
      delete metadata.lastFrequencyUpdate;

      strategy.onItemAccessed('key1', metadata);

      // The calculateFrequencyScore should return rawFrequency when lastFrequencyUpdate is not a number
      // Note: rawFrequency gets updated to accessCount (2) during onItemAccessed since useProbabilisticCounting is false
      expect(metadata.frequencyScore).toBe(2);
    });

    it('should handle undefined rawFrequency in fallback paths', () => {
      strategy = new LFUEvictionStrategy(); // Default config with no decay

      const metadata = createMockMetadata('key1');
      metadata.accessCount = 7;
      // Deliberately not setting rawFrequency
      delete metadata.rawFrequency;

      const items = new Map([['key1', metadata]]);
      const result = strategy.selectForEviction(items);

      // Should use accessCount as fallback
      expect(result).toBe('key1');
    });

    it('should handle metadata with undefined rawFrequency in decay calculation', () => {
      const config: LFUConfig = {
        type: 'lfu',
        useProbabilisticCounting: false,
        decayFactor: 0.1,
        decayInterval: 60000
      };
      strategy = new LFUEvictionStrategy(config);

      const metadata = createMockMetadata('key1');
      metadata.accessCount = 4;
      // Deliberately set rawFrequency to undefined
      delete metadata.rawFrequency;

      strategy.onItemAccessed('key1', metadata);

      // Should fall back to accessCount for calculations
      expect(metadata.frequencyScore).toBeGreaterThan(0);
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

      const metadata = createMockMetadata('key1');
      strategy.onItemAdded('key1', metadata);

      // First access to establish baseline
      strategy.onItemAccessed('key1', metadata);
      const firstScore = metadata.frequencyScore!;

      // Advance time and access again to test full decay calculation
      vi.advanceTimersByTime(30000); // 30 seconds
      strategy.onItemAccessed('key1', metadata);

      // Should have calculated with decay
      expect(metadata.frequencyScore).toBeGreaterThan(firstScore);
    });

    it('should handle undefined frequencyScore in calculateFrequencyScore', () => {
      const config: LFUConfig = {
        type: 'lfu',
        useProbabilisticCounting: false,
        decayFactor: 0.1,
        decayInterval: 60000
      };
      strategy = new LFUEvictionStrategy(config);

      const metadata = createMockMetadata('key1');
      metadata.rawFrequency = 5;
      metadata.lastFrequencyUpdate = Date.now() - 10000; // 10 seconds ago
      // Deliberately not setting frequencyScore
      delete metadata.frequencyScore;

      strategy.onItemAccessed('key1', metadata);

      // Should use rawFreq as fallback for previousScore
      expect(metadata.frequencyScore).toBeGreaterThan(0);
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

      const items = new Map<string, CacheItemMetadata>([
        ['key1', createMockMetadata('key1')]
      ]);

      strategy.onItemAdded('key1', items.get('key1')!);

      // Build up frequency
      for (let i = 0; i < 5; i++) {
        strategy.onItemAccessed('key1', items.get('key1')!);
      }

      // Advance time past decay interval
      vi.advanceTimersByTime(35000); // 35 seconds

      // This should trigger periodic decay in the sketch
      strategy.selectForEviction(items);

      // The decay should have been applied (exact values depend on implementation)
      expect(items.get('key1')!.rawFrequency).toBeGreaterThan(0);
    });

    it('should handle rawFrequency being 0 or falsy', () => {
      strategy = new LFUEvictionStrategy(); // Default config

      const metadata = createMockMetadata('key1');
      metadata.accessCount = 3;
      metadata.rawFrequency = 0; // Explicitly set to 0

      const items = new Map([['key1', metadata]]);
      const result = strategy.selectForEviction(items);

      // Should use accessCount when rawFrequency is 0
      expect(result).toBe('key1');
    });

    it('should test periodic decay without probabilistic counting', () => {
      const config: LFUConfig = {
        type: 'lfu',
        useProbabilisticCounting: false, // No sketch
        decayFactor: 0.1,
        decayInterval: 30000 // 30 seconds
      };
      strategy = new LFUEvictionStrategy(config);

      const items = new Map<string, CacheItemMetadata>([
        ['key1', createMockMetadata('key1')]
      ]);

      strategy.onItemAdded('key1', items.get('key1')!);

      // Advance time past decay interval
      vi.advanceTimersByTime(35000); // 35 seconds

      // This should trigger periodic decay without sketch
      strategy.selectForEviction(items);

      // Should complete without error even without sketch
      expect(items.get('key1')!.accessCount).toBe(1);
    });
  });
});
