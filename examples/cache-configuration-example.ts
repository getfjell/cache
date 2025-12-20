/**
 * Cache Configuration Example
 *
 * This example demonstrates how to configure different types of cache maps
 * using the new Options system in @fjell/cache.
 */

import { createRegistry } from '../src/Registry';
import { createCItemApi } from '@fjell/client-api';
import { createInstanceFactory, Options } from '../src/index.js';
import { Item } from "@fjell/types";

// Define User interface
interface User extends Item<'user'> {
  id: string;
  name: string;
  email: string;
  status: 'active' | 'inactive';
  createdAt?: Date;
  updatedAt?: Date;
}

async function cacheConfigurationExample() {
  console.log('🚀 Starting Cache Configuration Example\n');

  // Create registry and API
  const registry = createRegistry();
  const api = createCItemApi<User, 'user', never, never, never, never, never>(
    { baseUrl: 'http://localhost:3000/api' } as any,
    'user',
    [] as any
  );

  // Example 1: Memory Cache (Default)
  console.log('📝 Example 1: Memory Cache (Default)');
  const memoryOptions: Partial<Options<User, 'user', never, never, never, never, never>> = {
    cacheType: 'memory',
    memoryConfig: {
      maxItems: 1000
    },
    enableDebugLogging: true
  };

  const memoryInstanceFactory = createInstanceFactory(api, memoryOptions);
  console.log('✅ Memory cache factory created with 1000 item limit');

  // Example 2: LocalStorage Cache
  console.log('\n📝 Example 2: LocalStorage Cache');
  if (typeof window !== 'undefined' && window.localStorage) {
    const localStorageOptions: Partial<Options<User, 'user', never, never, never, never, never>> = {
      cacheType: 'localStorage',
      webStorageConfig: {
        keyPrefix: 'my-app:users:',
        compress: true
      },
      autoSync: false,
      enableDebugLogging: true
    };

    createInstanceFactory(api, localStorageOptions);
    console.log('✅ LocalStorage cache factory created with custom prefix and compression');
  } else {
    console.log('⚠️ LocalStorage not available in this environment, skipping');
  }

  // Example 3: SessionStorage Cache
  console.log('\n📝 Example 3: SessionStorage Cache');
  if (typeof window !== 'undefined' && window.sessionStorage) {
    const sessionStorageOptions: Partial<Options<User, 'user', never, never, never, never, never>> = {
      cacheType: 'sessionStorage',
      webStorageConfig: {
        keyPrefix: 'session:users:',
        compress: false
      },
      ttl: 1800000, // 30 minutes
      maxRetries: 5,
      retryDelay: 2000
    };

    createInstanceFactory(api, sessionStorageOptions);
    console.log('✅ SessionStorage cache factory created with 30min expiration');
  } else {
    console.log('⚠️ SessionStorage not available in this environment, skipping');
  }

  // Example 4: IndexedDB Cache
  console.log('\n📝 Example 4: IndexedDB Cache');
  if (typeof window !== 'undefined' && window.indexedDB) {
    const indexedDBOptions: Partial<Options<User, 'user', never, never, never, never, never>> = {
      cacheType: 'indexedDB',
      indexedDBConfig: {
        dbName: 'MyAppCache',
        version: 2,
        storeName: 'users'
      },
      enableDebugLogging: true
    };

    createInstanceFactory(api, indexedDBOptions);
    console.log('✅ IndexedDB cache factory created with custom database settings');
  } else {
    console.log('⚠️ IndexedDB not available in this environment, skipping');
  }

  // Example 5: Async IndexedDB Cache
  console.log('\n📝 Example 5: Async IndexedDB Cache');
  if (typeof window !== 'undefined' && window.indexedDB) {
    const indexedDBOptions: Partial<Options<User, 'user', never, never, never, never, never>> = {
      cacheType: 'indexedDB',
      indexedDBConfig: {
        dbName: 'MyAppAsyncCache',
        version: 1,
        storeName: 'users'
      },
      autoSync: true,
      maxRetries: 3
    };

    createInstanceFactory(api, indexedDBOptions);
    console.log('✅ Async IndexedDB cache factory created');
  } else {
    console.log('⚠️ Async IndexedDB not available in this environment, skipping');
  }

  // Example 6: Custom Cache Map
  console.log('\n📝 Example 6: Custom Cache Map');
  const customOptions: Partial<Options<User, 'user', never, never, never, never, never>> = {
    cacheType: 'custom',
    customCacheMapFactory: (kta: string[]) => {
      // Return a custom cache map implementation
      // For this example, we'll use MemoryCacheMap but you could implement any logic
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { MemoryCacheMap } = require('../src/memory/MemoryCacheMap');
      console.log('🔧 Custom cache map factory called with kta:', kta);
      return new MemoryCacheMap(kta);
    },
    enableDebugLogging: true
  };

  createInstanceFactory(api, customOptions);
  console.log('✅ Custom cache factory created with custom map factory');

  // Example 7: Environment-based Configuration
  console.log('\n📝 Example 7: Environment-based Configuration');

  function getEnvironmentBasedOptions(): Partial<Options<User, 'user', never, never, never, never, never>> {
    const isProduction = process.env.NODE_ENV === 'production';
    const isBrowser = typeof window !== 'undefined';

    if (isProduction) {
      // Production: Use persistent storage
      if (isBrowser && window.indexedDB) {
        return {
          cacheType: 'indexedDB',
          indexedDBConfig: {
            dbName: 'ProdUserCache',
            version: 1,
            storeName: 'users'
          },
          autoSync: true,
          enableDebugLogging: false,
          maxRetries: 5,
          retryDelay: 1000
        };
      } else {
        return {
          cacheType: 'memory',
          memoryConfig: {
            maxItems: 5000
          },
          autoSync: true,
          enableDebugLogging: false
        };
      }
    } else {
      // Development: Use memory cache with debug logging
      return {
        cacheType: 'memory',
        memoryConfig: {
          maxItems: 100
        },
        autoSync: true,
        enableDebugLogging: true,
        maxRetries: 1,
        retryDelay: 500
      };
    }
  }

  const envOptions = getEnvironmentBasedOptions();
  createInstanceFactory(api, envOptions);
  console.log(`✅ Environment-based cache factory created (${envOptions.cacheType})`);

  // Demonstrate usage with different configurations
  console.log('\n🔍 Testing different cache configurations...');

  try {
    // Create coordinate for users
    const userCoordinate: { kta: ['user']; scopes: [] } = { kta: ['user'], scopes: [] };

    // Create instances with available cache types
    const memoryInstance = memoryInstanceFactory(userCoordinate, { registry }) as any;

    console.log('📊 Cache types created:');
    console.log(`  - Memory cache: ${memoryInstance.cacheMap.constructor.name}`);

    // Show options are available
    if (memoryInstance.options) {
      console.log(`  - Memory cache options: ${memoryInstance.options.cacheType}, debug: ${memoryInstance.options.enableDebugLogging}`);
    }

    // Only test localStorage if it's available
    if (typeof window !== 'undefined' && window.localStorage) {
      const localStorageOptions: Partial<Options<User, 'user', never, never, never, never, never>> = {
        cacheType: 'localStorage',
        webStorageConfig: {
          keyPrefix: 'my-app:users:',
          compress: true
        }
      };
      const localStorageInstanceFactory = createInstanceFactory(api, localStorageOptions);
      const localStorageInstance = localStorageInstanceFactory(userCoordinate, { registry }) as any;

      console.log(`  - LocalStorage cache: ${localStorageInstance.cacheMap.constructor.name}`);
      if (localStorageInstance.options) {
        console.log(`  - LocalStorage cache options: ${localStorageInstance.options.cacheType}, prefix: ${localStorageInstance.options.webStorageConfig?.keyPrefix}`);
      }
    }

  } catch (error: any) {
    console.log(`⚠️  Some cache types may not be available in this environment: ${error.message}`);
  }

  console.log('\n✨ Cache Configuration Example Complete');
  console.log('\n💡 Key Benefits of the Options System:');
  console.log('   • Choose the right cache type for your environment');
  console.log('   • Configure cache behavior (TTL, limits, compression)');
  console.log('   • Environment-specific optimizations');
  console.log('   • Custom cache map implementations');
  console.log('   • Detailed configuration validation');
  console.log('   • Debug logging control');
}

// Graceful error handling for the demo
async function runExample() {
  try {
    await cacheConfigurationExample();
  } catch (error: any) {
    console.error('❌ Example failed:', error.message);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  runExample();
}

export { cacheConfigurationExample };
