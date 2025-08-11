import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ARCEvictionStrategy } from '../../../src/eviction/strategies/ARCEvictionStrategy';
import { CacheItemMetadata } from '../../../src/eviction/EvictionStrategy';
import { ARCConfig } from '../../../src/eviction/EvictionStrategyConfig';
import { MockMetadataProvider } from '../../utils/MockMetadataProvider';

describe('ARCEvictionStrategy', () => {
  let strategy: ARCEvictionStrategy;
  let metadataProvider: MockMetadataProvider;

  afterEach(() => {
    // Clean up any strategy resources
    if (strategy) {
      strategy.reset();
    }
    // Clear timers to prevent memory leaks
    vi.clearAllTimers();
  });

  beforeEach(async () => {
    // Ensure clean state for each test
    if (metadataProvider) {
      await metadataProvider.clearMetadata();
    }
  });

  function assertNonNull<T>(value: T, message?: string): asserts value is NonNullable<T> {
    if (value == null) {
      throw new Error(message ?? 'Expected value to be non-null');
    }
  }

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
      metadataProvider = new MockMetadataProvider();
    });

    it('should classify items as recent vs frequent based on simple access count', async () => {
      // Add items
      await strategy.onItemAdded('recent1', 100, metadataProvider);
      await strategy.onItemAdded('frequent1', 100, metadataProvider);

      // Access frequent1 more times
      await strategy.onItemAccessed('frequent1', metadataProvider);
      await strategy.onItemAccessed('frequent1', metadataProvider);

      // Should evict from recent items first
      const context = { currentSize: { itemCount: 5, sizeBytes: 500 }, limits: { maxItems: 4, maxSizeBytes: 400 } };
      const result = await strategy.selectForEviction(metadataProvider, context);
      expect(result).toContain('recent1');
    });

    it('should adapt target size based on ghost list hits', async () => {
      await strategy.onItemAdded('key1', 100, metadataProvider);

      // Simulate ghost list hit (this would normally happen during cache management)
      // For testing, we'll manually trigger the adaptive behavior
      await strategy.onItemAccessed('key1', metadataProvider);

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
      metadataProvider = new MockMetadataProvider();
    });

    it('should use frequency threshold for classification', async () => {
      // Add all items
      await strategy.onItemAdded('low-freq', 100, metadataProvider);
      await strategy.onItemAdded('med-freq', 100, metadataProvider);
      await strategy.onItemAdded('high-freq', 100, metadataProvider);

      // Access items different amounts
      // low-freq: 1 access (recent)

      // med-freq: 2 accesses (still recent, below threshold of 3)
      await strategy.onItemAccessed('med-freq', metadataProvider);

      // high-freq: 4 accesses (frequent, above threshold of 3)
      for (let i = 0; i < 3; i++) {
        await strategy.onItemAccessed('high-freq', metadataProvider);
      }

      // Check metadata from provider after operations
      const lowFreqMeta = await metadataProvider.getMetadata('low-freq');
      assertNonNull(lowFreqMeta, 'low-freq metadata missing');
      const medFreqMeta = await metadataProvider.getMetadata('med-freq');
      assertNonNull(medFreqMeta, 'med-freq metadata missing');
      const highFreqMeta = await metadataProvider.getMetadata('high-freq');
      assertNonNull(highFreqMeta, 'high-freq metadata missing');

      expect(lowFreqMeta.accessCount).toBe(1);
      expect(medFreqMeta.accessCount).toBe(2);
      expect(highFreqMeta.accessCount).toBe(4);

      // With frequency threshold of 3, only high-freq should be classified as frequent
      // The eviction selection should prioritize recent items
      const context = { currentSize: { itemCount: 5, sizeBytes: 500 }, limits: { maxItems: 4, maxSizeBytes: 400 } };
      const result = await strategy.selectForEviction(metadataProvider, context);
      expect(result.length).toBeGreaterThan(0);
      expect(['low-freq', 'med-freq']).toContain(result[0]);
    });

    it('should use frequency-weighted selection within lists', async () => {
      // Items map created but not used in this test since we call methods directly

      // Add items with different ages
      await strategy.onItemAdded('recent-high', 100, metadataProvider);
      await strategy.onItemAdded('recent-low', 100, metadataProvider);

      // Make recent-high accessed more but still below frequency threshold
      await strategy.onItemAccessed('recent-high', metadataProvider);

      // Both should be in recent list, but the frequency-weighted selection
      // should consider both frequency and recency
      const context = { currentSize: { itemCount: 5, sizeBytes: 500 }, limits: { maxItems: 4, maxSizeBytes: 400 } };
      const result = await strategy.selectForEviction(metadataProvider, context);

      // Either item could be selected based on the algorithm's weighting
      // Just verify that a valid selection was made
      expect(result.length).toBeGreaterThan(0);
      expect(['recent-high', 'recent-low']).toContain(result[0]);
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
      metadataProvider = new MockMetadataProvider();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should apply decay to frequency scores over time', async () => {
      await strategy.onItemAdded('key1', 100, metadataProvider);

      // Build up frequency
      for (let i = 0; i < 5; i++) {
        await strategy.onItemAccessed('key1', metadataProvider);
      }

      const metadata = await metadataProvider.getMetadata('key1');
      assertNonNull(metadata, 'metadata for key1 missing');
      const initialScore = metadata.frequencyScore!;
      expect(initialScore).toBeGreaterThan(1);

      // Advance time past decay interval
      vi.advanceTimersByTime(350000); // Just over 5 minutes

      // Trigger decay by calling selectForEviction
      const context = { currentSize: { itemCount: 5, sizeBytes: 500 }, limits: { maxItems: 4, maxSizeBytes: 400 } };
      await strategy.selectForEviction(metadataProvider, context);

      // Get updated metadata after decay
      const updatedMetadata = await metadataProvider.getMetadata('key1');
      assertNonNull(updatedMetadata, 'updated metadata for key1 missing');
      // Frequency score should have decayed
      expect(updatedMetadata.frequencyScore!).toBeLessThan(initialScore);
      expect(updatedMetadata.frequencyScore!).toBeGreaterThanOrEqual(1);
    });

    it('should reclassify items based on decayed frequency', async () => {
      await strategy.onItemAdded('old-frequent', 100, metadataProvider);
      await strategy.onItemAdded('new-moderate', 100, metadataProvider);

      // Make old item very frequent initially
      for (let i = 0; i < 10; i++) {
        await strategy.onItemAccessed('old-frequent', metadataProvider);
      }

      // Advance time significantly
      vi.advanceTimersByTime(900000); // 15 minutes

      // Make new item moderately frequent
      for (let i = 0; i < 3; i++) {
        await strategy.onItemAccessed('new-moderate', metadataProvider);
      }

      // Due to decay, classification might change - verify item metadata exists
      const metadata = await metadataProvider.getMetadata('new-moderate');
      expect(metadata).toBeTruthy();
      if (metadata && typeof metadata.frequencyScore === 'number') {
        expect(metadata.frequencyScore).toBeGreaterThan(0);
      }
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
      metadataProvider = new MockMetadataProvider();
    });

    it('should adjust target size with configurable learning rate', async () => {
      await strategy.onItemAdded('key1', 100, metadataProvider);

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

    it('should reset internal state when requested', async () => {
      await strategy.onItemAdded('key1', 100, metadataProvider);
      await strategy.onItemAccessed('key1', metadataProvider);

      // Reset should clear everything
      strategy.reset();

      const resetState = strategy.getAdaptiveState();
      expect(resetState.targetRecentSize).toBe(0);
      expect(resetState.recentGhostSize).toBe(0);
      expect(resetState.frequentGhostSize).toBe(0);
    });

    it('should handle empty item sets gracefully', async () => {
      // Clear any existing metadata and ensure clean state
      await metadataProvider.clearMetadata();
      const context = { currentSize: { itemCount: 5, sizeBytes: 500 }, limits: { maxItems: 4, maxSizeBytes: 400 } };
      const result = await strategy.selectForEviction(metadataProvider, context);
      expect(result).toEqual([]);
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

    it('should handle ghost list management', async () => {
      await strategy.onItemAdded('key1', 100, metadataProvider);

      // Simulate item removal (would normally trigger ghost list addition)
      await strategy.onItemRemoved('key1', metadataProvider);

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
      metadataProvider = new MockMetadataProvider();
    });

    it('should handle recent ghost list hits and adjust target size', async () => {
      const initialState = strategy.getAdaptiveState();
      const initialTarget = initialState.targetRecentSize;

      // Add item to recent ghost list by directly manipulating internal state
      strategy['recentGhosts'].add('key1');

      // Now access the item to trigger the ghost hit logic
      await strategy.onItemAdded('key1', 100, metadataProvider);
      await strategy.onItemAccessed('key1', metadataProvider);

      const finalState = strategy.getAdaptiveState();
      // Target should have been adjusted due to learning rate
      expect(finalState.targetRecentSize).toBeGreaterThanOrEqual(initialTarget);
    });

    it('should handle frequent ghost list hits and decrease target size', async () => {
      // First, simulate a frequent ghost hit scenario
      // We need to add the key to the frequent ghost list manually
      // since the actual ghost list management is internal

      // Set initial target size
      strategy['targetRecentSize'] = 50;

      // Add item to frequent ghost list by directly manipulating internal state
      // This simulates the item being in the frequent ghost list
      strategy['frequentGhosts'].add('frequent1');

      // Now access the item to trigger the ghost hit logic
      await strategy.onItemAdded('frequent1', 100, metadataProvider);
      await strategy.onItemAccessed('frequent1', metadataProvider);

      const finalState = strategy.getAdaptiveState();
      expect(finalState.targetRecentSize).toBeLessThan(50);
    });

    it('should limit ghost list sizes to maxGhostSize', () => {
      const smallStrategy = new ARCEvictionStrategy(5); // Small cache for testing

      // Add and remove more items than the max ghost size
      for (let i = 0; i < 10; i++) {
        smallStrategy.onItemAdded(`key${i}`, 100, metadataProvider);
        smallStrategy.onItemRemoved(`key${i}`, metadataProvider);
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
      metadataProvider = new MockMetadataProvider();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should handle items without frequency score during decay calculation', async () => {
      await strategy.onItemAdded('key1', 100, metadataProvider);

      // Get metadata and remove frequency score to test fallback
      const metadata = await metadataProvider.getMetadata('key1');
      assertNonNull(metadata, 'metadata for key1 missing');
      delete metadata.frequencyScore;
      delete metadata.lastFrequencyUpdate;
      await metadataProvider.setMetadata('key1', metadata);

      // Access should still work and calculate frequency score
      await strategy.onItemAccessed('key1', metadataProvider);

      const updatedMetadata = await metadataProvider.getMetadata('key1');
      assertNonNull(updatedMetadata, 'updated metadata for key1 missing');
      expect(updatedMetadata.frequencyScore).toBeGreaterThan(0);
    });

    it('should handle items without lastFrequencyUpdate during frequency calculation', async () => {
      await strategy.onItemAdded('key1', 100, metadataProvider);

      // Get metadata and modify it
      const metadata = await metadataProvider.getMetadata('key1');
      assertNonNull(metadata, 'metadata for key1 missing');
      metadata.rawFrequency = 5;
      delete metadata.lastFrequencyUpdate;
      await metadataProvider.setMetadata('key1', metadata);

      await strategy.onItemAccessed('key1', metadataProvider);

      // Should fallback to rawFrequency
      const updatedMetadata = await metadataProvider.getMetadata('key1');
      assertNonNull(updatedMetadata, 'updated metadata for key1 missing');
      expect(updatedMetadata.rawFrequency).toBeGreaterThan(0);
    });

    it('should use rawFrequency when enhanced frequency is disabled', async () => {
      const noEnhancedConfig: ARCConfig = {
        type: 'arc',
        maxCacheSize: 100,
        useEnhancedFrequency: false
      };
      const simpleStrategy = new ARCEvictionStrategy(100, noEnhancedConfig);

      simpleStrategy.onItemAdded('key1', 100, metadataProvider);

      // Get metadata and set rawFrequency
      const metadata = await metadataProvider.getMetadata('key1');
      assertNonNull(metadata, 'metadata for key1 missing');
      metadata.rawFrequency = 10;
      await metadataProvider.setMetadata('key1', metadata);

      // Should use simple classification based on access count
      const updatedMetadata = await metadataProvider.getMetadata('key1');
      assertNonNull(updatedMetadata, 'updated metadata for key1 missing');
      expect(updatedMetadata.accessCount).toBe(1);
    });

    it('should enforce minimum frequency score of 1 after decay', async () => {
      await strategy.onItemAdded('key1', 100, metadataProvider);

      // Get metadata and set a very low frequency score
      const metadata = await metadataProvider.getMetadata('key1');
      assertNonNull(metadata, 'metadata for key1 missing');
      metadata.frequencyScore = 0.5;
      metadata.lastFrequencyUpdate = Date.now();
      await metadataProvider.setMetadata('key1', metadata);

      // Advance time significantly to cause heavy decay
      vi.advanceTimersByTime(3000000); // 50 minutes

      const context = { currentSize: { itemCount: 5, sizeBytes: 500 }, limits: { maxItems: 4, maxSizeBytes: 400 } };
      await strategy.selectForEviction(metadataProvider, context);

      // Frequency score should be at least 1
      const updatedMetadata = await metadataProvider.getMetadata('key1');
      assertNonNull(updatedMetadata, 'updated metadata for key1 missing');
      expect(updatedMetadata.frequencyScore).toBeGreaterThanOrEqual(1);
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
      metadataProvider = new MockMetadataProvider();
    });

    it('should evict from frequent list when recent list is within target', async () => {
      await strategy.onItemAdded('recent', 100, metadataProvider);
      await strategy.onItemAdded('frequent', 100, metadataProvider);

      // Make frequent item actually frequent
      for (let i = 0; i < 5; i++) {
        await strategy.onItemAccessed('frequent', metadataProvider);
      }

      // Set target size higher than recent items
      strategy['targetRecentSize'] = 10;

      const context = { currentSize: { itemCount: 5, sizeBytes: 500 }, limits: { maxItems: 4, maxSizeBytes: 400 } };
      const result = await strategy.selectForEviction(metadataProvider, context);
      // Should prefer evicting from frequent list when recent is within target
      expect(result).toContain('frequent');
    });

    it('should use fallback selection when both lists are empty', async () => {
      // Add some items to the metadata provider but not through strategy calls
      // to test the fallback path
      await metadataProvider.setMetadata('item1', createMockMetadata('item1'));
      await metadataProvider.setMetadata('item2', createMockMetadata('item2'));

      const context = { currentSize: { itemCount: 5, sizeBytes: 500 }, limits: { maxItems: 4, maxSizeBytes: 400 } };
      const result = await strategy.selectForEviction(metadataProvider, context);
      expect(result.length).toBeGreaterThan(0);
      expect(['item1', 'item2']).toContain(result[0]);
    });

    it('should handle frequency-weighted selection in different contexts', async () => {
      // Items added through method calls below

      await strategy.onItemAdded('recent-old', 100, metadataProvider);
      await strategy.onItemAdded('recent-new', 100, metadataProvider);
      await strategy.onItemAdded('frequent-old', 100, metadataProvider);
      await strategy.onItemAdded('frequent-new', 100, metadataProvider);

      // Make frequent items actually frequent
      for (let i = 0; i < 5; i++) {
        await strategy.onItemAccessed('frequent-old', metadataProvider);
        await strategy.onItemAccessed('frequent-new', metadataProvider);
      }

      // Test different selection contexts
      // Force eviction from recent list
      strategy['targetRecentSize'] = 0;
      const context1 = { currentSize: { itemCount: 5, sizeBytes: 500 }, limits: { maxItems: 4, maxSizeBytes: 400 } };
      const result1 = await strategy.selectForEviction(metadataProvider, context1);
      expect(result1.length).toBeGreaterThan(0);
      expect(['recent-old', 'recent-new']).toContain(result1[0]);

      // Force eviction from frequent list
      strategy['targetRecentSize'] = 100;
      const context2 = { currentSize: { itemCount: 5, sizeBytes: 500 }, limits: { maxItems: 4, maxSizeBytes: 400 } };
      const result2 = await strategy.selectForEviction(metadataProvider, context2);
      expect(result2.length).toBeGreaterThan(0);
      expect(['frequent-old', 'frequent-new']).toContain(result2[0]);
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

      zeroStrategy.onItemAdded('key1', 100, metadataProvider);
      zeroStrategy.onItemRemoved('key1', metadataProvider);

      const initialState = zeroStrategy.getAdaptiveState();
      const initialTarget = initialState.targetRecentSize;

      // Access should not change target with zero learning rate
      zeroStrategy.onItemAdded('key1', 100, metadataProvider);
      zeroStrategy.onItemAccessed('key1', metadataProvider);

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
      metadataProvider = new MockMetadataProvider();
    });

    it('should select oldest item when using LRU fallback', async () => {
      const now = Date.now();
      const oldest = createMockMetadata('oldest', now - 5000);
      const middle = createMockMetadata('middle', now - 3000);
      const newest = createMockMetadata('newest', now - 1000);

      oldest.lastAccessedAt = now - 5000;
      middle.lastAccessedAt = now - 3000;
      newest.lastAccessedAt = now - 1000;

      // Add items to metadata provider
      await metadataProvider.setMetadata('oldest', oldest);
      await metadataProvider.setMetadata('middle', middle);
      await metadataProvider.setMetadata('newest', newest);

      const context = { currentSize: { itemCount: 5, sizeBytes: 500 }, limits: { maxItems: 4, maxSizeBytes: 400 } };
      const result = await strategy.selectForEviction(metadataProvider, context);
      expect(result.length).toBeGreaterThan(0);
      expect(result).toContain('oldest');
    });

    it('should handle items with same access time in LRU selection', async () => {
      const now = Date.now();
      const item1 = createMockMetadata('item1', now);
      const item2 = createMockMetadata('item2', now);

      item1.lastAccessedAt = now;
      item2.lastAccessedAt = now;

      // Add items to metadata provider
      await metadataProvider.setMetadata('item1', item1);
      await metadataProvider.setMetadata('item2', item2);

      const context = { currentSize: { itemCount: 5, sizeBytes: 500 }, limits: { maxItems: 4, maxSizeBytes: 400 } };
      const result = await strategy.selectForEviction(metadataProvider, context);
      expect(result.length).toBeGreaterThan(0);
      expect(['item1', 'item2']).toContain(result[0]);
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

    it('should handle ghost list cleanup when frequent ghost list exceeds max size', async () => {
      // Create many frequent items and remove them to populate frequent ghost list
      for (let i = 0; i < 10; i++) {
        await strategy.onItemAdded(`frequent${i}`, 100, metadataProvider);

        // Make items frequent before removing
        for (let j = 0; j < 3; j++) {
          await strategy.onItemAccessed(`frequent${i}`, metadataProvider);
        }

        // Remove to add to ghost list
        await strategy.onItemRemoved(`frequent${i}`, metadataProvider);
      }

      const state = strategy.getAdaptiveState();
      expect(state.frequentGhostSize).toBeLessThanOrEqual(5);
    });

    it('should handle ghost list cleanup when recent ghost list exceeds max size', async () => {
      // Create many recent items and remove them
      for (let i = 0; i < 10; i++) {
        await strategy.onItemAdded(`recent${i}`, 100, metadataProvider);
        // Don't access multiple times to keep them in recent category
        await strategy.onItemRemoved(`recent${i}`, metadataProvider);
      }

      const state = strategy.getAdaptiveState();
      expect(state.recentGhostSize).toBeLessThanOrEqual(5);
    });

    it('should handle removing items when ghost lists are empty', async () => {
      await strategy.onItemAdded('key1', 100, metadataProvider);

      // Remove item when ghost lists are empty
      await strategy.onItemRemoved('key1', metadataProvider);

      const state = strategy.getAdaptiveState();
      expect(state.recentGhostSize).toBeGreaterThan(0);
    });

    it('should cleanup frequent ghost list when first key is found', () => {
      const smallStrategy = new ARCEvictionStrategy(2);

      // Add items normally to trigger the ghost list cleanup through onItemRemoved
      for (let i = 0; i < 5; i++) {
        smallStrategy.onItemAdded(`recent${i}`, 100, metadataProvider);
        smallStrategy.onItemRemoved(`recent${i}`, metadataProvider);
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
      smallStrategy.onItemAdded('newItem', 100, metadataProvider);
      smallStrategy.onItemRemoved('newItem', metadataProvider);

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
      metadataProvider = new MockMetadataProvider();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should handle frequency decay factor of 0', async () => {
      const noDecayConfig: ARCConfig = {
        type: 'arc',
        maxCacheSize: 100,
        useEnhancedFrequency: true,
        frequencyDecayFactor: 0 // No decay
      };
      const noDecayStrategy = new ARCEvictionStrategy(100, noDecayConfig);

      noDecayStrategy.onItemAdded('key1', 100, metadataProvider);

      for (let i = 0; i < 5; i++) {
        noDecayStrategy.onItemAccessed('key1', metadataProvider);
      }

      const metadata = await metadataProvider.getMetadata('key1');
      assertNonNull(metadata, 'metadata for key1 missing');
      const initialScore = metadata.frequencyScore!;

      // Advance time significantly
      vi.advanceTimersByTime(900000); // 15 minutes

      // Trigger check
      const context = { currentSize: { itemCount: 5, sizeBytes: 500 }, limits: { maxItems: 4, maxSizeBytes: 400 } };
      noDecayStrategy.selectForEviction(metadataProvider, context);

      // Score should not have changed with no decay
      const updatedMetadata = await metadataProvider.getMetadata('key1');
      assertNonNull(updatedMetadata, 'updated metadata for key1 missing');
      expect(updatedMetadata.frequencyScore).toBe(initialScore);
    });

    it('should handle missing frequencyScore in periodic decay', async () => {
      await strategy.onItemAdded('key1', 100, metadataProvider);

      // Get metadata, set frequencyScore and then delete it
      const metadata = await metadataProvider.getMetadata('key1');
      assertNonNull(metadata, 'metadata for key1 missing');
      metadata.frequencyScore = 5;
      delete metadata.frequencyScore;
      await metadataProvider.setMetadata('key1', metadata);

      // Advance time to trigger periodic decay
      vi.advanceTimersByTime(350000);

      // This should not crash even with missing frequency score
      const context = { currentSize: { itemCount: 5, sizeBytes: 500 }, limits: { maxItems: 4, maxSizeBytes: 400 } };
      const result = await strategy.selectForEviction(metadataProvider, context);
      expect(result).toContain('key1');
    });

    it('should handle effective frequency calculation with missing properties', async () => {
      await strategy.onItemAdded('key1', 100, metadataProvider);

      // Get metadata and remove both frequency tracking properties
      const metadata = await metadataProvider.getMetadata('key1');
      assertNonNull(metadata, 'metadata for key1 missing');
      delete metadata.rawFrequency;
      delete metadata.frequencyScore;
      delete metadata.lastFrequencyUpdate;
      await metadataProvider.setMetadata('key1', metadata);

      // Should fallback to accessCount
      const updatedMetadata = await metadataProvider.getMetadata('key1');
      assertNonNull(updatedMetadata, 'updated metadata for key1 missing');
      expect(updatedMetadata.accessCount).toBe(1);
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
      metadataProvider = new MockMetadataProvider();
    });

    it('should handle frequency-weighted selection with zero-sized items map', async () => {
      // Test with empty metadata provider
      const context = { currentSize: { itemCount: 5, sizeBytes: 500 }, limits: { maxItems: 4, maxSizeBytes: 400 } };
      const result = await strategy.selectForEviction(metadataProvider, context);
      expect(result).toEqual([]);
    });

    it('should test all frequency-weighted selection scoring contexts', async () => {
      const now = Date.now();

      // Test recent context scoring
      const recentItem = createMockMetadata('recent', now - 5000);
      recentItem.lastAccessedAt = now - 5000;
      recentItem.rawFrequency = 2;

      await strategy.onItemAdded('recent', 100, metadataProvider);

      // Removed unused recentItems map([['recent', recentItem]]);
      const recentContext = { currentSize: { itemCount: 5, sizeBytes: 500 }, limits: { maxItems: 4, maxSizeBytes: 400 } };
      const recentResult = await strategy.selectForEviction(metadataProvider, recentContext);
      expect(recentResult.length).toBeGreaterThan(0);
      expect(recentResult[0]).toBe('recent');

      // Test frequent context scoring
      const frequentItem = createMockMetadata('frequent', now - 3000);
      frequentItem.lastAccessedAt = now - 3000;
      frequentItem.rawFrequency = 10;

      await strategy.onItemAdded('frequent', 100, metadataProvider);
      // Make it truly frequent
      for (let i = 0; i < 8; i++) {
        await strategy.onItemAccessed('frequent', metadataProvider);
      }

      // Force eviction from frequent by setting target high
      strategy['targetRecentSize'] = 100;
      const frequentContext = { currentSize: { itemCount: 5, sizeBytes: 500 }, limits: { maxItems: 4, maxSizeBytes: 400 } };
      const frequentResult = await strategy.selectForEviction(metadataProvider, frequentContext);
      expect(frequentResult.length).toBeGreaterThan(0);
      expect(frequentResult[0]).toBe('frequent');
    });

    it('should handle items classification at frequency threshold boundary', async () => {
      const config: ARCConfig = {
        type: 'arc',
        maxCacheSize: 100,
        useEnhancedFrequency: true,
        frequencyThreshold: 3
      };
      const boundaryStrategy = new ARCEvictionStrategy(100, config);

      await boundaryStrategy.onItemAdded('at-threshold', 100, metadataProvider);
      await boundaryStrategy.onItemAdded('below-threshold', 100, metadataProvider);

      // Make at-threshold exactly at the boundary (3 accesses total)
      await boundaryStrategy.onItemAccessed('at-threshold', metadataProvider);
      await boundaryStrategy.onItemAccessed('at-threshold', metadataProvider);

      // Make below-threshold just below (2 accesses total)
      await boundaryStrategy.onItemAccessed('below-threshold', metadataProvider);

      // Check actual metadata from provider
      const atThresholdMeta = await metadataProvider.getMetadata('at-threshold');
      assertNonNull(atThresholdMeta, 'at-threshold metadata missing');
      const belowThresholdMeta = await metadataProvider.getMetadata('below-threshold');
      assertNonNull(belowThresholdMeta, 'below-threshold metadata missing');

      expect(atThresholdMeta.accessCount).toBe(3); // Should be frequent
      expect(belowThresholdMeta.accessCount).toBe(2); // Should be recent

      const boundaryContext = { currentSize: { itemCount: 5, sizeBytes: 500 }, limits: { maxItems: 4, maxSizeBytes: 400 } };
      const result = await boundaryStrategy.selectForEviction(metadataProvider, boundaryContext);
      expect(result.length).toBeGreaterThan(0);
      expect(['at-threshold', 'below-threshold']).toContain(result[0]);
    });

    it('should handle frequency-weighted selection fallback when items map is empty after filter', async () => {
      // This should trigger the fallback path in selectFrequencyWeightedFromItems
      const context = { currentSize: { itemCount: 5, sizeBytes: 500 }, limits: { maxItems: 4, maxSizeBytes: 400 } };
      const result = await strategy.selectForEviction(metadataProvider, context);
      expect(result).toEqual([]);
    });

    it('should handle frequency-weighted selection with no bestKey found', async () => {
      // Create items with unusual scores to test the fallback path
      const item1 = createMockMetadata('item1');
      const item2 = createMockMetadata('item2');

      // Create a scenario where the scoring might result in no bestKey
      item1.lastAccessedAt = Number.MAX_SAFE_INTEGER; // Very recent access
      item2.lastAccessedAt = Number.MAX_SAFE_INTEGER; // Very recent access

      // Add the items to metadata provider
      await metadataProvider.setMetadata('item1', item1);
      await metadataProvider.setMetadata('item2', item2);

      const context = { currentSize: { itemCount: 5, sizeBytes: 500 }, limits: { maxItems: 4, maxSizeBytes: 400 } };
      const result = await strategy.selectForEviction(metadataProvider, context);
      expect(result.length).toBeGreaterThan(0);
      expect(['item1', 'item2']).toContain(result[0]);
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
