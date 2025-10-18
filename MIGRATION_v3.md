# Migration Guide: v2.x to v3.0

## Overview

Version 3.0 of `@fjell/cache` adopts the centralized Operations interface from `@fjell/core`. This provides a consistent interface across all Fjell packages, better type safety, and shared validation logic.

## Breaking Changes

### 1. Operations Interface Now Extends Core

The `Operations` interface now extends from `@fjell/core/Operations`. This change is mostly transparent to users, but provides better type checking and consistency across the Fjell ecosystem.

### 2. Updated `create` Method Signature

The `create` operation now uses the `CreateOptions` type from `@fjell/core`:

#### Before (v2.x)
```typescript
// Create with locations
await cache.operations.create(itemData, locations);

// Create without locations
await cache.operations.create(itemData, []);
await cache.operations.create(itemData);
```

#### After (v3.0)
```typescript
// Create with locations
await cache.operations.create(itemData, { locations });

// Create without locations (unchanged)
await cache.operations.create(itemData);

// Create with specific key (new feature)
await cache.operations.create(itemData, { key: { kt: 'user', pk: 'user-123' } });
```

### 3. New `upsert` Method

A new `upsert` method has been added to the Operations interface:

```typescript
// Update if exists, create if doesn't
const item = await cache.operations.upsert(
  key,
  itemData,
  locations  // Optional, used only for creation
);
```

## Migration Steps

### Step 1: Update Dependencies

Update to the latest versions:

```bash
npm install @fjell/core@latest @fjell/cache@latest
```

### Step 2: Update `create` Calls

Find all calls to `cache.operations.create` with a locations parameter and wrap the locations in an object:

```typescript
// Search for patterns like:
cache.operations.create(item, locations)
cache.operations.create(item, loc)
cache.operations.create(itemData, [{kt: 'parent', lk: '...'}])

// Replace with:
cache.operations.create(item, { locations })
cache.operations.create(item, { locations: loc })
cache.operations.create(itemData, { locations: [{kt: 'parent', lk: '...'}] })
```

### Step 3: Optional - Use New `upsert` Method

If you have code that checks for existence before creating or updating:

```typescript
// Before (v2.x)
const existing = await cache.operations.get(key);
if (existing) {
  await cache.operations.update(key, updates);
} else {
  await cache.operations.create(data, locations);
}

// After (v3.0) - simpler!
await cache.operations.upsert(key, data, locations);
```

## What Stays The Same

- All other cache operations work identically (`get`, `all`, `one`, `update`, `remove`, `find`, `findOne`, `action`, `allAction`, `facet`, `allFacet`)
- Cache-specific methods unchanged (`retrieve`, `set`, `reset`)
- Cache events unchanged
- TTL/eviction unchanged
- Cache statistics unchanged
- All cache implementations work the same way
- Cache configuration options unchanged

## Type Imports

You can now import core types from either package:

```typescript
// From core (recommended)
import { OperationParams, AffectedKeys } from '@fjell/core';

// From cache (re-exported for convenience)
import { OperationParams, AffectedKeys } from '@fjell/cache';
```

## Benefits

### Smaller Bundle Size
Shared types between packages reduce overall bundle size.

### Better Type Safety
Consistent types across packages provide better TypeScript support and catch more errors at compile time.

### Consistent Interface
The same Operations interface is used across `@fjell/cache`, `@fjell/lib`, `@fjell/providers`, and other packages.

### Enhanced Functionality
New `upsert` method simplifies common patterns.

## Examples

### Basic Migration Example

```typescript
import { createCache } from '@fjell/cache';
import { createCoordinate, createRegistry } from '@fjell/registry';

// Setup (unchanged)
const registry = createRegistry();
const cache = await createCache(api, createCoordinate('user'), registry);

// Operations (mostly unchanged)
await cache.operations.all();                    // ✓ No change
await cache.operations.get(key);                 // ✓ No change
await cache.operations.update(key, data);        // ✓ No change

// Create operation (requires update)
await cache.operations.create(data, locations);  // ✗ v2.x
await cache.operations.create(data, { locations }); // ✓ v3.0

// New upsert method
await cache.operations.upsert(key, data);        // ✓ New in v3.0
```

### Contained Items Migration

```typescript
// Before (v2.x)
const commentData = { text: 'Great post!' };
const locations = [{ kt: 'post', lk: 'post-123' }];
await commentCache.operations.create(commentData, locations);

// After (v3.0)
const commentData = { text: 'Great post!' };
const locations = [{ kt: 'post', lk: 'post-123' }];
await commentCache.operations.create(commentData, { locations });
```

### Upsert Pattern

```typescript
// Before (v2.x) - manual check
async function saveUser(key, userData) {
  const existing = await cache.operations.get(key);
  if (existing) {
    return await cache.operations.update(key, userData);
  } else {
    return await cache.operations.create(userData, []);
  }
}

// After (v3.0) - built-in upsert
async function saveUser(key, userData) {
  return await cache.operations.upsert(key, userData);
}
```

## Troubleshooting

### TypeScript Errors

If you see TypeScript errors after upgrading:

1. **"Argument of type 'LocKeyArray' is not assignable to parameter"**
   - Wrap the locations array in `{ locations: ... }`

2. **"Type X is not assignable to type CreateOptions"**
   - Update create calls to use the object syntax

3. **"Property 'upsert' does not exist"**
   - Ensure you've updated `@fjell/core` and `@fjell/cache` to the latest versions

### Runtime Issues

If the cache still works but you see warnings:

- Check that all `create` calls are using the new signature
- Verify that dependency versions are compatible

## Testing Your Migration

After migration, verify:

1. All create operations work correctly
2. No TypeScript compilation errors
3. Existing tests pass
4. Cache operations function as expected

```typescript
// Test create with locations
const item = await cache.operations.create(data, { locations: [loc1] });
expect(item).toBeDefined();

// Test upsert
const upserted = await cache.operations.upsert(key, updates);
expect(upserted).toBeDefined();
```

## Getting Help

If you encounter issues during migration:

1. Check this guide for common patterns
2. Review the [PHASE_3_CACHE_MIGRATION.md](../PHASE_3_CACHE_MIGRATION.md) for implementation details
3. Open an issue on GitHub with your specific use case

## Summary

The migration from v2.x to v3.0 requires minimal changes:

- ✅ Update `create(item, locations)` to `create(item, { locations })`
- ✅ Optionally use new `upsert` method for update-or-create patterns
- ✅ All other operations remain unchanged
- ✅ Cache behavior and performance unchanged
- ✅ Better type safety and consistency across packages

The migration should take less than an hour for most codebases, with the majority of time spent finding and updating `create` calls.

