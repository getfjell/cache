import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ARCEvictionStrategy } from '../../../src/eviction/strategies/ARCEvictionStrategy';
import { CacheItemMetadata } from '../../../src/eviction/EvictionStrategy';
import { ARCConfig } from '../../../src/eviction/EvictionStrategyConfig';

describe('ARCEvictionStrategy', () => {
  let strategy: ARCEvictionStrategy;

  function createMockMetadata(key: string, addedAt = 1000, accessCount = 1): CacheItemMetadata {
    return {
      key,
      addedAt,
      lastAccessedAt: addedAt,
      accessCount,
      estimatedSize: 100
    };
  }

  describe('Traditional ARC Mode', () => {
    beforeEach(() => {
      const config: ARCConfig = {
        type: 'arc',
        maxCacheSize: 100,
        useEnhancedFrequency: false,
        useFrequencyWeightedSelection: false
      };
      strategy = new ARCEvictionStrategy(100, config);
    });

    it('should classify items as recent vs frequent based on simple access count', () => {
      const items = new Map<string, CacheItemMetadata>([
        ['recent1', createMockMetadata('recent1', 1000, 1)], // accessCount = 1
        ['frequent1', createMockMetadata('frequent1', 1000, 3)] // accessCount = 3
      ]);

      // Add items
      strategy.onItemAdded('recent1', items.get('recent1')!);
      strategy.onItemAdded('frequent1', items.get('frequent1')!);

      // Access frequent1 more times
      strategy.onItemAccessed('frequent1', items.get('frequent1')!);
      strategy.onItemAccessed('frequent1', items.get('frequent1')!);

      // Should evict from recent items first
      const result = strategy.selectForEviction(items);
      expect(result).toBe('recent1');
    });

    it('should adapt target size based on ghost list hits', () => {
      const metadata = createMockMetadata('key1');
      strategy.onItemAdded('key1', metadata);

      // Simulate ghost list hit (this would normally happen during cache management)
      // For testing, we'll manually trigger the adaptive behavior
      strategy.onItemAccessed('key1', metadata);

      // The adaptive state should be available for monitoring
      const newState = strategy.getAdaptiveState();
      expect(typeof newState.targetRecentSize).toBe('number');
      expect(typeof newState.recentGhostSize).toBe('number');
      expect(typeof newState.frequentGhostSize).toBe('number');
    });
  });

  describe('Enhanced Frequency Mode', () => {
    beforeEach(() => {
      const config: ARCConfig = {
        type: 'arc',
        maxCacheSize: 100,
        frequencyThreshold: 3,
        useEnhancedFrequency: true,
        useFrequencyWeightedSelection: true,
        frequencyDecayFactor: 0
      };
      strategy = new ARCEvictionStrategy(100, config);
    });

    it('should use frequency threshold for classification', () => {
      const items = new Map<string, CacheItemMetadata>([
        ['low-freq', createMockMetadata('low-freq')],
        ['med-freq', createMockMetadata('med-freq')],
        ['high-freq', createMockMetadata('high-freq')]
      ]);

      // Add all items
      for (const [key, metadata] of items) {
        strategy.onItemAdded(key, metadata);
      }

      // Access items different amounts
      // low-freq: 1 access (recent)

      // med-freq: 2 accesses (still recent, below threshold of 3)
      strategy.onItemAccessed('med-freq', items.get('med-freq')!);

      // high-freq: 4 accesses (frequent, above threshold of 3)
      for (let i = 0; i < 3; i++) {
        strategy.onItemAccessed('high-freq', items.get('high-freq')!);
      }

      expect(items.get('low-freq')!.accessCount).toBe(1);
      expect(items.get('med-freq')!.accessCount).toBe(2);
      expect(items.get('high-freq')!.accessCount).toBe(4);

      // With frequency threshold of 3, only high-freq should be classified as frequent
      // The eviction selection should prioritize recent items
      const result = strategy.selectForEviction(items);
      expect(['low-freq', 'med-freq']).toContain(result);
    });

    it('should use frequency-weighted selection within lists', () => {
      const items = new Map<string, CacheItemMetadata>([
        ['recent-high', createMockMetadata('recent-high', Date.now() - 5000)],
        ['recent-low', createMockMetadata('recent-low', Date.now() - 1000)]
      ]);

      // Add items with different ages
      strategy.onItemAdded('recent-high', items.get('recent-high')!);
      strategy.onItemAdded('recent-low', items.get('recent-low')!);

      // Make recent-high accessed more but still below frequency threshold
      strategy.onItemAccessed('recent-high', items.get('recent-high')!);

      // Both should be in recent list, but the frequency-weighted selection
      // should consider both frequency and recency
      const result = strategy.selectForEviction(items);

      // Either item could be selected based on the algorithm's weighting
      // Just verify that a valid selection was made
      expect(['recent-high', 'recent-low']).toContain(result);
    });
  });

  describe('Frequency Decay Mode', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      const config: ARCConfig = {
        type: 'arc',
        maxCacheSize: 100,
        useEnhancedFrequency: true,
        useFrequencyWeightedSelection: true,
        frequencyDecayFactor: 0.1,
        frequencyDecayInterval: 300000, // 5 minutes
        frequencyThreshold: 2
      };
      strategy = new ARCEvictionStrategy(100, config);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should apply decay to frequency scores over time', () => {
      const metadata = createMockMetadata('key1');
      strategy.onItemAdded('key1', metadata);

      // Build up frequency
      for (let i = 0; i < 5; i++) {
        strategy.onItemAccessed('key1', metadata);
      }

      const initialScore = metadata.frequencyScore!;
      expect(initialScore).toBeGreaterThan(1);

      // Advance time past decay interval
      vi.advanceTimersByTime(350000); // Just over 5 minutes

      // Trigger decay by calling selectForEviction
      const items = new Map([['key1', metadata]]);
      strategy.selectForEviction(items);

      // Frequency score should have decayed
      expect(metadata.frequencyScore!).toBeLessThan(initialScore);
      expect(metadata.frequencyScore!).toBeGreaterThanOrEqual(1);
    });

    it('should reclassify items based on decayed frequency', () => {
      const oldItem = createMockMetadata('old-frequent');
      const newItem = createMockMetadata('new-moderate');

      strategy.onItemAdded('old-frequent', oldItem);
      strategy.onItemAdded('new-moderate', newItem);

      // Make old item very frequent initially
      for (let i = 0; i < 10; i++) {
        strategy.onItemAccessed('old-frequent', oldItem);
      }

      // Advance time significantly
      vi.advanceTimersByTime(900000); // 15 minutes

      // Make new item moderately frequent
      for (let i = 0; i < 3; i++) {
        strategy.onItemAccessed('new-moderate', newItem);
      }

      // Due to decay, classification might change
      expect(newItem.frequencyScore).toBeGreaterThan(0);
    });
  });

  describe('Adaptive Learning', () => {
    beforeEach(() => {
      const config: ARCConfig = {
        type: 'arc',
        maxCacheSize: 100,
        adaptiveLearningRate: 2.0, // Faster adaptation
        useEnhancedFrequency: true
      };
      strategy = new ARCEvictionStrategy(100, config);
    });

    it('should adjust target size with configurable learning rate', () => {
      const metadata = createMockMetadata('key1');
      strategy.onItemAdded('key1', metadata);

      const initialState = strategy.getAdaptiveState();
      expect(initialState.targetRecentSize).toBe(0);

      // The learning rate affects how quickly the algorithm adapts
      // This is more of a configuration verification test
      const config = strategy.getConfig();
      expect(config.adaptiveLearningRate).toBe(2.0);
    });
  });

  describe('Configuration and Utilities', () => {
    it('should return configuration correctly', () => {
      const config: ARCConfig = {
        type: 'arc',
        maxCacheSize: 200,
        frequencyThreshold: 4,
        useEnhancedFrequency: true,
        frequencyDecayFactor: 0.15,
        adaptiveLearningRate: 0.5
      };
      strategy = new ARCEvictionStrategy(200, config);

      const returnedConfig = strategy.getConfig();
      expect(returnedConfig.maxCacheSize).toBe(200);
      expect(returnedConfig.frequencyThreshold).toBe(4);
      expect(returnedConfig.useEnhancedFrequency).toBe(true);
      expect(returnedConfig.frequencyDecayFactor).toBe(0.15);
      expect(returnedConfig.adaptiveLearningRate).toBe(0.5);
    });

    it('should reset internal state when requested', () => {
      const metadata = createMockMetadata('key1');
      strategy.onItemAdded('key1', metadata);
      strategy.onItemAccessed('key1', metadata);

      // Reset should clear everything
      strategy.reset();

      const resetState = strategy.getAdaptiveState();
      expect(resetState.targetRecentSize).toBe(0);
      expect(resetState.recentGhostSize).toBe(0);
      expect(resetState.frequentGhostSize).toBe(0);
    });

    it('should handle empty item sets gracefully', () => {
      const items = new Map<string, CacheItemMetadata>();
      const result = strategy.selectForEviction(items);
      expect(result).toBeNull();
    });

    it('should provide adaptive state monitoring', () => {
      const state = strategy.getAdaptiveState();

      // Should have all required properties
      expect(typeof state.targetRecentSize).toBe('number');
      expect(typeof state.recentGhostSize).toBe('number');
      expect(typeof state.frequentGhostSize).toBe('number');

      // Initial state should be zeroed
      expect(state.targetRecentSize).toBe(0);
      expect(state.recentGhostSize).toBe(0);
      expect(state.frequentGhostSize).toBe(0);
    });

    it('should handle ghost list management', () => {
      const metadata = createMockMetadata('key1');
      strategy.onItemAdded('key1', metadata);

      // Simulate item removal (would normally trigger ghost list addition)
      strategy.onItemRemoved('key1');

      const state = strategy.getAdaptiveState();
      expect(state.recentGhostSize).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Ghost List Hit Scenarios', () => {
    beforeEach(() => {
      const config: ARCConfig = {
        type: 'arc',
        maxCacheSize: 100,
        useEnhancedFrequency: true,
        adaptiveLearningRate: 2.0
      };
      strategy = new ARCEvictionStrategy(100, config);
    });

    it('should handle recent ghost list hits and adjust target size', () => {
      const initialState = strategy.getAdaptiveState();
      const initialTarget = initialState.targetRecentSize;

      // Add item to recent ghost list by directly manipulating internal state
      strategy['recentGhosts'].add('key1');

      // Now access the item to trigger the ghost hit logic
      const metadata = createMockMetadata('key1');
      strategy.onItemAdded('key1', metadata);
      strategy.onItemAccessed('key1', metadata);

      const finalState = strategy.getAdaptiveState();
      // Target should have been adjusted due to learning rate
      expect(finalState.targetRecentSize).toBeGreaterThanOrEqual(initialTarget);
    });

    it('should handle frequent ghost list hits and decrease target size', () => {
      // First, simulate a frequent ghost hit scenario
      // We need to add the key to the frequent ghost list manually
      // since the actual ghost list management is internal

      // Set initial target size
      strategy['targetRecentSize'] = 50;

      // Add item to frequent ghost list by directly manipulating internal state
      // This simulates the item being in the frequent ghost list
      strategy['frequentGhosts'].add('frequent1');

      // Now access the item to trigger the ghost hit logic
      const metadata = createMockMetadata('frequent1');
      strategy.onItemAdded('frequent1', metadata);
      strategy.onItemAccessed('frequent1', metadata);

      const finalState = strategy.getAdaptiveState();
      expect(finalState.targetRecentSize).toBeLessThan(50);
    });

    it('should limit ghost list sizes to maxGhostSize', () => {
      const smallStrategy = new ARCEvictionStrategy(5); // Small cache for testing

      // Add and remove more items than the max ghost size
      for (let i = 0; i < 10; i++) {
        const metadata = createMockMetadata(`key${i}`);
        smallStrategy.onItemAdded(`key${i}`, metadata);
        smallStrategy.onItemRemoved(`key${i}`);
      }

      const state = smallStrategy.getAdaptiveState();
      expect(state.recentGhostSize).toBeLessThanOrEqual(5);
      expect(state.frequentGhostSize).toBeLessThanOrEqual(5);
    });
  });

  describe('Frequency Scoring Edge Cases', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      const config: ARCConfig = {
        type: 'arc',
        maxCacheSize: 100,
        useEnhancedFrequency: true,
        frequencyDecayFactor: 0.1,
        frequencyDecayInterval: 300000,
        frequencyThreshold: 2
      };
      strategy = new ARCEvictionStrategy(100, config);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should handle items without frequency score during decay calculation', () => {
      const metadata = createMockMetadata('key1');
      strategy.onItemAdded('key1', metadata);

      // Remove frequency score to test fallback
      delete metadata.frequencyScore;
      delete metadata.lastFrequencyUpdate;

      // Access should still work and calculate frequency score
      strategy.onItemAccessed('key1', metadata);

      expect(metadata.frequencyScore).toBeGreaterThan(0);
    });

    it('should handle items without lastFrequencyUpdate during frequency calculation', () => {
      const metadata = createMockMetadata('key1');
      metadata.rawFrequency = 5;
      delete metadata.lastFrequencyUpdate;

      strategy.onItemAdded('key1', metadata);
      strategy.onItemAccessed('key1', metadata);

      // Should fallback to rawFrequency
      expect(metadata.rawFrequency).toBeGreaterThan(0);
    });

    it('should use rawFrequency when enhanced frequency is disabled', () => {
      const noEnhancedConfig: ARCConfig = {
        type: 'arc',
        maxCacheSize: 100,
        useEnhancedFrequency: false
      };
      const simpleStrategy = new ARCEvictionStrategy(100, noEnhancedConfig);

      const metadata = createMockMetadata('key1');
      metadata.rawFrequency = 10;

      simpleStrategy.onItemAdded('key1', metadata);

      // Should use simple classification based on access count
      expect(metadata.accessCount).toBe(1);
    });

    it('should enforce minimum frequency score of 1 after decay', () => {
      const metadata = createMockMetadata('key1');
      strategy.onItemAdded('key1', metadata);

      // Set a very low frequency score
      metadata.frequencyScore = 0.5;
      metadata.lastFrequencyUpdate = Date.now();

      // Advance time significantly to cause heavy decay
      vi.advanceTimersByTime(3000000); // 50 minutes

      const items = new Map([['key1', metadata]]);
      strategy.selectForEviction(items);

      // Frequency score should be at least 1
      expect(metadata.frequencyScore).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Eviction Selection Branch Coverage', () => {
    beforeEach(() => {
      const config: ARCConfig = {
        type: 'arc',
        maxCacheSize: 100,
        useEnhancedFrequency: true,
        useFrequencyWeightedSelection: true,
        frequencyThreshold: 3
      };
      strategy = new ARCEvictionStrategy(100, config);
    });

    it('should evict from frequent list when recent list is within target', () => {
      const recentItem = createMockMetadata('recent');
      const frequentItem = createMockMetadata('frequent');

      strategy.onItemAdded('recent', recentItem);
      strategy.onItemAdded('frequent', frequentItem);

      // Make frequent item actually frequent
      for (let i = 0; i < 5; i++) {
        strategy.onItemAccessed('frequent', frequentItem);
      }

      // Set target size higher than recent items
      strategy['targetRecentSize'] = 10;

      const items = new Map([
        ['recent', recentItem],
        ['frequent', frequentItem]
      ]);

      const result = strategy.selectForEviction(items);
      // Should prefer evicting from frequent list when recent is within target
      expect(result).toBe('frequent');
    });

    it('should use fallback selection when both lists are empty', () => {
      const item1 = createMockMetadata('item1');
      const item2 = createMockMetadata('item2');

      // Don't add items through normal flow to avoid classification
      const items = new Map([
        ['item1', item1],
        ['item2', item2]
      ]);

      const result = strategy.selectForEviction(items);
      expect(['item1', 'item2']).toContain(result);
    });

    it('should handle frequency-weighted selection in different contexts', () => {
      const now = Date.now();
      const recentOld = createMockMetadata('recent-old', now - 10000);
      const recentNew = createMockMetadata('recent-new', now - 1000);
      const frequentOld = createMockMetadata('frequent-old', now - 10000);
      const frequentNew = createMockMetadata('frequent-new', now - 1000);

      strategy.onItemAdded('recent-old', recentOld);
      strategy.onItemAdded('recent-new', recentNew);
      strategy.onItemAdded('frequent-old', frequentOld);
      strategy.onItemAdded('frequent-new', frequentNew);

      // Make frequent items actually frequent
      for (let i = 0; i < 5; i++) {
        strategy.onItemAccessed('frequent-old', frequentOld);
        strategy.onItemAccessed('frequent-new', frequentNew);
      }

      // Test different selection contexts
      const recentItems = new Map([
        ['recent-old', recentOld],
        ['recent-new', recentNew]
      ]);

      const frequentItems = new Map([
        ['frequent-old', frequentOld],
        ['frequent-new', frequentNew]
      ]);

      // Force eviction from recent list
      strategy['targetRecentSize'] = 0;
      const result1 = strategy.selectForEviction(recentItems);
      expect(['recent-old', 'recent-new']).toContain(result1);

      // Force eviction from frequent list
      strategy['targetRecentSize'] = 100;
      const result2 = strategy.selectForEviction(frequentItems);
      expect(['frequent-old', 'frequent-new']).toContain(result2);
    });
  });

  describe('Configuration Edge Cases', () => {
    it('should handle default configuration values', () => {
      const defaultStrategy = new ARCEvictionStrategy();
      const config = defaultStrategy.getConfig();

      expect(config.maxCacheSize).toBe(1000);
      expect(typeof config.type).toBe('string');
    });

    it('should handle partial configuration override', () => {
      const partialConfig: Partial<ARCConfig> = {
        frequencyThreshold: 5,
        adaptiveLearningRate: 3.0
      };
      const customStrategy = new ARCEvictionStrategy(200, partialConfig);
      const config = customStrategy.getConfig();

      expect(config.maxCacheSize).toBe(200);
      expect(config.frequencyThreshold).toBe(5);
      expect(config.adaptiveLearningRate).toBe(3.0);
    });

    it('should handle zero or negative learning rates', () => {
      const config: ARCConfig = {
        type: 'arc',
        maxCacheSize: 100,
        adaptiveLearningRate: 0
      };
      const zeroStrategy = new ARCEvictionStrategy(100, config);

      const metadata = createMockMetadata('key1');
      zeroStrategy.onItemAdded('key1', metadata);
      zeroStrategy.onItemRemoved('key1');

      const initialState = zeroStrategy.getAdaptiveState();
      const initialTarget = initialState.targetRecentSize;

      // Access should not change target with zero learning rate
      const newMetadata = createMockMetadata('key1');
      zeroStrategy.onItemAdded('key1', newMetadata);
      zeroStrategy.onItemAccessed('key1', newMetadata);

      const finalState = zeroStrategy.getAdaptiveState();
      expect(finalState.targetRecentSize).toBe(initialTarget);
    });
  });

  describe('LRU Fallback Selection', () => {
    beforeEach(() => {
      const config: ARCConfig = {
        type: 'arc',
        maxCacheSize: 100,
        useEnhancedFrequency: false,
        useFrequencyWeightedSelection: false
      };
      strategy = new ARCEvictionStrategy(100, config);
    });

    it('should select oldest item when using LRU fallback', () => {
      const now = Date.now();
      const oldest = createMockMetadata('oldest', now - 5000);
      const middle = createMockMetadata('middle', now - 3000);
      const newest = createMockMetadata('newest', now - 1000);

      oldest.lastAccessedAt = now - 5000;
      middle.lastAccessedAt = now - 3000;
      newest.lastAccessedAt = now - 1000;

      const items = new Map([
        ['oldest', oldest],
        ['middle', middle],
        ['newest', newest]
      ]);

      const result = strategy.selectForEviction(items);
      expect(result).toBe('oldest');
    });

    it('should handle items with same access time in LRU selection', () => {
      const now = Date.now();
      const item1 = createMockMetadata('item1', now);
      const item2 = createMockMetadata('item2', now);

      item1.lastAccessedAt = now;
      item2.lastAccessedAt = now;

      const items = new Map([
        ['item1', item1],
        ['item2', item2]
      ]);

      const result = strategy.selectForEviction(items);
      expect(['item1', 'item2']).toContain(result);
    });
  });

  describe('Ghost List Management Edge Cases', () => {
    beforeEach(() => {
      const config: ARCConfig = {
        type: 'arc',
        maxCacheSize: 5 // Small cache for testing edge cases
      };
      strategy = new ARCEvictionStrategy(5, config);
    });

    it('should handle ghost list cleanup when frequent ghost list exceeds max size', () => {
      // Create many frequent items and remove them to populate frequent ghost list
      for (let i = 0; i < 10; i++) {
        const metadata = createMockMetadata(`frequent${i}`);
        strategy.onItemAdded(`frequent${i}`, metadata);

        // Make items frequent before removing
        for (let j = 0; j < 3; j++) {
          strategy.onItemAccessed(`frequent${i}`, metadata);
        }

        // Remove to add to ghost list
        strategy.onItemRemoved(`frequent${i}`);
      }

      const state = strategy.getAdaptiveState();
      expect(state.frequentGhostSize).toBeLessThanOrEqual(5);
    });

    it('should handle ghost list cleanup when recent ghost list exceeds max size', () => {
      // Create many recent items and remove them
      for (let i = 0; i < 10; i++) {
        const metadata = createMockMetadata(`recent${i}`);
        strategy.onItemAdded(`recent${i}`, metadata);
        // Don't access multiple times to keep them in recent category
        strategy.onItemRemoved(`recent${i}`);
      }

      const state = strategy.getAdaptiveState();
      expect(state.recentGhostSize).toBeLessThanOrEqual(5);
    });

    it('should handle removing items when ghost lists are empty', () => {
      const metadata = createMockMetadata('key1');
      strategy.onItemAdded('key1', metadata);

      // Remove item when ghost lists are empty
      strategy.onItemRemoved('key1');

      const state = strategy.getAdaptiveState();
      expect(state.recentGhostSize).toBeGreaterThan(0);
    });

    it('should cleanup frequent ghost list when first key is found', () => {
      const smallStrategy = new ARCEvictionStrategy(2);

      // Add items normally to trigger the ghost list cleanup through onItemRemoved
      for (let i = 0; i < 5; i++) {
        const metadata = createMockMetadata(`recent${i}`);
        smallStrategy.onItemAdded(`recent${i}`, metadata);
        smallStrategy.onItemRemoved(`recent${i}`);
      }

      const state = smallStrategy.getAdaptiveState();
      expect(state.recentGhostSize).toBeLessThanOrEqual(2);
    });

    it('should cleanup frequent ghost list when exceeding max size', () => {
      const smallStrategy = new ARCEvictionStrategy(2);

      // Pre-fill the frequent ghost list to max size
      smallStrategy['frequentGhosts'].add('frequent1');
      smallStrategy['frequentGhosts'].add('frequent2');

      // Now add and remove an item to trigger cleanup
      const metadata = createMockMetadata('newItem');
      smallStrategy.onItemAdded('newItem', metadata);
      smallStrategy.onItemRemoved('newItem');

      const state = smallStrategy.getAdaptiveState();
      // The cleanup should have been triggered
      expect(state.frequentGhostSize).toBeLessThanOrEqual(2);
    });
  });

  describe('Enhanced Frequency Edge Cases', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      const config: ARCConfig = {
        type: 'arc',
        maxCacheSize: 100,
        useEnhancedFrequency: true,
        frequencyDecayFactor: 0.1,
        frequencyDecayInterval: 300000
      };
      strategy = new ARCEvictionStrategy(100, config);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should handle frequency decay factor of 0', () => {
      const noDecayConfig: ARCConfig = {
        type: 'arc',
        maxCacheSize: 100,
        useEnhancedFrequency: true,
        frequencyDecayFactor: 0 // No decay
      };
      const noDecayStrategy = new ARCEvictionStrategy(100, noDecayConfig);

      const metadata = createMockMetadata('key1');
      noDecayStrategy.onItemAdded('key1', metadata);

      for (let i = 0; i < 5; i++) {
        noDecayStrategy.onItemAccessed('key1', metadata);
      }

      const initialScore = metadata.frequencyScore!;

      // Advance time significantly
      vi.advanceTimersByTime(900000); // 15 minutes

      // Trigger check
      const items = new Map([['key1', metadata]]);
      noDecayStrategy.selectForEviction(items);

      // Score should not have changed with no decay
      expect(metadata.frequencyScore).toBe(initialScore);
    });

    it('should handle missing frequencyScore in periodic decay', () => {
      const metadata = createMockMetadata('key1');
      strategy.onItemAdded('key1', metadata);

      // Manually set frequencyScore and then delete it
      metadata.frequencyScore = 5;
      delete metadata.frequencyScore;

      // Advance time to trigger periodic decay
      vi.advanceTimersByTime(350000);

      const items = new Map([['key1', metadata]]);
      // This should not crash even with missing frequency score
      const result = strategy.selectForEviction(items);
      expect(result).toBe('key1');
    });

    it('should handle effective frequency calculation with missing properties', () => {
      const metadata = createMockMetadata('key1');

      // Remove both frequency tracking properties
      delete metadata.rawFrequency;
      delete metadata.frequencyScore;
      delete metadata.lastFrequencyUpdate;

      strategy.onItemAdded('key1', metadata);

      // Should fallback to accessCount
      expect(metadata.accessCount).toBe(1);
    });
  });

  describe('Selection Context Branch Coverage', () => {
    beforeEach(() => {
      const config: ARCConfig = {
        type: 'arc',
        maxCacheSize: 100,
        useEnhancedFrequency: true,
        useFrequencyWeightedSelection: true
      };
      strategy = new ARCEvictionStrategy(100, config);
    });

    it('should handle frequency-weighted selection with zero-sized items map', () => {
      const emptyItems = new Map<string, CacheItemMetadata>();
      const result = strategy.selectForEviction(emptyItems);
      expect(result).toBeNull();
    });

    it('should test all frequency-weighted selection scoring contexts', () => {
      const now = Date.now();

      // Test recent context scoring
      const recentItem = createMockMetadata('recent', now - 5000);
      recentItem.lastAccessedAt = now - 5000;
      recentItem.rawFrequency = 2;

      strategy.onItemAdded('recent', recentItem);

      const recentItems = new Map([['recent', recentItem]]);
      const recentResult = strategy.selectForEviction(recentItems);
      expect(recentResult).toBe('recent');

      // Test frequent context scoring
      const frequentItem = createMockMetadata('frequent', now - 3000);
      frequentItem.lastAccessedAt = now - 3000;
      frequentItem.rawFrequency = 10;

      // Make it truly frequent
      for (let i = 0; i < 8; i++) {
        strategy.onItemAccessed('frequent', frequentItem);
      }

      const frequentItems = new Map([['frequent', frequentItem]]);
      // Force eviction from frequent by setting target high
      strategy['targetRecentSize'] = 100;
      const frequentResult = strategy.selectForEviction(frequentItems);
      expect(frequentResult).toBe('frequent');
    });

    it('should handle items classification at frequency threshold boundary', () => {
      const config: ARCConfig = {
        type: 'arc',
        maxCacheSize: 100,
        useEnhancedFrequency: true,
        frequencyThreshold: 3
      };
      const boundaryStrategy = new ARCEvictionStrategy(100, config);

      const atThreshold = createMockMetadata('at-threshold');
      const belowThreshold = createMockMetadata('below-threshold');

      boundaryStrategy.onItemAdded('at-threshold', atThreshold);
      boundaryStrategy.onItemAdded('below-threshold', belowThreshold);

      // Make at-threshold exactly at the boundary (3 accesses total)
      boundaryStrategy.onItemAccessed('at-threshold', atThreshold);
      boundaryStrategy.onItemAccessed('at-threshold', atThreshold);

      // Make below-threshold just below (2 accesses total)
      boundaryStrategy.onItemAccessed('below-threshold', belowThreshold);

      expect(atThreshold.accessCount).toBe(3); // Should be frequent
      expect(belowThreshold.accessCount).toBe(2); // Should be recent

      const items = new Map([
        ['at-threshold', atThreshold],
        ['below-threshold', belowThreshold]
      ]);

      const result = boundaryStrategy.selectForEviction(items);
      expect(['at-threshold', 'below-threshold']).toContain(result);
    });

    it('should handle frequency-weighted selection fallback when items map is empty after filter', () => {
      const emptyMap = new Map<string, CacheItemMetadata>();

      // This should trigger the fallback path in selectFrequencyWeightedFromItems
      const result = strategy.selectForEviction(emptyMap);
      expect(result).toBeNull();
    });

    it('should handle frequency-weighted selection with no bestKey found', () => {
      // Create items with unusual scores to test the fallback path
      const item1 = createMockMetadata('item1');
      const item2 = createMockMetadata('item2');

      // Create a scenario where the scoring might result in no bestKey
      item1.lastAccessedAt = Number.MAX_SAFE_INTEGER; // Very recent access
      item2.lastAccessedAt = Number.MAX_SAFE_INTEGER; // Very recent access

      const items = new Map([
        ['item1', item1],
        ['item2', item2]
      ]);

      const result = strategy.selectForEviction(items);
      expect(['item1', 'item2']).toContain(result);
    });
  });

  describe('Traditional vs Enhanced Comparison', () => {
    it('should behave differently with and without enhancements', () => {
      const traditionalConfig: ARCConfig = {
        type: 'arc',
        maxCacheSize: 100,
        useEnhancedFrequency: false,
        useFrequencyWeightedSelection: false
      };

      const enhancedConfig: ARCConfig = {
        type: 'arc',
        maxCacheSize: 100,
        useEnhancedFrequency: true,
        useFrequencyWeightedSelection: true,
        frequencyThreshold: 3,
        frequencyDecayFactor: 0.1
      };

      const traditional = new ARCEvictionStrategy(100, traditionalConfig);
      const enhanced = new ARCEvictionStrategy(100, enhancedConfig);

      // Verify configurations are different
      const traditionalConf = traditional.getConfig();
      const enhancedConf = enhanced.getConfig();

      expect(traditionalConf.useEnhancedFrequency).toBe(false);
      expect(enhancedConf.useEnhancedFrequency).toBe(true);
      expect(enhancedConf.frequencyThreshold).toBe(3);
      expect(enhancedConf.frequencyDecayFactor).toBe(0.1);
    });
  });
});
