# Fjell Cache

Cache for Fjell - A powerful caching framework for TypeScript applications

## Overview

Fjell Cache provides intelligent caching capabilities for complex data models and business relationships. Built on the Fjell framework architecture, it offers high-performance caching with automatic relationship management and business logic integration.

## Features

- **Smart Caching**: Intelligent cache operations with automatic cache hits/misses
- **Multiple Cache Implementations**: In-memory, localStorage, sessionStorage, and IndexedDB support
- **Comprehensive Configuration**: Rich options system for performance tuning and environment optimization
- **Business Relationships**: Automatic population of related entities through aggregation
- **Performance Optimized**: High-performance cache operations with bulk processing
- **Environment Aware**: Automatic environment detection with fallback strategies
- **Location-Based**: Support for contained items with location hierarchies
- **Browser-Ready**: Native browser storage implementations for client-side caching
- **Framework Integration**: Seamless integration with Fjell Core, Registry, and Client API
- **TypeScript First**: Full TypeScript support with comprehensive type safety
- **Cache Size Limits**: Configure maximum cache size in bytes or item count with automatic eviction
- **Advanced Eviction Policies**: LRU, LFU, FIFO, MRU, Random, ARC, and 2Q strategies for optimal performance
- **Performance Monitoring**: Built-in cache statistics and utilization tracking
- **Cache Introspection**: Runtime visibility into cache implementation type, eviction policies, and capabilities

## Installation

```bash
npm install @fjell/cache
# or
npm install @fjell/cache
# or
yarn add @fjell/cache
```

## Quick Start

```typescript
import { createCache, MemoryCacheMap } from '@fjell/cache';
import { createCoordinate, createRegistry } from '@fjell/registry';
import { ClientApi } from '@fjell/client-api';

// Create a registry for cache management
const registry = createRegistry();

// Create a cache instance with API integration
const userApi = createUserApi(); // Your API implementation
const userCache = await createCache(userApi, createCoordinate('user'), registry);

// Perform cache operations
const [cacheMap, allUsers] = await userCache.operations.all();
const [, cachedUser] = await userCache.operations.get(userKey);
const [, retrievedUser] = await userCache.operations.retrieve(userKey); // Cache hit!

await userCache.operations.set(userKey, updatedUser);

// Or use cache implementations directly
const memoryCache = new MemoryCacheMap<User>(['user']);
memoryCache.set(userKey, user);
const cachedUser = memoryCache.get(userKey);

// Get cache information for debugging or monitoring
const cacheInfo = userCache.getCacheInfo();
console.log(`Using ${cacheInfo.implementationType} cache`);
console.log(`TTL support: ${cacheInfo.supportsTTL}`);
console.log(`Eviction support: ${cacheInfo.supportsEviction}`);
```

## Configuration Options

Fjell Cache provides comprehensive configuration options to optimize caching behavior for your specific environment and performance requirements.

### Basic Configuration

```typescript
import { createInstanceFactory, createCache, Options } from '@fjell/cache';

// Configure cache with options
const options: Partial<Options<User, 'user'>> = {
  cacheType: 'memory',
  enableDebugLogging: true,
  autoSync: true,
  maxRetries: 3,
  retryDelay: 1000,
  ttl: 300000 // 5 minutes
};

// Use with InstanceFactory (recommended)
const factory = createInstanceFactory(userApi, options);
const cache = factory(coordinate, { registry });

// Or directly with createCache
const cache = createCache(userApi, coordinate, registry, options);
```

### Cache Types

#### Memory Cache (Default)
Fast in-memory caching with optional size limits, TTL, and advanced eviction policies:

```typescript
const options: Partial<Options<User, 'user'>> = {
  cacheType: 'memory',
  memoryConfig: {
    maxItems: 1000,     // Maximum number of items to cache
    ttl: 300000,        // Time-to-live in milliseconds (5 minutes)
    size: {
      maxSizeBytes: '10MB',      // Maximum cache size in bytes
      maxItems: 1000,            // Alternative/additional item limit
      evictionPolicy: 'lru'      // Eviction strategy when limits exceeded
    }
  }
};
```

#### Browser localStorage (Persistent)
Persistent storage that survives page reloads and browser restarts:

```typescript
const options: Partial<Options<User, 'user'>> = {
  cacheType: 'localStorage',
  webStorageConfig: {
    keyPrefix: 'myapp:users:',  // Namespace your cache keys
    compress: false             // Enable/disable compression
  }
};
```

#### Browser sessionStorage (Session-only)
Session-based storage that's cleared when the tab closes:

```typescript
const options: Partial<Options<User, 'user'>> = {
  cacheType: 'sessionStorage',
  webStorageConfig: {
    keyPrefix: 'session:users:',
    compress: true              // Compress data to save space
  }
};
```

#### IndexedDB (Large-scale, Synchronous)
For large amounts of structured data with synchronous API:

```typescript
const options: Partial<Options<User, 'user'>> = {
  cacheType: 'indexedDB',
  indexedDBConfig: {
    dbName: 'MyAppCache',       // Database name
    version: 2,                 // Database version
    storeName: 'users'          // Object store name
  }
};
```

#### IndexedDB (Large-scale, Asynchronous)
Recommended IndexedDB implementation with full async support:

```typescript
const options: Partial<Options<User, 'user'>> = {
  cacheType: 'indexedDB',
  indexedDBConfig: {
    dbName: 'MyAppCache',
    version: 1,
    storeName: 'userData'
  }
};

// Access async operations via the asyncCache property
const cache = createCache(api, coordinate, options);
const asyncValue = await cache.cacheMap.asyncCache.get(key);
await cache.cacheMap.asyncCache.set(key, value);
```

#### Custom Cache Implementation
Bring your own cache implementation:

```typescript
import { CacheMap } from '@fjell/cache';

const customCacheFactory = (kta) => {
  // Return your custom CacheMap implementation
  return new MyCustomCacheMap(kta);
};

const options: Partial<Options<User, 'user'>> = {
  cacheType: 'custom',
  customCacheMapFactory: customCacheFactory
};
```

### Cache Size Limits and Eviction Policies

Fjell Cache supports sophisticated cache size management with automatic eviction when limits are exceeded. You can configure both byte-based and item-count-based limits, along with various eviction strategies to optimize performance for your specific use case.

#### Size Configuration

Configure cache limits using flexible size formats:

```typescript
const options: Partial<Options<User, 'user'>> = {
  cacheType: 'memory',
  memoryConfig: {
    size: {
      // Byte-based limits (decimal units)
      maxSizeBytes: '10MB',    // 10 megabytes
      maxSizeBytes: '500KB',   // 500 kilobytes
      maxSizeBytes: '2GB',     // 2 gigabytes

      // Byte-based limits (binary units)
      maxSizeBytes: '10MiB',   // 10 mebibytes (1024^2)
      maxSizeBytes: '500KiB',  // 500 kibibytes (1024)
      maxSizeBytes: '2GiB',    // 2 gibibytes (1024^3)

      // Raw bytes
      maxSizeBytes: '1048576', // 1MB in bytes

      // Item count limit
      maxItems: 1000,          // Maximum number of cached items

      // Eviction policy (required when limits are set)
      evictionPolicy: 'lru'    // Strategy for removing items
    }
  }
};
```

#### Eviction Policies

Choose from several battle-tested eviction strategies:

##### LRU (Least Recently Used) - Default
Removes the item that was accessed longest ago. Best general-purpose strategy.

```typescript
const options: Partial<Options<User, 'user'>> = {
  cacheType: 'memory',
  memoryConfig: {
    size: {
      maxItems: 1000,
      evictionPolicy: 'lru'  // Remove least recently accessed items
    }
  }
};
```

##### LFU (Least Frequently Used)
Removes the item with the lowest access count. Good for workloads with stable access patterns.

```typescript
const options: Partial<Options<User, 'user'>> = {
  cacheType: 'memory',
  memoryConfig: {
    size: {
      maxItems: 1000,
      evictionPolicy: 'lfu'  // Remove least frequently accessed items
    }
  }
};
```

##### FIFO (First-In, First-Out)
Removes the oldest added item regardless of usage. Simple and predictable.

```typescript
const options: Partial<Options<User, 'user'>> = {
  cacheType: 'memory',
  memoryConfig: {
    size: {
      maxItems: 1000,
      evictionPolicy: 'fifo'  // Remove oldest items first
    }
  }
};
```

##### MRU (Most Recently Used)
Removes the most recently accessed item. Useful for specific access patterns.

```typescript
const options: Partial<Options<User, 'user'>> = {
  cacheType: 'memory',
  memoryConfig: {
    size: {
      maxItems: 1000,
      evictionPolicy: 'mru'  // Remove most recently accessed items
    }
  }
};
```

##### Random Replacement
Evicts a random item. Fast and low-overhead for uniform workloads.

```typescript
const options: Partial<Options<User, 'user'>> = {
  cacheType: 'memory',
  memoryConfig: {
    size: {
      maxItems: 1000,
      evictionPolicy: 'random'  // Remove random items
    }
  }
};
```

##### ARC (Adaptive Replacement Cache)
Balances between recency (LRU) and frequency (LFU) dynamically. Adapts to workload patterns.

```typescript
const options: Partial<Options<User, 'user'>> = {
  cacheType: 'memory',
  memoryConfig: {
    size: {
      maxItems: 1000,
      evictionPolicy: 'arc'  // Adaptive replacement cache
    }
  }
};
```

##### 2Q (Two Queues)
Maintains separate queues for recent and frequently accessed items. Reduces cache pollution.

```typescript
const options: Partial<Options<User, 'user'>> = {
  cacheType: 'memory',
  memoryConfig: {
    size: {
      maxItems: 1000,
      evictionPolicy: '2q'  // Two-queue algorithm
    }
  }
};
```

#### Combined Size and Item Limits

You can specify both size and item limits. The cache will respect whichever limit is reached first:

```typescript
const options: Partial<Options<User, 'user'>> = {
  cacheType: 'memory',
  memoryConfig: {
    size: {
      maxSizeBytes: '50MB',     // Size limit
      maxItems: 10000,          // Item count limit
      evictionPolicy: 'lru'     // Eviction strategy
    }
  }
};
```

#### Performance Monitoring

Monitor cache performance and utilization:

```typescript
import { createCache, formatBytes } from '@fjell/cache';

const cache = createCache(/* ... */);

// Get cache statistics
const stats = cache.getStats();
console.log(`Items: ${stats.currentItemCount}/${stats.maxItems}`);
console.log(`Size: ${formatBytes(stats.currentSizeBytes)}/${formatBytes(stats.maxSizeBytes)}`);
console.log(`Item utilization: ${stats.utilizationPercent.items?.toFixed(1)}%`);
console.log(`Size utilization: ${stats.utilizationPercent.bytes?.toFixed(1)}%`);
```

### Performance and Reliability Options

Configure retry logic, synchronization, and debugging:

```typescript
const options: Partial<Options<User, 'user'>> = {
  // Retry configuration
  maxRetries: 5,              // Number of retry attempts
  retryDelay: 2000,           // Delay between retries (ms)

  // Synchronization
  autoSync: true,             // Auto-sync with API
  ttl: 600000,  // Default expiration (10 minutes)

  // Debugging
  enableDebugLogging: true    // Enable detailed debug logs
};
```

### Environment-based Configuration

Automatically adapt cache strategy based on environment:

```typescript
const getOptimalCacheOptions = (): Partial<Options<User, 'user'>> => {
  // Browser environment with IndexedDB support
  if (typeof window !== 'undefined' && 'indexedDB' in window) {
    return {
      cacheType: 'indexedDB',
      indexedDBConfig: {
        dbName: 'MyAppCache',
        version: 1,
        storeName: 'users'
      },
      enableDebugLogging: false
    };
  }

  // Browser environment with localStorage
  if (typeof window !== 'undefined' && 'localStorage' in window) {
    return {
      cacheType: 'localStorage',
      webStorageConfig: {
        keyPrefix: 'myapp:',
        compress: true
      }
    };
  }

  // Node.js or other environments - use memory
  return {
    cacheType: 'memory',
    memoryConfig: {
      maxItems: 5000,
      ttl: 300000
    },
    enableDebugLogging: true
  };
};

const factory = createInstanceFactory(userApi, getOptimalCacheOptions());
```

### Complete Options Reference

```typescript
interface Options<V extends Item<S>, S extends string> {
  // Cache type selection
  cacheType: 'memory' | 'localStorage' | 'sessionStorage' |
             'indexedDB' | 'custom';

  // Memory cache configuration
  memoryConfig?: {
    maxItems?: number;          // Maximum items to store
    ttl?: number;              // Time-to-live in milliseconds
  };

  // Web storage configuration (localStorage/sessionStorage)
  webStorageConfig?: {
    keyPrefix?: string;         // Key prefix for namespacing
    compress?: boolean;         // Enable compression
  };

  // IndexedDB configuration
  indexedDBConfig?: {
    dbName?: string;           // Database name
    version?: number;          // Database version
    storeName?: string;        // Object store name
  };

  // Custom cache factory
  customCacheMapFactory?: (kta: AllItemTypeArrays) => CacheMap;

  // Performance and reliability
  maxRetries?: number;          // Retry attempts (default: 3)
  retryDelay?: number;          // Retry delay in ms (default: 1000)
  autoSync?: boolean;           // Auto-sync with API (default: true)
  ttl?: number;   // Default expiration in ms
  enableDebugLogging?: boolean; // Debug logging (default: false)
}
```

### Validation and Error Handling

The Options system includes automatic validation:

- **Environment Checks**: Validates browser API availability
- **Configuration Validation**: Ensures required options are provided
- **Type Safety**: Full TypeScript support with compile-time checks
- **Runtime Errors**: Clear error messages for invalid configurations

```typescript
// This will throw a clear error in Node.js environment:
const options = { cacheType: 'localStorage' as const };
// Error: localStorage is not available in non-browser environments

// This will throw an error:
const options = {
  cacheType: 'custom' as const
  // Missing: customCacheMapFactory
};
// Error: customCacheMapFactory is required when cacheType is "custom"
```

## Core Components

### Basic Caching
- **Cache Operations**: Get, set, retrieve, and manage cached data
- **Cache-as-Instance**: Caches extend Instance from fjell-registry
- **Performance Monitoring**: Track cache hits, misses, and efficiency

### Advanced Aggregation
- **Entity Relationships**: Automatic population of related entities
- **Required vs Optional**: Flexible relationship management
- **Business Logic**: Complex business scenarios with interconnected data

### Cache Implementations
- **MemoryCacheMap**: Fast in-memory caching (default)
- **LocalStorageCacheMap**: Persistent browser caching with localStorage
- **SessionStorageCacheMap**: Session-based browser caching with sessionStorage
- **AsyncIndexDBCacheMap**: Large-scale browser caching with IndexedDB
- **IndexDBCacheMap**: Synchronous wrapper for IndexedDB (throws errors, use async version)

### Direct Cache Management
- **CacheMap Interface**: Abstract interface for all cache implementations
- **Location Filtering**: Filter contained items by location hierarchy
- **Bulk Operations**: Efficient processing of multiple cache operations
- **Key Normalization**: Consistent string/number key handling across implementations

## Examples

Comprehensive examples are available in the [examples directory](./examples/):

- **[Basic Cache Example](./examples/basic-cache-example.ts)** - Start here! Fundamental caching operations
- **[Cache Configuration Example](./examples/cache-configuration-example.ts)** - Complete guide to cache options and configuration
- **[Cache Type Configurations Example](./examples/cache-type-configurations-example.ts)** - Practical setup for Memory, IndexedDB, and localStorage
- **[Aggregator Example](./examples/aggregator-example.ts)** - Advanced business relationships
- **[Cache Map Example](./examples/cache-map-example.ts)** - Low-level cache operations

## Browser Cache Implementations

Fjell Cache provides multiple cache implementations optimized for different environments:

### In-Memory Caching (Default)
```typescript
import { MemoryCacheMap } from '@fjell/cache';

const cache = new MemoryCacheMap<MyItem>(['myitem']);
cache.set(key, item);
const item = cache.get(key);
```

### Browser localStorage (Persistent)
```typescript
import { LocalStorageCacheMap } from '@fjell/cache';

// Survives page reloads and browser restarts
const cache = new LocalStorageCacheMap<MyItem>(['myitem'], 'my-app-cache');
cache.set(key, item);
const item = cache.get(key); // Retrieved from localStorage
```

### Browser sessionStorage (Session-only)
```typescript
import { SessionStorageCacheMap } from '@fjell/cache';

// Lost when tab is closed
const cache = new SessionStorageCacheMap<MyItem>(['myitem'], 'session-cache');
cache.set(key, item);
const item = cache.get(key); // Retrieved from sessionStorage
```

### IndexedDB (Large-scale, Asynchronous)
```typescript
import { AsyncIndexDBCacheMap } from '@fjell/cache';

// For large amounts of structured data
const cache = new AsyncIndexDBCacheMap<MyItem>(['myitem'], 'MyAppDB', 'items', 1);

// All operations are async
await cache.set(key, item);
const item = await cache.get(key);
const allItems = await cache.values();
```

### Cache Implementation Comparison

| Implementation | Storage | Persistence | Size Limit | Sync/Async | Use Case |
|---|---|---|---|---|---|
| MemoryCacheMap | Memory | None | RAM | Sync | Default, fast access |
| LocalStorageCacheMap | localStorage | Permanent | ~5-10MB | Sync | User preferences, settings |
| SessionStorageCacheMap | sessionStorage | Session only | ~5MB | Sync | Temporary session data |
| AsyncIndexDBCacheMap | IndexedDB | Permanent | Hundreds of MB+ | Async | Large datasets, offline apps |

## Documentation

For detailed documentation, examples, and API reference, visit our [documentation site](https://getfjell.github.io/fjell-cache/).

## Dependencies

Fjell Cache builds on the Fjell ecosystem:
- `@fjell/core` - Core framework functionality
- `@fjell/registry` - Registry and coordinate management
- `@fjell/client-api` - API integration layer
- `@fjell/http-api` - HTTP API capabilities
- `@fjell/logging` - Structured logging

## License

Apache-2.0

## Contributing

We welcome contributions! Please see our contributing guidelines for more information.

Built with love by the Fjell team.
# Test fix for sendit config bug
