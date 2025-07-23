# Fjell-Cache Examples

This directory contains examples demonstrating how to use fjell-cache for caching data models and managing complex business relationships with different patterns and complexity levels.

## Examples

### 1. `basic-cache-example.ts` ⭐ **Start Here!**
**Perfect for beginners!** Demonstrates the fundamental way to use fjell-cache for data caching:
- **Basic cache operations** - Create caches with coordinates and registries, use operations API
- **Simple data models** - User and Task entities with mock storage
- **Cache-as-Instance architecture** - Caches extend Instance from fjell-registry
- **Cache hits vs misses** - Understand cache behavior and performance benefits
- **Cache management** - Updates, deletions, and data consistency through operations

Great for understanding the fundamentals of fjell-cache data management.

### 2. `aggregator-example.ts` 🏗️ **Advanced Business Relationships**
**Complete business relationship management!** Demonstrates advanced caching patterns with entity relationships:
- **Multiple interconnected models**: Customer, Order, Product, SupportTicket
- **Automatic reference population**: Orders automatically include customer data
- **Required vs optional aggregates**: Flexible relationship management
- **Complex business scenarios**: E-commerce platform with customer management
- **Performance optimization**: Cache efficiency through aggregated data

Shows how fjell-cache handles enterprise data relationship patterns.

### 3. `cache-map-example.ts` 🔧 **Low-Level Cache Operations**
**Direct cache management!** Demonstrates lower-level CacheMap functionality:
- **Direct CacheMap usage**: Create and manage cache maps without higher-level abstractions
- **Primary and composite keys**: Handle both simple and complex key structures
- **Location-based operations**: Filter contained items by location hierarchy
- **Performance characteristics**: Bulk operations and efficiency testing
- **Cache lifecycle**: Cloning, cleanup, and memory management

Perfect for understanding the underlying cache mechanisms and advanced use cases.

## Key Concepts Demonstrated

### Basic Caching Operations (basic-cache-example.ts)
```typescript
// Import fjell-cache functionality
import { createCache } from '@fjell/cache';
import { createCoordinate, createRegistry } from '@fjell/registry';
import { ClientApi } from '@fjell/client-api';

// Create a registry for cache management
const registry = createRegistry();

// Create a cache instance with API integration
const userApi = createUserApi(); // Your API implementation
const userCache = await createCache(userApi, createCoordinate('user'), registry);

// Cache is now an instance - no need for separate createInstance call
// Perform cache operations through the operations API
const [cacheMap, allUsers] = await userCache.operations.all();
const [, cachedUser] = await userCache.operations.get(userKey);
const [, retrievedUser] = await userCache.operations.retrieve(userKey); // Cache hit!

await userCache.operations.set(userKey, updatedUser);
```

### Advanced Aggregation (aggregator-example.ts)
```typescript
// Create aggregated cache with relationships
const orderAggregator = await createAggregator(orderCache, {
  aggregates: {
    customer: { cache: customerCache, optional: false }, // Required reference
    product: { cache: productCache, optional: true },    // Optional reference
  },
  events: {}
});

// Automatically populate related entities
const populatedOrder = await orderAggregator.populate(order);
if (populatedOrder.aggs?.customer?.item) {
  const customer = populatedOrder.aggs.customer.item;
  console.log(`Order for: ${customer.name} (${customer.email})`);
}

// Aggregator is now itself an instance - access operations directly
const [, orders] = await orderAggregator.all();
```

### Direct Cache Management (cache-map-example.ts)
```typescript
// Create CacheMap instances directly
const documentCacheMap = new CacheMap<Document, 'document'>(['document']);
const commentCacheMap = new CacheMap<Comment, 'comment', 'document'>(['comment', 'document']);

// Basic operations
documentCacheMap.set(documentKey, document);
const retrievedDoc = documentCacheMap.get(documentKey);
const hasDoc = documentCacheMap.includesKey(documentKey);

// Bulk operations
const allDocuments = documentCacheMap.allIn([]);
const allKeys = documentCacheMap.keys();
const allValues = documentCacheMap.values();

// Location-based filtering for contained items
const commentsInDoc = commentCacheMap.allIn([{ kt: 'document', lk: documentId }]);

// Performance operations
const clonedCache = documentCacheMap.clone();
documentCacheMap.delete(documentKey);
```

### Data Model Patterns

#### Primary Items
- Standalone entities (User, Customer, Document)
- No location hierarchy constraints
- Simple key structure: `Item<'keyType'>`

#### Contained Items
- Nested within other entities or locations
- Multi-level location keys for organization
- Complex key structure: `Item<'keyType', 'location1', 'location2', ...>`

#### Aggregated Items
- Items with automatic reference population
- Business relationships through cache aggregation
- Performance optimized through cached references

## Running Examples

```bash
# Start with the basic example (recommended)
npx tsx examples/basic-cache-example.ts

# Run the aggregator example
npx tsx examples/aggregator-example.ts

# Run the cache map example
npx tsx examples/cache-map-example.ts

# Or with Node.js
node -r esbuild-register examples/basic-cache-example.ts
```

## Integration with Real Applications

All examples use the actual fjell-cache functionality! In production applications:

```typescript
import { createCache, createRegistry, createInstance, createAggregator } from '@fjell/cache';
import { ClientApi } from '@fjell/client-api';

// Basic cache setup
const registry = createRegistry();

const userCache = await createCache(userApi, 'user');
const userInstance = createInstance(registry, createCoordinate('user'), userCache);

// With aggregation for business relationships
const orderAggregator = await createAggregator(orderCache, {
  aggregates: {
    customer: { cache: customerCache, optional: false },
    items: { cache: productCache, optional: true }
  },
  events: {
    orderUpdated: async (key, item) => {
      // Custom event handling
      await notifyCustomer(item);
    }
  }
});

// Advanced cache configuration
const options = {
  cacheSize: 10000,
  ttl: 3600000, // 1 hour
  refreshThreshold: 0.8,
  compression: true
};
```

## Cache Operation Types

### Basic Operations
- **all()**: Get all items and update cache
- **get()**: Get item by key, fetch from API if not cached
- **retrieve()**: Get item by key, return null if not cached
- **set()**: Store item in cache
- **one()**: Get single item
- **find()**: Search items with finder methods

### Aggregation Operations
- **populate()**: Automatically populate item with related entities
- **populateAggregate()**: Populate specific aggregate relationship
- **populateEvent()**: Handle population events

### Cache Management
- **allIn()**: Get items by location (for contained items)
- **queryIn()**: Query items by location with filtering
- **clone()**: Create independent cache copy
- **delete()**: Remove item from cache
- **clear()**: Clear all cache contents

### Business Operations
```typescript
// Cache with business logic integration
const cache = await createCache(api, 'order', {
  hooks: {
    beforeGet: async (key) => { /* validation */ },
    afterSet: async (key, item) => { /* notifications */ }
  },
  validators: {
    status: (status) => ['pending', 'shipped', 'delivered'].includes(status)
  },
  aggregates: {
    customer: customerCache,
    items: productCache
  }
});
```

## When to Use What

**Use `basic-cache-example.ts` approach when:**
- Learning fjell-cache fundamentals
- Building simple applications with caching needs
- Need basic get/set cache operations
- Working with independent data models

**Use `aggregator-example.ts` approach when:**
- Managing complex business relationships
- Need automatic population of related entities
- Building enterprise applications with interconnected data
- Require performance optimization through aggregated caching
- Working with customer/order/product type relationships

**Use `cache-map-example.ts` approach when:**
- Need direct control over cache operations
- Building custom caching solutions
- Working with contained items and location hierarchies
- Require maximum performance and minimal overhead
- Implementing cache-based data structures

## Advanced Features

### Cache Aggregation
```typescript
// Complex aggregation with optional and required references
const ticketAggregator = await createAggregator(ticketCache, {
  aggregates: {
    customer: { cache: customerCache, optional: false },    // Always populated
    order: { cache: orderCache, optional: true },           // Only if orderId exists
    assignee: { cache: userCache, optional: true }          // Only if assigned
  },
  events: {
    ticketAssigned: async (key, ticket) => {
      await notifyAssignee(ticket);
    }
  }
});

// Automatic population includes all available references
const populatedTicket = await ticketAggregator.populate(ticket);
```

### Performance Optimization
```typescript
// Cache with coordinate and registry
const cache = await createCache(api, createCoordinate('product'), registry);

// Bulk operations for efficiency
const [cacheMap, allProducts] = await cache.operations.all();
const productMap = new Map(allProducts.map(p => [p.id, p]));

// Access cache properties for optimization
console.log(`Cache coordinate: ${cache.coordinate.kta.join(', ')}`);
console.log(`Cached items: ${cache.cacheMap.size()}`);
```

### Storage Integration
Fjell-cache works with any storage backend through the ClientApi interface:
- SQL databases (PostgreSQL, MySQL, SQLite)
- NoSQL databases (MongoDB, DynamoDB, Redis)
- REST APIs and GraphQL endpoints
- In-memory stores and mock data
- File systems and cloud storage
- Custom data sources

### Error Handling and Resilience
```typescript
// Cache with proper error handling through the API layer
const resilientCache = await createCache(api, createCoordinate('user'), registry);

// Error handling in operations
try {
  const [, user] = await resilientCache.operations.get(userKey);
  return user;
} catch (error) {
  // Handle cache errors gracefully
  console.error('Cache operation failed:', error);
  // Fallback to direct API call
  return await api.get(userKey);
}
```

This provides the foundation for building scalable, maintainable applications with intelligent caching using fjell-cache.
