# Fjell Cache

Cache for Fjell - A powerful caching framework for TypeScript applications

## Overview

Fjell Cache provides intelligent caching capabilities for complex data models and business relationships. Built on the Fjell framework architecture, it offers high-performance caching with automatic relationship management and business logic integration.

## Features

- **Smart Caching**: Intelligent cache operations with automatic cache hits/misses
- **Business Relationships**: Automatic population of related entities through aggregation
- **Performance Optimized**: High-performance cache operations with bulk processing
- **Location-Based**: Support for contained items with location hierarchies
- **Framework Integration**: Seamless integration with Fjell Core, Registry, and Client API
- **TypeScript First**: Full TypeScript support with comprehensive type safety

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
import { createCache } from '@fjell/cache';
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

### Direct Cache Management
- **CacheMap**: Low-level cache operations and management
- **Location Filtering**: Filter contained items by location hierarchy
- **Bulk Operations**: Efficient processing of multiple cache operations

## Examples

Comprehensive examples are available in the [examples directory](./examples/):

- **[Basic Cache Example](./examples/basic-cache-example.ts)** - Start here! Fundamental caching operations
- **[Aggregator Example](./examples/aggregator-example.ts)** - Advanced business relationships
- **[Cache Map Example](./examples/cache-map-example.ts)** - Low-level cache operations

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
