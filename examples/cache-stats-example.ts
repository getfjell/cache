import { createCache } from '../src';
import { createPItemApi } from '@fjell/client-api';
import { createCoordinate, createRegistry } from '@fjell/registry';
import { Item, PriKey } from '@fjell/core';

// Define a simple widget type for demonstration
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

/**
 * Demonstrates cache statistics tracking functionality
 * Shows how to monitor cache requests, hits, misses, and subscription activity
 */
async function cacheStatsExample() {
  console.log('Cache Statistics Example');
  console.log('========================\n');

  // Create registry and API with proper mock implementation
  const registry = createRegistry('cache');
  const api = createPItemApi<Widget, 'widget'>({
    httpGet: (path: string) => {
      // Mock HTTP GET with immediate response to prevent hanging
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
    },
    httpPost: () => Promise.resolve({}),
    httpPut: () => Promise.resolve({}),
    httpDelete: () => Promise.resolve(true),
    httpPostFile: () => Promise.resolve({}),
    uploadAsync: () => Promise.resolve({}),
    httpOptions: () => Promise.resolve({}),
    httpConnect: () => Promise.resolve({}),
    httpTrace: () => Promise.resolve({}),
    httpPatch: () => Promise.resolve({})
  } as any, 'widget', 'widgets');

  // Create coordinate for widgets
  const coordinate = createCoordinate(['widget'], []);

  // Create cache with default options
  const cache = createCache(api, coordinate, registry);

  // Initial stats (should be all zeros)
  console.log('Initial Stats:');
  console.log(cache.getStats());
  console.log('');

  // Test subscription tracking
  console.log('Testing subscription tracking...');
  const subscription1 = cache.subscribe((event) => {
    console.log('Event received:', event.type);
  });

  const subscription2 = cache.subscribe((event) => {
    console.log('Another event received:', event.type);
  });

  console.log('After 2 subscriptions:');
  console.log(cache.getStats());
  console.log('');

  // Test unsubscription tracking
  console.log('Testing unsubscription tracking...');
  cache.unsubscribe(subscription1);

  console.log('After 1 unsubscription:');
  console.log(cache.getStats());
  console.log('');

  // Test cache operations (this will mostly be cache misses since we don't have a real API)
  console.log('Testing cache operations...');

  try {
    // This will be a cache miss and likely throw an error due to no API server
    await cache.operations.get({ kt: 'widget', pk: 'widget-1' } as PriKey<'widget'>);
  } catch (error) {
    console.log('Expected error from missing API server');
  }

  try {
    // Another cache miss
    await cache.operations.retrieve({ kt: 'widget', pk: 'widget-2' } as PriKey<'widget'>);
  } catch (error) {
    console.log('Expected error from missing API server');
  }

  console.log('After cache operations:');
  console.log(cache.getStats());
  console.log('');

  // Test setting an item directly in cache (this creates a hit scenario)
  console.log('Setting item directly in cache...');
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

  await cache.operations.set({ kt: 'widget', pk: 'widget-3' } as PriKey<'widget'>, widget);

  // Now retrieve it (should be a cache hit)
  const result = await cache.operations.retrieve({ kt: 'widget', pk: 'widget-3' } as PriKey<'widget'>);
  const retrievedWidget = result?.[1];
  console.log('Retrieved widget:', retrievedWidget?.name);

  console.log('Final stats after cache hit:');
  const finalStats = cache.getStats();
  console.log(finalStats);
  console.log('');

  // Calculate hit ratio
  const hitRatio = finalStats.numRequests > 0
    ? (finalStats.numHits / finalStats.numRequests * 100).toFixed(1)
    : '0.0';

  console.log(`Cache Hit Ratio: ${hitRatio}%`);
  console.log(`Total Requests: ${finalStats.numRequests}`);
  console.log(`Cache Hits: ${finalStats.numHits}`);
  console.log(`Cache Misses: ${finalStats.numMisses}`);
  console.log(`Active Subscriptions: ${finalStats.activeSubscriptions}`);
  console.log(`Total Subscriptions: ${finalStats.numSubscriptions}`);
  console.log(`Total Unsubscriptions: ${finalStats.numUnsubscriptions}`);

  // Clean up
  cache.unsubscribe(subscription2);
  cache.destroy();

  console.log('\nExample completed successfully!');
}

// Export for testing
export { cacheStatsExample };

// Run if this file is executed directly
if (require.main === module) {
  cacheStatsExample().catch(console.error);
}
