import { createInstanceFactory, Options } from '@fjell/cache';
import { createRegistry } from '@fjell/registry';
import { createCItemApi } from '@fjell/client-api';

// Example item interface
interface User {
  key: { kt: 'user'; pk: string };
  id: string;
  name: string;
  email: string;
  createdAt?: Date;
  updatedAt?: Date;
}

async function bypassCacheExample() {
  console.log('🚀 Starting Bypass Cache Example\n');

  // Create registry and API
  const registry = createRegistry();
  const api = createCItemApi<User, 'user', never, never, never, never, never>(
    { baseUrl: 'http://localhost:3000/api' } as any,
    'user',
    [] as any
  );

  // Example 1: Normal caching behavior
  console.log('📝 Example 1: Normal Caching (Default)');
  const normalOptions: Partial<Options<User, 'user', never, never, never, never, never>> = {
    cacheType: 'memory',
    ttl: 300000, // 5 minutes
    enableDebugLogging: true
  };

  const normalFactory = createInstanceFactory(api, normalOptions);
  console.log('✅ Normal cache factory created with 5 minute TTL');

  // Example 2: Cache bypass enabled
  console.log('\n📝 Example 2: Cache Bypass Enabled');
  const bypassOptions: Partial<Options<User, 'user', never, never, never, never, never>> = {
    cacheType: 'memory',
    bypassCache: true, // This is the new option!
    enableDebugLogging: true
  };

  const bypassFactory = createInstanceFactory(api, bypassOptions);
  console.log('✅ Cache bypass factory created - will always fetch from API');

  // Example 3: Conditional cache bypass
  console.log('\n📝 Example 3: Conditional Cache Bypass');
  const conditionalOptions: Partial<Options<User, 'user', never, never, never, never, never>> = {
    cacheType: 'memory',
    bypassCache: process.env.NODE_ENV === 'development', // Bypass cache in development
    ttl: 600000, // 10 minutes
    enableDebugLogging: true
  };

  const conditionalFactory = createInstanceFactory(api, conditionalOptions);
  console.log(`✅ Conditional cache factory created - bypassCache: ${conditionalOptions.bypassCache}`);

  // Example 4: Cache bypass with different cache types
  console.log('\n📝 Example 4: Cache Bypass with IndexedDB');
  const indexedDBBypassOptions: Partial<Options<User, 'user', never, never, never, never, never>> = {
    cacheType: 'indexedDB',
    bypassCache: true,
    indexedDBConfig: {
      dbName: 'UserAppCache',
      version: 1,
      storeName: 'users'
    },
    enableDebugLogging: true
  };

  const indexedDBBypassFactory = createInstanceFactory(api, indexedDBBypassOptions);
  console.log('✅ IndexedDB cache bypass factory created');

  // Example 5: Runtime cache bypass switching
  console.log('\n📝 Example 5: Runtime Cache Bypass Switching');
  const runtimeOptions: Partial<Options<User, 'user', never, never, never, never, never>> = {
    cacheType: 'memory',
    bypassCache: false, // Start with caching enabled
    enableDebugLogging: true
  };

  const runtimeFactory = createInstanceFactory(api, runtimeOptions);
  console.log('✅ Runtime cache factory created - can switch bypassCache at runtime');

  // Example usage scenarios
  console.log('\n🔧 Usage Scenarios:');
  console.log('1. Use bypassCache: true when you need real-time data');
  console.log('2. Use bypassCache: true for debugging/testing');
  console.log('3. Use bypassCache: true in development environments');
  console.log('4. Use bypassCache: false (default) for production performance');
  console.log('5. Switch bypassCache dynamically based on user preferences');

  // Example of how the operations behave differently
  console.log('\n📊 Operation Behavior Comparison:');
  console.log('With bypassCache: false (normal):');
  console.log('  - get() checks cache first, then API');
  console.log('  - one() checks cache first, then API');
  console.log('  - all() checks cache first, then API');
  console.log('  - Results are cached for future requests');

  console.log('\nWith bypassCache: true:');
  console.log('  - get() goes directly to API, no cache check');
  console.log('  - one() goes directly to API, no cache check');
  console.log('  - all() goes directly to API, no cache check');
  console.log('  - Results are NOT cached');
  console.log('  - Every request hits the API');

  console.log('\n✅ Bypass Cache Example Complete!');
}

// Export for use in other examples
export { bypassCacheExample };

// Run the example if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  bypassCacheExample().catch(console.error);
}
