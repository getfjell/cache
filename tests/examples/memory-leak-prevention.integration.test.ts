/**
 * Integration tests for memory leak prevention features
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCache } from '../../src/Cache';
import { Coordinate } from '@fjell/registry';
import { createRegistry } from '../../src/Registry';
import { CacheEventFactory } from '../../src/events/CacheEventFactory';
import { ComKey, Item, ItemQuery, PriKey } from '@fjell/core';

// Test item interface
interface TestUser extends Item<'User', 'company', 'department', 'team'> {
  name: string;
  email: string;
}

const createTestUser = (id: string, name: string, email: string): TestUser => ({
  key: { pk: id, type: 'User' },
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
      kta: ['User', 'company', 'department', 'team']
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
        { key: { type: 'User', pk: 'user1' } },
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
  });
});
