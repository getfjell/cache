import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Item, ItemQuery } from '@fjell/core';
import { CacheEventEmitter } from '../../src/events/CacheEventEmitter';
import { CacheEventFactory } from '../../src/events/CacheEventFactory';
import { CacheEventListener, CacheSubscriptionOptions } from '../../src/events/CacheEventTypes';

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

describe('CacheEventEmitter', () => {
  let emitter: CacheEventEmitter<TestItem, 'test'>;
  let mockListener: CacheEventListener<TestItem, 'test'>;

  beforeEach(() => {
    emitter = new CacheEventEmitter<TestItem, 'test'>();
    mockListener = vi.fn();
  });

  afterEach(() => {
    emitter.destroy();
  });

  describe('subscription management', () => {
    it('should allow subscribing to events', () => {
      const subscription = emitter.subscribe(mockListener);

      expect(subscription.id).toBeDefined();
      expect(subscription.isActive()).toBe(true);
      expect(emitter.getSubscriptionCount()).toBe(1);
    });

    it('should allow unsubscribing from events', () => {
      const subscription = emitter.subscribe(mockListener);

      expect(emitter.getSubscriptionCount()).toBe(1);

      const unsubscribed = emitter.unsubscribe(subscription.id);
      expect(unsubscribed).toBe(true);
      expect(subscription.isActive()).toBe(false);
      expect(emitter.getSubscriptionCount()).toBe(0);
    });

    it('should return false when unsubscribing non-existent subscription', () => {
      const unsubscribed = emitter.unsubscribe('non-existent');
      expect(unsubscribed).toBe(false);
    });

    it('should allow unsubscribing via subscription object', () => {
      const subscription = emitter.subscribe(mockListener);

      expect(emitter.getSubscriptionCount()).toBe(1);

      subscription.unsubscribe();
      expect(subscription.isActive()).toBe(false);
      expect(emitter.getSubscriptionCount()).toBe(0);
    });
  });

  describe('event emission', () => {
    it('should emit events to all subscribers', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      emitter.subscribe(listener1);
      emitter.subscribe(listener2);

      const testItem = createTestItem('1', 'Test Item', 42);
      const event = CacheEventFactory.itemCreated(testItem.key, testItem);

      emitter.emit(event);

      expect(listener1).toHaveBeenCalledWith(event);
      expect(listener2).toHaveBeenCalledWith(event);
    });

    it('should not emit to inactive subscriptions', () => {
      const subscription = emitter.subscribe(mockListener);
      subscription.unsubscribe();

      const testItem = createTestItem('1', 'Test Item', 42);
      const event = CacheEventFactory.itemCreated(testItem.key, testItem);

      emitter.emit(event);

      expect(mockListener).not.toHaveBeenCalled();
    });

    it('should handle listener errors gracefully', () => {
      const errorListener = vi.fn(() => {
        throw new Error('Test error');
      });
      const normalListener = vi.fn();

      emitter.subscribe(errorListener);
      emitter.subscribe(normalListener);

      const testItem = createTestItem('1', 'Test Item', 42);
      const event = CacheEventFactory.itemCreated(testItem.key, testItem);

      // Should not throw
      expect(() => emitter.emit(event)).not.toThrow();

      expect(errorListener).toHaveBeenCalled();
      expect(normalListener).toHaveBeenCalled();
    });
  });

  describe('event filtering', () => {
    it('should filter events by type', () => {
      const options: CacheSubscriptionOptions<'test'> = {
        eventTypes: ['item_created']
      };

      emitter.subscribe(mockListener, options);

      const testItem = createTestItem('1', 'Test Item', 42);
      const createEvent = CacheEventFactory.itemCreated(testItem.key, testItem);
      const updateEvent = CacheEventFactory.itemUpdated(testItem.key, testItem);

      emitter.emit(createEvent);
      emitter.emit(updateEvent);

      expect(mockListener).toHaveBeenCalledTimes(1);
      expect(mockListener).toHaveBeenCalledWith(createEvent);
    });

    it('should filter events by specific keys', () => {
      const testItem1 = createTestItem('1', 'Test Item 1', 42);
      const testItem2 = createTestItem('2', 'Test Item 2', 84);

      const options: CacheSubscriptionOptions<'test'> = {
        keys: [testItem1.key]
      };

      emitter.subscribe(mockListener, options);

      const event1 = CacheEventFactory.itemCreated(testItem1.key, testItem1);
      const event2 = CacheEventFactory.itemCreated(testItem2.key, testItem2);

      emitter.emit(event1);
      emitter.emit(event2);

      expect(mockListener).toHaveBeenCalledTimes(1);
      expect(mockListener).toHaveBeenCalledWith(event1);
    });

    it('should filter events by query', () => {
      const query: ItemQuery = {};
      const options: CacheSubscriptionOptions<'test'> = {
        query
      };

      emitter.subscribe(mockListener, options);

      const testItem = createTestItem('1', 'Test Item', 42);
      const matchingQueryEvent = CacheEventFactory.createQueryEvent(query, [], [testItem]);
      const differentQueryEvent = CacheEventFactory.createQueryEvent({ limit: 1 }, [], [testItem]);

      emitter.emit(matchingQueryEvent);
      emitter.emit(differentQueryEvent);

      expect(mockListener).toHaveBeenCalledTimes(1);
      expect(mockListener).toHaveBeenCalledWith(matchingQueryEvent);
    });
  });

  describe('debouncing', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should debounce events when debounceMs is set', () => {
      const options: CacheSubscriptionOptions<'test'> = {
        debounceMs: 100
      };

      emitter.subscribe(mockListener, options);

      const testItem = createTestItem('1', 'Test Item', 42);
      const event = CacheEventFactory.itemCreated(testItem.key, testItem);

      // Emit multiple events quickly
      emitter.emit(event);
      emitter.emit(event);
      emitter.emit(event);

      // Should not have been called yet
      expect(mockListener).not.toHaveBeenCalled();

      // Fast forward time
      vi.advanceTimersByTime(100);

      // Should now be called once
      expect(mockListener).toHaveBeenCalledTimes(1);
      expect(mockListener).toHaveBeenCalledWith(event);
    });

    it('should reset debounce timer on new events', () => {
      const options: CacheSubscriptionOptions<'test'> = {
        debounceMs: 100
      };

      emitter.subscribe(mockListener, options);

      const testItem = createTestItem('1', 'Test Item', 42);
      const event = CacheEventFactory.itemCreated(testItem.key, testItem);

      emitter.emit(event);

      // Advance time partially
      vi.advanceTimersByTime(50);

      // Emit another event (should reset timer)
      emitter.emit(event);

      // Advance time to when first event would have fired
      vi.advanceTimersByTime(50);

      // Should not have been called yet
      expect(mockListener).not.toHaveBeenCalled();

      // Advance remaining time
      vi.advanceTimersByTime(50);

      // Should now be called
      expect(mockListener).toHaveBeenCalledTimes(1);
    });
  });

  describe('contained items (with locations)', () => {
    let containedEmitter: CacheEventEmitter<ContainedTestItem, 'test', 'container'>;

    beforeEach(() => {
      containedEmitter = new CacheEventEmitter<ContainedTestItem, 'test', 'container'>();
    });

    afterEach(() => {
      containedEmitter.destroy();
    });

    it('should filter events by locations', () => {
      const containerKey = { kt: 'container', lk: 'container1' };
      const options: CacheSubscriptionOptions<'test', 'container'> = {
        locations: [containerKey]
      };

      const listener = vi.fn();
      containedEmitter.subscribe(listener, options);

      const item1 = createContainedItem('1', 'container1', 'Item 1', 'data1');
      const item2 = createContainedItem('2', 'container2', 'Item 2', 'data2');

      const event1 = CacheEventFactory.itemCreated(item1.key, item1);
      const event2 = CacheEventFactory.itemCreated(item2.key, item2);

      containedEmitter.emit(event1);
      containedEmitter.emit(event2);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(event1);
    });
  });

  describe('destruction', () => {
    it('should clean up all subscriptions when destroyed', () => {
      const subscription1 = emitter.subscribe(vi.fn());
      const subscription2 = emitter.subscribe(vi.fn());

      expect(emitter.getSubscriptionCount()).toBe(2);
      expect(subscription1.isActive()).toBe(true);
      expect(subscription2.isActive()).toBe(true);

      emitter.destroy();

      expect(emitter.getSubscriptionCount()).toBe(0);
      expect(subscription1.isActive()).toBe(false);
      expect(subscription2.isActive()).toBe(false);
    });

    it('should not emit events after destruction', () => {
      emitter.subscribe(mockListener);
      emitter.destroy();

      const testItem = createTestItem('1', 'Test Item', 42);
      const event = CacheEventFactory.itemCreated(testItem.key, testItem);

      emitter.emit(event);

      expect(mockListener).not.toHaveBeenCalled();
    });

    it('should throw when subscribing to destroyed emitter', () => {
      emitter.destroy();

      expect(() => {
        emitter.subscribe(mockListener);
      }).toThrow('Cannot subscribe to destroyed event emitter');
    });
  });

  describe('subscription info', () => {
    it('should provide subscription details', () => {
      const options1: CacheSubscriptionOptions<'test'> = {
        eventTypes: ['item_created']
      };
      const options2: CacheSubscriptionOptions<'test'> = {
        debounceMs: 100
      };

      const sub1 = emitter.subscribe(vi.fn(), options1);
      const sub2 = emitter.subscribe(vi.fn(), options2);

      const subscriptions = emitter.getSubscriptions();

      expect(subscriptions).toHaveLength(2);
      expect(subscriptions.find(s => s.id === sub1.id)?.options).toEqual(options1);
      expect(subscriptions.find(s => s.id === sub2.id)?.options).toEqual(options2);
    });

    it('should return subscription options from subscription object', () => {
      const options: CacheSubscriptionOptions<'test'> = {
        eventTypes: ['item_created'],
        debounceMs: 50
      };

      const subscription = emitter.subscribe(mockListener, options);
      const returnedOptions = subscription.getOptions();

      expect(returnedOptions).toEqual(options);
      // Should be a copy, not the same object
      expect(returnedOptions).not.toBe(options);
    });
  });

  describe('error handling', () => {
    it('should call custom error handler when listener throws', () => {
      const errorHandler = vi.fn();
      const errorListener = vi.fn(() => {
        throw new Error('Test listener error');
      });

      const options: CacheSubscriptionOptions<'test'> = {
        onError: errorHandler
      };

      emitter.subscribe(errorListener, options);

      const testItem = createTestItem('1', 'Test Item', 42);
      const event = CacheEventFactory.itemCreated(testItem.key, testItem);

      emitter.emit(event);

      expect(errorListener).toHaveBeenCalled();
      expect(errorHandler).toHaveBeenCalledWith(
        expect.any(Error),
        event
      );
    });

    it('should handle errors in error handler gracefully', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

      const errorHandler = vi.fn(() => {
        throw new Error('Error handler error');
      });

      const errorListener = vi.fn(() => {
        throw new Error('Test listener error');
      });

      const options: CacheSubscriptionOptions<'test'> = {
        onError: errorHandler
      };

      emitter.subscribe(errorListener, options);

      const testItem = createTestItem('1', 'Test Item', 42);
      const event = CacheEventFactory.itemCreated(testItem.key, testItem);

      // Should not throw despite double error
      expect(() => emitter.emit(event)).not.toThrow();

      expect(errorListener).toHaveBeenCalled();
      expect(errorHandler).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2); // Both errors logged

      consoleErrorSpy.mockRestore();
    });

    it('should convert non-Error objects to Error when handling listener errors', () => {
      const errorHandler = vi.fn();
      const errorListener = vi.fn(() => {
        throw 'String error'; // Non-Error object
      });

      const options: CacheSubscriptionOptions<'test'> = {
        onError: errorHandler
      };

      emitter.subscribe(errorListener, options);

      const testItem = createTestItem('1', 'Test Item', 42);
      const event = CacheEventFactory.itemCreated(testItem.key, testItem);

      emitter.emit(event);

      expect(errorHandler).toHaveBeenCalledWith(
        expect.any(Error),
        event
      );

      const calledError = errorHandler.mock.calls[0][0];
      expect(calledError.message).toBe('String error');
    });

    it('should log to console when no error handler is provided', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

      const errorListener = vi.fn(() => {
        throw new Error('Test listener error');
      });

      emitter.subscribe(errorListener); // No error handler

      const testItem = createTestItem('1', 'Test Item', 42);
      const event = CacheEventFactory.itemCreated(testItem.key, testItem);

      emitter.emit(event);

      expect(errorListener).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error in cache event listener:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('key filtering with affected keys', () => {
    it('should filter events with affectedKeys array', () => {
      const testItem1 = createTestItem('1', 'Test Item 1', 42);
      const testItem2 = createTestItem('2', 'Test Item 2', 84);
      const testItem3 = createTestItem('3', 'Test Item 3', 126);

      const options: CacheSubscriptionOptions<'test'> = {
        keys: [testItem1.key, testItem2.key]
      };

      emitter.subscribe(mockListener, options);

      // Create a query event with affectedKeys
      const queryEvent = CacheEventFactory.createQueryEvent(
        {},
        [],
        [testItem1, testItem2, testItem3]
      );

      emitter.emit(queryEvent);

      expect(mockListener).toHaveBeenCalledTimes(1);
      expect(mockListener).toHaveBeenCalledWith(queryEvent);
    });

    it('should not emit when no affectedKeys match subscription keys', () => {
      const testItem1 = createTestItem('1', 'Test Item 1', 42);
      const testItem2 = createTestItem('2', 'Test Item 2', 84);
      const testItem3 = createTestItem('3', 'Test Item 3', 126);

      const options: CacheSubscriptionOptions<'test'> = {
        keys: [testItem1.key]
      };

      emitter.subscribe(mockListener, options);

      // Create a query event with affectedKeys that don't match
      const queryEvent = CacheEventFactory.createQueryEvent(
        {},
        [],
        [testItem2, testItem3]
      );

      emitter.emit(queryEvent);

      expect(mockListener).not.toHaveBeenCalled();
    });

    it('should handle location invalidated events with affectedKeys', () => {
      const testItem1 = createTestItem('1', 'Test Item 1', 42);
      const testItem2 = createTestItem('2', 'Test Item 2', 84);

      const options: CacheSubscriptionOptions<'test'> = {
        keys: [testItem1.key]
      };

      emitter.subscribe(mockListener, options);

      const locationEvent = CacheEventFactory.createLocationInvalidatedEvent(
        [],
        [testItem1.key, testItem2.key]
      );

      emitter.emit(locationEvent);

      expect(mockListener).toHaveBeenCalledTimes(1);
      expect(mockListener).toHaveBeenCalledWith(locationEvent);
    });
  });

  describe('location filtering advanced cases', () => {
    let multiLevelEmitter: CacheEventEmitter<ContainedTestItem, 'test', 'container', 'subcategory'>;

    beforeEach(() => {
      multiLevelEmitter = new CacheEventEmitter<ContainedTestItem, 'test', 'container', 'subcategory'>();
    });

    afterEach(() => {
      multiLevelEmitter.destroy();
    });

    it('should handle events without location info when subscription has location filters', () => {
      const options: CacheSubscriptionOptions<'test'> = {
        locations: [{ kt: 'container', lk: 'container1' }]
      };

      emitter.subscribe(mockListener, options);

      // Create a cache cleared event (no location info)
      const cacheEvent = CacheEventFactory.createCacheClearedEvent(10, true);

      emitter.emit(cacheEvent);

      expect(mockListener).not.toHaveBeenCalled();
    });

    it('should handle PriKey items with location filters', () => {
      const priKeyItem = createTestItem('1', 'Test Item', 42); // PriKey (no locations)

      const options: CacheSubscriptionOptions<'test'> = {
        locations: [{ kt: 'container', lk: 'container1' }]
      };

      emitter.subscribe(mockListener, options);

      const event = CacheEventFactory.itemCreated(priKeyItem.key, priKeyItem);

      emitter.emit(event);

      expect(mockListener).not.toHaveBeenCalled();
    });

    it('should match PriKey items when location filter is empty', () => {
      const priKeyItem = createTestItem('1', 'Test Item', 42); // PriKey (no locations)

      const options: CacheSubscriptionOptions<'test'> = {
        locations: []
      };

      emitter.subscribe(mockListener, options);

      const event = CacheEventFactory.itemCreated(priKeyItem.key, priKeyItem);

      emitter.emit(event);

      expect(mockListener).toHaveBeenCalledTimes(1);
      expect(mockListener).toHaveBeenCalledWith(event);
    });

    it('should handle events with affectedLocations vs locations properties', () => {
      const containerKey = { kt: 'container', lk: 'container1' };
      const options: CacheSubscriptionOptions<'test', 'container'> = {
        locations: [containerKey]
      };

      const listener = vi.fn();
      multiLevelEmitter.subscribe(listener, options);

      // Create event with affectedLocations (like ItemEvent)
      const item = createContainedItem('1', 'container1', 'Item 1', 'data1');
      const itemEvent = CacheEventFactory.itemCreated(item.key, item);

      // Create event with locations (like QueryEvent)
      const queryEvent = CacheEventFactory.createQueryEvent(
        {},
        [containerKey],
        [item]
      );

      multiLevelEmitter.emit(itemEvent);
      multiLevelEmitter.emit(queryEvent);

      expect(listener).toHaveBeenCalledTimes(2);
      expect(listener).toHaveBeenNthCalledWith(1, itemEvent);
      expect(listener).toHaveBeenNthCalledWith(2, queryEvent);
    });

    it('should handle mismatched location array lengths', () => {
      const options: CacheSubscriptionOptions<'test', 'container'> = {
        locations: [{ kt: 'container', lk: 'container1' }]
      };

      const listener = vi.fn();
      multiLevelEmitter.subscribe(listener, options);

      // Create event with different location structure (empty array)
      const queryEvent = CacheEventFactory.createQueryEvent(
        {},
        [], // Different length from filter
        []
      );

      multiLevelEmitter.emit(queryEvent);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('query matching', () => {
    it('should handle complex nested query objects', () => {
      const complexQuery = {};

      const options: CacheSubscriptionOptions<'test'> = {
        query: complexQuery
      };

      emitter.subscribe(mockListener, options);

      const matchingEvent = CacheEventFactory.createQueryEvent(
        complexQuery,
        [],
        []
      );

      const differentEvent = CacheEventFactory.createQueryEvent(
        { limit: 10 },
        [],
        []
      );

      emitter.emit(matchingEvent);
      emitter.emit(differentEvent);

      expect(mockListener).toHaveBeenCalledTimes(1);
      expect(mockListener).toHaveBeenCalledWith(matchingEvent);
    });

    it('should normalize query objects with different property orders', () => {
      const query1 = {};
      const query2 = {}; // Different order, but should match after normalization

      const options: CacheSubscriptionOptions<'test'> = {
        query: query1
      };

      emitter.subscribe(mockListener, options);

      const event = CacheEventFactory.createQueryEvent(query2, [], []);

      emitter.emit(event);

      expect(mockListener).toHaveBeenCalledTimes(1);
      expect(mockListener).toHaveBeenCalledWith(event);
    });

    it('should handle non-query events with query filters', () => {
      const options: CacheSubscriptionOptions<'test'> = {
        query: {}
      };

      emitter.subscribe(mockListener, options);

      // Non-query event should pass through (can't determine query match)
      const testItem = createTestItem('1', 'Test Item', 42);
      const itemEvent = CacheEventFactory.itemCreated(testItem.key, testItem);

      emitter.emit(itemEvent);

      expect(mockListener).toHaveBeenCalledTimes(1);
      expect(mockListener).toHaveBeenCalledWith(itemEvent);
    });
  });

  describe('key normalization', () => {
    it('should normalize string and number values consistently', () => {
      // Create items with equivalent but differently typed keys
      const stringItem = createTestItem('123', 'String Key Item', 42);
      const numericKeyItem = { ...stringItem, key: { kt: 'test', pk: 123 } }; // Number instead of string

      const options: CacheSubscriptionOptions<'test'> = {
        keys: [stringItem.key]
      };

      emitter.subscribe(mockListener, options);

      const stringEvent = CacheEventFactory.itemCreated(stringItem.key, stringItem);
      const numericEvent = CacheEventFactory.itemCreated(numericKeyItem.key, numericKeyItem);

      emitter.emit(stringEvent);
      emitter.emit(numericEvent);

      // Both should match due to normalization
      expect(mockListener).toHaveBeenCalledTimes(2);
    });

    it('should handle complex key structures with nested normalization', () => {
      const complexKey1 = {
        kt: 'test',
        pk: '123',
        loc: [{ kt: 'container', lk: 'container1' }, { kt: 'container', lk: 456 }] // Mixed string/number
      };

      const complexKey2 = {
        kt: 'test',
        pk: 123, // Number instead of string
        loc: [{ kt: 'container', lk: 'container1' }, { kt: 'container', lk: '456' }] // String instead of number
      };

      const item1 = { ...createContainedItem('123', 'container1', 'Item 1', 'data1'), key: complexKey1 };
      const item2 = { ...item1, key: complexKey2 };

      const containedEmitter = new CacheEventEmitter<any, 'test', 'container'>();
      const listener = vi.fn();

      const options = {
        keys: [complexKey1]
      };

      containedEmitter.subscribe(listener, options);

      const event1 = CacheEventFactory.itemCreated(complexKey1, item1);
      const event2 = CacheEventFactory.itemCreated(complexKey2, item2);

      containedEmitter.emit(event1);
      containedEmitter.emit(event2);

      expect(listener).toHaveBeenCalledTimes(2);

      containedEmitter.destroy();
    });
  });

  describe('debounce timer management', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should clear debounce timer on unsubscribe', () => {
      const options: CacheSubscriptionOptions<'test'> = {
        debounceMs: 100
      };

      const subscription = emitter.subscribe(mockListener, options);

      const testItem = createTestItem('1', 'Test Item', 42);
      const event = CacheEventFactory.itemCreated(testItem.key, testItem);

      emitter.emit(event);

      // Timer should be set
      expect(mockListener).not.toHaveBeenCalled();

      subscription.unsubscribe();

      // Advance time past debounce period
      vi.advanceTimersByTime(150);

      // Should not have been called because timer was cleared
      expect(mockListener).not.toHaveBeenCalled();
    });

    it('should clear debounce timers on destroy', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      const options: CacheSubscriptionOptions<'test'> = {
        debounceMs: 100
      };

      emitter.subscribe(listener1, options);
      emitter.subscribe(listener2, options);

      const testItem = createTestItem('1', 'Test Item', 42);
      const event = CacheEventFactory.itemCreated(testItem.key, testItem);

      emitter.emit(event);

      // Timers should be set
      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();

      emitter.destroy();

      // Advance time past debounce period
      vi.advanceTimersByTime(150);

      // Should not have been called because timers were cleared
      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
    });

    it('should not emit to inactive subscriptions after debounce', () => {
      const options: CacheSubscriptionOptions<'test'> = {
        debounceMs: 100
      };

      const subscription = emitter.subscribe(mockListener, options);

      const testItem = createTestItem('1', 'Test Item', 42);
      const event = CacheEventFactory.itemCreated(testItem.key, testItem);

      emitter.emit(event);

      // Unsubscribe while timer is pending
      subscription.unsubscribe();

      // Advance time
      vi.advanceTimersByTime(150);

      // Should not be called because subscription became inactive
      expect(mockListener).not.toHaveBeenCalled();
    });

    it('should update lastEmitTime when debounced event fires', () => {
      const options: CacheSubscriptionOptions<'test'> = {
        debounceMs: 100
      };

      const subscription = emitter.subscribe(mockListener, options);

      const testItem = createTestItem('1', 'Test Item', 42);
      const event = CacheEventFactory.itemCreated(testItem.key, testItem);

      emitter.emit(event);

      vi.advanceTimersByTime(100);

      expect(mockListener).toHaveBeenCalledTimes(1);

      // Verify the subscription still exists and is active
      expect(subscription.isActive()).toBe(true);
    });
  });

  describe('subscription ID generation', () => {
    it('should generate unique subscription IDs', () => {
      const sub1 = emitter.subscribe(vi.fn());
      const sub2 = emitter.subscribe(vi.fn());
      const sub3 = emitter.subscribe(vi.fn());

      expect(sub1.id).not.toBe(sub2.id);
      expect(sub2.id).not.toBe(sub3.id);
      expect(sub1.id).not.toBe(sub3.id);

      // IDs should follow the expected pattern
      expect(sub1.id).toMatch(/^subscription_\d+$/);
      expect(sub2.id).toMatch(/^subscription_\d+$/);
      expect(sub3.id).toMatch(/^subscription_\d+$/);
    });

    it('should increment subscription IDs sequentially', () => {
      const sub1 = emitter.subscribe(vi.fn());
      const sub2 = emitter.subscribe(vi.fn());

      const id1Num = parseInt(sub1.id.replace('subscription_', ''));
      const id2Num = parseInt(sub2.id.replace('subscription_', ''));

      expect(id2Num).toBe(id1Num + 1);
    });
  });
});
