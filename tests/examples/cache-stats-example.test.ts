import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cacheStatsExample } from '../../examples/cache-stats-example';
import { createCache } from '../../src';
import { createPItemApi } from '@fjell/client-api';
import { createCoordinate, createRegistry } from '@fjell/registry';
import { Item, PriKey } from '@fjell/core';

// Mock the console.log to capture output
const mockConsoleLog = vi.fn();
const originalConsoleLog = console.log;

// Define the Widget interface for testing
interface Widget extends Item<'widget'> {
  key: PriKey<'widget'>;
  name: string;
  description: string;
  events: {
    created: { at: Date };
    updated: { at: Date };
    deleted: { at: Date | null };
  };
}

// Mock HTTP API for testing
const mockHttpApi = {
  httpGet: vi.fn().mockImplementation((path: string) => {
    // Return mock widget data based on path
    if (path.includes('widget-1')) {
      return Promise.resolve({
        key: { kt: 'widget', pk: 'widget-1' },
        name: 'Widget 1',
        description: 'First test widget',
        events: {
          created: { at: new Date() },
          updated: { at: new Date() },
          deleted: { at: null }
        }
      });
    } else if (path.includes('widget-2')) {
      return Promise.resolve({
        key: { kt: 'widget', pk: 'widget-2' },
        name: 'Widget 2',
        description: 'Second test widget',
        events: {
          created: { at: new Date() },
          updated: { at: new Date() },
          deleted: { at: null }
        }
      });
    } else {
      // Return null for non-existent widgets
      return Promise.resolve(null);
    }
  }),
  httpPost: vi.fn().mockResolvedValue({}),
  httpPut: vi.fn().mockResolvedValue({}),
  httpDelete: vi.fn().mockResolvedValue(true),
  httpPostFile: vi.fn().mockResolvedValue({}),
  uploadAsync: vi.fn().mockResolvedValue({}),
  httpOptions: vi.fn().mockResolvedValue({}),
  httpConnect: vi.fn().mockResolvedValue({}),
  httpTrace: vi.fn().mockResolvedValue({}),
  httpPatch: vi.fn().mockResolvedValue({})
};

describe('Cache Stats Example', () => {
  beforeEach(() => {
    // Mock console.log to capture output
    console.log = mockConsoleLog;
    mockConsoleLog.mockClear();
  });

  afterEach(() => {
    // Restore original console.log
    console.log = originalConsoleLog;
  });

  it('should run the cache stats example successfully', async () => {
    // Run the example
    await cacheStatsExample();

    // Verify that the example ran without throwing errors
    expect(mockConsoleLog).toHaveBeenCalled();

    // Check that the example started correctly
    expect(mockConsoleLog).toHaveBeenCalledWith('Cache Statistics Example');
    expect(mockConsoleLog).toHaveBeenCalledWith('========================\n');
  });

  it('should demonstrate initial cache statistics', async () => {
    // Create the components needed for testing
    const registry = createRegistry('cache');
    const api = createPItemApi<Widget, 'widget'>(mockHttpApi as any, 'widget', 'widgets');
    const coordinate = createCoordinate(['widget'], []);

    // Create cache with default options
    const cache = createCache(api, coordinate, registry);

    // Get initial stats
    const initialStats = cache.getStats();

    // Verify initial stats are all zeros
    expect(initialStats).toEqual({
      numRequests: 0,
      numMisses: 0,
      numHits: 0,
      numSubscriptions: 0,
      numUnsubscriptions: 0,
      activeSubscriptions: 0
    });

    cache.destroy();
  });

  it('should track subscription statistics correctly', async () => {
    const registry = createRegistry('cache');
    const api = createPItemApi<Widget, 'widget'>(mockHttpApi as any, 'widget', 'widgets');
    const coordinate = createCoordinate(['widget'], []);
    const cache = createCache(api, coordinate, registry);

    // Initial stats should be zero
    expect(cache.getStats().numSubscriptions).toBe(0);
    expect(cache.getStats().activeSubscriptions).toBe(0);

    // Create first subscription
    const subscription1 = cache.subscribe(() => { });
    expect(cache.getStats().numSubscriptions).toBe(1);
    expect(cache.getStats().activeSubscriptions).toBe(1);

    // Create second subscription
    const subscription2 = cache.subscribe(() => { });
    expect(cache.getStats().numSubscriptions).toBe(2);
    expect(cache.getStats().activeSubscriptions).toBe(2);

    // Unsubscribe first subscription
    cache.unsubscribe(subscription1);
    expect(cache.getStats().numSubscriptions).toBe(2); // Total subscriptions doesn't decrease
    expect(cache.getStats().numUnsubscriptions).toBe(1);
    expect(cache.getStats().activeSubscriptions).toBe(1);

    // Unsubscribe second subscription
    cache.unsubscribe(subscription2);
    expect(cache.getStats().numSubscriptions).toBe(2);
    expect(cache.getStats().numUnsubscriptions).toBe(2);
    expect(cache.getStats().activeSubscriptions).toBe(0);

    cache.destroy();
  });

  it('should track cache operation statistics', async () => {
    const registry = createRegistry('cache');
    const api = createPItemApi<Widget, 'widget'>(mockHttpApi as any, 'widget', 'widgets');
    const coordinate = createCoordinate(['widget'], []);
    const cache = createCache(api, coordinate, registry);

    // Initial stats
    expect(cache.getStats().numRequests).toBe(0);
    expect(cache.getStats().numMisses).toBe(0);
    expect(cache.getStats().numHits).toBe(0);

    // Test cache operations that will likely fail (no API server)
    try {
      await cache.operations.get({ kt: 'widget', pk: 'widget-1' } as PriKey<'widget'>);
    } catch (error) {
      // Expected error
    }

    try {
      await cache.operations.retrieve({ kt: 'widget', pk: 'widget-2' } as PriKey<'widget'>);
    } catch (error) {
      // Expected error
    }

    // Check that requests were tracked
    const stats = cache.getStats();
    expect(stats.numRequests).toBeGreaterThan(0);
    expect(stats.numMisses).toBeGreaterThan(0);

    cache.destroy();
  });

  it('should demonstrate cache hit scenario', async () => {
    const registry = createRegistry('cache');
    const api = createPItemApi<Widget, 'widget'>(mockHttpApi as any, 'widget', 'widgets');
    const coordinate = createCoordinate(['widget'], []);
    const cache = createCache(api, coordinate, registry);

    // Create a test widget
    const widget: Widget = {
      key: { kt: 'widget', pk: 'widget-3' } as PriKey<'widget'>,
      name: 'Test Widget',
      description: 'A test widget for demonstration',
      events: {
        created: { at: new Date() },
        updated: { at: new Date() },
        deleted: { at: null }
      }
    };

    // Set item in cache
    await cache.operations.set({ kt: 'widget', pk: 'widget-3' } as PriKey<'widget'>, widget);

    // Get stats before retrieval
    const statsBefore = cache.getStats();
    const requestsBefore = statsBefore.numRequests;
    const hitsBefore = statsBefore.numHits;

    // Retrieve the item (should be a cache hit)
    const retrievedWidget = await cache.operations.get({ kt: 'widget', pk: 'widget-3' } as PriKey<'widget'>);

    // Verify the item was retrieved correctly
    expect(retrievedWidget).toBeDefined();
    expect(retrievedWidget?.name).toBe('Test Widget');

    // Check that stats were updated
    const statsAfter = cache.getStats();
    expect(statsAfter.numRequests).toBe(requestsBefore + 1);
    expect(statsAfter.numHits).toBe(hitsBefore + 1);

    cache.destroy();
  });

  it('should calculate hit ratio correctly', async () => {
    const registry = createRegistry('cache');
    const api = createPItemApi<Widget, 'widget'>(mockHttpApi as any, 'widget', 'widgets');
    const coordinate = createCoordinate(['widget'], []);
    const cache = createCache(api, coordinate, registry);

    // Create and set a widget
    const widget: Widget = {
      key: { kt: 'widget', pk: 'widget-1' } as PriKey<'widget'>,
      name: 'Test Widget',
      description: 'A test widget',
      events: {
        created: { at: new Date() },
        updated: { at: new Date() },
        deleted: { at: null }
      }
    };
    await cache.operations.set({ kt: 'widget', pk: 'widget-1' } as PriKey<'widget'>, widget);

    // Perform operations to generate stats
    try {
      await cache.operations.get({ kt: 'widget', pk: 'widget-miss' } as PriKey<'widget'>); // This should be a miss
    } catch (error) {
      // Expected error
    }

    await cache.operations.retrieve({ kt: 'widget', pk: 'widget-1' } as PriKey<'widget'>); // This should be a hit

    // Calculate hit ratio
    const stats = cache.getStats();
    const hitRatio = stats.numRequests > 0
      ? (stats.numHits / stats.numRequests * 100).toFixed(1)
      : '0.0';

    // Verify hit ratio calculation
    expect(stats.numRequests).toBeGreaterThan(0);
    expect(stats.numHits).toBeGreaterThan(0);
    expect(parseFloat(hitRatio)).toBeGreaterThan(0);
    expect(parseFloat(hitRatio)).toBeLessThanOrEqual(100);

    cache.destroy();
  });

  it('should demonstrate complete statistics tracking workflow', async () => {
    const registry = createRegistry('cache');
    const api = createPItemApi<Widget, 'widget'>(mockHttpApi as any, 'widget', 'widgets');
    const coordinate = createCoordinate(['widget'], []);
    const cache = createCache(api, coordinate, registry);

    // Step 1: Initial stats
    const initialStats = cache.getStats();
    expect(initialStats.numRequests).toBe(0);
    expect(initialStats.numHits).toBe(0);
    expect(initialStats.numMisses).toBe(0);
    expect(initialStats.numSubscriptions).toBe(0);
    expect(initialStats.activeSubscriptions).toBe(0);

    // Step 2: Add subscriptions
    const subscription1 = cache.subscribe(() => { });
    const subscription2 = cache.subscribe(() => { });

    const afterSubscriptions = cache.getStats();
    expect(afterSubscriptions.numSubscriptions).toBe(2);
    expect(afterSubscriptions.activeSubscriptions).toBe(2);

    // Step 3: Remove one subscription
    cache.unsubscribe(subscription1);

    const afterUnsubscription = cache.getStats();
    expect(afterUnsubscription.numSubscriptions).toBe(2); // Total doesn't decrease
    expect(afterUnsubscription.numUnsubscriptions).toBe(1);
    expect(afterUnsubscription.activeSubscriptions).toBe(1);

    // Step 4: Perform cache operations
    const widget: Widget = {
      key: { kt: 'widget', pk: 'widget-1' } as PriKey<'widget'>,
      name: 'Test Widget',
      description: 'A test widget',
      events: {
        created: { at: new Date() },
        updated: { at: new Date() },
        deleted: { at: null }
      }
    };
    await cache.operations.set({ kt: 'widget', pk: 'widget-1' } as PriKey<'widget'>, widget);
    await cache.operations.retrieve({ kt: 'widget', pk: 'widget-1' } as PriKey<'widget'>); // Should be a hit

    // Step 5: Final stats
    const finalStats = cache.getStats();
    expect(finalStats.numRequests).toBeGreaterThan(0);
    expect(finalStats.numHits).toBeGreaterThan(0);
    expect(finalStats.numSubscriptions).toBe(2);
    expect(finalStats.numUnsubscriptions).toBe(1);
    expect(finalStats.activeSubscriptions).toBe(1);

    // Clean up
    cache.unsubscribe(subscription2);
    cache.destroy();
  });

  it('should handle cache operations that result in errors gracefully', async () => {
    const registry = createRegistry('cache');
    const api = createPItemApi<Widget, 'widget'>(mockHttpApi as any, 'widget', 'widgets');
    const coordinate = createCoordinate(['widget'], []);
    const cache = createCache(api, coordinate, registry);

    // Test that operations that fail still track statistics
    const statsBefore = cache.getStats();

    try {
      await cache.operations.get({ kt: 'widget', pk: 'non-existent-widget' } as PriKey<'widget'>);
    } catch (error) {
      // Expected error - no API server
    }

    const statsAfter = cache.getStats();

    // Should still track the request even if it failed
    expect(statsAfter.numRequests).toBeGreaterThan(statsBefore.numRequests);

    cache.destroy();
  });

  it('should demonstrate statistics reset functionality', async () => {
    const registry = createRegistry('cache');
    const api = createPItemApi<Widget, 'widget'>(mockHttpApi as any, 'widget', 'widgets');
    const coordinate = createCoordinate(['widget'], []);
    const cache = createCache(api, coordinate, registry);

    // Perform some operations to generate stats
    const subscription = cache.subscribe(() => { });
    cache.unsubscribe(subscription);

    const widget: Widget = {
      key: { kt: 'widget', pk: 'widget-1' } as PriKey<'widget'>,
      name: 'Test Widget',
      description: 'A test widget',
      events: {
        created: { at: new Date() },
        updated: { at: new Date() },
        deleted: { at: null }
      }
    };
    await cache.operations.set({ kt: 'widget', pk: 'widget-1' } as PriKey<'widget'>, widget);
    await cache.operations.retrieve({ kt: 'widget', pk: 'widget-1' } as PriKey<'widget'>);

    // Verify stats were generated
    const statsWithData = cache.getStats();
    expect(statsWithData.numRequests).toBeGreaterThan(0);
    expect(statsWithData.numSubscriptions).toBeGreaterThan(0);

    // Reset stats (this would be done through the stats manager)
    cache.statsManager.reset();

    const statsAfterReset = cache.getStats();
    expect(statsAfterReset.numRequests).toBe(0);
    expect(statsAfterReset.numHits).toBe(0);
    expect(statsAfterReset.numMisses).toBe(0);
    expect(statsAfterReset.numSubscriptions).toBe(0);
    expect(statsAfterReset.numUnsubscriptions).toBe(0);
    expect(statsAfterReset.activeSubscriptions).toBe(0);

    cache.destroy();
  });
});
