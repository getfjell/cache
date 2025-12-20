import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryCacheMap } from '../src/memory/MemoryCacheMap';
import { EnhancedMemoryCacheMap } from '../src/memory/EnhancedMemoryCacheMap';
import { LocalStorageCacheMap } from '../src/browser/LocalStorageCacheMap';
import { SessionStorageCacheMap } from '../src/browser/SessionStorageCacheMap';
import { IndexDBCacheMap } from '../src/browser/IndexDBCacheMap';
import { Item } from '@fjell/types';

describe('CacheMap Implementation Types', () => {
  interface TestItem extends Item<'test'> {
    id: string;
    name: string;
    value: number;
  }

  describe('Implementation type consistency', () => {
    it('should have consistent implementation types across all CacheMap implementations', () => {
      const implementations = [
        { factory: () => new MemoryCacheMap<TestItem, 'test'>(['test']), expectedType: 'memory/memory' },
        { factory: () => new EnhancedMemoryCacheMap<TestItem, 'test'>(['test']), expectedType: 'memory/enhanced' },
        { factory: () => new LocalStorageCacheMap<TestItem, 'test'>(['test'], 'test-cache-info'), expectedType: 'browser/localStorage' },
        { factory: () => new SessionStorageCacheMap<TestItem, 'test'>(['test'], 'test-cache-info'), expectedType: 'browser/sessionStorage' },
        { factory: () => new IndexDBCacheMap<TestItem, 'test'>(['test']), expectedType: 'browser/indexedDB' }
      ];

      implementations.forEach(({ factory, expectedType }) => {
        const cacheMap = factory();
        expect(cacheMap.implementationType).toBe(expectedType);
      });
    });

    it('should support metadata provider interface on all implementations', () => {
      const implementations = [
        () => new MemoryCacheMap<TestItem, 'test'>(['test']),
        () => new EnhancedMemoryCacheMap<TestItem, 'test'>(['test']),
        () => new LocalStorageCacheMap<TestItem, 'test'>(['test'], 'test-cache-metadata'),
        () => new SessionStorageCacheMap<TestItem, 'test'>(['test'], 'test-cache-metadata'),
        () => new IndexDBCacheMap<TestItem, 'test'>(['test'])
      ];

      implementations.forEach(createCacheMap => {
        const cacheMap = createCacheMap();

        // Check metadata provider methods exist
        expect(typeof cacheMap.getMetadata).toBe('function');
        expect(typeof cacheMap.setMetadata).toBe('function');
        expect(typeof cacheMap.deleteMetadata).toBe('function');
        expect(typeof cacheMap.getAllMetadata).toBe('function');
        expect(typeof cacheMap.clearMetadata).toBe('function');
        expect(typeof cacheMap.getCurrentSize).toBe('function');
        expect(typeof cacheMap.getSizeLimits).toBe('function');
      });
    });
  });

  describe('MemoryCacheMap metadata operations', () => {
    let cache: MemoryCacheMap<TestItem, 'test'>;

    beforeEach(() => {
      cache = new MemoryCacheMap<TestItem, 'test'>(['test']);
    });

    it('should support metadata operations', async () => {
      const metadata = {
        key: 'test-key',
        addedAt: Date.now(),
        lastAccessedAt: Date.now(),
        accessCount: 1,
        estimatedSize: 100
      };

      // Set metadata
      await cache.setMetadata('test-key', metadata);

      // Get metadata
      const retrieved = await cache.getMetadata('test-key');
      expect(retrieved).toEqual(metadata);

      // Get all metadata
      const allMetadata = await cache.getAllMetadata();
      expect(allMetadata.size).toBe(1);
      expect(allMetadata.get('test-key')).toEqual(metadata);

      // Delete metadata
      await cache.deleteMetadata('test-key');
      expect(await cache.getMetadata('test-key')).toBeNull();
    });

    it('should provide size information', async () => {
      const sizeInfo = await cache.getCurrentSize();
      expect(typeof sizeInfo.itemCount).toBe('number');
      expect(typeof sizeInfo.sizeBytes).toBe('number');

      const limits = await cache.getSizeLimits();
      expect(limits.maxItems).toBeNull();
      expect(limits.maxSizeBytes).toBeNull();
    });
  });

});
