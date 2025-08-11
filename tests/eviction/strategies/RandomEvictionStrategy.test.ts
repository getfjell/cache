import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RandomEvictionStrategy } from '../../../src/eviction/strategies/RandomEvictionStrategy';
import { CacheItemMetadata } from '../../../src/eviction/EvictionStrategy';
import { MockMetadataProvider } from '../../utils/MockMetadataProvider';

describe('RandomEvictionStrategy', () => {
  let strategy: RandomEvictionStrategy;
  let metadataProvider: MockMetadataProvider;

  afterEach(() => {
    // Clear timers to prevent memory leaks
    vi.clearAllTimers();
  });

  function createMockMetadata(key: string, addedAt = 1000, accessCount = 1): CacheItemMetadata {
    return {
      key,
      addedAt,
      lastAccessedAt: addedAt,
      accessCount,
      estimatedSize: 100
    };
  }

  beforeEach(() => {
    metadataProvider = new MockMetadataProvider();
    strategy = new RandomEvictionStrategy();
  });

  describe('selectForEviction', () => {
    it('should return null for empty cache', async () => {
      const context = {
        currentSize: { itemCount: 0, sizeBytes: 0 },
        limits: { maxItems: 5, maxSizeBytes: 1000 },
        newItemSize: 100
      };

      const result = await strategy.selectForEviction(metadataProvider, context);

      expect(result).toEqual([]);
    });

    it('should return the only key when cache has single item', async () => {
      const metadata = createMockMetadata('key1');
      await metadataProvider.setMetadata('key1', metadata);

      const context = {
        currentSize: { itemCount: 1, sizeBytes: 100 },
        limits: { maxItems: 1, maxSizeBytes: 100 },
        newItemSize: 100
      };

      const result = await strategy.selectForEviction(metadataProvider, context);

      expect(result).toContain('key1');
    });

    it('should return a valid key when cache has multiple items', async () => {
      await metadataProvider.setMetadata('key1', createMockMetadata('key1'));
      await metadataProvider.setMetadata('key2', createMockMetadata('key2'));
      await metadataProvider.setMetadata('key3', createMockMetadata('key3'));

      const context = {
        currentSize: { itemCount: 3, sizeBytes: 300 },
        limits: { maxItems: 3, maxSizeBytes: 300 },
        newItemSize: 100
      };

      const result = await strategy.selectForEviction(metadataProvider, context);

      expect(result).toHaveLength(1);
      expect(['key1', 'key2', 'key3']).toContain(result[0]);
    });

    it('should demonstrate randomness by selecting different keys over multiple calls', async () => {
      // Mock Math.random to control randomness for testing
      const originalRandom = Math.random;
      const mockValues = [0.1, 0.5, 0.9]; // Different random values
      let callCount = 0;

      vi.spyOn(Math, 'random').mockImplementation(() => {
        return mockValues[callCount++ % mockValues.length];
      });

      await metadataProvider.setMetadata('key1', createMockMetadata('key1'));
      await metadataProvider.setMetadata('key2', createMockMetadata('key2'));
      await metadataProvider.setMetadata('key3', createMockMetadata('key3'));

      const context = {
        currentSize: { itemCount: 3, sizeBytes: 300 },
        limits: { maxItems: 3, maxSizeBytes: 300 },
        newItemSize: 100
      };

      const results = new Set<string>();

      // Call multiple times to see different selections
      for (let i = 0; i < 6; i++) {
        const result = await strategy.selectForEviction(metadataProvider, context);
        if (result.length > 0) {
          results.add(result[0]);
        }
      }

      // Should have selected different keys
      expect(results.size).toBeGreaterThan(1);

      // Restore original Math.random
      Math.random = originalRandom;
    });
  });

  describe('onItemAccessed', () => {
    it('should update lastAccessedAt and increment accessCount', async () => {
      const metadata = createMockMetadata('key1', 1000, 5);
      await metadataProvider.setMetadata('key1', metadata);
      const originalTime = Date.now();

      vi.spyOn(Date, 'now').mockReturnValue(originalTime + 1000);

      await strategy.onItemAccessed('key1', metadataProvider);

      const updatedMetadata = (await metadataProvider.getMetadata('key1'))!;
      expect(updatedMetadata.lastAccessedAt).toBe(originalTime + 1000);
      expect(updatedMetadata.accessCount).toBe(6);
    });

    it('should handle multiple accesses correctly', async () => {
      const metadata = createMockMetadata('key1', 1000, 1);
      await metadataProvider.setMetadata('key1', metadata);

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      await strategy.onItemAccessed('key1', metadataProvider);

      vi.spyOn(Date, 'now').mockReturnValue(3000);
      await strategy.onItemAccessed('key1', metadataProvider);

      const updatedMetadata = (await metadataProvider.getMetadata('key1'))!;
      expect(updatedMetadata.lastAccessedAt).toBe(3000);
      expect(updatedMetadata.accessCount).toBe(3);
    });
  });

  describe('onItemAdded', () => {
    it('should initialize metadata correctly', async () => {
      const currentTime = 5000;

      vi.spyOn(Date, 'now').mockReturnValue(currentTime);

      await strategy.onItemAdded('key1', 100, metadataProvider);

      const metadata = (await metadataProvider.getMetadata('key1'))!;
      expect(metadata.addedAt).toBe(currentTime);
      expect(metadata.lastAccessedAt).toBe(currentTime);
      expect(metadata.accessCount).toBe(1);
    });

    it('should handle adding multiple items', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(1000);
      await strategy.onItemAdded('key1', 100, metadataProvider);

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      await strategy.onItemAdded('key2', 100, metadataProvider);

      const metadata1 = (await metadataProvider.getMetadata('key1'))!;
      expect(metadata1.addedAt).toBe(1000);
      expect(metadata1.lastAccessedAt).toBe(1000);
      expect(metadata1.accessCount).toBe(1);

      const metadata2 = (await metadataProvider.getMetadata('key2'))!;
      expect(metadata2.addedAt).toBe(2000);
      expect(metadata2.lastAccessedAt).toBe(2000);
      expect(metadata2.accessCount).toBe(1);
    });
  });

  describe('onItemRemoved', () => {
    it('should complete without throwing errors', async () => {
      await expect(strategy.onItemRemoved('key1', metadataProvider)).resolves.toBeUndefined();
    });
  });

  describe('integration behavior', () => {
    it('should work with typical cache operations', async () => {
      // Add some items
      await strategy.onItemAdded('key1', 100, metadataProvider);
      await strategy.onItemAdded('key2', 100, metadataProvider);
      await strategy.onItemAdded('key3', 100, metadataProvider);

      // Access some items
      await strategy.onItemAccessed('key1', metadataProvider);
      await strategy.onItemAccessed('key2', metadataProvider);

      const context = {
        currentSize: { itemCount: 3, sizeBytes: 300 },
        limits: { maxItems: 3, maxSizeBytes: 300 },
        newItemSize: 100
      };

      // Select for eviction should return a valid key
      const evictionKeys = await strategy.selectForEviction(metadataProvider, context);
      expect(evictionKeys).toHaveLength(1);
      expect(['key1', 'key2', 'key3']).toContain(evictionKeys[0]);

      // Remove the item
      await strategy.onItemRemoved(evictionKeys[0], metadataProvider);

      // Should still work with remaining items
      const context2 = {
        currentSize: { itemCount: 2, sizeBytes: 200 },
        limits: { maxItems: 2, maxSizeBytes: 200 },
        newItemSize: 100
      };
      const nextEvictionKeys = await strategy.selectForEviction(metadataProvider, context2);
      expect(nextEvictionKeys).toHaveLength(1);
    });
  });
});
