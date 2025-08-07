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
  key: { pk: id },
  id,
  name,
  value
});

const createContainedItem = (id: string, containerId: string, name: string, data: string): ContainedTestItem => ({
  key: { pk: id, loc: [{ lk: containerId }] },
  id,
  name,
  data
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
      const options: CacheSubscriptionOptions<TestItem, 'test'> = {
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

      const options: CacheSubscriptionOptions<TestItem, 'test'> = {
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
      const query: ItemQuery = { name: 'Test' };
      const options: CacheSubscriptionOptions<TestItem, 'test'> = {
        query
      };

      emitter.subscribe(mockListener, options);

      const testItem = createTestItem('1', 'Test Item', 42);
      const matchingQueryEvent = CacheEventFactory.createQueryEvent(query, [], [testItem]);
      const differentQueryEvent = CacheEventFactory.createQueryEvent({ value: 42 }, [], [testItem]);

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
      const options: CacheSubscriptionOptions<TestItem, 'test'> = {
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
      const options: CacheSubscriptionOptions<TestItem, 'test'> = {
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
      const containerKey = { lk: 'container1' };
      const options: CacheSubscriptionOptions<ContainedTestItem, 'test', 'container'> = {
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
      const options1: CacheSubscriptionOptions<TestItem, 'test'> = {
        eventTypes: ['item_created']
      };
      const options2: CacheSubscriptionOptions<TestItem, 'test'> = {
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
      const options: CacheSubscriptionOptions<TestItem, 'test'> = {
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
});
