import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MRUEvictionStrategy } from '../../../src/eviction/strategies/MRUEvictionStrategy';
import { CacheItemMetadata, EvictionContext } from '../../../src/eviction/EvictionStrategy';
import { MockMetadataProvider } from '../../utils/MockMetadataProvider';

describe('MRUEvictionStrategy', () => {
  let strategy: MRUEvictionStrategy;
  let metadataProvider: MockMetadataProvider;

  afterEach(() => {
    // Clear timers to prevent memory leaks
    vi.clearAllTimers();
  });

  function createMockMetadata(
    key: string,
    addedAt = 1000,
    lastAccessedAt = 1000,
    accessCount = 1,
    estimatedSize = 100
  ): CacheItemMetadata {
    return {
      key,
      addedAt,
      lastAccessedAt,
      accessCount,
      estimatedSize
    };
  }

  beforeEach(() => {
    strategy = new MRUEvictionStrategy();
    metadataProvider = new MockMetadataProvider();
  });

  describe('getStrategyName', () => {
    it('should return "MRU"', () => {
      expect(strategy.getStrategyName()).toBe('MRU');
    });
  });

  describe('selectForEviction', () => {
    it('should return empty array when cache is empty', async () => {
      const context: EvictionContext = {
        currentSize: { itemCount: 0, sizeBytes: 0 },
        limits: { maxItems: 10, maxSizeBytes: null }
      };

      const result = await strategy.selectForEviction(metadataProvider, context);
      expect(result).toEqual([]);
    });

    it('should return empty array when no eviction is needed', async () => {
      await metadataProvider.setMetadata('key1', createMockMetadata('key1'));
      await metadataProvider.setMetadata('key2', createMockMetadata('key2'));

      const context: EvictionContext = {
        currentSize: { itemCount: 2, sizeBytes: 200 },
        limits: { maxItems: 10, maxSizeBytes: null }
      };

      const result = await strategy.selectForEviction(metadataProvider, context);
      expect(result).toEqual([]);
    });

    it('should select most recently accessed item for eviction', async () => {
      // Set up items with different access times
      await metadataProvider.setMetadata('key1', createMockMetadata('key1', 1000, 2000, 1)); // Older access
      await metadataProvider.setMetadata('key2', createMockMetadata('key2', 1000, 3000, 1)); // Most recent
      await metadataProvider.setMetadata('key3', createMockMetadata('key3', 1000, 1000, 1)); // Oldest access

      const context: EvictionContext = {
        currentSize: { itemCount: 3, sizeBytes: 300 },
        limits: { maxItems: 2, maxSizeBytes: null } // Need to evict 2 items (3-2+1=2)
      };

      const result = await strategy.selectForEviction(metadataProvider, context);
      expect(result).toHaveLength(2);
      expect(result[0]).toBe('key2'); // Most recently accessed should be evicted first
      expect(result[1]).toBe('key1'); // Second most recently accessed should be evicted second
    });

    it('should select multiple items when needed', async () => {
      // Set up items with different access times
      await metadataProvider.setMetadata('key1', createMockMetadata('key1', 1000, 1000, 1)); // Oldest
      await metadataProvider.setMetadata('key2', createMockMetadata('key2', 1000, 2000, 1)); // Middle
      await metadataProvider.setMetadata('key3', createMockMetadata('key3', 1000, 3000, 1)); // Most recent
      await metadataProvider.setMetadata('key4', createMockMetadata('key4', 1000, 4000, 1)); // Newest

      const context: EvictionContext = {
        currentSize: { itemCount: 4, sizeBytes: 400 },
        limits: { maxItems: 2, maxSizeBytes: null } // Need to evict 3 items (4-2+1=3)
      };

      const result = await strategy.selectForEviction(metadataProvider, context);
      expect(result).toHaveLength(3);
      expect(result[0]).toBe('key4'); // Most recent
      expect(result[1]).toBe('key3'); // Second most recent
      expect(result[2]).toBe('key2'); // Third most recent
    });

    it('should evict based on size limits', async () => {
      await metadataProvider.setMetadata('key1', createMockMetadata('key1', 1000, 1000, 1, 100));
      await metadataProvider.setMetadata('key2', createMockMetadata('key2', 1000, 2000, 1, 100));

      const context: EvictionContext = {
        currentSize: { itemCount: 2, sizeBytes: 200 },
        limits: { maxItems: null, maxSizeBytes: 250 },
        newItemSize: 100 // Adding this would exceed size limit
      };

      const result = await strategy.selectForEviction(metadataProvider, context);
      expect(result).toContain('key2'); // Most recently accessed
    });

    it('should handle identical access times consistently', async () => {
      const sameTime = 1500;
      await metadataProvider.setMetadata('key1', createMockMetadata('key1', 1000, sameTime, 1));
      await metadataProvider.setMetadata('key2', createMockMetadata('key2', 1000, sameTime, 1));

      const context: EvictionContext = {
        currentSize: { itemCount: 2, sizeBytes: 200 },
        limits: { maxItems: 1, maxSizeBytes: null } // Need to evict 2 items (2-1+1=2)
      };

      const result = await strategy.selectForEviction(metadataProvider, context);
      expect(result).toHaveLength(2);
      expect(result).toContain('key1');
      expect(result).toContain('key2');
    });

    it('should return empty array when eviction count is zero or negative', async () => {
      await metadataProvider.setMetadata('key1', createMockMetadata('key1'));

      const context: EvictionContext = {
        currentSize: { itemCount: 1, sizeBytes: 100 },
        limits: { maxItems: 5, maxSizeBytes: null }
      };

      const result = await strategy.selectForEviction(metadataProvider, context);
      expect(result).toEqual([]);
    });

    it('should return empty array when well under limits', async () => {
      await metadataProvider.setMetadata('key1', createMockMetadata('key1', 1000, 1000, 1, 50));
      await metadataProvider.setMetadata('key2', createMockMetadata('key2', 1000, 1000, 1, 50));

      const context: EvictionContext = {
        currentSize: { itemCount: 2, sizeBytes: 100 },
        limits: { maxItems: 10, maxSizeBytes: 1000 } // Well under limits
      };

      const result = await strategy.selectForEviction(metadataProvider, context);
      expect(result).toEqual([]);
    });
  });

  describe('onItemAccessed', () => {
    it('should update lastAccessedAt and increment accessCount', async () => {
      const initialMetadata = createMockMetadata('key1', 1000, 1500, 2);
      await metadataProvider.setMetadata('key1', initialMetadata);

      const beforeAccess = Date.now();
      await strategy.onItemAccessed('key1', metadataProvider);
      const afterAccess = Date.now();

      const updatedMetadata = await metadataProvider.getMetadata('key1')!;
      expect(updatedMetadata!.accessCount).toBe(3); // Incremented from 2
      expect(updatedMetadata!.lastAccessedAt).toBeGreaterThanOrEqual(beforeAccess);
      expect(updatedMetadata!.lastAccessedAt).toBeLessThanOrEqual(afterAccess);
    });
  });

  it('should preserve other metadata fields', async () => {
    const originalMetadata = createMockMetadata('key1', 1000, 1500, 5, 250);
    await metadataProvider.setMetadata('key1', originalMetadata);

    await strategy.onItemAccessed('key1', metadataProvider);

    const updatedMetadata = await metadataProvider.getMetadata('key1')!;
    expect(updatedMetadata!.key).toBe('key1');
    expect(updatedMetadata!.addedAt).toBe(1000);
    expect(updatedMetadata!.estimatedSize).toBe(250);
    // Only accessCount and lastAccessedAt should change
    expect(updatedMetadata!.accessCount).toBe(6);
  });

  describe('onItemAdded', () => {
    it('should create metadata for new item', async () => {
      const beforeAdd = Date.now();
      await strategy.onItemAdded('newKey', 150, metadataProvider);
      const afterAdd = Date.now();

      const metadata = await metadataProvider.getMetadata('newKey')!;
      expect(metadata).toBeDefined();
      expect(metadata!.key).toBe('newKey');
      expect(metadata!.estimatedSize).toBe(150);
      expect(metadata!.accessCount).toBe(1);
      expect(metadata!.addedAt).toBeGreaterThanOrEqual(beforeAdd);
      expect(metadata!.addedAt).toBeLessThanOrEqual(afterAdd);
      expect(metadata!.lastAccessedAt).toBe(metadata!.addedAt);
    });

    it('should handle zero-size items', async () => {
      await strategy.onItemAdded('zeroSize', 0, metadataProvider);

      const metadata = await metadataProvider.getMetadata('zeroSize')!;
      expect(metadata!.estimatedSize).toBe(0);
      expect(metadata!.accessCount).toBe(1);
    });

    it('should handle large size items', async () => {
      const largeSize = 1024 * 1024; // 1MB
      await strategy.onItemAdded('large', largeSize, metadataProvider);

      const metadata = await metadataProvider.getMetadata('large')!;
      expect(metadata!.estimatedSize).toBe(largeSize);
    });
  });

  describe('onItemRemoved', () => {
    it('should remove metadata for existing item', async () => {
      const metadata = createMockMetadata('key1');
      await metadataProvider.setMetadata('key1', metadata);

      expect(await metadataProvider.getMetadata('key1')).toBeDefined();

      await strategy.onItemRemoved('key1', metadataProvider);

      expect(await metadataProvider.getMetadata('key1')).toBeNull();
    });
  });

  describe('Integration scenarios', () => {
    it('should work correctly in a typical cache usage scenario', async () => {
      // Add some items with explicit times to ensure deterministic ordering
      const baseTime = 1000;
      await metadataProvider.setMetadata('item1', createMockMetadata('item1', baseTime, baseTime, 1)); // Original time
      await metadataProvider.setMetadata('item2', createMockMetadata('item2', baseTime, baseTime + 100, 2)); // Accessed once
      await metadataProvider.setMetadata('item3', createMockMetadata('item3', baseTime, baseTime + 200, 2)); // Accessed once, most recent

      // Now trigger eviction
      const context: EvictionContext = {
        currentSize: { itemCount: 3, sizeBytes: 300 },
        limits: { maxItems: 2, maxSizeBytes: null } // Need to evict 2 items (3-2+1=2)
      };

      const toEvict = await strategy.selectForEviction(metadataProvider, context);
      expect(toEvict).toHaveLength(2);
      expect(toEvict[0]).toBe('item3'); // Most recently accessed should be evicted first
      expect(toEvict[1]).toBe('item2'); // Second most recently accessed should be evicted second

      // Remove the evicted items
      await strategy.onItemRemoved('item3', metadataProvider);
      await strategy.onItemRemoved('item2', metadataProvider);
      expect(await metadataProvider.getMetadata('item3')).toBeNull();
      expect(await metadataProvider.getMetadata('item2')).toBeNull();
    });

    it('should handle rapid successive accesses correctly', async () => {
      await strategy.onItemAdded('rapid', 100, metadataProvider);

      const initialMetadata = await metadataProvider.getMetadata('rapid')!;
      const initialAccessTime = initialMetadata!.lastAccessedAt;

      // Rapid successive accesses
      for (let i = 0; i < 5; i++) {
        await strategy.onItemAccessed('rapid', metadataProvider);
      }

      const finalMetadata = await metadataProvider.getMetadata('rapid')!;
      expect(finalMetadata!.accessCount).toBe(6); // 1 initial + 5 accesses
      expect(finalMetadata!.lastAccessedAt).toBeGreaterThanOrEqual(initialAccessTime);
    });

    it('should maintain correct eviction order with multiple operations', async () => {
      // Add items at different times
      await strategy.onItemAdded('first', 100, metadataProvider);

      // Simulate time passing
      const laterTime = Date.now() + 1000;
      const evenLaterTime = Date.now() + 2000;

      // Mock different access times by directly setting metadata
      await metadataProvider.setMetadata('second', createMockMetadata('second', Date.now(), laterTime, 1));
      await metadataProvider.setMetadata('third', createMockMetadata('third', Date.now(), evenLaterTime, 1));

      const context: EvictionContext = {
        currentSize: { itemCount: 3, sizeBytes: 300 },
        limits: { maxItems: 1, maxSizeBytes: null } // Need to evict 3 items (3-1+1=3)
      };

      const toEvict = await strategy.selectForEviction(metadataProvider, context);
      expect(toEvict).toHaveLength(3);
      expect(toEvict[0]).toBe('third'); // Most recently accessed should be first to evict
      expect(toEvict[1]).toBe('second'); // Second most recently accessed
      expect(toEvict[2]).toBe('first'); // Oldest access
    });
  });
});
