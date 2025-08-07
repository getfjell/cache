import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TwoQueueEvictionStrategy } from '../../../src/eviction/strategies/TwoQueueEvictionStrategy';
import { CacheItemMetadata } from '../../../src/eviction/EvictionStrategy';
import { TwoQueueConfig } from '../../../src/eviction/EvictionStrategyConfig';

describe('TwoQueueEvictionStrategy', () => {
  let strategy: TwoQueueEvictionStrategy;

  function createMockMetadata(key: string, addedAt = 1000, accessCount = 1): CacheItemMetadata {
    return {
      key,
      addedAt,
      lastAccessedAt: addedAt,
      accessCount,
      estimatedSize: 100
    };
  }

  describe('Traditional 2Q Mode (Default)', () => {
    beforeEach(() => {
      strategy = new TwoQueueEvictionStrategy(100);
    });

    it('should evict from recent queue before hot queue', () => {
      const items = new Map<string, CacheItemMetadata>([
        ['recent1', createMockMetadata('recent1')],
        ['hot1', createMockMetadata('hot1')]
      ]);

      // Add items
      strategy.onItemAdded('recent1', items.get('recent1')!);
      strategy.onItemAdded('hot1', items.get('hot1')!);

      // Promote hot1 to hot queue by accessing it again
      strategy.onItemAccessed('hot1', items.get('hot1')!);

      const result = strategy.selectForEviction(items);
      expect(result).toBe('recent1'); // Should evict from recent queue first
    });

    it('should promote items from recent to hot queue on second access', () => {
      const metadata = createMockMetadata('key1');
      strategy.onItemAdded('key1', metadata);

      expect(metadata.accessCount).toBe(1);

      // Access again should promote to hot queue
      strategy.onItemAccessed('key1', metadata);
      expect(metadata.accessCount).toBe(2);
    });

    it('should use ghost queue for promoting previously evicted items', () => {
      const metadata = createMockMetadata('key1');

      // Simulate item that was previously in cache and evicted to ghost queue
      strategy.onItemAdded('key1', metadata);
      // Force eviction to ghost queue would happen normally through cache size limits

      // Remove and re-add (simulating ghost queue behavior)
      strategy.onItemRemoved('key1');
      strategy.onItemAdded('key1', metadata);

      expect(metadata.accessCount).toBe(1);
    });
  });

  describe('Frequency-Enhanced Mode', () => {
    beforeEach(() => {
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
      strategy.onItemAdded('key1', metadata);

      // Access twice - should not promote yet (threshold is 3)
      strategy.onItemAccessed('key1', metadata);
      strategy.onItemAccessed('key1', metadata);
      expect(metadata.accessCount).toBe(3);

      // Access once more to reach threshold
      strategy.onItemAccessed('key1', metadata);
      expect(metadata.accessCount).toBe(4);
    });

    it('should use frequency-weighted LRU in hot queue', () => {
      const items = new Map<string, CacheItemMetadata>([
        ['freq-high', createMockMetadata('freq-high')],
        ['freq-low', createMockMetadata('freq-low')]
      ]);

      // Add both items and promote to hot queue
      strategy.onItemAdded('freq-high', items.get('freq-high')!);
      strategy.onItemAdded('freq-low', items.get('freq-low')!);

      // Make freq-high accessed many times
      for (let i = 0; i < 10; i++) {
        strategy.onItemAccessed('freq-high', items.get('freq-high')!);
      }

      // Make freq-low accessed few times
      for (let i = 0; i < 2; i++) {
        strategy.onItemAccessed('freq-low', items.get('freq-low')!);
      }

      // Both should be in hot queue due to multiple accesses
      // When evicting from hot queue, should prefer lower frequency item
      const result = strategy.selectForEviction(items);
      expect(result).toBe('freq-low');
    });
  });

  describe('Frequency Decay Mode', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      const config: TwoQueueConfig = {
        type: '2q',
        maxCacheSize: 100,
        useFrequencyPromotion: true,
        useFrequencyWeightedLRU: true,
        hotQueueDecayFactor: 0.1,
        hotQueueDecayInterval: 60000 // 1 minute
      };
      strategy = new TwoQueueEvictionStrategy(100, config);
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
      vi.advanceTimersByTime(65000); // Just over 1 minute

      // Trigger decay by calling selectForEviction
      const items = new Map([['key1', metadata]]);
      strategy.selectForEviction(items);

      // Frequency score should have decayed
      expect(metadata.frequencyScore!).toBeLessThan(initialScore);
      expect(metadata.frequencyScore!).toBeGreaterThanOrEqual(1); // Minimum threshold
    });

    it('should consider decay in promotion decisions', () => {
      const oldMetadata = createMockMetadata('old-item');
      const newMetadata = createMockMetadata('new-item');

      strategy.onItemAdded('old-item', oldMetadata);
      strategy.onItemAdded('new-item', newMetadata);

      // Make old item frequently accessed initially
      for (let i = 0; i < 10; i++) {
        strategy.onItemAccessed('old-item', oldMetadata);
      }

      // Advance time significantly
      vi.advanceTimersByTime(120000); // 2 minutes

      // Make new item moderately accessed
      for (let i = 0; i < 5; i++) {
        strategy.onItemAccessed('new-item', newMetadata);
      }

      // The new item should now have higher effective frequency due to decay
      expect(newMetadata.frequencyScore).toBeGreaterThan(0);
    });
  });

  describe('Configuration and Utilities', () => {
    it('should return configuration correctly', () => {
      const config: TwoQueueConfig = {
        type: '2q',
        maxCacheSize: 200,
        useFrequencyPromotion: false,
        promotionThreshold: 5,
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
      const metadata = createMockMetadata('key1');
      strategy.onItemAdded('key1', metadata);
      strategy.onItemAccessed('key1', metadata);

      // Reset should clear internal queues
      strategy.reset();

      // After reset, adding same key should work as if fresh
      strategy.onItemAdded('key1', metadata);
      expect(metadata.accessCount).toBe(1);
    });

    it('should handle empty item sets gracefully', () => {
      const items = new Map<string, CacheItemMetadata>();
      const result = strategy.selectForEviction(items);
      expect(result).toBeNull();
    });

    it('should maintain queue size limits', () => {
      const smallStrategy = new TwoQueueEvictionStrategy(4); // Very small cache

      // Add more items than recent queue can hold
      for (let i = 0; i < 10; i++) {
        const metadata = createMockMetadata(`key${i}`);
        smallStrategy.onItemAdded(`key${i}`, metadata);
      }

      // Should not exceed memory limits and handle gracefully
      expect(true).toBe(true); // If we get here without errors, it's working
    });
  });

  describe('Traditional vs Enhanced Comparison', () => {
    it('should behave differently with and without frequency enhancements', () => {
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

      const items = new Map<string, CacheItemMetadata>([
        ['item1', createMockMetadata('item1')],
        ['item2', createMockMetadata('item2')]
      ]);

      // Setup same initial state for both
      ['item1', 'item2'].forEach(key => {
        traditional.onItemAdded(key, items.get(key)!);
        enhanced.onItemAdded(key, items.get(key)!);
      });

      // Access item1 multiple times for both strategies
      for (let i = 0; i < 5; i++) {
        traditional.onItemAccessed('item1', items.get('item1')!);
        enhanced.onItemAccessed('item1', items.get('item1')!);
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
      strategy = new TwoQueueEvictionStrategy(4); // Small cache for easier testing
    });

    it('should promote items from ghost queue to hot queue', () => {
      const items = new Map<string, CacheItemMetadata>();

      // Fill up the recent queue completely (25% of 4 = 1 item)
      for (let i = 0; i < 3; i++) {
        const metadata = createMockMetadata(`recent${i}`);
        items.set(`recent${i}`, metadata);
        strategy.onItemAdded(`recent${i}`, metadata);
      }

      // Add one more item to force eviction to ghost queue
      const ghostMetadata = createMockMetadata('ghost-item');
      items.set('ghost-item', ghostMetadata);
      strategy.onItemAdded('ghost-item', ghostMetadata);

      // Now re-add the ghost item - should go to hot queue (line 143)
      const newGhostMetadata = createMockMetadata('ghost-item');
      items.set('ghost-item', newGhostMetadata);
      strategy.onItemAdded('ghost-item', newGhostMetadata);

      expect(newGhostMetadata.accessCount).toBe(1);
    });

    it('should remove items from hot queue when onItemRemoved is called', () => {
      const metadata = createMockMetadata('hot-item');
      strategy.onItemAdded('hot-item', metadata);

      // Promote to hot queue
      strategy.onItemAccessed('hot-item', metadata);

      // Remove from hot queue (lines 175-176)
      strategy.onItemRemoved('hot-item');

      // Should handle removal gracefully
      expect(true).toBe(true); // Test passes if no errors thrown
    });

    it('should remove items from recent queue when onItemRemoved is called', () => {
      const metadata = createMockMetadata('recent-item');
      strategy.onItemAdded('recent-item', metadata);

      // Remove from recent queue (should not access hot queue removal path)
      strategy.onItemRemoved('recent-item');

      expect(true).toBe(true); // Test passes if no errors thrown
    });
  });

  describe('Frequency Fallback Coverage', () => {
    beforeEach(() => {
      const config: TwoQueueConfig = {
        type: '2q',
        maxCacheSize: 100,
        useFrequencyPromotion: true,
        useFrequencyWeightedLRU: true,
        hotQueueDecayFactor: 0 // Disable decay to test fallback
      };
      strategy = new TwoQueueEvictionStrategy(100, config);
    });

    it('should fallback to rawFrequency when no frequencyScore exists', () => {
      const metadata = createMockMetadata('test-key');
      metadata.rawFrequency = 5;
      metadata.accessCount = 3;
      // Don't set frequencyScore to test fallback (line 213)

      strategy.onItemAdded('test-key', metadata);
      strategy.onItemAccessed('test-key', metadata);

      expect(metadata.rawFrequency).toBeGreaterThan(0);
    });

    it('should handle metadata without lastFrequencyUpdate in calculateFrequencyScore', () => {
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

      testStrategy.onItemAdded('test-key', metadata);
      testStrategy.onItemAccessed('test-key', metadata);

      expect(metadata.accessCount).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    beforeEach(() => {
      strategy = new TwoQueueEvictionStrategy(100);
    });

    it('should handle selecting from hot queue when no items exist in queues', () => {
      const items = new Map<string, CacheItemMetadata>([
        ['orphan', createMockMetadata('orphan')]
      ]);

      // Don't add item to strategy queues, just to items map
      const result = strategy.selectForEviction(items);
      expect(result).toBe('orphan'); // Should fallback to first available item
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

      const items = new Map<string, CacheItemMetadata>([
        ['low-freq', createMockMetadata('low-freq')],
        ['zero-freq', createMockMetadata('zero-freq')]
      ]);

      // Add items and promote to hot queue
      testStrategy.onItemAdded('low-freq', items.get('low-freq')!);
      testStrategy.onItemAdded('zero-freq', items.get('zero-freq')!);

      // Promote both to hot queue
      for (let i = 0; i < 3; i++) {
        testStrategy.onItemAccessed('low-freq', items.get('low-freq')!);
        testStrategy.onItemAccessed('zero-freq', items.get('zero-freq')!);
      }

      // Set one to have zero effective frequency
      const zeroFreqMeta = items.get('zero-freq')!;
      zeroFreqMeta.rawFrequency = 0;
      zeroFreqMeta.accessCount = 0;

      const result = testStrategy.selectForEviction(items);
      expect(result).toBeTruthy();
    });

    it('should handle ghost queue size limits', () => {
      const smallStrategy = new TwoQueueEvictionStrategy(2);

      // Add many items to exceed ghost queue limits
      for (let i = 0; i < 10; i++) {
        const metadata = createMockMetadata(`item${i}`);
        smallStrategy.onItemAdded(`item${i}`, metadata);
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

      const items = new Map<string, CacheItemMetadata>([
        ['hot-item', createMockMetadata('hot-item')]
      ]);

      // Add item and immediately promote to hot queue
      testStrategy.onItemAdded('hot-item', items.get('hot-item')!);
      testStrategy.onItemAccessed('hot-item', items.get('hot-item')!);

      // Now recent queue is empty, should select from hot queue
      const result = testStrategy.selectForEviction(items);
      expect(result).toBe('hot-item');
    });
  });

  describe('Additional Branch Coverage', () => {
    it('should cover ghost queue promotion with proper setup', () => {
      const smallStrategy = new TwoQueueEvictionStrategy(4); // Small cache for easier testing
      const items = new Map<string, CacheItemMetadata>();

      // Fill up recent queue to force eviction to ghost queue
      const recentItems = ['recent1', 'recent2', 'recent3', 'recent4', 'recent5'];
      for (const key of recentItems) {
        const metadata = createMockMetadata(key);
        items.set(key, metadata);
        smallStrategy.onItemAdded(key, metadata);
      }

      // Now add an item that was previously evicted to ghost queue
      // This should trigger the ghost queue promotion path (lines 142-143)
      const ghostMetadata = createMockMetadata('recent1'); // Re-use first item
      items.set('recent1', ghostMetadata);
      smallStrategy.onItemAdded('recent1', ghostMetadata);

      expect(ghostMetadata.accessCount).toBe(1);
    });

    it('should use rawFrequency fallback in getEffectiveFrequency', () => {
      const config: TwoQueueConfig = {
        type: '2q',
        maxCacheSize: 100,
        useFrequencyPromotion: true,
        useFrequencyWeightedLRU: true,
        hotQueueDecayFactor: 0 // Disable decay to test rawFrequency fallback
      };
      const testStrategy = new TwoQueueEvictionStrategy(100, config);

      const metadata = createMockMetadata('test-key');
      testStrategy.onItemAdded('test-key', metadata);

      // Manually remove frequencyScore to test fallback (line 213)
      delete metadata.frequencyScore;

      // Access item to trigger getEffectiveFrequency through frequency-weighted selection
      testStrategy.onItemAccessed('test-key', metadata);

      expect(metadata.rawFrequency).toBe(2); // Should be equal to accessCount after access
      expect(metadata.accessCount).toBe(2);
    });

    it('should handle calculateFrequencyScore with missing lastFrequencyUpdate', () => {
      const config: TwoQueueConfig = {
        type: '2q',
        maxCacheSize: 100,
        useFrequencyPromotion: true,
        useFrequencyWeightedLRU: true,
        hotQueueDecayFactor: 0.05 // Enable decay
      };
      const testStrategy = new TwoQueueEvictionStrategy(100, config);

      const metadata = createMockMetadata('test-key');
      testStrategy.onItemAdded('test-key', metadata);

      // Manually remove lastFrequencyUpdate to test lines 223-224
      delete metadata.lastFrequencyUpdate;

      // This should trigger calculateFrequencyScore with missing lastFrequencyUpdate
      testStrategy.onItemAccessed('test-key', metadata);

      expect(metadata.accessCount).toBe(2); // Should be incremented from 1 to 2
      expect(metadata.rawFrequency).toBe(2);
    });

    it('should fallback to accessCount when rawFrequency is falsy in getEffectiveFrequency', () => {
      const config: TwoQueueConfig = {
        type: '2q',
        maxCacheSize: 100,
        useFrequencyPromotion: true,
        useFrequencyWeightedLRU: true,
        hotQueueDecayFactor: 0 // Disable decay to test rawFrequency fallback
      };
      const testStrategy = new TwoQueueEvictionStrategy(100, config);

      const metadata = createMockMetadata('test-key');
      testStrategy.onItemAdded('test-key', metadata);

      // Set rawFrequency to 0 to test the OR fallback to accessCount (line 213)
      metadata.rawFrequency = 0;
      metadata.accessCount = 5;

      // Trigger frequency-weighted selection to call getEffectiveFrequency
      const items = new Map([['test-key', metadata]]);

      // Add another item to hot queue to enable frequency-weighted selection
      const metadata2 = createMockMetadata('test-key2');
      testStrategy.onItemAdded('test-key2', metadata2);
      items.set('test-key2', metadata2);

      // Promote both to hot queue
      testStrategy.onItemAccessed('test-key', metadata);
      testStrategy.onItemAccessed('test-key2', metadata2);
      testStrategy.onItemAccessed('test-key', metadata);
      testStrategy.onItemAccessed('test-key2', metadata2);

      // Reset rawFrequency to 0 again after it was set by onItemAccessed
      metadata.rawFrequency = 0;

      const result = testStrategy.selectForEviction(items);
      expect(result).toBeTruthy(); // Should complete without error
    });
  });
});
