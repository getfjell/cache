# Cache Event System

The fjell-cache event system provides real-time notifications when cache operations occur. This enables reactive patterns where components can subscribe to cache changes and update automatically.

## Overview

The event system is built into the core Cache interface and provides:

- **Event emission** for all cache operations (create, update, remove, query, etc.)
- **Subscription management** with filtering options
- **Event types** covering all cache state changes
- **Debouncing** support for high-frequency updates
- **Type safety** with full TypeScript support

## Basic Usage

### Subscribing to Events

```typescript
import { createCache, CacheEventListener } from '@fjell/cache';

// Create cache
const cache = createCache(api, coordinate, registry);

// Subscribe to all events
const listener: CacheEventListener<MyItem, 'myType'> = (event) => {
  console.log('Cache event:', event.type, event);
};

const subscription = cache.subscribe(listener);

// Later: unsubscribe
subscription.unsubscribe();
```

### Filtering Events

```typescript
// Subscribe only to item creation events
const subscription = cache.subscribe(listener, {
  eventTypes: ['item_created', 'item_updated']
});

// Subscribe only to events for specific keys
const subscription = cache.subscribe(listener, {
  keys: [{ pk: 'user-123' }]
});

// Subscribe only to events in specific locations
const subscription = cache.subscribe(listener, {
  locations: [{ lk: 'container-1' }]
});

// Subscribe with debouncing (useful for UI updates)
const subscription = cache.subscribe(listener, {
  debounceMs: 100  // Debounce events by 100ms
});
```

## Event Types

### Item Events

These events are emitted when individual items are affected:

- **`item_created`** - Item was created via API and cached
- **`item_updated`** - Item was updated via API and cache updated
- **`item_removed`** - Item was removed via API and from cache
- **`item_retrieved`** - Item was retrieved from API and cached
- **`item_set`** - Item was set directly in cache (no API call)

```typescript
interface ItemEvent<V, S, L1, L2, L3, L4, L5> {
  type: 'item_created' | 'item_updated' | 'item_removed' | 'item_retrieved' | 'item_set';
  key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>;
  item: V | null;  // null for removed items
  previousItem?: V | null;  // Previous state before change
  affectedLocations?: LocKeyArray<L1, L2, L3, L4, L5> | [];
  timestamp: number;
  source: 'api' | 'cache' | 'operation';
}
```

### Query Events

These events are emitted when multiple items are queried:

- **`items_queried`** - Multiple items were queried and cached

```typescript
interface QueryEvent<V, S, L1, L2, L3, L4, L5> {
  type: 'items_queried';
  query: ItemQuery;
  locations: LocKeyArray<L1, L2, L3, L4, L5> | [];
  items: V[];
  affectedKeys: (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[];
  timestamp: number;
  source: 'api' | 'cache' | 'operation';
}
```

### Cache Management Events

These events are emitted for cache-wide operations:

- **`cache_cleared`** - Entire cache was cleared
- **`location_invalidated`** - Specific location(s) were invalidated
- **`query_invalidated`** - Cached query results were invalidated

## Advanced Usage

### React Integration Example

```typescript
import { useEffect, useState } from 'react';
import { Cache, CacheSubscription } from '@fjell/cache';

function useItem<T>(cache: Cache<T, any>, key: any): T | null {
  const [item, setItem] = useState<T | null>(() =>
    cache.cacheMap.get(key)
  );

  useEffect(() => {
    const subscription = cache.subscribe((event) => {
      if (event.type === 'item_changed' &&
          JSON.stringify(event.key) === JSON.stringify(key)) {
        setItem(event.item);
      } else if (event.type === 'item_removed' &&
                 JSON.stringify(event.key) === JSON.stringify(key)) {
        setItem(null);
      }
    }, {
      keys: [key],
      eventTypes: ['item_updated', 'item_removed', 'item_set']
    });

    return () => subscription.unsubscribe();
  }, [cache, key]);

  return item;
}
```

### Listening to Multiple Caches

```typescript
class CacheEventHub {
  private subscriptions: CacheSubscription[] = [];

  subscribeTo<T>(cache: Cache<T, any>, listener: CacheEventListener<T, any>) {
    const subscription = cache.subscribe(listener);
    this.subscriptions.push(subscription);
    return subscription;
  }

  unsubscribeAll() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.subscriptions = [];
  }
}

const hub = new CacheEventHub();

// Subscribe to multiple caches
hub.subscribeTo(userCache, (event) => console.log('User event:', event));
hub.subscribeTo(orderCache, (event) => console.log('Order event:', event));

// Later: clean up all subscriptions
hub.unsubscribeAll();
```

### Event Logging and Debugging

```typescript
// Log all cache events for debugging
const debugSubscription = cache.subscribe((event) => {
  console.log(`[${new Date(event.timestamp).toISOString()}] ${event.type}:`, {
    source: event.source,
    ...('key' in event ? { key: event.key } : {}),
    ...('query' in event ? { query: event.query } : {}),
  });
});

// Performance monitoring
let eventCounts = new Map<string, number>();

cache.subscribe((event) => {
  const count = eventCounts.get(event.type) || 0;
  eventCounts.set(event.type, count + 1);
});

setInterval(() => {
  console.log('Event counts:', Object.fromEntries(eventCounts));
  eventCounts.clear();
}, 10000);
```

## Best Practices

### 1. Use Specific Event Filters

```typescript
// Good: Filter by specific event types and keys
cache.subscribe(listener, {
  eventTypes: ['item_updated'],
  keys: [userKey]
});

// Avoid: Subscribing to all events when you only need specific ones
cache.subscribe(listener); // Too broad
```

### 2. Debounce High-Frequency Updates

```typescript
// Good: Debounce UI updates
cache.subscribe(updateUI, {
  debounceMs: 100
});

// Good: Don't debounce critical business logic
cache.subscribe(saveToDisk, {
  // No debouncing for critical operations
});
```

### 3. Clean Up Subscriptions

```typescript
useEffect(() => {
  const subscription = cache.subscribe(listener);

  // Always clean up
  return () => subscription.unsubscribe();
}, []);
```

### 4. Handle Errors in Listeners

```typescript
cache.subscribe((event) => {
  try {
    // Your event handling logic
    handleEvent(event);
  } catch (error) {
    console.error('Error handling cache event:', error);
    // Don't let errors break other listeners
  }
});
```

## Event Sources

Events include a `source` field indicating where they originated:

- **`api`** - Event from API operation (create, update, remove, etc.)
- **`cache`** - Event from direct cache operation (set, invalidate)
- **`operation`** - Event from internal cache operation

## Performance Considerations

- **Subscription count**: Each subscription has minimal overhead, but avoid creating unnecessary subscriptions
- **Event frequency**: Use debouncing for high-frequency UI updates
- **Memory leaks**: Always unsubscribe when components unmount
- **Event filtering**: Use specific filters to reduce unnecessary event processing

## Error Handling

The event system is designed to be resilient:

- Listener errors don't affect other listeners or cache operations
- Failed subscriptions are automatically cleaned up
- Event emission continues even if some listeners fail

## Migration from Manual State Management

If you're currently using manual state management patterns:

```typescript
// Before: Manual state management
const [items, setItems] = useState([]);

const addItem = async (item) => {
  const newItem = await cache.operations.create(item);
  setItems(prev => [...prev, newItem]);  // Manual update
};

// After: Event-driven updates
const [items, setItems] = useState([]);

useEffect(() => {
  const subscription = cache.subscribe((event) => {
    if (event.type === 'item_created') {
      setItems(prev => [...prev, event.item]);
    }
  }, { eventTypes: ['item_created'] });

  return () => subscription.unsubscribe();
}, []);

const addItem = async (item) => {
  await cache.operations.create(item);  // Event automatically updates state
};
```

This approach eliminates the need for manual state synchronization and ensures your UI always reflects the current cache state.
