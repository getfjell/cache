import { beforeEach, describe, expect, it } from 'vitest';
import { FIFOEvictionStrategy } from '../../../src/eviction/strategies/FIFOEvictionStrategy';
import { CacheItemMetadata, EvictionContext } from '../../../src/eviction/EvictionStrategy';
import { MockMetadataProvider } from '../../utils/MockMetadataProvider';

describe('FIFOEvictionStrategy', () => {
  let strategy: FIFOEvictionStrategy;
  let metadataProvider: MockMetadataProvider;

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
    it('should return empty array when cache is empty', () => {
      const context: EvictionContext = {
        currentSize: { itemCount: 0, sizeBytes: 0 },
        limits: { maxItems: 10, maxSizeBytes: null }
      };

      const result = strategy.selectForEviction(metadataProvider, context);
      expect(result).toEqual([]);
    });

    it('should return empty array when no eviction is needed', () => {
      metadataProvider.setMetadata('key1', createMockMetadata('key1'));
      metadataProvider.setMetadata('key2', createMockMetadata('key2'));

      const context: EvictionContext = {
        currentSize: { itemCount: 2, sizeBytes: 200 },
        limits: { maxItems: 10, maxSizeBytes: null }
      };

      const result = strategy.selectForEviction(metadataProvider, context);
      expect(result).toEqual([]);
    });

    it('should select oldest added item for eviction (FIFO behavior)', () => {
      // Set up items with different add times (FIFO should evict oldest first)
      metadataProvider.setMetadata('key1', createMockMetadata('key1', 1000, 2000, 1)); // Oldest added
      metadataProvider.setMetadata('key2', createMockMetadata('key2', 2000, 3000, 1)); // Middle
      metadataProvider.setMetadata('key3', createMockMetadata('key3', 3000, 1000, 1)); // Newest added

      const context: EvictionContext = {
        currentSize: { itemCount: 3, sizeBytes: 300 },
        limits: { maxItems: 2, maxSizeBytes: null } // Need to evict 2 items (3-2+1=2)
      };

      const result = strategy.selectForEviction(metadataProvider, context);
      expect(result).toHaveLength(2);
      expect(result[0]).toBe('key1'); // Oldest added should be evicted first
      expect(result[1]).toBe('key2'); // Second oldest added should be evicted second
    });

    it('should select multiple items when needed', () => {
      // Set up items with different add times
      metadataProvider.setMetadata('key1', createMockMetadata('key1', 1000, 1000, 1)); // Oldest
      metadataProvider.setMetadata('key2', createMockMetadata('key2', 2000, 2000, 1)); // Second oldest
      metadataProvider.setMetadata('key3', createMockMetadata('key3', 3000, 3000, 1)); // Third oldest
      metadataProvider.setMetadata('key4', createMockMetadata('key4', 4000, 4000, 1)); // Newest

      const context: EvictionContext = {
        currentSize: { itemCount: 4, sizeBytes: 400 },
        limits: { maxItems: 2, maxSizeBytes: null } // Need to evict 3 items (4-2+1=3)
      };

      const result = strategy.selectForEviction(metadataProvider, context);
      expect(result).toHaveLength(3);
      expect(result[0]).toBe('key1'); // Oldest added
      expect(result[1]).toBe('key2'); // Second oldest added
      expect(result[2]).toBe('key3'); // Third oldest added
    });

    it('should evict based on size limits', () => {
      metadataProvider.setMetadata('key1', createMockMetadata('key1', 1000, 1000, 1, 100));
      metadataProvider.setMetadata('key2', createMockMetadata('key2', 2000, 2000, 1, 100));

      const context: EvictionContext = {
        currentSize: { itemCount: 2, sizeBytes: 200 },
        limits: { maxItems: null, maxSizeBytes: 250 },
        newItemSize: 100 // Adding this would exceed size limit
      };

      const result = strategy.selectForEviction(metadataProvider, context);
      expect(result).toContain('key1'); // Oldest added should be evicted
    });

    it('should handle identical add times consistently', () => {
      const sameTime = 1500;
      metadataProvider.setMetadata('key1', createMockMetadata('key1', sameTime, 1000, 1));
      metadataProvider.setMetadata('key2', createMockMetadata('key2', sameTime, 2000, 1));

      const context: EvictionContext = {
        currentSize: { itemCount: 2, sizeBytes: 200 },
        limits: { maxItems: 1, maxSizeBytes: null } // Need to evict 2 items (2-1+1=2)
      };

      const result = strategy.selectForEviction(metadataProvider, context);
      expect(result).toHaveLength(2);
      expect(result).toContain('key1');
      expect(result).toContain('key2');
    });

    it('should return empty array when eviction count is zero or negative', () => {
      metadataProvider.setMetadata('key1', createMockMetadata('key1'));

      const context: EvictionContext = {
        currentSize: { itemCount: 1, sizeBytes: 100 },
        limits: { maxItems: 5, maxSizeBytes: null }
      };

      const result = strategy.selectForEviction(metadataProvider, context);
      expect(result).toEqual([]);
    });

    it('should return empty array when well under limits', () => {
      metadataProvider.setMetadata('key1', createMockMetadata('key1', 1000, 1000, 1, 50));
      metadataProvider.setMetadata('key2', createMockMetadata('key2', 2000, 1000, 1, 50));

      const context: EvictionContext = {
        currentSize: { itemCount: 2, sizeBytes: 100 },
        limits: { maxItems: 10, maxSizeBytes: 1000 } // Well under limits
      };

      const result = strategy.selectForEviction(metadataProvider, context);
      expect(result).toEqual([]);
    });

    it('should not be affected by access patterns (FIFO ignores access frequency)', () => {
      // Set up items where oldest added has been accessed most recently
      metadataProvider.setMetadata('key1', createMockMetadata('key1', 1000, 5000, 10)); // Oldest but most accessed
      metadataProvider.setMetadata('key2', createMockMetadata('key2', 2000, 1000, 1)); // Newer but less accessed
      metadataProvider.setMetadata('key3', createMockMetadata('key3', 3000, 1000, 1)); // Newest but least accessed

      const context: EvictionContext = {
        currentSize: { itemCount: 3, sizeBytes: 300 },
        limits: { maxItems: 2, maxSizeBytes: null } // Need to evict 2 items
      };

      const result = strategy.selectForEviction(metadataProvider, context);
      expect(result).toHaveLength(2);
      expect(result[0]).toBe('key1'); // Should still evict oldest added despite high access
      expect(result[1]).toBe('key2'); // Second oldest added
    });
  });

  describe('onItemAccessed', () => {
    it('should update lastAccessedAt and increment accessCount', () => {
      const initialMetadata = createMockMetadata('key1', 1000, 1500, 2);
      metadataProvider.setMetadata('key1', initialMetadata);

      const beforeAccess = Date.now();
      strategy.onItemAccessed('key1', metadataProvider);
      const afterAccess = Date.now();

      const updatedMetadata = metadataProvider.getMetadata('key1')!;
      expect(updatedMetadata.accessCount).toBe(3); // Incremented from 2
      expect(updatedMetadata.lastAccessedAt).toBeGreaterThanOrEqual(beforeAccess);
      expect(updatedMetadata.lastAccessedAt).toBeLessThanOrEqual(afterAccess);
    });

    it('should handle non-existent key gracefully', () => {
      // Should not throw when key doesn't exist
      expect(() => {
        strategy.onItemAccessed('nonexistent', metadataProvider);
      }).not.toThrow();
    });

    it('should preserve other metadata fields', () => {
      const originalMetadata = createMockMetadata('key1', 1000, 1500, 5, 250);
      metadataProvider.setMetadata('key1', originalMetadata);

      strategy.onItemAccessed('key1', metadataProvider);

      const updatedMetadata = metadataProvider.getMetadata('key1')!;
      expect(updatedMetadata.key).toBe('key1');
      expect(updatedMetadata.addedAt).toBe(1000); // Should not change for FIFO
      expect(updatedMetadata.estimatedSize).toBe(250);
      // Only accessCount and lastAccessedAt should change
      expect(updatedMetadata.accessCount).toBe(6);
    });

    it('should not affect eviction order (FIFO is addedAt based)', () => {
      // Even though we access items in reverse order, eviction should still be FIFO
      metadataProvider.setMetadata('key1', createMockMetadata('key1', 1000, 1000, 1));
      metadataProvider.setMetadata('key2', createMockMetadata('key2', 2000, 2000, 1));

      // Access newer item more
      strategy.onItemAccessed('key2', metadataProvider);
      strategy.onItemAccessed('key2', metadataProvider);

      const context: EvictionContext = {
        currentSize: { itemCount: 2, sizeBytes: 200 },
        limits: { maxItems: 1, maxSizeBytes: null }
      };

      const result = strategy.selectForEviction(metadataProvider, context);
      expect(result[0]).toBe('key1'); // Should still evict oldest added
    });
  });

  describe('onItemAdded', () => {
    it('should create metadata for new item', () => {
      const beforeAdd = Date.now();
      strategy.onItemAdded('newKey', 150, metadataProvider);
      const afterAdd = Date.now();

      const metadata = metadataProvider.getMetadata('newKey')!;
      expect(metadata).toBeDefined();
      expect(metadata.key).toBe('newKey');
      expect(metadata.estimatedSize).toBe(150);
      expect(metadata.accessCount).toBe(1);
      expect(metadata.addedAt).toBeGreaterThanOrEqual(beforeAdd);
      expect(metadata.addedAt).toBeLessThanOrEqual(afterAdd);
      expect(metadata.lastAccessedAt).toBe(metadata.addedAt);
    });

    it('should handle zero-size items', () => {
      strategy.onItemAdded('zeroSize', 0, metadataProvider);

      const metadata = metadataProvider.getMetadata('zeroSize')!;
      expect(metadata.estimatedSize).toBe(0);
      expect(metadata.accessCount).toBe(1);
    });

    it('should handle large size items', () => {
      const largeSize = 1024 * 1024; // 1MB
      strategy.onItemAdded('large', largeSize, metadataProvider);

      const metadata = metadataProvider.getMetadata('large')!;
      expect(metadata.estimatedSize).toBe(largeSize);
    });

    it('should maintain chronological order for FIFO eviction', () => {
      const baseTime = Date.now();

      // Add items with small time gaps
      strategy.onItemAdded('first', 100, metadataProvider);
      strategy.onItemAdded('second', 100, metadataProvider);
      strategy.onItemAdded('third', 100, metadataProvider);

      const firstMeta = metadataProvider.getMetadata('first')!;
      const secondMeta = metadataProvider.getMetadata('second')!;
      const thirdMeta = metadataProvider.getMetadata('third')!;

      expect(firstMeta.addedAt).toBeLessThanOrEqual(secondMeta.addedAt);
      expect(secondMeta.addedAt).toBeLessThanOrEqual(thirdMeta.addedAt);
    });
  });

  describe('onItemRemoved', () => {
    it('should remove metadata for existing item', () => {
      const metadata = createMockMetadata('key1');
      metadataProvider.setMetadata('key1', metadata);

      expect(metadataProvider.getMetadata('key1')).toBeDefined();

      strategy.onItemRemoved('key1', metadataProvider);

      expect(metadataProvider.getMetadata('key1')).toBeNull();
    });

    it('should handle removal of non-existent key gracefully', () => {
      // Should not throw when key doesn't exist
      expect(() => {
        strategy.onItemRemoved('nonexistent', metadataProvider);
      }).not.toThrow();
    });

    it('should not affect other items', () => {
      metadataProvider.setMetadata('key1', createMockMetadata('key1'));
      metadataProvider.setMetadata('key2', createMockMetadata('key2'));

      strategy.onItemRemoved('key1', metadataProvider);

      expect(metadataProvider.getMetadata('key1')).toBeNull();
      expect(metadataProvider.getMetadata('key2')).toBeDefined();
    });
  });

  describe('Integration scenarios', () => {
    it('should work correctly in a typical cache usage scenario', () => {
      // Add items in chronological order
      const baseTime = 1000;
      metadataProvider.setMetadata('item1', createMockMetadata('item1', baseTime, baseTime, 1)); // First added
      metadataProvider.setMetadata('item2', createMockMetadata('item2', baseTime + 100, baseTime + 100, 1)); // Second added
      metadataProvider.setMetadata('item3', createMockMetadata('item3', baseTime + 200, baseTime + 200, 1)); // Third added

      // Access items in reverse order (shouldn't affect FIFO eviction)
      strategy.onItemAccessed('item3', metadataProvider);
      strategy.onItemAccessed('item2', metadataProvider);
      strategy.onItemAccessed('item1', metadataProvider);

      // Now trigger eviction
      const context: EvictionContext = {
        currentSize: { itemCount: 3, sizeBytes: 300 },
        limits: { maxItems: 2, maxSizeBytes: null } // Need to evict 2 items
      };

      const toEvict = strategy.selectForEviction(metadataProvider, context);
      expect(toEvict).toHaveLength(2);
      expect(toEvict[0]).toBe('item1'); // First added should be evicted first
      expect(toEvict[1]).toBe('item2'); // Second added should be evicted second

      // Remove the evicted items
      strategy.onItemRemoved('item1', metadataProvider);
      strategy.onItemRemoved('item2', metadataProvider);
      expect(metadataProvider.getMetadata('item1')).toBeNull();
      expect(metadataProvider.getMetadata('item2')).toBeNull();
      expect(metadataProvider.getMetadata('item3')).toBeDefined(); // Should remain
    });

    it('should handle rapid successive additions correctly', () => {
      // Add items rapidly
      for (let i = 0; i < 5; i++) {
        strategy.onItemAdded(`rapid${i}`, 100, metadataProvider);
      }

      const context: EvictionContext = {
        currentSize: { itemCount: 5, sizeBytes: 500 },
        limits: { maxItems: 3, maxSizeBytes: null } // Need to evict 3 items
      };

      const toEvict = strategy.selectForEviction(metadataProvider, context);
      expect(toEvict).toHaveLength(3);
      expect(toEvict[0]).toBe('rapid0'); // First added
      expect(toEvict[1]).toBe('rapid1'); // Second added
      expect(toEvict[2]).toBe('rapid2'); // Third added
    });

    it('should maintain correct eviction order with mixed operations', () => {
      // Add first item
      strategy.onItemAdded('first', 100, metadataProvider);

      // Add second item
      strategy.onItemAdded('second', 100, metadataProvider);

      // Access first item multiple times (shouldn't affect FIFO order)
      strategy.onItemAccessed('first', metadataProvider);
      strategy.onItemAccessed('first', metadataProvider);

      // Add third item
      strategy.onItemAdded('third', 100, metadataProvider);

      const context: EvictionContext = {
        currentSize: { itemCount: 3, sizeBytes: 300 },
        limits: { maxItems: 1, maxSizeBytes: null } // Need to evict all but 1
      };

      const toEvict = strategy.selectForEviction(metadataProvider, context);
      expect(toEvict).toHaveLength(3);
      expect(toEvict[0]).toBe('first'); // Should still be first to evict despite multiple accesses
      expect(toEvict[1]).toBe('second');
      expect(toEvict[2]).toBe('third');
    });

    it('should handle size-based eviction correctly', () => {
      metadataProvider.setMetadata('small1', createMockMetadata('small1', 1000, 1000, 1, 50));
      metadataProvider.setMetadata('large', createMockMetadata('large', 2000, 2000, 1, 200));
      metadataProvider.setMetadata('small2', createMockMetadata('small2', 3000, 3000, 1, 50));

      const context: EvictionContext = {
        currentSize: { itemCount: 3, sizeBytes: 300 },
        limits: { maxItems: null, maxSizeBytes: 250 },
        newItemSize: 100 // Would exceed size limit
      };

      const toEvict = strategy.selectForEviction(metadataProvider, context);
      expect(toEvict.length).toBeGreaterThan(0);
      expect(toEvict[0]).toBe('small1'); // Oldest added should be evicted first
    });

    it('should demonstrate FIFO behavior vs LRU behavior', () => {
      // Create scenario where FIFO and LRU would behave differently
      metadataProvider.setMetadata('oldest', createMockMetadata('oldest', 1000, 1000, 1)); // Oldest added, not accessed recently
      metadataProvider.setMetadata('middle', createMockMetadata('middle', 2000, 2000, 1)); // Middle age
      metadataProvider.setMetadata('newest', createMockMetadata('newest', 3000, 3000, 1)); // Newest added

      // Access oldest item recently (LRU would keep it, FIFO should evict it)
      strategy.onItemAccessed('oldest', metadataProvider);
      const updatedOldest = metadataProvider.getMetadata('oldest')!;
      updatedOldest.lastAccessedAt = Date.now(); // Make it most recently accessed
      metadataProvider.setMetadata('oldest', updatedOldest);

      const context: EvictionContext = {
        currentSize: { itemCount: 3, sizeBytes: 300 },
        limits: { maxItems: 2, maxSizeBytes: null }
      };

      const toEvict = strategy.selectForEviction(metadataProvider, context);
      expect(toEvict).toHaveLength(2);
      expect(toEvict[0]).toBe('oldest'); // FIFO evicts oldest added, regardless of recent access
      expect(toEvict[1]).toBe('middle');
    });
  });
});
