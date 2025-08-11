import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FIFOEvictionStrategy } from '../../../src/eviction/strategies/FIFOEvictionStrategy';
import { CacheItemMetadata, EvictionContext } from '../../../src/eviction/EvictionStrategy';
import { MockMetadataProvider } from '../../utils/MockMetadataProvider';

describe('FIFOEvictionStrategy', () => {
  let strategy: FIFOEvictionStrategy;
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
    strategy = new FIFOEvictionStrategy();
    metadataProvider = new MockMetadataProvider();
  });

  describe('getStrategyName', () => {
    it('should return "fifo"', () => {
      expect(strategy.getStrategyName()).toBe('fifo');
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

    it('should select oldest added item for eviction (FIFO behavior)', async () => {
      // Set up items with different add times (FIFO should evict oldest first)
      await metadataProvider.setMetadata('key1', createMockMetadata('key1', 1000, 2000, 1)); // Oldest added
      await metadataProvider.setMetadata('key2', createMockMetadata('key2', 2000, 3000, 1)); // Middle
      await metadataProvider.setMetadata('key3', createMockMetadata('key3', 3000, 1000, 1)); // Newest added

      const context: EvictionContext = {
        currentSize: { itemCount: 3, sizeBytes: 300 },
        limits: { maxItems: 2, maxSizeBytes: null } // Need to evict 2 items (3-2+1=2)
      };

      const result = await strategy.selectForEviction(metadataProvider, context);
      expect(result).toHaveLength(2);
      expect(result[0]).toBe('key1'); // Oldest added should be evicted first
      expect(result[1]).toBe('key2'); // Second oldest added should be evicted second
    });

    it('should select multiple items when needed', async () => {
      // Set up items with different add times
      await metadataProvider.setMetadata('key1', createMockMetadata('key1', 1000, 1000, 1)); // Oldest
      await metadataProvider.setMetadata('key2', createMockMetadata('key2', 2000, 2000, 1)); // Second oldest
      await metadataProvider.setMetadata('key3', createMockMetadata('key3', 3000, 3000, 1)); // Third oldest
      await metadataProvider.setMetadata('key4', createMockMetadata('key4', 4000, 4000, 1)); // Newest

      const context: EvictionContext = {
        currentSize: { itemCount: 4, sizeBytes: 400 },
        limits: { maxItems: 2, maxSizeBytes: null } // Need to evict 3 items (4-2+1=3)
      };

      const result = await strategy.selectForEviction(metadataProvider, context);
      expect(result).toHaveLength(3);
      expect(result[0]).toBe('key1'); // Oldest added
      expect(result[1]).toBe('key2'); // Second oldest added
      expect(result[2]).toBe('key3'); // Third oldest added
    });

    it('should evict based on size limits', async () => {
      await metadataProvider.setMetadata('key1', createMockMetadata('key1', 1000, 1000, 1, 100));
      await metadataProvider.setMetadata('key2', createMockMetadata('key2', 2000, 2000, 1, 100));

      const context: EvictionContext = {
        currentSize: { itemCount: 2, sizeBytes: 200 },
        limits: { maxItems: null, maxSizeBytes: 250 },
        newItemSize: 100 // Adding this would exceed size limit
      };

      const result = await strategy.selectForEviction(metadataProvider, context);
      expect(result).toContain('key1'); // Oldest added should be evicted
    });

    it('should handle identical add times consistently', async () => {
      const sameTime = 1500;
      await metadataProvider.setMetadata('key1', createMockMetadata('key1', sameTime, 1000, 1));
      await metadataProvider.setMetadata('key2', createMockMetadata('key2', sameTime, 2000, 1));

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
      await metadataProvider.setMetadata('key2', createMockMetadata('key2', 2000, 1000, 1, 50));

      const context: EvictionContext = {
        currentSize: { itemCount: 2, sizeBytes: 100 },
        limits: { maxItems: 10, maxSizeBytes: 1000 } // Well under limits
      };

      const result = await strategy.selectForEviction(metadataProvider, context);
      expect(result).toEqual([]);
    });

    it('should not be affected by access patterns (FIFO ignores access frequency)', async () => {
      // Set up items where oldest added has been accessed most recently
      await metadataProvider.setMetadata('key1', createMockMetadata('key1', 1000, 5000, 10)); // Oldest but most accessed
      await metadataProvider.setMetadata('key2', createMockMetadata('key2', 2000, 1000, 1)); // Newer but less accessed
      await metadataProvider.setMetadata('key3', createMockMetadata('key3', 3000, 1000, 1)); // Newest but least accessed

      const context: EvictionContext = {
        currentSize: { itemCount: 3, sizeBytes: 300 },
        limits: { maxItems: 2, maxSizeBytes: null } // Need to evict 2 items
      };

      const result = await strategy.selectForEviction(metadataProvider, context);
      expect(result).toHaveLength(2);
      expect(result[0]).toBe('key1'); // Should still evict oldest added despite high access
      expect(result[1]).toBe('key2'); // Second oldest added
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

    it('should handle non-existent key gracefully', async () => {
      // Should not throw when key doesn't exist
      await expect(strategy.onItemAccessed('nonexistent', metadataProvider)).resolves.not.toThrow();
    });

    it('should preserve other metadata fields', async () => {
      const originalMetadata = createMockMetadata('key1', 1000, 1500, 5, 250);
      await metadataProvider.setMetadata('key1', originalMetadata);

      await strategy.onItemAccessed('key1', metadataProvider);

      const updatedMetadata = await metadataProvider.getMetadata('key1')!;
      expect(updatedMetadata!.key).toBe('key1');
      expect(updatedMetadata!.addedAt).toBe(1000); // Should not change for FIFO
      expect(updatedMetadata!.estimatedSize).toBe(250);
      // Only accessCount and lastAccessedAt should change
      expect(updatedMetadata!.accessCount).toBe(6);
    });

    it('should not affect eviction order (FIFO is addedAt based)', async () => {
      // Even though we access items in reverse order, eviction should still be FIFO
      await metadataProvider.setMetadata('key1', createMockMetadata('key1', 1000, 1000, 1));
      await metadataProvider.setMetadata('key2', createMockMetadata('key2', 2000, 2000, 1));

      // Access newer item more
      await strategy.onItemAccessed('key2', metadataProvider);
      await strategy.onItemAccessed('key2', metadataProvider);

      const context: EvictionContext = {
        currentSize: { itemCount: 2, sizeBytes: 200 },
        limits: { maxItems: 1, maxSizeBytes: null }
      };

      const result = await strategy.selectForEviction(metadataProvider, context);
      expect(result[0]).toBe('key1'); // Should still evict oldest added
    });
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

    it('should maintain chronological order for FIFO eviction', async () => {
      const baseTime = Date.now();

      // Add items with small time gaps
      await strategy.onItemAdded('first', 100, metadataProvider);
      await strategy.onItemAdded('second', 100, metadataProvider);
      await strategy.onItemAdded('third', 100, metadataProvider);

      const firstMeta = await metadataProvider.getMetadata('first')!;
      const secondMeta = await metadataProvider.getMetadata('second')!;
      const thirdMeta = await metadataProvider.getMetadata('third')!;

      expect(firstMeta!.addedAt).toBeLessThanOrEqual(secondMeta!.addedAt);
      expect(secondMeta!.addedAt).toBeLessThanOrEqual(thirdMeta!.addedAt);
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

    it('should handle removal of non-existent key gracefully', async () => {
      // Should not throw when key doesn't exist
      await expect(strategy.onItemRemoved('nonexistent', metadataProvider)).resolves.not.toThrow();
    });

    it('should not affect other items', async () => {
      await metadataProvider.setMetadata('key1', createMockMetadata('key1'));
      await metadataProvider.setMetadata('key2', createMockMetadata('key2'));

      await strategy.onItemRemoved('key1', metadataProvider);

      expect(await metadataProvider.getMetadata('key1')).toBeNull();
      expect(await metadataProvider.getMetadata('key2')).toBeDefined();
    });
  });

  describe('Integration scenarios', () => {
    it('should work correctly in a typical cache usage scenario', async () => {
      // Add items in chronological order
      const baseTime = 1000;
      await metadataProvider.setMetadata('item1', createMockMetadata('item1', baseTime, baseTime, 1)); // First added
      await metadataProvider.setMetadata('item2', createMockMetadata('item2', baseTime + 100, baseTime + 100, 1)); // Second added
      await metadataProvider.setMetadata('item3', createMockMetadata('item3', baseTime + 200, baseTime + 200, 1)); // Third added

      // Access items in reverse order (shouldn't affect FIFO eviction)
      await strategy.onItemAccessed('item3', metadataProvider);
      await strategy.onItemAccessed('item2', metadataProvider);
      await strategy.onItemAccessed('item1', metadataProvider);

      // Now trigger eviction
      const context: EvictionContext = {
        currentSize: { itemCount: 3, sizeBytes: 300 },
        limits: { maxItems: 2, maxSizeBytes: null } // Need to evict 2 items
      };

      const toEvict = await strategy.selectForEviction(metadataProvider, context);
      expect(toEvict).toHaveLength(2);
      expect(toEvict[0]).toBe('item1'); // First added should be evicted first
      expect(toEvict[1]).toBe('item2'); // Second added should be evicted second

      // Remove the evicted items
      await strategy.onItemRemoved('item1', metadataProvider);
      await strategy.onItemRemoved('item2', metadataProvider);
      expect(await metadataProvider.getMetadata('item1')).toBeNull();
      expect(await metadataProvider.getMetadata('item2')).toBeNull();
      expect(await metadataProvider.getMetadata('item3')).toBeDefined(); // Should remain
    });

    it('should handle rapid successive additions correctly', async () => {
      // Add items rapidly
      for (let i = 0; i < 5; i++) {
        await strategy.onItemAdded(`rapid${i}`, 100, metadataProvider);
      }

      const context: EvictionContext = {
        currentSize: { itemCount: 5, sizeBytes: 500 },
        limits: { maxItems: 3, maxSizeBytes: null } // Need to evict 3 items
      };

      const toEvict = await strategy.selectForEviction(metadataProvider, context);
      expect(toEvict).toHaveLength(3);
      expect(toEvict[0]).toBe('rapid0'); // First added
      expect(toEvict[1]).toBe('rapid1'); // Second added
      expect(toEvict[2]).toBe('rapid2'); // Third added
    });

    it('should maintain correct eviction order with mixed operations', async () => {
      // Add first item
      await strategy.onItemAdded('first', 100, metadataProvider);

      // Add second item
      await strategy.onItemAdded('second', 100, metadataProvider);

      // Access first item multiple times (shouldn't affect FIFO order)
      await strategy.onItemAccessed('first', metadataProvider);
      await strategy.onItemAccessed('first', metadataProvider);

      // Add third item
      await strategy.onItemAdded('third', 100, metadataProvider);

      const context: EvictionContext = {
        currentSize: { itemCount: 3, sizeBytes: 300 },
        limits: { maxItems: 1, maxSizeBytes: null } // Need to evict all but 1
      };

      const toEvict = await strategy.selectForEviction(metadataProvider, context);
      expect(toEvict).toHaveLength(3);
      expect(toEvict[0]).toBe('first'); // Should still be first to evict despite multiple accesses
      expect(toEvict[1]).toBe('second');
      expect(toEvict[2]).toBe('third');
    });

    it('should handle size-based eviction correctly', async () => {
      await metadataProvider.setMetadata('small1', createMockMetadata('small1', 1000, 1000, 1, 50));
      await metadataProvider.setMetadata('large', createMockMetadata('large', 2000, 2000, 1, 200));
      await metadataProvider.setMetadata('small2', createMockMetadata('small2', 3000, 3000, 1, 50));

      const context: EvictionContext = {
        currentSize: { itemCount: 3, sizeBytes: 300 },
        limits: { maxItems: null, maxSizeBytes: 250 },
        newItemSize: 100 // Would exceed size limit
      };

      const toEvict = await strategy.selectForEviction(metadataProvider, context);
      expect(toEvict.length).toBeGreaterThan(0);
      expect(toEvict[0]).toBe('small1'); // Oldest added should be evicted first
    });

    it('should demonstrate FIFO behavior vs LRU behavior', async () => {
      // Create scenario where FIFO and LRU would behave differently
      await metadataProvider.setMetadata('oldest', createMockMetadata('oldest', 1000, 1000, 1)); // Oldest added, not accessed recently
      await metadataProvider.setMetadata('middle', createMockMetadata('middle', 2000, 2000, 1)); // Middle age
      await metadataProvider.setMetadata('newest', createMockMetadata('newest', 3000, 3000, 1)); // Newest added

      // Access oldest item recently (LRU would keep it, FIFO should evict it)
      await strategy.onItemAccessed('oldest', metadataProvider);
      const updatedOldest = await metadataProvider.getMetadata('oldest')!;
      updatedOldest!.lastAccessedAt = Date.now(); // Make it most recently accessed
      await metadataProvider.setMetadata('oldest', updatedOldest!);

      const context: EvictionContext = {
        currentSize: { itemCount: 3, sizeBytes: 300 },
        limits: { maxItems: 2, maxSizeBytes: null }
      };

      const toEvict = await strategy.selectForEviction(metadataProvider, context);
      expect(toEvict).toHaveLength(2);
      expect(toEvict[0]).toBe('oldest'); // FIFO evicts oldest added, regardless of recent access
      expect(toEvict[1]).toBe('middle');
    });
  });
});
