import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Cache, createCache } from '../../src/Cache';
import { createCoordinate, createRegistry } from '@fjell/registry';
import { Item, PriKey } from '@fjell/core';

// Test data types
interface Widget extends Item<'widget'> {
  pk: string;
  name: string;
  description: string;
}

// Test utility to wait for async operations
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('TTL Persistence Integration', () => {
  let cache: Cache<Widget, 'widget'>;
  let registry: any;
  let api: any;

  beforeEach(() => {
    registry = createRegistry('widget');

    // Mock API
    let mockData: Widget[] = [];
    let callCount = 0;

    api = {
      get: vi.fn().mockImplementation(async (key: PriKey<'widget'>) => {
        callCount++;
        return mockData.find(w => w.pk === key.pk) || null;
      }),
      set: vi.fn(),
      delete: vi.fn(),
      all: vi.fn(),
      one: vi.fn(),
      find: vi.fn(),
      findOne: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      action: vi.fn(),
      allAction: vi.fn(),
      facet: vi.fn(),
      allFacet: vi.fn(),
      setMockData: (data: Widget[]) => { mockData = data; },
      getCallCount: () => callCount
    };

    // Create cache with IndexedDB and TTL enabled
    cache = createCache(
      api,
      createCoordinate('widget'),
      registry,
      {
        cacheType: 'indexedDB',
        indexedDBConfig: {
          dbName: 'test-ttl-integration',
          storeName: 'widgets',
          version: 1
        },
        ttl: 2000, // 2 seconds for testing
        enableDebugLogging: true
      }
    );
  });

  afterEach(async () => {
    cache.destroy();
    // Note: IndexedDB cleanup skipped in test environment
  });

  it('should persist TTL metadata and validate expiration across cache lifecycle', async () => {
    const widget: Widget = {
      pk: 'ttl-test-widget',
      key: { kt: 'widget', pk: 'ttl-test-widget' },
      name: 'TTL Test Widget',
      description: 'Widget for testing TTL persistence',
      events: {
        created: { at: new Date() },
        updated: { at: new Date() },
        deleted: { at: null }
      }
    };

    // Mock API to return our widget
    api.setMockData([widget]);

    // Get widget from API (should cache it with TTL)
    const result1 = await cache.operations.get(widget.key);
    expect(result1).toEqual(widget);

    // Verify TTL is set
    const cacheInfo = cache.getCacheInfo();
    expect(cacheInfo.supportsTTL).toBe(true);
    expect(cacheInfo.defaultTTL).toBe(2000);

    // Check metadata exists
    const keyStr = JSON.stringify(widget.key);
    const metadata = await cache.cacheMap.getMetadata(keyStr);
    expect(metadata).toBeTruthy();
    expect(metadata?.addedAt).toBeGreaterThan(0);

    // Check TTL info
    const ttlInfo = await cache.ttlManager.getItemTTLInfo(keyStr, cache.cacheMap);
    expect(ttlInfo.hasTTL).toBe(true);
    expect(ttlInfo.ttl).toBe(2000);
    expect(ttlInfo.isExpired).toBe(false);
    expect(ttlInfo.remainingTTL).toBeGreaterThan(0);

    // Wait for sync to persistent storage
    await wait(300);

    // Get again - should hit cache (no new API call)
    const originalGetCount = api.getCallCount();
    const result2 = await cache.operations.get(widget.key);
    expect(result2).toEqual(widget);
    expect(api.getCallCount()).toBe(originalGetCount); // No new API call

    // Wait for TTL to expire
    await wait(2200);

    // Check that item is now expired
    const expiredTTLInfo = await cache.ttlManager.getItemTTLInfo(keyStr, cache.cacheMap);
    expect(expiredTTLInfo.isExpired).toBe(true);
    expect(expiredTTLInfo.remainingTTL).toBe(0);

    // Get again - should fetch from API since expired
    const result3 = await cache.operations.get(widget.key);
    expect(result3).toEqual(widget);
    expect(api.getCallCount()).toBe(originalGetCount + 1); // New API call due to expiration
  });

  it('should handle TTL metadata across different cache implementations', async () => {
    const widget: Widget = {
      pk: 'multi-impl-widget',
      key: { kt: 'widget', pk: 'multi-impl-widget' },
      name: 'Multi Implementation Widget',
      description: 'Widget for testing across implementations',
      events: {
        created: { at: new Date() },
        updated: { at: new Date() },
        deleted: { at: null }
      }
    };

    // Test with memory cache first
    const memoryCache = createCache(
      api,
      createCoordinate('widget'),
      registry,
      {
        cacheType: 'memory',
        ttl: 1000,
        enableDebugLogging: true
      }
    );

    api.setMockData([widget]);

    const memoryResult = await memoryCache.operations.get(widget.key);
    expect(memoryResult).toEqual(widget);

    const memoryKeyStr = JSON.stringify(widget.key);
    const memoryTTLInfo = await memoryCache.ttlManager.getItemTTLInfo(memoryKeyStr, memoryCache.cacheMap);
    expect(memoryTTLInfo.hasTTL).toBe(true);
    expect(memoryTTLInfo.ttl).toBe(1000);

    // Test with IndexedDB cache
    const indexedDBResult = await cache.operations.get(widget.key);
    expect(indexedDBResult).toEqual(widget);

    const indexedDBKeyStr = JSON.stringify(widget.key);
    const indexedDBTTLInfo = await cache.ttlManager.getItemTTLInfo(indexedDBKeyStr, cache.cacheMap);
    expect(indexedDBTTLInfo.hasTTL).toBe(true);
    expect(indexedDBTTLInfo.ttl).toBe(2000);

    // Both should have valid TTL but different values
    expect(memoryTTLInfo.ttl).not.toBe(indexedDBTTLInfo.ttl);
    expect(memoryTTLInfo.isExpired).toBe(false);
    expect(indexedDBTTLInfo.isExpired).toBe(false);

    memoryCache.destroy();
  });

  it('should maintain eviction metadata alongside TTL data', async () => {
    // Create cache with both TTL and eviction
    const evictionCache = createCache(
      api,
      createCoordinate('widget'),
      registry,
      {
        cacheType: 'indexedDB',
        indexedDBConfig: {
          dbName: 'test-eviction-ttl',
          storeName: 'widgets',
          version: 1
        },
        ttl: 5000, // 5 seconds
        evictionConfig: {
          type: 'lru'
        },
        memoryConfig: {
          maxItems: 2 // Small limit to trigger eviction
        },
        enableDebugLogging: true
      }
    );

    const widgets: Widget[] = [
      {
        pk: 'eviction-widget-1',
        key: { kt: 'widget', pk: 'eviction-widget-1' },
        name: 'Eviction Widget 1',
        description: 'First widget',
        events: {
          created: { at: new Date() },
          updated: { at: new Date() },
          deleted: { at: null }
        }
      },
      {
        pk: 'eviction-widget-2',
        key: { kt: 'widget', pk: 'eviction-widget-2' },
        name: 'Eviction Widget 2',
        description: 'Second widget',
        events: {
          created: { at: new Date() },
          updated: { at: new Date() },
          deleted: { at: null }
        }
      },
      {
        pk: 'eviction-widget-3',
        key: { kt: 'widget', pk: 'eviction-widget-3' },
        name: 'Eviction Widget 3',
        description: 'Third widget (should trigger eviction)',
        events: {
          created: { at: new Date() },
          updated: { at: new Date() },
          deleted: { at: null }
        }
      }
    ];

    api.setMockData(widgets);

    // Add widgets to cache
    await evictionCache.operations.get(widgets[0].key);
    await evictionCache.operations.get(widgets[1].key);

    // Check that both have TTL and eviction metadata
    const key1Str = JSON.stringify(widgets[0].key);
    const key2Str = JSON.stringify(widgets[1].key);

    const metadata1 = await evictionCache.cacheMap.getMetadata(key1Str);
    const metadata2 = await evictionCache.cacheMap.getMetadata(key2Str);

    expect(metadata1).toBeTruthy();
    expect(metadata2).toBeTruthy();
    expect(metadata1?.accessCount).toBeGreaterThan(0);
    expect(metadata2?.accessCount).toBeGreaterThan(0);

    const ttlInfo1 = await evictionCache.ttlManager.getItemTTLInfo(key1Str, evictionCache.cacheMap);
    const ttlInfo2 = await evictionCache.ttlManager.getItemTTLInfo(key2Str, evictionCache.cacheMap);

    expect(ttlInfo1.hasTTL).toBe(true);
    expect(ttlInfo2.hasTTL).toBe(true);

    // Add third widget (should trigger eviction of first due to LRU)
    await evictionCache.operations.get(widgets[2].key);

    await wait(100); // Wait for eviction processing

    // Verify eviction occurred but TTL metadata is consistent
    const key3Str = JSON.stringify(widgets[2].key);
    const ttlInfo3 = await evictionCache.ttlManager.getItemTTLInfo(key3Str, evictionCache.cacheMap);
    expect(ttlInfo3.hasTTL).toBe(true);

    evictionCache.destroy();
    // Note: IndexedDB cleanup skipped in test environment
  });
});
