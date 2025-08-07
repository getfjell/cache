import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RandomEvictionStrategy } from '../../../src/eviction/strategies/RandomEvictionStrategy';
import { CacheItemMetadata } from '../../../src/eviction/EvictionStrategy';

describe('RandomEvictionStrategy', () => {
  let strategy: RandomEvictionStrategy;

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
    strategy = new RandomEvictionStrategy();
  });

  describe('selectForEviction', () => {
    it('should return null for empty cache', () => {
      const items = new Map<string, CacheItemMetadata>();

      const result = strategy.selectForEviction(items);

      expect(result).toBeNull();
    });

    it('should return the only key when cache has single item', () => {
      const items = new Map<string, CacheItemMetadata>([
        ['key1', createMockMetadata('key1')]
      ]);

      const result = strategy.selectForEviction(items);

      expect(result).toBe('key1');
    });

    it('should return a valid key when cache has multiple items', () => {
      const items = new Map<string, CacheItemMetadata>([
        ['key1', createMockMetadata('key1')],
        ['key2', createMockMetadata('key2')],
        ['key3', createMockMetadata('key3')]
      ]);

      const result = strategy.selectForEviction(items);

      expect(result).not.toBeNull();
      expect(items.has(result!)).toBe(true);
    });

    it('should demonstrate randomness by selecting different keys over multiple calls', () => {
      // Mock Math.random to control randomness for testing
      const originalRandom = Math.random;
      const mockValues = [0.1, 0.5, 0.9]; // Different random values
      let callCount = 0;

      vi.spyOn(Math, 'random').mockImplementation(() => {
        return mockValues[callCount++ % mockValues.length];
      });

      const items = new Map<string, CacheItemMetadata>([
        ['key1', createMockMetadata('key1')],
        ['key2', createMockMetadata('key2')],
        ['key3', createMockMetadata('key3')]
      ]);

      const results = new Set<string>();

      // Call multiple times to see different selections
      for (let i = 0; i < 6; i++) {
        const result = strategy.selectForEviction(items);
        results.add(result!);
      }

      // Should have selected different keys
      expect(results.size).toBeGreaterThan(1);

      // Restore original Math.random
      Math.random = originalRandom;
    });
  });

  describe('onItemAccessed', () => {
    it('should update lastAccessedAt and increment accessCount', () => {
      const metadata = createMockMetadata('key1', 1000, 5);
      const originalTime = Date.now();

      vi.spyOn(Date, 'now').mockReturnValue(originalTime + 1000);

      strategy.onItemAccessed('key1', metadata);

      expect(metadata.lastAccessedAt).toBe(originalTime + 1000);
      expect(metadata.accessCount).toBe(6);
    });

    it('should handle multiple accesses correctly', () => {
      const metadata = createMockMetadata('key1', 1000, 1);

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      strategy.onItemAccessed('key1', metadata);

      vi.spyOn(Date, 'now').mockReturnValue(3000);
      strategy.onItemAccessed('key1', metadata);

      expect(metadata.lastAccessedAt).toBe(3000);
      expect(metadata.accessCount).toBe(3);
    });
  });

  describe('onItemAdded', () => {
    it('should initialize metadata correctly', () => {
      const metadata = createMockMetadata('key1');
      const currentTime = 5000;

      vi.spyOn(Date, 'now').mockReturnValue(currentTime);

      strategy.onItemAdded('key1', metadata);

      expect(metadata.addedAt).toBe(currentTime);
      expect(metadata.lastAccessedAt).toBe(currentTime);
      expect(metadata.accessCount).toBe(1);
    });

    it('should handle adding multiple items', () => {
      const metadata1 = createMockMetadata('key1');
      const metadata2 = createMockMetadata('key2');

      vi.spyOn(Date, 'now').mockReturnValue(1000);
      strategy.onItemAdded('key1', metadata1);

      vi.spyOn(Date, 'now').mockReturnValue(2000);
      strategy.onItemAdded('key2', metadata2);

      expect(metadata1.addedAt).toBe(1000);
      expect(metadata1.lastAccessedAt).toBe(1000);
      expect(metadata1.accessCount).toBe(1);

      expect(metadata2.addedAt).toBe(2000);
      expect(metadata2.lastAccessedAt).toBe(2000);
      expect(metadata2.accessCount).toBe(1);
    });
  });

  describe('onItemRemoved', () => {
    it('should complete without throwing errors', () => {
      expect(() => strategy.onItemRemoved()).not.toThrow();
    });
  });

  describe('integration behavior', () => {
    it('should work with typical cache operations', () => {
      const items = new Map<string, CacheItemMetadata>();

      // Add some items
      const metadata1 = createMockMetadata('key1');
      const metadata2 = createMockMetadata('key2');
      const metadata3 = createMockMetadata('key3');

      items.set('key1', metadata1);
      items.set('key2', metadata2);
      items.set('key3', metadata3);

      strategy.onItemAdded('key1', metadata1);
      strategy.onItemAdded('key2', metadata2);
      strategy.onItemAdded('key3', metadata3);

      // Access some items
      strategy.onItemAccessed('key1', metadata1);
      strategy.onItemAccessed('key2', metadata2);

      // Select for eviction should return a valid key
      const evictionKey = strategy.selectForEviction(items);
      expect(evictionKey).not.toBeNull();
      expect(items.has(evictionKey!)).toBe(true);

      // Remove the item
      strategy.onItemRemoved();
      items.delete(evictionKey!);

      // Should still work with remaining items
      const nextEvictionKey = strategy.selectForEviction(items);
      expect(nextEvictionKey).not.toBeNull();
      expect(items.has(nextEvictionKey!)).toBe(true);
    });
  });
});
