# Cache Invalidation for Actions

## Overview

The cache library now automatically handles cache invalidation when actions are performed. When an action or allAction method is called, the cache system will:

1. Execute the action via the API
2. Extract key type information from the returned affected items
3. Locate related cache instances in the registry
4. Automatically invalidate those caches

This ensures that when actions modify data that affects other cached items, those caches are automatically cleared to maintain data consistency.

## How It Works

### Action Return Types

Actions now return a tuple containing:
- The updated/created item(s)
- An array of affected items that need cache invalidation

```typescript
// Single action returns: [V, Array<PriKey<any> | ComKey<any, any, any, any, any, any> | LocKeyArray<any, any, any, any, any>>]
const [updatedItem, affectedItems] = await cache.operations.action(key, 'updateStatus', { status: 'completed' });

// All action returns: [V[], Array<PriKey<any> | ComKey<any, any, any, any, any, any> | LocKeyArray<any, any, any, any, any>>]
const [updatedItems, affectedItems] = await cache.operations.allAction('bulkUpdate', { status: 'completed' });
```

### Affected Items Types

The affected items array can contain three types of references:

1. **PriKey** - Primary key references
   ```typescript
   { kt: 'order', pk: '123' }
   ```

2. **ComKey** - Composite key references with locations
   ```typescript
   { 
     kt: 'orderPhase', 
     pk: '123', 
     loc: [
       { kt: 'order', lk: '456' }
     ] 
   }
   ```

3. **LocKeyArray** - Location key arrays
   ```typescript
   [
     { kt: 'order', lk: '123' },
     { kt: 'customer', lk: '456' }
   ]
   ```

### Cache Invalidation Process

1. **Extract Key Types**: The system extracts key type arrays from each affected item
2. **Locate Caches**: Uses the registry to find cache instances matching the key types
3. **Invalidate Caches**: Calls `reset()` on each found cache instance to clear all cached data

## Example Scenarios

### Order Phase Action Affecting Order

```typescript
// An action on OrderPhase that modifies an Order
const [orderPhase, affectedItems] = await cache.operations.action(
  orderPhaseKey, 
  'advancePhase', 
  { newPhase: 'processing' }
);

// affectedItems might contain:
// [{ kt: 'order', pk: 'order-123' }]
// This will automatically invalidate the 'order' cache
```

### Bulk Action Affecting Multiple Types

```typescript
// A bulk action that affects multiple item types
const [items, affectedItems] = await cache.operations.allAction(
  'bulkArchive', 
  { archived: true }
);

// affectedItems might contain:
// [
//   { kt: 'order', pk: 'order-123' },
//   { kt: 'orderPhase', pk: 'phase-456', loc: [{ kt: 'order', lk: 'order-789' }] },
//   [{ kt: 'customer', lk: 'customer-101' }]
// ]
// This will invalidate 'order', 'orderPhase', and 'customer' caches
```

## Registry Integration

The cache invalidation system integrates with the Fjell Registry to locate cache instances:

```typescript
// The system automatically finds caches by key types
const cacheInstance = registry.get(['order']);
if (cacheInstance && isCache(cacheInstance)) {
  await cacheInstance.operations.reset();
}
```

## Error Handling

The cache invalidation system is designed to be resilient:

- If a cache instance cannot be found, the operation continues
- If cache invalidation fails for one item, other items are still processed
- All errors are logged but don't prevent the main action from completing

## Configuration

No additional configuration is required. The cache invalidation system:

- Automatically activates when actions return affected items
- Uses the existing registry infrastructure
- Maintains backward compatibility with existing code

## Benefits

1. **Automatic Consistency**: Related caches are automatically invalidated
2. **No Manual Management**: Developers don't need to manually track cache dependencies
3. **Performance**: Prevents serving stale data from related caches
4. **Reliability**: Built-in error handling ensures operations complete successfully

## Migration Notes

Existing code will continue to work without changes. The new functionality is additive:

- Actions that don't return affected items work as before
- Actions that do return affected items automatically benefit from cache invalidation
- The return type changes are backward compatible through type assertions

## Testing

The cache invalidation system includes comprehensive tests:

```bash
npm test -- cacheInvalidation.test.ts
```

Tests cover:
- Key type extraction from various item types
- Cache instance location and invalidation
- Error handling scenarios
- Edge cases and empty arrays
