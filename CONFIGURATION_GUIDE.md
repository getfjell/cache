# Cache Configuration Quick Reference

This guide provides quick reference configurations for the three most common cache types in fjell-cache.

## 1. Memory Cache Configuration

**Best for**: Fast access, temporary data, development environments

```typescript
import { createInstanceFactory, Options } from '@fjell/cache';

const memoryOptions: Partial<Options<User, 'user'>> = {
  cacheType: 'memory',
  memoryConfig: {
    maxItems: 1000,           // Store maximum 1000 items
    ttl: 300000               // 5 minutes expiration
  },
  enableDebugLogging: true,   // Enable detailed logging
  autoSync: true,             // Automatically sync with API
  maxRetries: 3,              // Retry failed operations 3 times
  retryDelay: 1000,           // Wait 1 second between retries
  ttl: 600000   // 10 minutes default expiration
};

const factory = createInstanceFactory(api, memoryOptions);
const cache = factory(coordinate, { registry });
```

**Key Features**:
- No persistence (lost on app restart)
- Fast access times
- Configurable memory limits
- Automatic TTL expiration

## 2. IndexedDB Configuration

**Best for**: Large datasets, offline capability, persistent storage

```typescript
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

const factory = createInstanceFactory(api, indexedDBOptions);
const cache = factory(coordinate, { registry });
```

**Key Features**:
- Persistent storage (survives browser restart)
- Large storage capacity (hundreds of MB+)
- Asynchronous operations
- Structured database with versioning

## 3. localStorage Configuration

**Best for**: User preferences, settings, moderate-sized persistent data

```typescript
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

const factory = createInstanceFactory(api, localStorageOptions);
const cache = factory(coordinate, { registry });
```

**Key Features**:
- Persistent storage (survives browser restart)
- ~5-10MB storage limit
- Synchronous operations
- Optional compression
- Key namespacing for conflict avoidance

## 4. Cache Bypass Configuration

**Best for**: Real-time data, debugging, development environments, when you need to always fetch fresh data

```typescript
const bypassOptions: Partial<Options<User, 'user'>> = {
  cacheType: 'memory',
  bypassCache: true,            // Completely bypass cache, always fetch from API
  enableDebugLogging: true,     // Enable logging to see bypass behavior
  autoSync: false,              // Not needed when bypassing cache
  maxRetries: 3,                // Retry failed API calls
  retryDelay: 1000              // Wait 1 second between retries
};

const factory = createInstanceFactory(api, bypassOptions);
const cache = factory(coordinate, { registry });
```

**Key Features**:
- **No caching**: Every request goes directly to the API
- **Real-time data**: Always get the latest information
- **Debugging friendly**: See exactly what the API returns
- **Development ready**: Perfect for testing and development
- **Performance trade-off**: Slower response times, higher API usage

**Use Cases**:
- Development and testing environments
- Real-time dashboards requiring live data
- Debugging cache-related issues
- When you need to ensure data freshness
- Performance testing without cache interference

**Behavior with bypassCache: true**:
- `get()` → Direct API call, no cache check
- `one()` → Direct API call, no cache check  
- `all()` → Direct API call, no cache check
- `find()` → Direct API call, no cache check
- `findOne()` → Direct API call, no cache check
- `retrieve()` → Direct API call, no cache check

**Note**: When `bypassCache: true`, the `ttl` setting is ignored since no caching occurs.

## Environment-Based Auto-Configuration

Automatically select the optimal cache type based on the runtime environment:

```typescript
function createOptimalCacheConfiguration(): Partial<Options<User, 'user'>> {
  // Browser with IndexedDB support
  if (typeof window !== 'undefined' && 'indexedDB' in window) {
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

  // Browser with localStorage
  if (typeof window !== 'undefined' && 'localStorage' in window) {
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

  // Node.js or limited browser - use memory cache
  return {
    cacheType: 'memory',
    memoryConfig: {
      maxItems: 5000,
      ttl: 300000
    },
    enableDebugLogging: true,
    maxRetries: 3
  };
}

const optimalOptions = createOptimalCacheConfiguration();
const factory = createInstanceFactory(api, optimalOptions);
```

## Configuration Comparison

| Cache Type | Persistence | Size Limit | Speed | Use Case |
|------------|-------------|-------------|-------|----------|
| Memory | None | RAM dependent | Fastest | Temporary data, development |
| IndexedDB | Permanent | Hundreds of MB+ | Fast | Large datasets, offline apps |
| localStorage | Permanent | ~5-10MB | Fast | User preferences, settings |

## Quick Setup Commands

```bash
# Install fjell-cache
npm install @fjell/cache

# Run the configuration example
npx ts-node examples/cache-type-configurations-example.ts
```

## See Also

- [Complete Examples](./examples/) - Comprehensive examples directory
- [README.md](./README.md) - Full documentation
- [API Documentation](https://getfjell.github.io/fjell-cache/) - Detailed API reference

For more detailed examples and use cases, see the [cache-type-configurations-example.ts](./examples/cache-type-configurations-example.ts) file.
