import { beforeEach, describe, expect, it } from 'vitest';
import { EvictionManager } from '../../src/eviction/EvictionManager';
import { LRUEvictionStrategy } from '../../src/eviction/strategies/LRUEvictionStrategy';
import { CacheItemMetadata, CacheMapMetadataProvider } from '../../src/eviction/EvictionStrategy';

// Mock metadata provider for testing
class MockMetadataProvider implements CacheMapMetadataProvider {
  private metadata: Map<string, CacheItemMetadata> = new Map();
  private currentSize = { itemCount: 0, sizeBytes: 0 };
  private sizeLimits = { maxItems: null as number | null, maxSizeBytes: null as number | null };

  getMetadata(key: string): CacheItemMetadata | null {
    return this.metadata.get(key) || null;
  }

  setMetadata(key: string, metadata: CacheItemMetadata): void {
    this.metadata.set(key, metadata);
  }

  deleteMetadata(key: string): void {
    this.metadata.delete(key);
  }

  getAllMetadata(): Map<string, CacheItemMetadata> {
    return new Map(this.metadata);
  }

  clearMetadata(): void {
    this.metadata.clear();
  }

  getCurrentSize() {
    return this.currentSize;
  }

  getSizeLimits() {
    return this.sizeLimits;
  }

  // Test helpers
  setCurrentSize(itemCount: number, sizeBytes: number): void {
    this.currentSize = { itemCount, sizeBytes };
  }

  setSizeLimits(maxItems: number | null, maxSizeBytes: number | null): void {
    this.sizeLimits = { maxItems, maxSizeBytes };
  }
}

describe('EvictionManager', () => {
  let evictionManager: EvictionManager;
  let metadataProvider: MockMetadataProvider;

  beforeEach(() => {
    metadataProvider = new MockMetadataProvider();
  });

  describe('constructor and strategy management', () => {
    it('should create eviction manager without strategy', () => {
      evictionManager = new EvictionManager();
      expect(evictionManager.isEvictionSupported()).toBe(false);
      expect(evictionManager.getEvictionStrategyName()).toBeNull();
    });

    it('should create eviction manager with strategy', () => {
      const strategy = new LRUEvictionStrategy();
      evictionManager = new EvictionManager(strategy);
      expect(evictionManager.isEvictionSupported()).toBe(true);
      expect(evictionManager.getEvictionStrategyName()).toBe('lru');
    });

    it('should set and update eviction strategy', () => {
      evictionManager = new EvictionManager();
      expect(evictionManager.isEvictionSupported()).toBe(false);

      const strategy = new LRUEvictionStrategy();
      evictionManager.setEvictionStrategy(strategy);
      expect(evictionManager.isEvictionSupported()).toBe(true);
      expect(evictionManager.getEvictionStrategyName()).toBe('lru');

      evictionManager.setEvictionStrategy(null);
      expect(evictionManager.isEvictionSupported()).toBe(false);
    });
  });

  describe('item lifecycle events', () => {
    beforeEach(() => {
      const strategy = new LRUEvictionStrategy();
      evictionManager = new EvictionManager(strategy);
    });

    it('should handle item access', () => {
      const now = Date.now();
      const metadata: CacheItemMetadata = {
        key: 'test-key',
        addedAt: now - 1000,
        lastAccessedAt: now - 1000,
        accessCount: 1,
        estimatedSize: 100
      };
      metadataProvider.setMetadata('test-key', metadata);

      evictionManager.onItemAccessed('test-key', metadataProvider);

      const updatedMetadata = metadataProvider.getMetadata('test-key');
      expect(updatedMetadata).not.toBeNull();
      expect(updatedMetadata!.lastAccessedAt).toBeGreaterThan(now - 1000);
      expect(updatedMetadata!.accessCount).toBe(2);
    });

    it('should handle item addition and eviction', () => {
      // Set up a cache with limits that will trigger eviction
      metadataProvider.setSizeLimits(2, null);
      metadataProvider.setCurrentSize(2, 200);

      // Add existing items
      const now = Date.now();
      metadataProvider.setMetadata('old-key-1', {
        key: 'old-key-1',
        addedAt: now - 2000,
        lastAccessedAt: now - 2000,
        accessCount: 1,
        estimatedSize: 100
      });
      metadataProvider.setMetadata('old-key-2', {
        key: 'old-key-2',
        addedAt: now - 1000,
        lastAccessedAt: now - 1000,
        accessCount: 1,
        estimatedSize: 100
      });

      const testValue = { id: 'new-item', data: 'test' };
      const evictedKeys = evictionManager.onItemAdded('new-key', testValue, metadataProvider);

      // Should evict the least recently used item
      expect(evictedKeys).toEqual(['old-key-1']);

      // New item metadata should be added
      const newMetadata = metadataProvider.getMetadata('new-key');
      expect(newMetadata).not.toBeNull();
      expect(newMetadata!.key).toBe('new-key');
    });

    it('should handle item removal', () => {
      const metadata: CacheItemMetadata = {
        key: 'test-key',
        addedAt: Date.now(),
        lastAccessedAt: Date.now(),
        accessCount: 1,
        estimatedSize: 100
      };
      metadataProvider.setMetadata('test-key', metadata);

      evictionManager.onItemRemoved('test-key', metadataProvider);

      expect(metadataProvider.getMetadata('test-key')).toBeNull();
    });

    it('should handle operations without strategy gracefully', () => {
      evictionManager = new EvictionManager(); // No strategy

      // These should not throw and return empty results
      const evictedKeys = evictionManager.onItemAdded('key', { test: 'value' }, metadataProvider);
      expect(evictedKeys).toEqual([]);

      evictionManager.onItemAccessed('key', metadataProvider);
      evictionManager.onItemRemoved('key', metadataProvider);

      const manualEvicted = evictionManager.performEviction(metadataProvider);
      expect(manualEvicted).toEqual([]);
    });
  });

  describe('manual eviction', () => {
    beforeEach(() => {
      const strategy = new LRUEvictionStrategy();
      evictionManager = new EvictionManager(strategy);
    });

    it('should perform manual eviction when limits exceeded', () => {
      // Set up cache with size limits
      metadataProvider.setSizeLimits(1, null);
      metadataProvider.setCurrentSize(2, 200);

      const now = Date.now();
      metadataProvider.setMetadata('key-1', {
        key: 'key-1',
        addedAt: now - 2000,
        lastAccessedAt: now - 2000,
        accessCount: 1,
        estimatedSize: 100
      });
      metadataProvider.setMetadata('key-2', {
        key: 'key-2',
        addedAt: now - 1000,
        lastAccessedAt: now - 1000,
        accessCount: 1,
        estimatedSize: 100
      });

      const evictedKeys = evictionManager.performEviction(metadataProvider);

      // Should evict items to get within limits (1 item max, 2 items present, so evict 1)
      // LRU strategy will evict the oldest (key-1) first, but may need to evict more
      expect(evictedKeys).toContain('key-1');
      expect(evictedKeys.length).toBeGreaterThanOrEqual(1);
    });

    it('should not evict when within limits', () => {
      metadataProvider.setSizeLimits(5, null);
      metadataProvider.setCurrentSize(2, 200);

      const now = Date.now();
      metadataProvider.setMetadata('key-1', {
        key: 'key-1',
        addedAt: now,
        lastAccessedAt: now,
        accessCount: 1,
        estimatedSize: 100
      });

      const evictedKeys = evictionManager.performEviction(metadataProvider);
      expect(evictedKeys).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('should handle strategy errors gracefully', () => {
      // Create a strategy that throws errors
      const faultyStrategy = {
        selectForEviction: () => { throw new Error('Strategy error'); },
        onItemAccessed: () => { throw new Error('Strategy error'); },
        onItemAdded: () => { throw new Error('Strategy error'); },
        onItemRemoved: () => { throw new Error('Strategy error'); },
        getStrategyName: () => 'faulty'
      };

      evictionManager = new EvictionManager(faultyStrategy as any);

      // These should not throw, errors should be logged
      expect(() => {
        evictionManager.onItemAccessed('key', metadataProvider);
        evictionManager.onItemAdded('key', { test: 'value' }, metadataProvider);
        evictionManager.onItemRemoved('key', metadataProvider);
        evictionManager.performEviction(metadataProvider);
      }).not.toThrow();
    });
  });
});
