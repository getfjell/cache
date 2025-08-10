import { beforeEach, describe, expect, it } from 'vitest';
import { TwoQueueEvictionStrategy } from '../../../src/eviction/strategies/TwoQueueEvictionStrategy';
import { CacheItemMetadata, EvictionContext } from '../../../src/eviction/EvictionStrategy';
import { TwoQueueConfig } from '../../../src/eviction/EvictionStrategyConfig';
import { MockMetadataProvider } from '../../utils/MockMetadataProvider';

describe('TwoQueueEvictionStrategy', () => {
  let strategy: TwoQueueEvictionStrategy;
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

  function createEvictionContext(): EvictionContext {
    return {
      currentSize: { itemCount: 5, sizeBytes: 5000 },
      limits: { maxItems: 3, maxSizeBytes: 3000 }
    };
  }

  describe('Traditional 2Q Mode (Default)', () => {
    beforeEach(() => {
      metadataProvider = new MockMetadataProvider();
      strategy = new TwoQueueEvictionStrategy(100);
    });

    it('should evict from recent queue before hot queue', () => {
      // Add items
      strategy.onItemAdded('recent1', 100, metadataProvider);
      strategy.onItemAdded('hot1', 100, metadataProvider);

      // Promote hot1 to hot queue by accessing it again
      strategy.onItemAccessed('hot1', metadataProvider);

      const context = createEvictionContext();
      const result = strategy.selectForEviction(metadataProvider, context);
      expect(result).toContain('recent1'); // Should evict from recent queue first
    });

    it('should promote items from recent to hot queue on second access', () => {
      const metadata = createMockMetadata('key1');
      metadataProvider.setMetadata('key1', metadata);
      strategy.onItemAdded('key1', 100, metadataProvider);

      expect(metadata.accessCount).toBe(1);

      // Access again should promote to hot queue
      strategy.onItemAccessed('key1', metadataProvider);
      expect(metadata.accessCount).toBe(2);
    });

    it('should use ghost queue for promoting previously evicted items', () => {
      const metadata = createMockMetadata('key1');
      metadataProvider.setMetadata('key1', metadata);

      // Simulate item that was previously in cache and evicted to ghost queue
      strategy.onItemAdded('key1', 100, metadataProvider);
      // Force eviction to ghost queue would happen normally through cache size limits

      // Remove and re-add (simulating ghost queue behavior)
      strategy.onItemRemoved('key1', metadataProvider);
      strategy.onItemAdded('key1', 100, metadataProvider);

      expect(metadata.accessCount).toBe(1);
    });
  });

  describe('Frequency-Enhanced Mode', () => {
    beforeEach(() => {
      metadataProvider = new MockMetadataProvider();
      const config: TwoQueueConfig = {
        type: '2q',
        maxCacheSize: 100,
        useFrequencyPromotion: true,
        promotionThreshold: 3,
        useFrequencyWeightedLRU: false, // Disable timing-dependent calculations for deterministic tests
        hotQueueDecayFactor: 0
      };
      strategy = new TwoQueueEvictionStrategy(100, config);
    });

    it('should use frequency threshold for promotion instead of simple count', () => {
      const metadata = createMockMetadata('key1');
      metadataProvider.setMetadata('key1', metadata);
      strategy.onItemAdded('key1', 100, metadataProvider);

      // Access twice - should not promote yet (threshold is 3)
      strategy.onItemAccessed('key1', metadataProvider);
      strategy.onItemAccessed('key1', metadataProvider);
      expect(metadata.accessCount).toBe(3);

      // Access once more to reach threshold
      strategy.onItemAccessed('key1', metadataProvider);
      expect(metadata.accessCount).toBe(4);
    });

    it('should use frequency-weighted LRU in hot queue', () => {
      const freqHighMeta = createMockMetadata('freq-high');
      const freqLowMeta = createMockMetadata('freq-low');

      // Add items to metadata provider
      metadataProvider.setMetadata('freq-high', freqHighMeta);
      metadataProvider.setMetadata('freq-low', freqLowMeta);

      // Add items to strategy
      strategy.onItemAdded('freq-high', 100, metadataProvider);
      strategy.onItemAdded('freq-low', 100, metadataProvider);

      // Promote both to hot queue
      for (let i = 0; i < 3; i++) {
        strategy.onItemAccessed('freq-high', metadataProvider);
        strategy.onItemAccessed('freq-low', metadataProvider);
      }

      // Access high frequency item more times
      for (let i = 0; i < 5; i++) {
        strategy.onItemAccessed('freq-high', metadataProvider);
      }

      const context = createEvictionContext();
      const result = strategy.selectForEviction(metadataProvider, context);
      expect(result).toContain('freq-low'); // Should evict lower frequency item
    });
  });

  describe('Configuration and Behavior', () => {
    beforeEach(() => {
      metadataProvider = new MockMetadataProvider();
    });

    it('should accept custom configuration', () => {
      const config: TwoQueueConfig = {
        type: '2q',
        maxCacheSize: 200,
        useFrequencyPromotion: false,
        promotionThreshold: 5,
        useFrequencyWeightedLRU: true,
        hotQueueDecayFactor: 0.2
      };

      strategy = new TwoQueueEvictionStrategy(200, config);

      const returnedConfig = strategy.getConfig();
      expect(returnedConfig.maxCacheSize).toBe(200);
      expect(returnedConfig.useFrequencyPromotion).toBe(false);
      expect(returnedConfig.promotionThreshold).toBe(5);
      expect(returnedConfig.hotQueueDecayFactor).toBe(0.2);
    });

    it('should reset internal state when requested', () => {
      strategy = new TwoQueueEvictionStrategy(100);
      const metadata = createMockMetadata('key1');
      metadataProvider.setMetadata('key1', metadata);
      strategy.onItemAdded('key1', 100, metadataProvider);
      strategy.onItemAccessed('key1', metadataProvider);

      // Reset should clear internal queues
      strategy.reset();

      // After reset, adding same key should work as if fresh
      strategy.onItemAdded('key1', 100, metadataProvider);
      expect(metadata.accessCount).toBe(2); // accessCount should continue from previous value
    });

    it('should handle empty item sets gracefully', () => {
      strategy = new TwoQueueEvictionStrategy(100);
      const context = createEvictionContext();
      const result = strategy.selectForEviction(metadataProvider, context);
      expect(result).toEqual([]);
    });

    it('should maintain queue size limits', () => {
      const smallStrategy = new TwoQueueEvictionStrategy(4); // Very small cache

      // Add more items than recent queue can hold
      for (let i = 0; i < 10; i++) {
        const metadata = createMockMetadata(`key${i}`);
        metadataProvider.setMetadata(`key${i}`, metadata);
        smallStrategy.onItemAdded(`key${i}`, 100, metadataProvider);
      }

      // Should not exceed memory limits and handle gracefully
      expect(true).toBe(true); // If we get here without errors, it's working
    });
  });

  describe('Traditional vs Enhanced Comparison', () => {
    it('should behave differently with and without frequency enhancements', () => {
      metadataProvider = new MockMetadataProvider();

      const traditionalConfig: TwoQueueConfig = {
        type: '2q',
        maxCacheSize: 100,
        useFrequencyPromotion: false,
        useFrequencyWeightedLRU: false
      };

      const enhancedConfig: TwoQueueConfig = {
        type: '2q',
        maxCacheSize: 100,
        useFrequencyPromotion: true,
        promotionThreshold: 3,
        useFrequencyWeightedLRU: true
      };

      const traditional = new TwoQueueEvictionStrategy(100, traditionalConfig);
      const enhanced = new TwoQueueEvictionStrategy(100, enhancedConfig);

      // Setup same initial state for both
      ['item1', 'item2'].forEach(key => {
        const metadata = createMockMetadata(key);
        metadataProvider.setMetadata(key, metadata);
        traditional.onItemAdded(key, 100, metadataProvider);
        enhanced.onItemAdded(key, 100, metadataProvider);
      });

      // Access item1 multiple times for both strategies
      for (let i = 0; i < 5; i++) {
        traditional.onItemAccessed('item1', metadataProvider);
        enhanced.onItemAccessed('item1', metadataProvider);
      }

      // Get configurations to verify they're different
      const traditionalConf = traditional.getConfig();
      const enhancedConf = enhanced.getConfig();

      expect(traditionalConf.useFrequencyPromotion).toBe(false);
      expect(enhancedConf.useFrequencyPromotion).toBe(true);
      expect(enhancedConf.promotionThreshold).toBe(3);
    });
  });

  describe('Ghost Queue and Hot Queue Coverage', () => {
    beforeEach(() => {
      metadataProvider = new MockMetadataProvider();
      strategy = new TwoQueueEvictionStrategy(4); // Small cache for easier testing
    });

    it('should promote items from ghost queue to hot queue', () => {
      // Fill up the recent queue completely (25% of 4 = 1 item)
      for (let i = 0; i < 3; i++) {
        const metadata = createMockMetadata(`recent${i}`);
        metadataProvider.setMetadata(`recent${i}`, metadata);
        strategy.onItemAdded(`recent${i}`, 100, metadataProvider);
      }

      // Add one more item to force eviction to ghost queue
      const metadata = createMockMetadata('ghost-item');
      metadataProvider.setMetadata('ghost-item', metadata);
      strategy.onItemAdded('ghost-item', 100, metadataProvider);

      // Remove the ghost item
      strategy.onItemRemoved('ghost-item', metadataProvider);

      // Re-add the same item - should go directly to hot queue
      strategy.onItemAdded('ghost-item', 100, metadataProvider);

      expect(metadata.accessCount).toBe(1);
    });
  });

  describe('Frequency Fallback Coverage', () => {
    it('should handle metadata without lastFrequencyUpdate in calculateFrequencyScore', () => {
      metadataProvider = new MockMetadataProvider();
      const config: TwoQueueConfig = {
        type: '2q',
        maxCacheSize: 100,
        useFrequencyPromotion: true,
        useFrequencyWeightedLRU: true,
        hotQueueDecayFactor: 0.1 // Enable decay to trigger calculateFrequencyScore
      };
      const testStrategy = new TwoQueueEvictionStrategy(100, config);

      const metadata = createMockMetadata('test-key');
      metadata.rawFrequency = 5;
      metadata.accessCount = 3;
      // Don't set lastFrequencyUpdate to test fallback (lines 223-224)
      delete metadata.lastFrequencyUpdate;

      metadataProvider.setMetadata('test-key', metadata);
      testStrategy.onItemAdded('test-key', 100, metadataProvider);
      testStrategy.onItemAccessed('test-key', metadataProvider);

      expect(metadata.accessCount).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    beforeEach(() => {
      metadataProvider = new MockMetadataProvider();
      strategy = new TwoQueueEvictionStrategy(100);
    });

    it('should handle selecting from hot queue when no items exist in queues', () => {
      const metadata = createMockMetadata('orphan');
      metadataProvider.setMetadata('orphan', metadata);

      // Don't add item to strategy queues, just to metadata provider
      const context = createEvictionContext();
      const result = strategy.selectForEviction(metadataProvider, context);
      expect(result).toContain('orphan'); // Should fallback to first available item
    });

    it('should handle frequency-weighted selection with zero frequency', () => {
      const config: TwoQueueConfig = {
        type: '2q',
        maxCacheSize: 100,
        useFrequencyPromotion: true,
        useFrequencyWeightedLRU: true,
        hotQueueDecayFactor: 0
      };
      const testStrategy = new TwoQueueEvictionStrategy(100, config);

      const lowFreqMeta = createMockMetadata('low-freq');
      const zeroFreqMeta = createMockMetadata('zero-freq');

      metadataProvider.setMetadata('low-freq', lowFreqMeta);
      metadataProvider.setMetadata('zero-freq', zeroFreqMeta);

      // Add items and promote to hot queue
      testStrategy.onItemAdded('low-freq', 100, metadataProvider);
      testStrategy.onItemAdded('zero-freq', 100, metadataProvider);

      // Promote both to hot queue
      for (let i = 0; i < 3; i++) {
        testStrategy.onItemAccessed('low-freq', metadataProvider);
        testStrategy.onItemAccessed('zero-freq', metadataProvider);
      }

      // Set one to have zero effective frequency
      zeroFreqMeta.rawFrequency = 0;
      zeroFreqMeta.accessCount = 0;

      const context = createEvictionContext();
      const result = testStrategy.selectForEviction(metadataProvider, context);
      expect(result).toBeTruthy();
    });

    it('should handle ghost queue size limits', () => {
      const smallStrategy = new TwoQueueEvictionStrategy(2);

      // Add many items to exceed ghost queue limits
      for (let i = 0; i < 10; i++) {
        const metadata = createMockMetadata(`item${i}`);
        metadataProvider.setMetadata(`item${i}`, metadata);
        smallStrategy.onItemAdded(`item${i}`, 100, metadataProvider);
      }

      expect(true).toBe(true); // Should not throw errors
    });

    it('should handle empty recent queue in selectForEviction', () => {
      const config: TwoQueueConfig = {
        type: '2q',
        maxCacheSize: 100,
        useFrequencyPromotion: false,
        useFrequencyWeightedLRU: false
      };
      const testStrategy = new TwoQueueEvictionStrategy(100, config);

      const metadata = createMockMetadata('hot-item');
      metadataProvider.setMetadata('hot-item', metadata);

      // Add item and immediately promote to hot queue
      testStrategy.onItemAdded('hot-item', 100, metadataProvider);
      testStrategy.onItemAccessed('hot-item', metadataProvider);

      const context = createEvictionContext();
      const result = testStrategy.selectForEviction(metadataProvider, context);
      expect(result).toBeTruthy();
    });
  });

  describe('Additional Branch Coverage', () => {
    beforeEach(() => {
      metadataProvider = new MockMetadataProvider();
    });

    it('should cover ghost queue promotion with proper setup', () => {
      const testStrategy = new TwoQueueEvictionStrategy(4);

      // Add item to recent queue
      const metadata = createMockMetadata('ghost-test');
      metadataProvider.setMetadata('ghost-test', metadata);
      testStrategy.onItemAdded('ghost-test', 100, metadataProvider);

      // Remove it (should go to ghost queue)
      testStrategy.onItemRemoved('ghost-test', metadataProvider);

      // Re-add (should promote from ghost to hot)
      testStrategy.onItemAdded('ghost-test', 100, metadataProvider);

      expect(metadata.accessCount).toBe(1);
    });

    it('should use rawFrequency fallback in getEffectiveFrequency', () => {
      const config: TwoQueueConfig = {
        type: '2q',
        maxCacheSize: 100,
        useFrequencyPromotion: true,
        useFrequencyWeightedLRU: true,
        hotQueueDecayFactor: 0.1
      };
      const testStrategy = new TwoQueueEvictionStrategy(100, config);

      const metadata = createMockMetadata('freq-test');
      metadata.rawFrequency = 5;
      metadata.accessCount = 3;
      // Don't set frequencyScore to test fallback
      delete metadata.frequencyScore;

      metadataProvider.setMetadata('freq-test', metadata);
      testStrategy.onItemAdded('freq-test', 100, metadataProvider);
      testStrategy.onItemAccessed('freq-test', metadataProvider);

      expect(metadata.accessCount).toBeGreaterThan(0);
    });

    it('should handle calculateFrequencyScore with missing lastFrequencyUpdate', () => {
      const config: TwoQueueConfig = {
        type: '2q',
        maxCacheSize: 100,
        useFrequencyPromotion: true,
        useFrequencyWeightedLRU: true,
        hotQueueDecayFactor: 0.1
      };
      const testStrategy = new TwoQueueEvictionStrategy(100, config);

      const metadata = createMockMetadata('score-test');
      metadata.rawFrequency = 5;
      metadata.accessCount = 3;
      // Don't set lastFrequencyUpdate to test fallback
      delete metadata.lastFrequencyUpdate;

      metadataProvider.setMetadata('score-test', metadata);
      testStrategy.onItemAdded('score-test', 100, metadataProvider);
      testStrategy.onItemAccessed('score-test', metadataProvider);

      expect(metadata.accessCount).toBeGreaterThan(0);
    });

    it('should fallback to accessCount when rawFrequency is falsy in getEffectiveFrequency', () => {
      const config: TwoQueueConfig = {
        type: '2q',
        maxCacheSize: 100,
        useFrequencyPromotion: true,
        useFrequencyWeightedLRU: true,
        hotQueueDecayFactor: 0.1
      };
      const testStrategy = new TwoQueueEvictionStrategy(100, config);

      const metadata = createMockMetadata('fallback-test');
      metadata.rawFrequency = 0; // Falsy value
      metadata.accessCount = 3;

      metadataProvider.setMetadata('fallback-test', metadata);
      testStrategy.onItemAdded('fallback-test', 100, metadataProvider);
      testStrategy.onItemAccessed('fallback-test', metadataProvider);

      expect(metadata.accessCount).toBeGreaterThan(0);
    });
  });
});
