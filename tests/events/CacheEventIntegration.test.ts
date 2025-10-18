import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Item, ItemQuery, PriKey } from '@fjell/core';
import { Cache, createCache } from '../../src/Cache';
import { AnyCacheEvent, CacheEventListener, CacheSubscription } from '../../src/events/CacheEventTypes';
import { createCoordinate } from '@fjell/core';
import { createRegistry } from '@fjell/registry';

// Test item interface
interface TestItem extends Item<'test'> {
  id: string;
  name: string;
  value: number;
}

const createTestItem = (id: string, name: string, value: number): TestItem => ({
  key: { pk: id, kt: 'test' },
  id,
  name,
  value,
  __pkType: 'test' as const,
  events: {
    created: { at: new Date() },
    updated: { at: new Date() },
    deleted: { at: null }
  }
});

// Mock API for testing
const createMockApi = () => {
  // Simple in-memory store for the mock API
  const mockStore = new Map<string, TestItem>();

  return {
    async all(query: ItemQuery = {}) {
      // Return mock data based on query
      if (query.compoundCondition?.conditions.some(c => 'column' in c && c.column === 'name')) {
        const nameCondition = query.compoundCondition.conditions.find(c => 'column' in c && c.column === 'name') as any;
        return [createTestItem('1', nameCondition.value as string, 42)];
      }
      return [
        createTestItem('1', 'Item 1', 42),
        createTestItem('2', 'Item 2', 84)
      ];
    },

    async one() {
      return createTestItem('1', 'Single Item', 42);
    },

    async get(key: PriKey<'test'>) {
      return createTestItem(String(key.pk), `Item ${key.pk}`, 42);
    },

    async create(item: Partial<TestItem>) {
      const created = createTestItem(item.id || 'new', item.name || 'New Item', item.value || 0);
      mockStore.set(created.id, created);
      return created;
    },

    async update(key: PriKey<'test'>, updates: Partial<TestItem>) {
      const keyString = String(key.pk);
      const existing = mockStore.get(keyString);
      const updated = createTestItem(
        keyString,
        updates.name != null ? updates.name : (existing?.name || `Updated ${key.pk}`),
        updates.value != null ? updates.value : (existing?.value || 100)
      );
      mockStore.set(keyString, updated);
      return updated;
    },

    async remove() {
      return true;
    },

    async action(key: PriKey<'test'>, action: string) {
      return createTestItem(String(key.pk), `${action} result`, 42);
    },

    async allAction(action: string) {
      return [createTestItem('1', `${action} result`, 42)];
    },

    async facet() {
      return { facetResult: true };
    },

    async allFacet() {
      return { allFacetResult: true };
    },

    async find() {
      return [createTestItem('found', 'Found Item', 42)];
    },

    async findOne() {
      return createTestItem('found', 'Found One Item', 42);
    }
  };
};

describe('Cache Event Integration', () => {
  let cache: Cache<TestItem, 'test'>;
  let eventLog: AnyCacheEvent<TestItem, 'test'>[];
  let subscription: CacheSubscription;

  beforeEach(() => {
    const registry = createRegistry('cache');
    const coordinate = createCoordinate(['test']);
    const api = createMockApi();

    cache = createCache(api, coordinate, registry, {
      cacheType: 'memory'
    });

    eventLog = [];
    const listener: CacheEventListener<TestItem, 'test'> = (event) => {
      eventLog.push(event);
    };

    subscription = cache.subscribe(listener);
  });

  afterEach(() => {
    subscription?.unsubscribe();
    cache.eventEmitter.destroy();
  });

  describe('cache operations emit events', () => {
    it('should emit event when setting item directly in cache', async () => {
      const testItem = createTestItem('direct', 'Direct Item', 42);

      await cache.operations.set(testItem.key, testItem);

      expect(eventLog).toHaveLength(1);
      expect(eventLog[0].type).toBe('item_set');
      expect(eventLog[0]).toMatchObject({
        key: testItem.key,
        item: testItem,
        source: 'cache'
      });
    });

    it('should emit event when creating item via API', async () => {
      const newItem = { id: 'new', name: 'New Item', value: 100 };

      await cache.operations.create(newItem);

      expect(eventLog).toHaveLength(2);
      expect(eventLog[0].type).toBe('item_created');
      expect(eventLog[1].type).toBe('query_invalidated');
      expect(eventLog[0]).toMatchObject({
        source: 'api',
        item: expect.objectContaining({
          id: 'new',
          name: 'New Item',
          value: 100
        })
      });
    });

    it('should emit event when getting item from API', async () => {
      const key: PriKey<'test'> = { pk: 'api-get', kt: 'test' };

      await cache.operations.get(key);

      expect(eventLog).toHaveLength(1);
      expect(eventLog[0].type).toBe('item_retrieved');
      expect(eventLog[0]).toMatchObject({
        key,
        source: 'api',
        item: expect.objectContaining({
          id: 'api-get'
        })
      });
    });

    it('should emit event when updating item', async () => {
      const key: PriKey<'test'> = { pk: 'update-test', kt: 'test' };
      const updates = { name: 'Updated Name', value: 200 };

      // First set an item to have something to update
      const originalItem = createTestItem('update-test', 'Original', 50);
      await cache.operations.set(key, originalItem);

      // Clear event log
      eventLog.length = 0;

      await cache.operations.update(key, updates);

      expect(eventLog).toHaveLength(2);
      expect(eventLog[0].type).toBe('item_updated');
      expect(eventLog[1].type).toBe('query_invalidated');
      expect(eventLog[0]).toMatchObject({
        key,
        source: 'api',
        item: expect.objectContaining({
          name: 'Updated Name',
          value: 200
        })
      });
    });

    it('should emit event when removing item', async () => {
      const key: PriKey<'test'> = { pk: 'remove-test', kt: 'test' };

      // First set an item to have something to remove
      const originalItem = createTestItem('remove-test', 'To Remove', 50);
      await cache.operations.set(key, originalItem);

      // Clear event log
      eventLog.length = 0;

      await cache.operations.remove(key);

      expect(eventLog).toHaveLength(2);
      expect(eventLog[0].type).toBe('item_removed');
      expect(eventLog[1].type).toBe('query_invalidated');
      expect(eventLog[0]).toMatchObject({
        key,
        source: 'api',
        item: null,
        previousItem: originalItem
      });
    });

    it('should emit query event when querying items', async () => {
      const query: ItemQuery = {
        compoundCondition: {
          compoundType: 'AND',
          conditions: [
            { column: 'name', value: 'Test Query', operator: '==' }
          ]
        }
      };

      await cache.operations.all(query);

      expect(eventLog).toHaveLength(1);
      expect(eventLog[0].type).toBe('items_queried');
      expect(eventLog[0]).toMatchObject({
        query,
        locations: [],
        items: expect.arrayContaining([
          expect.objectContaining({ name: 'Test Query' })
        ])
      });
    });
  });

  describe('subscription filtering', () => {
    it('should filter events by key', async () => {
      const targetKey: PriKey<'test'> = { pk: 'target', kt: 'test' };
      const otherKey: PriKey<'test'> = { pk: 'other', kt: 'test' };

      // Create filtered subscription
      subscription.unsubscribe();
      eventLog.length = 0;

      subscription = cache.subscribe((event) => {
        eventLog.push(event);
      }, {
        keys: [targetKey]
      });

      const targetItem = createTestItem('target', 'Target Item', 42);
      const otherItem = createTestItem('other', 'Other Item', 84);

      await cache.operations.set(targetKey, targetItem);
      await cache.operations.set(otherKey, otherItem);

      expect(eventLog).toHaveLength(1);
      expect(eventLog[0]).toMatchObject({
        key: targetKey,
        item: targetItem
      });
    });

    it('should filter events by type', async () => {
      // Create filtered subscription for only created events
      subscription.unsubscribe();
      eventLog.length = 0;

      subscription = cache.subscribe((event) => {
        eventLog.push(event);
      }, {
        eventTypes: ['item_created']
      });

      const testItem = createTestItem('test', 'Test Item', 42);

      await cache.operations.set(testItem.key, testItem); // item_set - should be filtered out
      await cache.operations.create({ id: 'new', name: 'New', value: 100 }); // item_created - should pass

      expect(eventLog).toHaveLength(1);
      expect(eventLog[0].type).toBe('item_created');
    });
  });

  describe('multiple subscriptions', () => {
    it('should emit events to multiple subscribers', async () => {
      const log1: AnyCacheEvent<TestItem, 'test'>[] = [];
      const log2: AnyCacheEvent<TestItem, 'test'>[] = [];

      const sub1 = cache.subscribe((event) => log1.push(event));
      const sub2 = cache.subscribe((event) => log2.push(event));

      const testItem = createTestItem('multi', 'Multi Sub Test', 42);
      await cache.operations.set(testItem.key, testItem);

      expect(log1).toHaveLength(1);
      expect(log2).toHaveLength(1);
      expect(log1[0]).toEqual(log2[0]);

      sub1.unsubscribe();
      sub2.unsubscribe();
    });

    it('should handle subscription cleanup properly', async () => {
      const listener = vi.fn();
      const tempSub = cache.subscribe(listener);

      tempSub.unsubscribe();

      const testItem = createTestItem('cleanup', 'Cleanup Test', 42);
      await cache.operations.set(testItem.key, testItem);

      // Original subscription should still work
      expect(eventLog).toHaveLength(1);
      // Unsubscribed listener should not be called
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('event sequencing', () => {
    it('should emit events in correct order for complex operations', async () => {
      const key: PriKey<'test'> = { pk: 'sequence', kt: 'test' };

      // Perform multiple operations
      await cache.operations.create({ id: 'sequence', name: 'Original', value: 10 });
      await cache.operations.update(key, { value: 20 });
      await cache.operations.update(key, { name: 'Updated' });
      await cache.operations.remove(key);

      expect(eventLog).toHaveLength(8);
      expect(eventLog[0].type).toBe('item_created');
      expect(eventLog[1].type).toBe('query_invalidated');
      expect(eventLog[2].type).toBe('item_updated');
      expect(eventLog[3].type).toBe('query_invalidated');
      expect(eventLog[4].type).toBe('item_updated');
      expect(eventLog[5].type).toBe('query_invalidated');
      expect(eventLog[6].type).toBe('item_removed');
      expect(eventLog[7].type).toBe('query_invalidated');

      // Verify the sequence maintains proper previous/current item relationships
      expect(eventLog[6]).toMatchObject({
        type: 'item_removed',
        item: null,
        previousItem: expect.objectContaining({
          name: 'Updated',
          value: 20
        })
      });
    });
  });

  describe('cache subscription lifecycle', () => {
    it('should provide subscription management methods', () => {
      expect(cache.subscribe).toBeTypeOf('function');
      expect(cache.unsubscribe).toBeTypeOf('function');
      expect(cache.eventEmitter).toBeDefined();
    });

    it('should track subscription count', () => {
      expect(cache.eventEmitter.getSubscriptionCount()).toBe(1); // Our test subscription

      const sub1 = cache.subscribe(vi.fn());
      const sub2 = cache.subscribe(vi.fn());

      expect(cache.eventEmitter.getSubscriptionCount()).toBe(3);

      sub1.unsubscribe();
      expect(cache.eventEmitter.getSubscriptionCount()).toBe(2);

      sub2.unsubscribe();
      expect(cache.eventEmitter.getSubscriptionCount()).toBe(1);
    });

    it('should unsubscribe via cache.unsubscribe method', () => {
      const sub = cache.subscribe(vi.fn());

      expect(cache.eventEmitter.getSubscriptionCount()).toBe(2);

      const result = cache.unsubscribe(sub);
      expect(result).toBe(true);
      expect(cache.eventEmitter.getSubscriptionCount()).toBe(1);
    });
  });

  describe('error handling', () => {
    it('should continue emitting events even if a listener throws', async () => {
      const errorListener = vi.fn(() => {
        throw new Error('Test listener error');
      });
      const normalListener = vi.fn();

      cache.subscribe(errorListener);
      cache.subscribe(normalListener);

      const testItem = createTestItem('error-test', 'Error Test', 42);

      // Should not throw
      await expect(cache.operations.set(testItem.key, testItem)).resolves.toBeDefined();

      expect(errorListener).toHaveBeenCalled();
      expect(normalListener).toHaveBeenCalled();
      // Original listener should also have been called
      expect(eventLog).toHaveLength(1);
    });
  });
});
