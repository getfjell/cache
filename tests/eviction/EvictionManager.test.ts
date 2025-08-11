import { beforeEach, describe, expect, it } from 'vitest';
import { EvictionManager } from '../../src/eviction/EvictionManager';
import { LRUEvictionStrategy } from '../../src/eviction/strategies/LRUEvictionStrategy';
import { CacheItemMetadata } from '../../src/eviction/EvictionStrategy';
import { MockMetadataProvider } from '../utils/MockMetadataProvider';

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

    it('should handle item access', async () => {
      const now = Date.now();
      const metadata: CacheItemMetadata = {
        key: 'test-key',
        addedAt: now - 1000,
        lastAccessedAt: now - 1000,
        accessCount: 1,
        estimatedSize: 100
      };
      await metadataProvider.setMetadata('test-key', metadata);

      await evictionManager.onItemAccessed('test-key', metadataProvider);

      const updatedMetadata = await metadataProvider.getMetadata('test-key');
      expect(updatedMetadata).not.toBeNull();
      expect(updatedMetadata!.lastAccessedAt).toBeGreaterThan(now - 1000);
      expect(updatedMetadata!.accessCount).toBe(2);
    });

    it('should handle item addition and eviction', async () => {
      // Set up a cache with limits that will trigger eviction
      metadataProvider.setSizeLimits(2, null);

      // Add existing items first (this will update the count automatically)
      const now = Date.now();
      await metadataProvider.setMetadata('old-key-1', {
        key: 'old-key-1',
        addedAt: now - 2000,
        lastAccessedAt: now - 2000,
        accessCount: 1,
        estimatedSize: 100
      });
      await metadataProvider.setMetadata('old-key-2', {
        key: 'old-key-2',
        addedAt: now - 1000,
        lastAccessedAt: now - 1000,
        accessCount: 1,
        estimatedSize: 100
      });

      const testValue = { id: 'new-item', data: 'test' };
      const evictedKeys = await evictionManager.onItemAdded('new-key', testValue, metadataProvider);

      // Should evict the least recently used item
      expect(evictedKeys).toEqual(['old-key-1']);

      // New item metadata should be added
      const newMetadata = await metadataProvider.getMetadata('new-key');
      expect(newMetadata).not.toBeNull();
      expect(newMetadata!.key).toBe('new-key');
    });

    it('should handle item removal', async () => {
      const metadata: CacheItemMetadata = {
        key: 'test-key',
        addedAt: Date.now(),
        lastAccessedAt: Date.now(),
        accessCount: 1,
        estimatedSize: 100
      };
      await metadataProvider.setMetadata('test-key', metadata);

      await evictionManager.onItemRemoved('test-key', metadataProvider);

      expect(await metadataProvider.getMetadata('test-key')).toBeNull();
    });

    it('should handle operations without strategy gracefully', async () => {
      evictionManager = new EvictionManager(); // No strategy

      // These should not throw and return empty results
      const evictedKeys = await evictionManager.onItemAdded('key', { test: 'value' }, metadataProvider);
      expect(evictedKeys).toEqual([]);

      await evictionManager.onItemAccessed('key', metadataProvider);
      await evictionManager.onItemRemoved('key', metadataProvider);

      const manualEvicted = await evictionManager.performEviction(metadataProvider);
      expect(manualEvicted).toEqual([]);
    });
  });

  describe('manual eviction', () => {
    beforeEach(() => {
      const strategy = new LRUEvictionStrategy();
      evictionManager = new EvictionManager(strategy);
    });

    it('should perform manual eviction when limits exceeded', async () => {
      // Set up cache with size limits
      metadataProvider.setSizeLimits(1, null);
      metadataProvider.setCurrentSize(2, 200);

      const now = Date.now();
      await metadataProvider.setMetadata('key-1', {
        key: 'key-1',
        addedAt: now - 2000,
        lastAccessedAt: now - 2000,
        accessCount: 1,
        estimatedSize: 100
      });
      await metadataProvider.setMetadata('key-2', {
        key: 'key-2',
        addedAt: now - 1000,
        lastAccessedAt: now - 1000,
        accessCount: 1,
        estimatedSize: 100
      });

      const evictedKeys = await evictionManager.performEviction(metadataProvider);

      // Should evict items to get within limits (1 item max, 2 items present, so evict 1)
      // LRU strategy will evict the oldest (key-1) first, but may need to evict more
      expect(evictedKeys).toContain('key-1');
      expect(evictedKeys.length).toBeGreaterThanOrEqual(1);
    });

    it('should not evict when within limits', async () => {
      metadataProvider.setSizeLimits(5, null);
      metadataProvider.setCurrentSize(2, 200);

      const now = Date.now();
      await metadataProvider.setMetadata('key-1', {
        key: 'key-1',
        addedAt: now,
        lastAccessedAt: now,
        accessCount: 1,
        estimatedSize: 100
      });

      const evictedKeys = await evictionManager.performEviction(metadataProvider);
      expect(evictedKeys).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('should handle strategy errors gracefully', async () => {
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
      await expect(evictionManager.onItemAccessed('key', metadataProvider)).resolves.toBeUndefined();
      await expect(evictionManager.onItemAdded('key', { test: 'value' }, metadataProvider)).resolves.toEqual([]);
      expect(() => evictionManager.onItemRemoved('key', metadataProvider)).not.toThrow();
      await expect(evictionManager.performEviction(metadataProvider)).resolves.toEqual([]);
    });
  });
});
