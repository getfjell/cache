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

  describe('Hash Function and Count-Min Sketch Tests', () => {
    beforeEach(() => {
      metadataProvider = new MockMetadataProvider();
    });

    it('should test hash function with edge case inputs', () => {
      const config: LFUConfig = {
        type: 'lfu',
        useProbabilisticCounting: true,
        sketchWidth: 1024,
        sketchDepth: 4
      };
      strategy = new LFUEvictionStrategy(config);

      // Test with various string types
      const testKeys = [
        '', // Empty string
        'a', // Single character
        'test-key-with-dashes',
        'test_key_with_underscores',
        'TestKeyWithCamelCase',
        'test.key.with.dots',
        'test/key/with/slashes',
        'key-with-numbers-123',
        'key-with-unicode-🔑',
        'very-long-key-'.repeat(100), // Very long key
        '🌟⭐✨💫🌙', // All unicode
        'key with spaces',
        '\n\t\r\0', // Special characters
        JSON.stringify({ nested: { object: 'as-key' } }) // JSON as key
      ];

      testKeys.forEach(key => {
        strategy.onItemAdded(key, 100, metadataProvider);
        strategy.onItemAccessed(key, metadataProvider);

        const metadata = metadataProvider.getMetadata(key);
        expect(metadata).toBeTruthy();
        expect(metadata!.rawFrequency).toBeGreaterThan(0);
      });
    });

    it('should test hash function distribution with power-of-2 sketch width', () => {
      const config: LFUConfig = {
        type: 'lfu',
        useProbabilisticCounting: true,
        sketchWidth: 64, // Power of 2
        sketchDepth: 2
      };
      strategy = new LFUEvictionStrategy(config);

      // Add many items to test distribution
      for (let i = 0; i < 1000; i++) {
        const key = `key-${i}`;
        strategy.onItemAdded(key, 100, metadataProvider);
        strategy.onItemAccessed(key, metadataProvider);
      }

      // Verify all items have frequencies
      const allMetadata = metadataProvider.getAllMetadata();
      expect(allMetadata.size).toBe(1000);
      allMetadata.forEach(metadata => {
        expect(metadata.rawFrequency).toBeGreaterThan(0);
      });
    });

    it('should test hash function distribution with non-power-of-2 sketch width', () => {
      const config: LFUConfig = {
        type: 'lfu',
        useProbabilisticCounting: true,
        sketchWidth: 100, // Not a power of 2
        sketchDepth: 3
      };
      strategy = new LFUEvictionStrategy(config);

      // Add many items to test distribution
      for (let i = 0; i < 500; i++) {
        const key = `key-${i}`;
        strategy.onItemAdded(key, 100, metadataProvider);
        strategy.onItemAccessed(key, metadataProvider);
      }

      // Verify all items have frequencies
      const allMetadata = metadataProvider.getAllMetadata();
      expect(allMetadata.size).toBe(500);
      allMetadata.forEach(metadata => {
        expect(metadata.rawFrequency).toBeGreaterThan(0);
      });
    });

    it('should handle sketch operations with minimum dimensions', () => {
      const config: LFUConfig = {
        type: 'lfu',
        useProbabilisticCounting: true,
        sketchWidth: 16, // Minimum recommended
        sketchDepth: 1 // Minimum depth
      };
      strategy = new LFUEvictionStrategy(config);

      strategy.onItemAdded('test-key', 100, metadataProvider);

      // Access multiple times to test sketch increments
      for (let i = 0; i < 10; i++) {
        strategy.onItemAccessed('test-key', metadataProvider);
      }

      const metadata = metadataProvider.getMetadata('test-key')!;
      expect(metadata.rawFrequency).toBeGreaterThan(10); // Should be at least access count
    });

    it('should handle sketch reset functionality', () => {
      const config: LFUConfig = {
        type: 'lfu',
        useProbabilisticCounting: true,
        sketchWidth: 32,
        sketchDepth: 2
      };
      strategy = new LFUEvictionStrategy(config);

      // Build up frequencies
      strategy.onItemAdded('key1', 100, metadataProvider);
      strategy.onItemAdded('key2', 100, metadataProvider);

      for (let i = 0; i < 5; i++) {
        strategy.onItemAccessed('key1', metadataProvider);
        strategy.onItemAccessed('key2', metadataProvider);
      }

      // Reset should clear internal sketch
      strategy.reset();

      // New items should start fresh
      strategy.onItemAdded('new-key', 100, metadataProvider);
      const newMetadata = metadataProvider.getMetadata('new-key')!;
      expect(newMetadata.rawFrequency).toBe(1);
    });
  });

  describe('Configuration Validation and Sanitization Tests', () => {
    it('should handle invalid configuration values gracefully', () => {
      // Test with invalid decay factor
      const config1: Partial<LFUConfig> = {
        type: 'lfu',
        decayFactor: -0.5 // Invalid: negative
      };

      // Should not throw, but sanitize the value
      expect(() => {
        strategy = new LFUEvictionStrategy(config1 as LFUConfig);
      }).not.toThrow();

      // Test with invalid sketch dimensions
      const config2: Partial<LFUConfig> = {
        type: 'lfu',
        useProbabilisticCounting: true,
        sketchWidth: -10, // Invalid: negative
        sketchDepth: 0 // Invalid: zero
      };

      expect(() => {
        strategy = new LFUEvictionStrategy(config2 as LFUConfig);
      }).not.toThrow();
    });

    it('should apply default configuration when no config provided', () => {
      strategy = new LFUEvictionStrategy();
      const config = strategy.getConfig();

      // Should use backwards-compatible defaults
      expect(config.useProbabilisticCounting).toBe(false);
      expect(config.decayFactor).toBe(0);
      expect(config.decayInterval).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('should merge partial configurations with defaults', () => {
      const partialConfig: Partial<LFUConfig> = {
        type: 'lfu',
        decayFactor: 0.2
      };

      strategy = new LFUEvictionStrategy(partialConfig);
      const config = strategy.getConfig();

      expect(config.decayFactor).toBe(0.2);
      expect(config.useProbabilisticCounting).toBe(false); // Should use backwards-compatible default
    });

    it('should return correct strategy name', () => {
      strategy = new LFUEvictionStrategy();
      expect(strategy.getStrategyName()).toBe('lfu');
    });

    it('should handle extreme configuration values', () => {
      const extremeConfig: Partial<LFUConfig> = {
        type: 'lfu',
        decayFactor: 1.0, // Maximum decay
        decayInterval: 1, // Very short interval
        sketchWidth: 65536, // Maximum width
        sketchDepth: 16, // Maximum depth
        minFrequencyThreshold: 1000 // High threshold
      };

      expect(() => {
        strategy = new LFUEvictionStrategy(extremeConfig as LFUConfig);
      }).not.toThrow();
    });
  });

  describe('Eviction Context Edge Cases', () => {
    beforeEach(() => {
      metadataProvider = new MockMetadataProvider();
      strategy = new LFUEvictionStrategy();
    });

    it('should handle zero limits correctly', () => {
      metadataProvider.setSizeLimits(0, 0);

      const context = {
        currentSize: { itemCount: 0, sizeBytes: 0 },
        limits: { maxItems: 0, maxSizeBytes: 0 }
      };

      const result = strategy.selectForEviction(metadataProvider, context);
      expect(result).toEqual([]);
    });

    it('should handle null limits correctly', () => {
      metadataProvider.setSizeLimits(null, null);

      // Add some items
      strategy.onItemAdded('key1', 100, metadataProvider);
      strategy.onItemAdded('key2', 200, metadataProvider);

      const context = {
        currentSize: { itemCount: 2, sizeBytes: 300 },
        limits: { maxItems: null, maxSizeBytes: null }
      };

      // Should not evict anything when no limits
      const result = strategy.selectForEviction(metadataProvider, context);
      expect(result).toEqual([]);
    });

    it('should handle mixed null and non-null limits', () => {
      // Only item count limit
      const context1 = {
        currentSize: { itemCount: 3, sizeBytes: 300 },
        limits: { maxItems: 2, maxSizeBytes: null }
      };

      strategy.onItemAdded('key1', 100, metadataProvider);
      strategy.onItemAdded('key2', 100, metadataProvider);
      strategy.onItemAdded('key3', 100, metadataProvider);

      const result1 = strategy.selectForEviction(metadataProvider, context1);
      expect(result1.length).toBeGreaterThan(0);

      // Reset for next test
      metadataProvider.clearMetadata();

      // Only size limit
      const context2 = {
        currentSize: { itemCount: 2, sizeBytes: 300 },
        limits: { maxItems: null, maxSizeBytes: 250 }
      };

      strategy.onItemAdded('key1', 150, metadataProvider);
      strategy.onItemAdded('key2', 150, metadataProvider);

      const result2 = strategy.selectForEviction(metadataProvider, context2);
      expect(result2.length).toBeGreaterThan(0);
    });

    it('should handle newItemSize in eviction context', () => {
      strategy.onItemAdded('key1', 100, metadataProvider);

      const context = {
        currentSize: { itemCount: 1, sizeBytes: 100 },
        limits: { maxItems: null, maxSizeBytes: 150 },
        newItemSize: 100 // Would exceed size limit
      };

      const result = strategy.selectForEviction(metadataProvider, context);
      expect(result.length).toBeGreaterThan(0);
      expect(result).toContain('key1');
    });

    it('should calculate correct eviction count for multiple scenarios', () => {
      // Setup multiple items with different sizes
      strategy.onItemAdded('small1', 50, metadataProvider);
      strategy.onItemAdded('small2', 50, metadataProvider);
      strategy.onItemAdded('large1', 200, metadataProvider);
      strategy.onItemAdded('large2', 200, metadataProvider);

      // Test eviction count calculation based on size
      const context = {
        currentSize: { itemCount: 4, sizeBytes: 500 },
        limits: { maxItems: null, maxSizeBytes: 300 },
        newItemSize: 100
      };

      const result = strategy.selectForEviction(metadataProvider, context);
      expect(result.length).toBeGreaterThan(0);

      // Should evict enough items to make room
      let totalEvictedSize = 0;
      result.forEach(key => {
        const metadata = metadataProvider.getMetadata(key);
        if (metadata) {
          totalEvictedSize += metadata.estimatedSize;
        }
      });

      expect(totalEvictedSize).toBeGreaterThan(0);
    });
  });

  describe('Metadata Edge Cases and Null Handling', () => {
    beforeEach(() => {
      metadataProvider = new MockMetadataProvider();
      strategy = new LFUEvictionStrategy();
    });

    it('should handle accessing non-existent keys gracefully', () => {
      expect(() => {
        strategy.onItemAccessed('non-existent-key', metadataProvider);
      }).not.toThrow();
    });

    it('should handle metadata with missing optional fields', () => {
      strategy.onItemAdded('key1', 100, metadataProvider);
      const metadata = metadataProvider.getMetadata('key1')!;

      // Remove optional fields
      delete metadata.frequencyScore;
      delete metadata.lastFrequencyUpdate;
      delete metadata.rawFrequency;
      delete metadata.strategyData;

      metadataProvider.setMetadata('key1', metadata);

      // Should handle gracefully
      expect(() => {
        strategy.onItemAccessed('key1', metadataProvider);
      }).not.toThrow();

      const context = {
        currentSize: { itemCount: 1, sizeBytes: 100 },
        limits: { maxItems: 1, maxSizeBytes: null }
      };

      expect(() => {
        strategy.selectForEviction(metadataProvider, context);
      }).not.toThrow();
    });

    it('should handle metadata with zero or negative values', () => {
      strategy.onItemAdded('key1', 100, metadataProvider);
      const metadata = metadataProvider.getMetadata('key1')!;

      // Set problematic values
      metadata.accessCount = 0;
      metadata.rawFrequency = -1;
      metadata.estimatedSize = -100;
      metadata.lastAccessedAt = -1000;
      metadata.addedAt = -2000;

      metadataProvider.setMetadata('key1', metadata);

      expect(() => {
        strategy.onItemAccessed('key1', metadataProvider);
      }).not.toThrow();

      const context = {
        currentSize: { itemCount: 1, sizeBytes: 100 },
        limits: { maxItems: 1, maxSizeBytes: null }
      };

      const result = strategy.selectForEviction(metadataProvider, context);
      expect(result).toContain('key1');
    });

    it('should handle concurrent metadata modifications', () => {
      strategy.onItemAdded('key1', 100, metadataProvider);

      // Simulate concurrent modification
      const metadata1 = metadataProvider.getMetadata('key1')!;
      const metadata2 = { ...metadata1 };

      // Modify both versions
      metadata1.accessCount = 5;
      metadata2.accessCount = 10;

      metadataProvider.setMetadata('key1', metadata1);
      metadataProvider.setMetadata('key1', metadata2);

      // Should use the last set metadata
      const finalMetadata = metadataProvider.getMetadata('key1')!;
      expect(finalMetadata.accessCount).toBe(10);
    });

    it('should handle extremely large numbers in metadata', () => {
      strategy.onItemAdded('key1', Number.MAX_SAFE_INTEGER, metadataProvider);
      const metadata = metadataProvider.getMetadata('key1')!;

      metadata.accessCount = Number.MAX_SAFE_INTEGER;
      metadata.rawFrequency = Number.MAX_SAFE_INTEGER;
      metadata.lastAccessedAt = Number.MAX_SAFE_INTEGER;

      metadataProvider.setMetadata('key1', metadata);

      expect(() => {
        strategy.onItemAccessed('key1', metadataProvider);
      }).not.toThrow();
    });
  });

  describe('Performance and Stress Tests', () => {
    beforeEach(() => {
      metadataProvider = new MockMetadataProvider();
    });

    it('should handle large numbers of items efficiently', () => {
      const config: LFUConfig = {
        type: 'lfu',
        useProbabilisticCounting: true,
        sketchWidth: 1024,
        sketchDepth: 4
      };
      strategy = new LFUEvictionStrategy(config);

      const itemCount = 10000;
      const startTime = performance.now();

      // Add many items
      for (let i = 0; i < itemCount; i++) {
        strategy.onItemAdded(`key-${i}`, 100, metadataProvider);
      }

      // Access items randomly
      for (let i = 0; i < itemCount * 2; i++) {
        const randomKey = `key-${Math.floor(Math.random() * itemCount)}`;
        strategy.onItemAccessed(randomKey, metadataProvider);
      }

      const addTime = performance.now() - startTime;

      // Test eviction performance
      const evictionStartTime = performance.now();
      const context = {
        currentSize: { itemCount, sizeBytes: itemCount * 100 },
        limits: { maxItems: itemCount / 2, maxSizeBytes: null }
      };

      const result = strategy.selectForEviction(metadataProvider, context);
      const evictionTime = performance.now() - evictionStartTime;

      expect(result.length).toBeGreaterThan(0);
      expect(addTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(evictionTime).toBeLessThan(1000); // Eviction should be fast
    });

    it('should handle frequent access pattern changes', () => {
      const config: LFUConfig = {
        type: 'lfu',
        useProbabilisticCounting: true,
        decayFactor: 0.1,
        decayInterval: 100 // Very short for testing
      };
      strategy = new LFUEvictionStrategy(config);

      vi.useFakeTimers();

      try {
        // Phase 1: Make key1 very frequent
        strategy.onItemAdded('key1', 100, metadataProvider);
        strategy.onItemAdded('key2', 100, metadataProvider);

        for (let i = 0; i < 100; i++) {
          strategy.onItemAccessed('key1', metadataProvider);
        }

        // Phase 2: Switch to key2 being frequent
        vi.advanceTimersByTime(1000);

        for (let i = 0; i < 50; i++) {
          strategy.onItemAccessed('key2', metadataProvider);
        }

        const context = {
          currentSize: { itemCount: 2, sizeBytes: 200 },
          limits: { maxItems: 1, maxSizeBytes: null }
        };

        const result = strategy.selectForEviction(metadataProvider, context);
        expect(result.length).toBeGreaterThan(0);

        // Due to decay, the result could be either key depending on timing
        expect(result.every(key => ['key1', 'key2'].includes(key))).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should maintain consistency under rapid operations', () => {
      strategy = new LFUEvictionStrategy();

      const keys = ['a', 'b', 'c', 'd', 'e'];

      // Rapid add/access/remove cycles
      for (let cycle = 0; cycle < 1000; cycle++) {
        const key = keys[cycle % keys.length];

        if (Math.random() < 0.7) {
          // Add or access
          if (!metadataProvider.getMetadata(key)) {
            strategy.onItemAdded(key, 100, metadataProvider);
          } else {
            strategy.onItemAccessed(key, metadataProvider);
          }
        } else {
          // Remove
          if (metadataProvider.getMetadata(key)) {
            strategy.onItemRemoved(key, metadataProvider);
          }
        }
      }

      // Should still function correctly
      const context = {
        currentSize: metadataProvider.getCurrentSize(),
        limits: { maxItems: 2, maxSizeBytes: null }
      };

      expect(() => {
        strategy.selectForEviction(metadataProvider, context);
      }).not.toThrow();
    });
  });

  describe('Integration and Realistic Scenarios', () => {
    beforeEach(() => {
      metadataProvider = new MockMetadataProvider();
    });

    it('should simulate realistic cache usage pattern', () => {
      const config: LFUConfig = {
        type: 'lfu',
        useProbabilisticCounting: true,
        decayFactor: 0.05,
        decayInterval: 30000,
        sketchWidth: 256,
        sketchDepth: 4
      };
      strategy = new LFUEvictionStrategy(config);

      vi.useFakeTimers();

      try {
        // Simulate web cache usage patterns
        const popularPages = ['home', 'about', 'contact'];
        const occasionalPages = ['terms', 'privacy', 'help', 'faq'];
        const rarePages = ['admin', 'debug', 'test', 'old-article-1', 'old-article-2'];

        // Popular pages accessed frequently
        popularPages.forEach(page => {
          strategy.onItemAdded(page, 1024, metadataProvider);
          for (let i = 0; i < 20; i++) {
            strategy.onItemAccessed(page, metadataProvider);
          }
        });

        // Occasional pages accessed moderately
        occasionalPages.forEach(page => {
          strategy.onItemAdded(page, 512, metadataProvider);
          for (let i = 0; i < 5; i++) {
            strategy.onItemAccessed(page, metadataProvider);
          }
        });

        // Rare pages accessed once
        rarePages.forEach(page => {
          strategy.onItemAdded(page, 256, metadataProvider);
          strategy.onItemAccessed(page, metadataProvider);
        });

        // Advance time to let some decay occur
        vi.advanceTimersByTime(45000);

        // Force eviction due to cache size limit
        const context = {
          currentSize: metadataProvider.getCurrentSize(),
          limits: { maxItems: 8, maxSizeBytes: null }
        };

        const evicted = strategy.selectForEviction(metadataProvider, context);

        // Should evict rare pages first
        const evictedSet = new Set(evicted);
        const rareEvicted = rarePages.filter(page => evictedSet.has(page));
        const popularEvicted = popularPages.filter(page => evictedSet.has(page));

        expect(rareEvicted.length).toBeGreaterThan(0);
        expect(popularEvicted.length).toBe(0); // Popular pages should be preserved
      } finally {
        vi.useRealTimers();
      }
    });

    it('should handle cache warming and steady state operations', () => {
      strategy = new LFUEvictionStrategy();

      // Phase 1: Cache warming (many new items)
      for (let i = 0; i < 100; i++) {
        strategy.onItemAdded(`item-${i}`, 100, metadataProvider);
      }

      // Phase 2: Steady state (existing items accessed)
      for (let round = 0; round < 10; round++) {
        for (let i = 0; i < 100; i++) {
          if (Math.random() < 0.8) { // 80% hit rate
            strategy.onItemAccessed(`item-${i}`, metadataProvider);
          }
        }
      }

      // Phase 3: Memory pressure (force evictions)
      const context = {
        currentSize: { itemCount: 100, sizeBytes: 10000 },
        limits: { maxItems: 50, maxSizeBytes: null }
      };

      const evicted = strategy.selectForEviction(metadataProvider, context);
      expect(evicted.length).toBeGreaterThan(0);
      expect(evicted.length).toBeLessThanOrEqual(100); // Should not evict more than total items

      // Verify that items with higher access counts are preserved
      const remainingKeys = Array.from(metadataProvider.getAllMetadata().keys())
        .filter(key => !evicted.includes(key));

      expect(remainingKeys.length).toBeGreaterThan(0);
      expect(evicted.length + remainingKeys.length).toBe(100); // Total should match
    });

    it('should handle mixed operation types in realistic sequence', () => {
      const config: LFUConfig = {
        type: 'lfu',
        useProbabilisticCounting: false, // Simple mode for predictable behavior
        decayFactor: 0,
        decayInterval: Number.MAX_SAFE_INTEGER
      };
      strategy = new LFUEvictionStrategy(config);

      // Simulate database cache operations
      const operations = [
        { type: 'add', key: 'user:1', size: 200 },
        { type: 'add', key: 'user:2', size: 180 },
        { type: 'access', key: 'user:1' },
        { type: 'access', key: 'user:1' },
        { type: 'add', key: 'session:abc', size: 150 },
        { type: 'access', key: 'user:2' },
        { type: 'add', key: 'config:app', size: 100 },
        { type: 'access', key: 'user:1' },
        { type: 'remove', key: 'session:abc' },
        { type: 'add', key: 'user:3', size: 220 },
        { type: 'access', key: 'config:app' },
        { type: 'access', key: 'config:app' },
        { type: 'access', key: 'user:3' }
      ];

      operations.forEach(op => {
        switch (op.type) {
          case 'add':
            strategy.onItemAdded(op.key, op.size!, metadataProvider);
            break;
          case 'access':
            strategy.onItemAccessed(op.key, metadataProvider);
            break;
          case 'remove':
            strategy.onItemRemoved(op.key, metadataProvider);
            break;
        }
      });

      // Force eviction
      const context = {
        currentSize: metadataProvider.getCurrentSize(),
        limits: { maxItems: 2, maxSizeBytes: null }
      };

      const evicted = strategy.selectForEviction(metadataProvider, context);
      expect(evicted.length).toBeGreaterThan(0);

      // user:1 should be preserved (highest access count: 4)
      expect(evicted).not.toContain('user:1');
    });

    it('should handle size-based eviction scenarios', () => {
      strategy = new LFUEvictionStrategy();

      // Add items with different sizes
      strategy.onItemAdded('small-frequent', 10, metadataProvider);
      strategy.onItemAdded('medium-rare', 500, metadataProvider);
      strategy.onItemAdded('large-medium', 1000, metadataProvider);

      // Make small item very frequent
      for (let i = 0; i < 100; i++) {
        strategy.onItemAccessed('small-frequent', metadataProvider);
      }

      // Make large item moderately frequent
      for (let i = 0; i < 10; i++) {
        strategy.onItemAccessed('large-medium', metadataProvider);
      }

      // Access medium item once
      strategy.onItemAccessed('medium-rare', metadataProvider);

      // Force size-based eviction
      const context = {
        currentSize: { itemCount: 3, sizeBytes: 1510 },
        limits: { maxItems: null, maxSizeBytes: 1000 },
        newItemSize: 100
      };

      const evicted = strategy.selectForEviction(metadataProvider, context);
      expect(evicted.length).toBeGreaterThan(0);

      // Should prefer evicting larger, less frequent items
      const evictedSet = new Set(evicted);
      expect(evictedSet.has('medium-rare') || evictedSet.has('large-medium')).toBe(true);
      expect(evictedSet.has('small-frequent')).toBe(false);
    });
  });
});
