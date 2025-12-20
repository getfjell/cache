import { beforeEach, describe, expect, it } from 'vitest';
import { ComKey, Item, ItemQuery } from '@fjell/types';
import { CacheEventFactory } from '../../src/events/CacheEventFactory';

// Test item interface
interface TestItem extends Item<'test'> {
  id: string;
  name: string;
  value: number;
}

// Test item with locations
interface ContainedTestItem extends Item<'test', 'container'> {
  id: string;
  name: string;
  data: string;
}

const createTestItem = (id: string, name: string, value: number): TestItem => ({
  key: { kt: 'test', pk: id },
  id,
  name,
  value,
  events: {
    created: { at: new Date() },
    updated: { at: new Date() },
    deleted: { at: null }
  }
});

const createContainedItem = (id: string, containerId: string, name: string, data: string): ContainedTestItem => ({
  key: { kt: 'test', pk: id, loc: [{ kt: 'container', lk: containerId }] },
  id,
  name,
  data,
  events: {
    created: { at: new Date() },
    updated: { at: new Date() },
    deleted: { at: null }
  }
});

describe('CacheEventFactory', () => {
  beforeEach(() => {
    // Reset timestamp state before each test
    CacheEventFactory.resetTimestamp();
  });

  describe('item events', () => {
    it('should create item created event', () => {
      const testItem = createTestItem('1', 'Test Item', 42);
      const event = CacheEventFactory.itemCreated(testItem.key, testItem);

      expect(event.type).toBe('item_created');
      expect(event.key).toEqual(testItem.key);
      expect(event.item).toEqual(testItem);
      expect(event.source).toBe('api');
      expect(event.timestamp).toBeTypeOf('number');
      expect(event.previousItem).toBeUndefined();
    });

    it('should create item updated event with previous item', () => {
      const oldItem = createTestItem('1', 'Old Name', 42);
      const newItem = createTestItem('1', 'New Name', 84);

      const event = CacheEventFactory.itemUpdated(newItem.key, newItem, oldItem);

      expect(event.type).toBe('item_updated');
      expect(event.key).toEqual(newItem.key);
      expect(event.item).toEqual(newItem);
      expect(event.previousItem).toEqual(oldItem);
      expect(event.source).toBe('api');
    });

    it('should create item removed event', () => {
      const testItem = createTestItem('1', 'Test Item', 42);
      const event = CacheEventFactory.itemRemoved(testItem.key, testItem);

      expect(event.type).toBe('item_removed');
      expect(event.key).toEqual(testItem.key);
      expect(event.item).toBeNull();
      expect(event.previousItem).toEqual(testItem);
      expect(event.source).toBe('api');
    });

    it('should create item retrieved event', () => {
      const testItem = createTestItem('1', 'Test Item', 42);
      const event = CacheEventFactory.itemRetrieved(testItem.key, testItem);

      expect(event.type).toBe('item_retrieved');
      expect(event.key).toEqual(testItem.key);
      expect(event.item).toEqual(testItem);
      expect(event.source).toBe('api');
    });

    it('should create item set event (cache operation)', () => {
      const oldItem = createTestItem('1', 'Old Item', 42);
      const newItem = createTestItem('1', 'New Item', 84);

      const event = CacheEventFactory.itemSet(newItem.key, newItem, oldItem);

      expect(event.type).toBe('item_set');
      expect(event.key).toEqual(newItem.key);
      expect(event.item).toEqual(newItem);
      expect(event.previousItem).toEqual(oldItem);
      expect(event.source).toBe('cache');
    });

    it('should allow custom source for item events', () => {
      const testItem = createTestItem('1', 'Test Item', 42);
      const event = CacheEventFactory.itemCreated(testItem.key, testItem, 'operation');

      expect(event.source).toBe('operation');
    });

    it('should include affected locations for contained items', () => {
      const containedItem = createContainedItem('1', 'container1', 'Item', 'data');
      const event = CacheEventFactory.createItemEvent(
        'item_created',
        containedItem.key,
        containedItem,
        {
          affectedLocations: [{ kt: 'container', lk: 'container1' }]
        }
      );

      expect(event.affectedLocations).toEqual([{ kt: 'container', lk: 'container1' }]);
    });

    it('should include context information', () => {
      const testItem = createTestItem('1', 'Test Item', 42);
      const context = {
        operation: 'bulk_create',
        requestId: 'req-123',
        userId: 'user-456'
      };

      const event = CacheEventFactory.createItemEvent(
        'item_created',
        testItem.key,
        testItem,
        { context }
      );

      expect(event.context).toEqual(context);
    });
  });

  describe('query events', () => {
    it('should create query event', () => {
      const item1 = createTestItem('1', 'Item 1', 42);
      const item2 = createTestItem('2', 'Item 2', 84);
      const items = [item1, item2];
      const query: ItemQuery = {};
      const locations: [] = [];

      const event = CacheEventFactory.createQueryEvent<TestItem, 'test'>(query, locations, items);

      expect(event.type).toBe('items_queried');
      expect(event.query).toEqual(query);
      expect(event.locations).toEqual(locations);
      expect(event.items).toEqual(items);
      expect(event.affectedKeys).toEqual([item1.key, item2.key]);
      expect(event.source).toBe('operation');
      expect(event.timestamp).toBeTypeOf('number');
    });

    it('should create query event with custom source', () => {
      const items = [createTestItem('1', 'Item 1', 42)];
      const query: ItemQuery = {};

      const event = CacheEventFactory.createQueryEvent<TestItem, 'test'>(query, [], items, {
        source: 'api'
      });

      expect(event.source).toBe('api');
    });

    it('should handle empty query results', () => {
      const query: ItemQuery = {};
      const event = CacheEventFactory.createQueryEvent<never, 'test'>(query, [], []);

      expect(event.items).toEqual([]);
      expect(event.affectedKeys).toEqual([]);
    });
  });

  describe('cache management events', () => {
    it('should create cache cleared event', () => {
      const event = CacheEventFactory.createCacheClearedEvent(150, true);

      expect(event.type).toBe('cache_cleared');
      expect(event.itemsCleared).toBe(150);
      expect(event.queryCacheCleared).toBe(true);
      expect(event.source).toBe('operation');
      expect(event.timestamp).toBeTypeOf('number');
    });

    it('should create cache cleared event with custom options', () => {
      const context = { operation: 'admin_clear' };
      const event = CacheEventFactory.createCacheClearedEvent(50, false, {
        source: 'api',
        context
      });

      expect(event.itemsCleared).toBe(50);
      expect(event.queryCacheCleared).toBe(false);
      expect(event.source).toBe('api');
      expect(event.context).toEqual(context);
    });

    it('should create location invalidated event', () => {
      const locations: [] = [];
      const affectedKeys = [
        { kt: 'test', pk: '1' },
        { kt: 'test', pk: '2' }
      ];

      const event = CacheEventFactory.createLocationInvalidatedEvent(locations, affectedKeys);

      expect(event.type).toBe('location_invalidated');
      expect(event.locations).toEqual(locations);
      expect(event.affectedKeys).toEqual(affectedKeys);
      expect(event.source).toBe('operation');
    });

    it('should create query invalidated event', () => {
      const invalidatedQueries = ['query-hash-1', 'query-hash-2'];
      const reason = 'item_changed';

      const event = CacheEventFactory.createQueryInvalidatedEvent(invalidatedQueries, reason);

      expect(event.type).toBe('query_invalidated');
      expect(event.invalidatedQueries).toEqual(invalidatedQueries);
      expect(event.reason).toBe(reason);
      expect(event.source).toBe('operation');
    });

    it('should create query invalidated event with different reasons', () => {
      const reasons = ['manual', 'item_changed', 'location_changed', 'ttl_expired'] as const;

      reasons.forEach(reason => {
        const event = CacheEventFactory.createQueryInvalidatedEvent(['query-1'], reason);
        expect(event.reason).toBe(reason);
      });
    });
  });

  describe('timestamp consistency', () => {
    it('should create events with reasonable timestamps', () => {
      const before = Date.now();
      const testItem = createTestItem('1', 'Test Item', 42);
      const event = CacheEventFactory.itemCreated(testItem.key, testItem);
      const after = Date.now();

      // Timestamp should be close to current time (within 1 second)
      expect(event.timestamp).toBeGreaterThanOrEqual(before - 1000);
      expect(event.timestamp).toBeLessThanOrEqual(after + 1000);
    });

    it('should create different timestamps for events created at different times', async () => {
      const testItem = createTestItem('1', 'Test Item', 42);

      const event1 = CacheEventFactory.itemCreated(testItem.key, testItem);

      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 1));

      const event2 = CacheEventFactory.itemCreated(testItem.key, testItem);

      expect(event2.timestamp).toBeGreaterThan(event1.timestamp);
    });
  });

  describe('edge cases', () => {
    it('should handle items with complex keys', () => {
      const complexKey: ComKey<'test', 'container', 'subcategory'> = {
        kt: 'test',
        pk: 'complex-id',
        loc: [{ kt: 'container', lk: 'container1' }, { kt: 'subcategory', lk: 'subcategory1' }]
      };

      const item = {
        key: complexKey,
        id: 'complex-id',
        name: 'Complex Item',
        value: 42
      } as any;

      const event = CacheEventFactory.itemCreated(complexKey, item);

      expect(event.key).toEqual(complexKey);
      expect(event.item).toEqual(item);
    });

    it('should handle null previous items gracefully', () => {
      const testItem = createTestItem('1', 'Test Item', 42);
      const event = CacheEventFactory.itemUpdated(testItem.key, testItem);

      expect(event.previousItem).toBeUndefined();
    });

    it('should handle empty affected keys list', () => {
      const event = CacheEventFactory.createLocationInvalidatedEvent([], []);

      expect(event.locations).toEqual([]);
      expect(event.affectedKeys).toEqual([]);
    });
  });
});
