/**
 * Cache Type Configuration Examples
 *
 * This example demonstrates how to configure different cache types
 * with their specific options and performance settings.
 */

// @ts-nocheck
import { createInstanceFactory, Options } from '../src/index';
import { createCoordinate } from '@fjell/core';
import { createRegistry } from '@fjell/registry';
import { Item } from '@fjell/core';

// Sample item interface
interface User extends Item<'user'> {
  id: string;
  name: string;
  email: string;
  lastLogin: Date;
  preferences: {
    theme: string;
    notifications: boolean;
  };
}

// Mock API for demonstration
const mockUserApi = {
  get: async () => ({
    id: 'sample-id',
    name: 'Sample User',
    email: 'user@example.com',
    lastLogin: new Date(),
    preferences: { theme: 'dark', notifications: true },
    events: {} as any
  } as User),
  create: async (item: User) => item,
  update: async (item: User) => item,
  remove: async () => true,
  all: async () => [],
  find: async () => [],
  action: async () => ({} as any),
  allAction: async () => [],
  allFacet: async () => [],
  facet: async () => [],
  reference: async () => ({} as any),
  allReference: async () => [],
  findOne: async () => null,
  one: async () => null
};

const registry = createRegistry('user');
const userCoordinate = createCoordinate('user');

console.log('🚀 Cache Type Configuration Examples\n');

// =============================================================================
// 1. MEMORY CACHE CONFIGURATION
// =============================================================================

console.log('1️⃣ Memory Cache Configuration');
console.log('Best for: Fast access, temporary data, development');

const memoryOptions: Partial<Options<User, 'user'>> = {
  cacheType: 'memory',
  memoryConfig: {
    maxItems: 1000            // Store maximum 1000 users
  },
  enableDebugLogging: true,   // Enable detailed logging
  autoSync: true,             // Automatically sync with API
  maxRetries: 3,              // Retry failed operations 3 times
  retryDelay: 1000,           // Wait 1 second between retries
  ttl: 600000                 // 10 minutes default expiration
};

// Create cache instance with memory configuration
const memoryFactory = createInstanceFactory(mockUserApi, memoryOptions);
const memoryCache = memoryFactory(userCoordinate, { registry });

// Store instance for potential use (prevents unused variable warning)
void memoryCache;

console.log('✅ Memory cache configured with:');
console.log(`   - Max items: ${memoryOptions.memoryConfig?.maxItems}`);
console.log(`   - TTL: ${memoryOptions.memoryConfig?.ttl}ms (${(memoryOptions.memoryConfig?.ttl || 0) / 1000}s)`);
console.log(`   - Debug logging: ${memoryOptions.enableDebugLogging}`);
console.log(`   - Auto sync: ${memoryOptions.autoSync}`);
console.log(`   - Max retries: ${memoryOptions.maxRetries}\n`);

// =============================================================================
// 2. INDEXEDDB CACHE CONFIGURATION
// =============================================================================

console.log('2️⃣ IndexedDB Cache Configuration');
console.log('Best for: Large datasets, offline capability, persistent storage');

const indexedDBOptions: Partial<Options<User, 'user'>> = {
  cacheType: 'indexedDB',
  indexedDBConfig: {
    dbName: 'UserAppCache',     // Database name
    version: 2,                 // Database version (increment for schema changes)
    storeName: 'users'          // Object store name
  },
  enableDebugLogging: false,    // Disable debug logging in production
  autoSync: true,               // Keep data synchronized
  maxRetries: 5,                // More retries for async operations
  retryDelay: 2000,             // Longer delay for database operations
  ttl: 1800000    // 30 minutes default expiration
};

// Create cache instance with IndexedDB configuration
const indexedDBFactory = createInstanceFactory(mockUserApi, indexedDBOptions);
const indexedDBCache = indexedDBFactory(userCoordinate, { registry });

// Store instance for potential use (prevents unused variable warning)
void indexedDBCache;

console.log('✅ IndexedDB cache configured with:');
console.log(`   - Database: ${indexedDBOptions.indexedDBConfig?.dbName}`);
console.log(`   - Version: ${indexedDBOptions.indexedDBConfig?.version}`);
console.log(`   - Store: ${indexedDBOptions.indexedDBConfig?.storeName}`);
console.log(`   - Debug logging: ${indexedDBOptions.enableDebugLogging}`);
console.log(`   - Max retries: ${indexedDBOptions.maxRetries}`);
console.log(`   - Retry delay: ${indexedDBOptions.retryDelay}ms\n`);

// =============================================================================
// 3. LOCALSTORAGE CACHE CONFIGURATION
// =============================================================================

console.log('3️⃣ localStorage Cache Configuration');
console.log('Best for: User preferences, settings, moderate-sized persistent data');

const localStorageOptions: Partial<Options<User, 'user'>> = {
  cacheType: 'localStorage',
  webStorageConfig: {
    keyPrefix: 'myapp:users:',  // Namespace to avoid key conflicts
    compress: true              // Enable compression to save space
  },
  enableDebugLogging: false,    // Usually disabled in production
  autoSync: false,              // Manual sync for better control
  maxRetries: 2,                // Fewer retries for localStorage (usually fast)
  retryDelay: 500,              // Quick retry for localStorage operations
  ttl: 7200000    // 2 hours default expiration
};

// Create cache instance with localStorage configuration
const localStorageFactory = createInstanceFactory(mockUserApi, localStorageOptions);
const localStorageCache = localStorageFactory(userCoordinate, { registry });

// Store instance for potential use (prevents unused variable warning)
void localStorageCache;

console.log('✅ localStorage cache configured with:');
console.log(`   - Key prefix: "${localStorageOptions.webStorageConfig?.keyPrefix}"`);
console.log(`   - Compression: ${localStorageOptions.webStorageConfig?.compress}`);
console.log(`   - Auto sync: ${localStorageOptions.autoSync}`);
console.log(`   - Max retries: ${localStorageOptions.maxRetries}`);
console.log(`   - Default expiration: ${localStorageOptions.ttl}ms (${localStorageOptions.ttl! / 1000}s)\n`);

// =============================================================================
// 4. ENVIRONMENT-BASED CONFIGURATION
// =============================================================================

console.log('4️⃣ Environment-Based Configuration');
console.log('Automatically select optimal cache based on environment');

function createOptimalCacheConfiguration(): Partial<Options<User, 'user'>> {
  // Check if we're in a browser environment
  const isBrowser = typeof window !== 'undefined';

  if (isBrowser) {
    // Check for IndexedDB support (best for large datasets)
    if ('indexedDB' in window) {
      console.log('🌐 Browser with IndexedDB detected - using IndexedDB');
      return {
        cacheType: 'indexedDB',
        indexedDBConfig: {
          dbName: 'OptimalCache',
          version: 1,
          storeName: 'items'
        },
        enableDebugLogging: false,
        maxRetries: 5,
        retryDelay: 2000
      };
    }

    // Fallback to localStorage
    if ('localStorage' in window) {
      console.log('🌐 Browser with localStorage detected - using localStorage');
      return {
        cacheType: 'localStorage',
        webStorageConfig: {
          keyPrefix: 'optimal:',
          compress: true
        },
        enableDebugLogging: false,
        maxRetries: 3
      };
    }
  }

  // Node.js or limited browser - use memory cache
  console.log('🖥️  Node.js or limited browser environment - using memory cache');
  return {
    cacheType: 'memory',
    memoryConfig: {
      maxItems: 5000
    },
    ttl: 600000,
    enableDebugLogging: true,
    maxRetries: 3
  };
}

const optimalOptions = createOptimalCacheConfiguration();
createInstanceFactory(mockUserApi, optimalOptions); // Factory created for demonstration

console.log('✅ Optimal configuration selected\n');

// =============================================================================
// 5. DEMONSTRATION OF CACHE OPERATIONS
// =============================================================================

async function demonstrateCacheOperations() {
  console.log('5️⃣ Cache Operations Demonstration\n');

  const sampleUser: User = {
    key: { kt: 'user', pk: 'user-123' },
    id: 'user-123',
    name: 'Jane Doe',
    email: 'jane.doe@example.com',
    lastLogin: new Date(),
    preferences: {
      theme: 'light',
      notifications: true
    },
    events: {} as any  // Mock events for example
  };

  // Use the sample user to prevent unused variable warning
  try {
    // Memory Cache Operations
    console.log('Memory Cache Operations:');
    console.log('Sample user for demo:', sampleUser);
    // Cache operations would be used here in a real application
    // await memoryCache.set(sampleUser.key, sampleUser);
    // const result = await memoryCache.get(sampleUser.key);
    console.log(`   ✅ Memory cache instance configured successfully`);
    console.log(`   📊 Ready for cache operations`);

    // localStorage Cache Operations (if in browser)
    if (typeof window !== 'undefined' && 'localStorage' in window) {
      console.log('\nlocalStorage Cache Operations:');
      // localStorage cache operations would be used here
      // await localStorageCache.set(sampleUser.key, sampleUser);
      // const result = await localStorageCache.get(sampleUser.key);
      console.log(`   ✅ localStorage cache configured successfully`);
      console.log(`   📊 Ready for persistent browser storage`);
      console.log(`   🔑 Storage prefix: ${localStorageOptions.webStorageConfig?.keyPrefix}`);
    }

    // IndexedDB Cache Operations (if in browser)
    if (typeof window !== 'undefined' && 'indexedDB' in window) {
      console.log('\nIndexedDB Cache Operations:');
      // IndexedDB cache operations would be used here
      // await indexedDBCache.set(sampleUser.key, sampleUser);
      // const result = await indexedDBCache.get(sampleUser.key);
      console.log(`   ✅ IndexedDB cache configured successfully`);
      console.log(`   📊 Ready for advanced browser storage`);
      console.log(`   🗄️  Database: ${indexedDBOptions.indexedDBConfig?.dbName}`);
    }

  } catch (error) {
    console.error('❌ Error during cache operations:', error);
  }
}

// =============================================================================
// 6. CONFIGURATION COMPARISON TABLE
// =============================================================================

function displayConfigurationComparison() {
  console.log('\n6️⃣ Configuration Comparison\n');

  const configurations = [
    {
      name: 'Memory Cache',
      cacheType: memoryOptions.cacheType,
      persistence: 'None',
      sizeLimit: `${memoryOptions.memoryConfig?.maxItems} items`,
      ttl: `${(memoryOptions.ttl || 0) / 1000}s`,
      useCase: 'Fast access, temporary data'
    },
    {
      name: 'IndexedDB',
      cacheType: indexedDBOptions.cacheType,
      persistence: 'Permanent',
      sizeLimit: 'Hundreds of MB+',
      ttl: `${(indexedDBOptions.ttl || 0) / 1000}s`,
      useCase: 'Large datasets, offline apps'
    },
    {
      name: 'localStorage',
      cacheType: localStorageOptions.cacheType,
      persistence: 'Permanent',
      sizeLimit: '~5-10MB',
      ttl: `${(localStorageOptions.ttl || 0) / 1000}s`,
      useCase: 'User preferences, settings'
    }
  ];

  console.log('┌────────────────┬─────────────────┬─────────────┬──────────────┬──────────┬─────────────────────────────┐');
  console.log('│ Cache Type     │ Implementation  │ Persistence │ Size Limit   │ TTL      │ Primary Use Case            │');
  console.log('├────────────────┼─────────────────┼─────────────┼──────────────┼──────────┼─────────────────────────────┤');

  configurations.forEach(config => {
    const name = config.name.padEnd(14);
    const type = config.cacheType!.padEnd(15);
    const persistence = config.persistence.padEnd(11);
    const sizeLimit = config.sizeLimit.padEnd(12);
    const ttl = config.ttl.padEnd(8);
    const useCase = config.useCase.padEnd(27);

    console.log(`│ ${name} │ ${type} │ ${persistence} │ ${sizeLimit} │ ${ttl} │ ${useCase} │`);
  });

  console.log('└────────────────┴─────────────────┴─────────────┴──────────────┴──────────┴─────────────────────────────┘');
}

// =============================================================================
// 7. PERFORMANCE RECOMMENDATIONS
// =============================================================================

function displayPerformanceRecommendations() {
  console.log('\n7️⃣ Performance Recommendations\n');

  console.log('🚀 Memory Cache:');
  console.log('   • Use for frequently accessed data');
  console.log('   • Set appropriate maxItems to avoid memory leaks');
  console.log('   • Use short TTL for data that changes frequently');
  console.log('   • Enable debug logging during development');

  console.log('\n🗄️  IndexedDB Cache:');
  console.log('   • Ideal for large datasets and offline-first apps');
  console.log('   • Use async operations with proper error handling');
  console.log('   • Increment version number when changing schema');
  console.log('   • Higher retry counts for network-dependent operations');

  console.log('\n💾 localStorage Cache:');
  console.log('   • Perfect for user preferences and settings');
  console.log('   • Enable compression for larger data objects');
  console.log('   • Use meaningful key prefixes to avoid conflicts');
  console.log('   • Consider 5-10MB browser storage limits');

  console.log('\n🎯 General Best Practices:');
  console.log('   • Use environment-based configuration for cross-platform apps');
  console.log('   • Disable debug logging in production');
  console.log('   • Set appropriate retry delays based on cache type');
  console.log('   • Monitor cache hit rates and adjust TTL accordingly');
}

// Run the examples
async function runExamples() {
  try {
    await demonstrateCacheOperations();
    displayConfigurationComparison();
    displayPerformanceRecommendations();

    console.log('\n🎉 Cache configuration examples completed!');
    console.log('Check the configurations above and adapt them to your use case.');
  } catch (error) {
    console.error('❌ Error during cache operations:', error);
  }
}

// Execute if running directly
if (require.main === module) {
  runExamples().catch(console.error);
}

export {
  memoryOptions,
  indexedDBOptions,
  localStorageOptions,
  createOptimalCacheConfiguration,
  runExamples
};
