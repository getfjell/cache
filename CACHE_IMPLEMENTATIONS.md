# Cache Implementations Guide

The `@fjell/cache` package now provides multiple cache implementations to suit different environments and persistence requirements.

## Available Implementations

### 1. MemoryCacheMap (Default)
**Location**: `src/memory/MemoryCacheMap.ts`
**Use case**: Server-side or Node.js applications

```typescript
import { MemoryCacheMap } from '@fjell/cache';

const cache = new MemoryCacheMap<YourItem, 'item-type'>(keyTypeArray);
```

**Characteristics:**
- Fast, in-memory storage
- Data lost when application restarts
- No persistence across sessions
- Thread-safe for single process
- Best performance for frequent read/write operations

### 2. LocalStorageCacheMap
**Location**: `src/browser/LocalStorageCacheMap.ts`
**Use case**: Browser applications requiring persistent storage

```typescript
import { LocalStorageCacheMap } from '@fjell/cache';

const cache = new LocalStorageCacheMap<YourItem, 'item-type'>(
  keyTypeArray,
  'my-app-cache' // optional prefix
);
```

**Characteristics:**
- ~5-10MB storage limit
- Data persists across browser sessions and restarts
- Synchronous operations
- Shared across all tabs for the same origin
- Stores data as JSON strings

### 3. SessionStorageCacheMap
**Location**: `src/browser/SessionStorageCacheMap.ts`
**Use case**: Browser applications requiring tab-scoped temporary storage

```typescript
import { SessionStorageCacheMap } from '@fjell/cache';

const cache = new SessionStorageCacheMap<YourItem, 'item-type'>(
  keyTypeArray,
  'my-session-cache' // optional prefix
);
```

**Characteristics:**
- ~5MB storage limit
- Data lost when browser tab is closed
- Synchronous operations
- Tab-specific storage (not shared between tabs)
- Stores data as JSON strings

### 4. AsyncIndexDBCacheMap
**Location**: `src/browser/AsyncIndexDBCacheMap.ts`
**Use case**: Browser applications requiring large, structured data storage

```typescript
import { AsyncIndexDBCacheMap } from '@fjell/cache';

const cache = new AsyncIndexDBCacheMap<YourItem, 'item-type'>(
  keyTypeArray,
  'my-database',    // database name
  'cache-store',    // object store name
  1                 // version
);

// All operations are async
const item = await cache.get(key);
await cache.set(key, value);
const items = await cache.allIn(locations);
```

**Characteristics:**
- Hundreds of MB+ storage capacity
- Asynchronous operations (returns Promises)
- Long-term persistence
- Can store complex objects natively
- Better performance for large datasets
- Supports transactions and indexing

### 5. IndexDBCacheMap (Synchronous Wrapper)
**Location**: `src/browser/IndexDBCacheMap.ts`
**Use case**: Browser applications needing synchronous API with IndexedDB persistence

```typescript
import { IndexDBCacheMap } from '@fjell/cache';

const cache = new IndexDBCacheMap<YourItem, 'item-type'>(
  keyTypeArray,
  'my-database',    // database name
  'cache-store',    // object store name
  1                 // version
);

// Synchronous operations work immediately
cache.set(key, value);          // Sets in memory cache immediately
const item = cache.get(key);    // Gets from memory cache immediately
const items = cache.allIn(locations);

// Background sync to IndexedDB happens automatically
// For explicit async operations, use:
await cache.asyncCache.set(key, value);
const item = await cache.asyncCache.get(key);
```

**Characteristics:**
- Synchronous API compatible with other CacheMap implementations
- Memory cache for immediate operations
- Background IndexedDB sync for persistence
- Higher memory usage (dual storage)
- Best for apps migrating from synchronous cache implementations
- Provides access to async cache via `asyncCache` property

**When to use IndexDBCacheMap vs AsyncIndexDBCacheMap:**
- **IndexDBCacheMap**: When you need synchronous compatibility or are migrating from MemoryCacheMap
- **AsyncIndexDBCacheMap**: When you can work with async/await and want direct IndexedDB control

## Migration Guide

### From Old CacheMap
If you were previously using `CacheMap` directly:

```typescript
// OLD
import { CacheMap } from '@fjell/cache';
const cache = new CacheMap(keyTypeArray);

// NEW
import { MemoryCacheMap } from '@fjell/cache';
const cache = new MemoryCacheMap(keyTypeArray);
```

### Choosing the Right Implementation

**For Node.js/Server applications:**
- Use `MemoryCacheMap`

**For Browser applications:**
- **Small data, session-only**: `SessionStorageCacheMap`
- **Small data, persistent**: `LocalStorageCacheMap`
- **Large data, complex queries**: `AsyncIndexDBCacheMap`

## Common Patterns

### Factory Pattern
```typescript
import { CacheMap, MemoryCacheMap, LocalStorageCacheMap } from '@fjell/cache';

function createCacheMap<V extends Item<S>, S extends string>(
  keyTypeArray: AllItemTypeArrays<S>,
  environment: 'node' | 'browser-persistent' | 'browser-session' = 'node'
): CacheMap<V, S> {
  switch (environment) {
    case 'node':
      return new MemoryCacheMap<V, S>(keyTypeArray);
    case 'browser-persistent':
      return new LocalStorageCacheMap<V, S>(keyTypeArray);
    case 'browser-session':
      return new SessionStorageCacheMap<V, S>(keyTypeArray);
    default:
      return new MemoryCacheMap<V, S>(keyTypeArray);
  }
}
```

### Error Handling for Storage
```typescript
try {
  await cache.set(key, value);
} catch (error) {
  if (error.message.includes('quota')) {
    // Handle storage quota exceeded
    cache.clear(); // Clear old data
    await cache.set(key, value); // Retry
  }
  throw error;
}
```

## Key Normalization

All implementations use the same key normalization logic:
- String and number primary/location keys are normalized to strings
- Ensures consistent behavior across different implementations
- Prevents issues with mixed key types (e.g., '123' vs 123)

This refactoring maintains full backward compatibility while providing flexible storage options for different environments and use cases.
