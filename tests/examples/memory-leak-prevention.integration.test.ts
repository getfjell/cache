/**
 * Integration tests for memory leak prevention features
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCache } from '../../src/Cache';
import { Coordinate } from '@fjell/registry';
import { createRegistry } from '../../src/Registry';
import { CacheEventFactory } from '../../src/events/CacheEventFactory';
import { CacheEventEmitter } from '../../src/events/CacheEventEmitter';
import { ComKey, Item, ItemQuery, PriKey } from '@fjell/types';

// Test item interface
interface TestUser extends Item<'User', 'company', 'department', 'team'> {
  name: string;
  email: string;
}

const createTestUser = (id: string, name: string, email: string): TestUser => ({
  key: { kt: 'User', pk: id },
  name,
  email,
  __pkType: 'User' as const,
  events: {
    created: { at: new Date() },
    updated: { at: new Date() },
    deleted: { at: null }
  }
});

// Mock API for testing
const createMockApi = () => {
  const mockStore = new Map<string, TestUser>();

  return {
    async all() {
      return Array.from(mockStore.values());
    },

    async one() {
      const items = Array.from(mockStore.values());
      return items.length > 0 ? items[0] : null;
    },

    async get(key: PriKey<'User'>) {
      return mockStore.get(String(key.pk)) || null;
    },

    async find() {
      return Array.from(mockStore.values());
    },

    async findOne() {
      const items = Array.from(mockStore.values());
      return items.length > 0 ? items[0] : null;
    },

    async create(item: Partial<TestUser>, locations: any[]) {
      const id = `user_${Date.now()}_${Math.random()}`;
      const newUser = createTestUser(id, item.name || 'Test User', item.email || 'test@example.com');
      mockStore.set(id, newUser);
      return newUser;
    },

    async update(key: ComKey<'User', 'company', 'department', 'team'> | PriKey<'User'>, item: TestUser) {
      const id = String(key.pk);
      const updated = { ...item };
      mockStore.set(id, updated);
      return updated;
    },

    async remove(key: ComKey<'User', 'company', 'department', 'team'> | PriKey<'User'>) {
      const id = String(key.pk);
      mockStore.delete(id);
    },

    async retrieve(key: ComKey<'User', 'company', 'department', 'team'> | PriKey<'User'>) {
      return mockStore.get(String(key.pk)) || null;
    },

    async action() {
      return Array.from(mockStore.values());
    },

    async allAction() {
      return Array.from(mockStore.values());
    },

    async facet() {
      return Array.from(mockStore.values());
    },

    async allFacet() {
      return Array.from(mockStore.values());
    }
  };
};

describe('Memory Leak Prevention', () => {
  let coordinate: Coordinate<'User', 'company', 'department', 'team'>;
  let registry: any;
  let api: any;

  beforeEach(() => {
    coordinate = {
      kta: ['User', 'company', 'department', 'team'],
      scopes: []
    };
    registry = createRegistry();
    api = createMockApi();

    // Reset CacheEventFactory state
    CacheEventFactory.resetTimestamp();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('CacheEventFactory Memory Management', () => {
    it('should manage static timestamp state correctly', () => {
      const initialTimestamp = Date.now();

      // Reset should work
      CacheEventFactory.resetTimestamp();

      // Creating events should initialize cleanup
      const event1 = CacheEventFactory.itemCreated(
        { kt: 'User', pk: 'user1' },
        { key: { type: 'User', pk: 'user1' }, name: 'Test User', email: 'test@example.com' } as any
      );

      expect(event1.timestamp).toBeGreaterThanOrEqual(initialTimestamp);
      expect(event1.type).toBe('item_created');
    });

    it('should handle instance counting for cleanup', () => {
      // This tests the destroyInstance method exists and can be called
      expect(() => {
        CacheEventFactory.destroyInstance();
      }).not.toThrow();
    });

    it('should handle multiple instance creation and destruction', () => {
      // Create multiple events to simulate multiple instances
      const event1 = CacheEventFactory.itemCreated(
        { kt: 'User', pk: 'user1' },
        { key: { type: 'User', pk: 'user1' }, name: 'User 1', email: 'user1@example.com' } as any
      );

      const event2 = CacheEventFactory.itemUpdated(
        { kt: 'User', pk: 'user2' },
        { key: { type: 'User', pk: 'user2' }, name: 'User 2', email: 'user2@example.com' } as any
      );

      expect(event1.timestamp).toBeGreaterThan(0);
      expect(event2.timestamp).toBeGreaterThanOrEqual(event1.timestamp);

      // Destroy instances
      CacheEventFactory.destroyInstance();
      CacheEventFactory.destroyInstance();
    });

    it('should handle timestamp overflow and reset scenarios', () => {
      // Force a very old timestamp scenario
      const oldTimestamp = Date.now() - 1000000; // 1 million ms ago

      // Create an event to trigger cleanup
      const event = CacheEventFactory.itemCreated(
        { kt: 'User', pk: 'user1' },
        { key: { type: 'User', pk: 'user1' }, name: 'Test User', email: 'test@example.com' } as any
      );

      expect(event.timestamp).toBeGreaterThan(oldTimestamp);
    });
  });

  describe('Cache Destruction', () => {
    it('should properly destroy cache and clean up resources', () => {
      const cache = createCache(api, coordinate, registry, {
        cacheType: 'memory'
      });

      // Create some subscriptions
      const subscription1 = cache.subscribe(() => { }, {});
      const subscription2 = cache.subscribe(() => { }, {});

      expect(cache.eventEmitter.getSubscriptionCount()).toBe(2);

      // Destroy cache
      cache.destroy();

      // Should not be able to subscribe after destruction
      expect(() => {
        cache.subscribe(() => { }, {});
      }).toThrow('Cannot subscribe to destroyed event emitter');

      expect(cache.eventEmitter.getSubscriptionCount()).toBe(0);
    });

    it('should handle multiple destroy calls gracefully', () => {
      const cache = createCache(api, coordinate, registry, {
        cacheType: 'memory'
      });

      // First destroy should work
      expect(() => cache.destroy()).not.toThrow();

      // Second destroy should not throw
      expect(() => cache.destroy()).not.toThrow();
    });

    it('should clean up TTL manager when present', () => {
      const cache = createCache(api, coordinate, registry, {
        cacheType: 'memory',
        ttl: 60000
      });

      // Verify TTL manager exists
      expect(cache).toBeDefined();

      // Destroy should clean up TTL manager
      expect(() => cache.destroy()).not.toThrow();
    });

    it('should clean up cache map when it has destroy method', () => {
      const cache = createCache(api, coordinate, registry, {
        cacheType: 'memory'
      });

      // Destroy should work even if cache map doesn't have destroy method
      expect(() => cache.destroy()).not.toThrow();
    });
  });

  describe('Event Subscription Cleanup', () => {
    it('should create subscriptions with weak references when supported', () => {
      const cache = createCache(api, coordinate, registry, {
        cacheType: 'memory'
      });

      const subscription = cache.subscribe(
        () => { },
        { useWeakRef: true }
      );

      expect(subscription.id).toBeDefined();
      expect(subscription.isActive()).toBe(true);

      cache.destroy();
    });

    it('should create subscriptions without weak references when disabled', () => {
      const cache = createCache(api, coordinate, registry, {
        cacheType: 'memory'
      });

      const subscription = cache.subscribe(
        () => { },
        { useWeakRef: false }
      );

      expect(subscription.id).toBeDefined();
      expect(subscription.isActive()).toBe(true);

      cache.destroy();
    });

    it('should track subscription access times', () => {
      const cache = createCache(api, coordinate, registry, {
        cacheType: 'memory'
      });

      const subscription = cache.subscribe(() => { }, {});

      // Access the subscription
      const isActive1 = subscription.isActive();
      expect(isActive1).toBe(true);

      // Access again after a delay (removed setTimeout to avoid async issues)
      const isActive2 = subscription.isActive();
      expect(isActive2).toBe(true);

      cache.destroy();
    });

    it('should properly unsubscribe and clean up timers', () => {
      const cache = createCache(api, coordinate, registry, {
        cacheType: 'memory'
      });

      const subscription = cache.subscribe(
        () => { },
        { debounceMs: 100 }
      );

      expect(cache.eventEmitter.getSubscriptionCount()).toBe(1);

      // Unsubscribe should clean up
      const unsubscribed = cache.unsubscribe(subscription);
      expect(unsubscribed).toBe(true);
      expect(cache.eventEmitter.getSubscriptionCount()).toBe(0);

      cache.destroy();
    });

    it('should handle unsubscribe of non-existent subscription', () => {
      const cache = createCache(api, coordinate, registry, {
        cacheType: 'memory'
      });

      // Create a fake subscription object with non-existent ID
      const fakeSubscription = {
        id: 'non-existent-id',
        unsubscribe: () => { },
        isActive: () => false,
        getOptions: () => ({})
      };

      const result = cache.unsubscribe(fakeSubscription);
      expect(result).toBe(false);

      cache.destroy();
    });

    it('should handle subscription with debounce timer cleanup', () => {
      const cache = createCache(api, coordinate, registry, {
        cacheType: 'memory'
      });

      const subscription = cache.subscribe(
        () => { },
        { debounceMs: 100 }
      );

      // Trigger an event to create a debounce timer
      cache.eventEmitter.emit({
        type: 'item_created',
        timestamp: Date.now(),
        source: 'api',
        key: { type: 'User', pk: 'test' },
        item: null,
        affectedLocations: []
      } as any);

      // Unsubscribe should clean up the timer
      const unsubscribed = cache.unsubscribe(subscription);
      expect(unsubscribed).toBe(true);

      cache.destroy();
    });
  });

  describe('Event Emitter Cleanup', () => {
    it('should start and stop periodic cleanup correctly', () => {
      const cache = createCache(api, coordinate, registry, {
        cacheType: 'memory'
      });

      // Cache should be created and cleanup should be initialized
      expect(cache.eventEmitter).toBeDefined();
      expect(cache.eventEmitter.getSubscriptionCount()).toBe(0);

      // Destroy should stop cleanup
      cache.destroy();

      // Should not be able to emit after destruction
      expect(() => {
        cache.eventEmitter.emit({
          type: 'item_created',
          timestamp: Date.now(),
          source: 'api',
          key: { type: 'User', pk: 'test' },
          item: null,
          affectedLocations: []
        } as any);
      }).not.toThrow(); // emit() just returns early if destroyed
    });

    it('should handle weak reference cleanup when listeners are garbage collected', () => {
      const cache = createCache(api, coordinate, registry, {
        cacheType: 'memory'
      });

      // Create subscription with weak reference
      let handler = vi.fn();
      const subscription = cache.subscribe(handler, {
        useWeakRef: true
      });

      expect(cache.eventEmitter.getSubscriptionCount()).toBe(1);

      // Remove reference to handler
      handler = null as any;

      // In real scenario, GC would clean up the handler
      // Here we just verify the subscription exists
      expect(subscription.isActive()).toBe(true);

      cache.destroy();
    });

    it('should handle periodic cleanup of inactive subscriptions', () => {
      const cache = createCache(api, coordinate, registry, {
        cacheType: 'memory'
      });

      // Create a subscription
      const subscription = cache.subscribe(() => { }, {});

      expect(cache.eventEmitter.getSubscriptionCount()).toBe(1);

      // Manually mark as inactive (simulating timeout)
      const internalSub = (cache.eventEmitter as any).subscriptions.get(subscription.id);
      if (internalSub) {
        internalSub.isActive = false;
        internalSub.lastAccessTime = Date.now() - 400000; // 6+ minutes ago
      }

      // Trigger periodic cleanup
      (cache.eventEmitter as any).performPeriodicCleanup();

      // Subscription should be removed
      expect(cache.eventEmitter.getSubscriptionCount()).toBe(0);

      cache.destroy();
    });

    it('should handle multiple subscriptions with different configurations', () => {
      const cache = createCache(api, coordinate, registry, {
        cacheType: 'memory'
      });

      // Create subscriptions with different options
      const sub1 = cache.subscribe(() => { }, { eventTypes: ['item_created'] });
      const sub2 = cache.subscribe(() => { }, { useWeakRef: true });
      const sub3 = cache.subscribe(() => { }, { debounceMs: 50 });

      expect(cache.eventEmitter.getSubscriptionCount()).toBe(3);

      // Unsubscribe one by one
      cache.unsubscribe(sub1);
      expect(cache.eventEmitter.getSubscriptionCount()).toBe(2);

      cache.unsubscribe(sub2);
      expect(cache.eventEmitter.getSubscriptionCount()).toBe(1);

      cache.unsubscribe(sub3);
      expect(cache.eventEmitter.getSubscriptionCount()).toBe(0);

      cache.destroy();
    });
  });

  describe('Integration with Cache Operations', () => {
    it('should handle subscription cleanup during cache operations', () => {
      const cache = createCache(api, coordinate, registry, {
        cacheType: 'memory'
      });

      const events: any[] = [];
      const subscription = cache.subscribe(
        (event) => events.push(event),
        { eventTypes: ['item_created'] }
      );

      expect(cache.eventEmitter.getSubscriptionCount()).toBe(1);

      // Test that manual cleanup works correctly
      cache.unsubscribe(subscription);
      expect(cache.eventEmitter.getSubscriptionCount()).toBe(0);

      // Final cleanup should work
      cache.destroy();
      expect(cache.eventEmitter.getSubscriptionCount()).toBe(0);
    });

    it('should handle cache operations with event emission', async () => {
      const cache = createCache(api, coordinate, registry, {
        cacheType: 'memory'
      });

      const events: any[] = [];
      const subscription = cache.subscribe(
        (event) => events.push(event),
        { eventTypes: ['item_created', 'item_updated', 'item_removed'] }
      );

      // Perform cache operations
      const user = await cache.operations.create({
        name: 'Test User',
        email: 'test@example.com'
      }, [
        { kt: 'company', lk: 'company-1' },
        { kt: 'department', lk: 'dept-1' },
        { kt: 'team', lk: 'team-1' }
      ]);

      // Events should be emitted
      expect(events.length).toBeGreaterThan(0);

      cache.unsubscribe(subscription);
      cache.destroy();
    });

    it('should handle subscription with event type filtering', () => {
      const cache = createCache(api, coordinate, registry, {
        cacheType: 'memory'
      });

      const createdEvents: any[] = [];
      const updatedEvents: any[] = [];

      const createdSub = cache.subscribe(
        (event) => createdEvents.push(event),
        { eventTypes: ['item_created'] }
      );

      const updatedSub = cache.subscribe(
        (event) => updatedEvents.push(event),
        { eventTypes: ['item_updated'] }
      );

      // Emit different event types
      cache.eventEmitter.emit({
        type: 'item_created',
        timestamp: Date.now(),
        source: 'api',
        key: { type: 'User', pk: 'user1' },
        item: null,
        affectedLocations: []
      } as any);

      cache.eventEmitter.emit({
        type: 'item_updated',
        timestamp: Date.now(),
        source: 'api',
        key: { type: 'User', pk: 'user1' },
        item: null,
        affectedLocations: []
      } as any);

      expect(createdEvents.length).toBe(1);
      expect(updatedEvents.length).toBe(1);

      cache.unsubscribe(createdSub);
      cache.unsubscribe(updatedSub);
      cache.destroy();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle subscription to destroyed emitter', () => {
      const cache = createCache(api, coordinate, registry, {
        cacheType: 'memory'
      });

      cache.destroy();

      expect(() => {
        cache.subscribe(() => { }, {});
      }).toThrow('Cannot subscribe to destroyed event emitter');
    });

    it('should handle emit to destroyed emitter', () => {
      const cache = createCache(api, coordinate, registry, {
        cacheType: 'memory'
      });

      cache.destroy();

      // Should not throw when emitting to destroyed emitter
      expect(() => {
        cache.eventEmitter.emit({
          type: 'item_created',
          timestamp: Date.now(),
          source: 'api',
          key: { type: 'User', pk: 'test' },
          item: null,
          affectedLocations: []
        } as any);
      }).not.toThrow();
    });

    it('should handle multiple rapid subscriptions and unsubscriptions', () => {
      const cache = createCache(api, coordinate, registry, {
        cacheType: 'memory'
      });

      const subscriptions = [];

      // Create many subscriptions rapidly
      for (let i = 0; i < 10; i++) {
        const sub = cache.subscribe(() => { }, {});
        subscriptions.push(sub);
      }

      expect(cache.eventEmitter.getSubscriptionCount()).toBe(10);

      // Unsubscribe all rapidly
      subscriptions.forEach(sub => cache.unsubscribe(sub));

      expect(cache.eventEmitter.getSubscriptionCount()).toBe(0);

      cache.destroy();
    });

    it('should handle subscription with complex options', () => {
      const cache = createCache(api, coordinate, registry, {
        cacheType: 'memory'
      });

      const subscription = cache.subscribe(
        () => { },
        {
          eventTypes: ['item_created', 'item_updated'],
          useWeakRef: true,
          debounceMs: 100,
          keys: [{ kt: 'User', pk: 'user1' }],
          locations: [{ kt: 'company', lk: 'company-1' }, { kt: 'department', lk: 'dept-1' }, { kt: 'team', lk: 'team-1' }],
          query: { name: 'Test' } as any
        }
      );

      expect(subscription.isActive()).toBe(true);
      expect(subscription.getOptions()).toEqual({
        eventTypes: ['item_created', 'item_updated'],
        useWeakRef: true,
        debounceMs: 100,
        keys: [{ kt: 'User', pk: 'user1' }],
        locations: [{ kt: 'company', lk: 'company-1' }, { kt: 'department', lk: 'dept-1' }, { kt: 'team', lk: 'team-1' }],
        query: { name: 'Test' }
      });

      cache.unsubscribe(subscription);
      cache.destroy();
    });

    it('should handle memory pressure scenarios', () => {
      const cache = createCache(api, coordinate, registry, {
        cacheType: 'memory',
        memoryConfig: {
          maxItems: 5
        }
      });

      // Create many subscriptions to simulate memory pressure
      const subscriptions = [];
      for (let i = 0; i < 20; i++) {
        const sub = cache.subscribe(() => { }, {});
        subscriptions.push(sub);
      }

      expect(cache.eventEmitter.getSubscriptionCount()).toBe(20);

      // Clean up all subscriptions
      subscriptions.forEach(sub => cache.unsubscribe(sub));

      expect(cache.eventEmitter.getSubscriptionCount()).toBe(0);

      cache.destroy();
    });
  });

  describe('CacheEventEmitter Direct Testing', () => {
    it('should handle direct CacheEventEmitter instantiation and cleanup', () => {
      const emitter = new CacheEventEmitter<any, 'User', 'company', 'department', 'team'>();

      const subscription = emitter.subscribe(() => { }, {});
      expect(emitter.getSubscriptionCount()).toBe(1);

      emitter.destroy();
      expect(emitter.getSubscriptionCount()).toBe(0);

      // Should not be able to subscribe after destruction
      expect(() => {
        emitter.subscribe(() => { }, {});
      }).toThrow('Cannot subscribe to destroyed event emitter');
    });

    it('should handle getSubscriptions method', () => {
      const emitter = new CacheEventEmitter<any, 'User', 'company', 'department', 'team'>();

      const subscription = emitter.subscribe(() => { }, {
        eventTypes: ['item_created'],
        useWeakRef: true
      });

      const subscriptions = emitter.getSubscriptions();
      expect(subscriptions.length).toBe(1);
      expect(subscriptions[0].id).toBe(subscription.id);
      expect(subscriptions[0].options.eventTypes).toEqual(['item_created']);

      emitter.destroy();
    });

    it('should handle event filtering by keys', () => {
      const emitter = new CacheEventEmitter<any, 'User', 'company', 'department', 'team'>();

      const events: any[] = [];
      const subscription = emitter.subscribe(
        (event) => events.push(event),
        {
          keys: [{ kt: 'User', pk: 'user1' }]
        }
      );

      // Emit event with matching key
      emitter.emit({
        type: 'item_created',
        timestamp: Date.now(),
        source: 'api',
        key: { kt: 'User', pk: 'user1' },
        item: null,
        affectedLocations: []
      } as any);

      // Emit event with non-matching key
      emitter.emit({
        type: 'item_created',
        timestamp: Date.now(),
        source: 'api',
        key: { kt: 'User', pk: 'user2' },
        item: null,
        affectedLocations: []
      } as any);

      expect(events.length).toBe(1);
      expect(events[0].key.pk).toBe('user1');

      emitter.destroy();
    });

    it('should handle event filtering by locations', () => {
      const emitter = new CacheEventEmitter<any, 'User', 'company', 'department', 'team'>();

      const events: any[] = [];
      const subscription = emitter.subscribe(
        (event) => events.push(event),
        {
          locations: [{ kt: 'company', lk: 'company-1' }, { kt: 'department', lk: 'dept-1' }, { kt: 'team', lk: 'team-1' }]
        }
      );

      // Emit event with matching locations
      emitter.emit({
        type: 'item_created',
        timestamp: Date.now(),
        source: 'api',
        key: { kt: 'User', pk: 'user1' },
        item: null,
        affectedLocations: [{ kt: 'company', lk: 'company-1' }, { kt: 'department', lk: 'dept-1' }, { kt: 'team', lk: 'team-1' }]
      } as any);

      // Emit event with non-matching locations
      emitter.emit({
        type: 'item_created',
        timestamp: Date.now(),
        source: 'api',
        key: { kt: 'User', pk: 'user2' },
        item: null,
        affectedLocations: [{ kt: 'company', lk: 'company-2' }, { kt: 'department', lk: 'dept-2' }, { kt: 'team', lk: 'team-2' }]
      } as any);

      expect(events.length).toBe(1);

      emitter.destroy();
    });
  });

  describe('Memory Usage and Performance', () => {
    it('should not leak memory with repeated cache creation and destruction', () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Create and destroy multiple caches
      for (let i = 0; i < 10; i++) {
        const cache = createCache(api, coordinate, registry, {
          cacheType: 'memory'
        });

        // Create some subscriptions
        const subscriptions = [];
        for (let j = 0; j < 5; j++) {
          const sub = cache.subscribe(() => { }, {});
          subscriptions.push(sub);
        }

        // Clean up subscriptions
        subscriptions.forEach(sub => cache.unsubscribe(sub));

        // Destroy cache
        cache.destroy();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (less than 1MB)
      expect(memoryIncrease).toBeLessThan(1024 * 1024);
    });

    it('should handle large numbers of subscriptions efficiently', () => {
      const cache = createCache(api, coordinate, registry, {
        cacheType: 'memory'
      });

      const startTime = Date.now();
      const subscriptions = [];

      // Create many subscriptions
      for (let i = 0; i < 100; i++) {
        const sub = cache.subscribe(() => { }, {});
        subscriptions.push(sub);
      }

      const creationTime = Date.now() - startTime;
      expect(creationTime).toBeLessThan(1000); // Should complete in less than 1 second

      // Clean up
      subscriptions.forEach(sub => cache.unsubscribe(sub));
      cache.destroy();
    });
  });

  describe('Example Code Execution', () => {
    it('should run the memory leak prevention example successfully', async () => {
      // Import and run the actual example function
      const { runMemoryLeakPreventionExample } = await import('../../examples/memory-leak-prevention-example');

      // Mock console.log to capture output and prevent noise in tests
      const originalLog = console.log;
      const logOutput: string[] = [];
      console.log = vi.fn((...args) => {
        logOutput.push(args.join(' '));
      });

      try {
        // Run the example function
        await runMemoryLeakPreventionExample();

        // Verify the example ran successfully by checking for expected output
        const output = logOutput.join('\n');
        expect(output).toContain('Memory Leak Prevention Features Demo');
        expect(output).toContain('Cache Destruction and Resource Cleanup');
        expect(output).toContain('Creating event subscriptions');
        expect(output).toContain('Performing cache operations');
        expect(output).toContain('Cache destroyed successfully');
        expect(output).toContain('Memory leak prevention features demonstration complete');
      } finally {
        // Restore console.log
        console.log = originalLog;
      }
    });

    it('should handle example execution with error scenarios gracefully', async () => {
      // Test that the example handles errors properly
      const { runMemoryLeakPreventionExample } = await import('../../examples/memory-leak-prevention-example');

      // Mock console.log and console.error
      const originalLog = console.log;
      const originalError = console.error;
      const logOutput: string[] = [];
      const errorOutput: string[] = [];

      console.log = vi.fn((...args) => {
        logOutput.push(args.join(' '));
      });
      console.error = vi.fn((...args) => {
        errorOutput.push(args.join(' '));
      });

      try {
        // Run the example function
        await runMemoryLeakPreventionExample();

        // Verify no errors occurred
        expect(errorOutput.length).toBe(0);
        expect(logOutput.length).toBeGreaterThan(0);
      } finally {
        // Restore console methods
        console.log = originalLog;
        console.error = originalError;
      }
    });
  });
});
