import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCache } from '../../src/Cache';
import { AllOperationResult, Item, ItemQuery, PriKey } from '@fjell/types';
import { CacheEventFactory } from '../../src/events/CacheEventFactory';

interface TestItem extends Item<'test'> {
  key: PriKey<'test'>;
  name: string;
  value: number;
}

describe('Query Invalidation Events', () => {
  let cache: any;
  let mockApi: any;
  let emittedEvents: any[] = [];
  let mockData: Map<string, TestItem>;

  beforeEach(() => {
    emittedEvents = [];
    
    // Initialize mock data store
    mockData = new Map([
      ['test:1', { key: { pk: 'test:1', kt: 'test' }, name: 'Item 1', value: 1 }],
      ['test:2', { key: { pk: 'test:2', kt: 'test' }, name: 'Item 2', value: 2 }]
    ]);

    mockApi = {
      all: vi.fn(async (): Promise<AllOperationResult<TestItem>> => {
        const items = Array.from(mockData.values());
        return {
          items,
          metadata: { total: items.length, returned: items.length, offset: 0, hasMore: false }
        };
      }),
      update: vi.fn(async (key: PriKey<'test'>, updates: Partial<TestItem>) => {
        const existing = mockData.get(key.pk) || { key, name: 'Updated', value: 0 };
        const updated = { ...existing, ...updates, key };
        mockData.set(key.pk, updated);
        return updated;
      }),
      create: vi.fn(async () => ({
        key: { pk: 'test:3', kt: 'test' },
        name: 'New Item',
        value: 3
      })),
      remove: vi.fn(async () => { })
    };

    const coordinate = { pkType: 'test' as const, kta: ['test'] as const };
    const registry = { type: 'cache' as const };

    cache = createCache(mockApi, coordinate, registry, {
      cacheType: 'memory'
    });

    // Subscribe to all events
    cache.subscribe((event: any) => {
      emittedEvents.push(event);
    });
  });

  it('should emit query_invalidated event when updating an item', async () => {
    // First, do a query to populate the cache
    await cache.operations.all();

    // Clear captured events from the query
    emittedEvents = [];

    // Update an item
    await cache.operations.update(
      { pk: 'test:1', kt: 'test' },
      { name: 'Updated!' }
    );

    // Check that both item_updated and query_invalidated events were emitted
    const itemUpdatedEvent = emittedEvents.find(e => e.type === 'item_updated');
    const queryInvalidatedEvent = emittedEvents.find(e => e.type === 'query_invalidated');

    expect(itemUpdatedEvent).toBeDefined();
    expect(queryInvalidatedEvent).toBeDefined();
    expect(queryInvalidatedEvent.reason).toBe('item_changed');
    expect(queryInvalidatedEvent.context.operation).toBe('update');
  });

  it('should emit query_invalidated event when creating an item', async () => {
    // Clear any initial events
    emittedEvents = [];

    // Create an item
    await cache.operations.create({ name: 'New Item', value: 100 });

    // Check that both item_created and query_invalidated events were emitted
    const itemCreatedEvent = emittedEvents.find(e => e.type === 'item_created');
    const queryInvalidatedEvent = emittedEvents.find(e => e.type === 'query_invalidated');

    expect(itemCreatedEvent).toBeDefined();
    expect(queryInvalidatedEvent).toBeDefined();
    expect(queryInvalidatedEvent.reason).toBe('item_changed');
    expect(queryInvalidatedEvent.context.operation).toBe('create');
  });

  it('should emit query_invalidated event when removing an item', async () => {
    // First, create an item to remove
    await cache.operations.create({ name: 'To Remove', value: 50 });

    // Clear captured events
    emittedEvents = [];

    // Remove the item
    await cache.operations.remove({ pk: 'test:3', kt: 'test' });

    // Check that both item_removed and query_invalidated events were emitted
    const itemRemovedEvent = emittedEvents.find(e => e.type === 'item_removed');
    const queryInvalidatedEvent = emittedEvents.find(e => e.type === 'query_invalidated');

    expect(itemRemovedEvent).toBeDefined();
    expect(queryInvalidatedEvent).toBeDefined();
    expect(queryInvalidatedEvent.reason).toBe('item_changed');
    expect(queryInvalidatedEvent.context.operation).toBe('remove');
  });

  it('should return updated items from cache after update', async () => {
    // First, do a query to populate the cache
    const query: ItemQuery = {}; // Empty query to get all items
    const initialResults = await cache.operations.all(query);
    expect(initialResults.items).toHaveLength(2);
    expect(initialResults.items[0].value).toBe(1);
    expect(mockApi.all).toHaveBeenCalledTimes(1);

    // Update an item
    await cache.operations.update(
      { pk: 'test:1', kt: 'test' },
      { value: 999 }
    );

    // The next query should return the updated item from cache
    // It uses the individual item cache, not the query cache
    const secondResults = await cache.operations.all(query);
    expect(secondResults.items).toHaveLength(2);

    // Find the updated item - should have the updated value
    const updatedItem = secondResults.items.find(item => item.key.pk === 'test:1');
    expect(updatedItem?.value).toBe(999);

    // The API should have been called for the update
    expect(mockApi.update).toHaveBeenCalledTimes(1);
  });
});
