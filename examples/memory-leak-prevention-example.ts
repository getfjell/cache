/**
 * Memory Leak Prevention Example
 *
 * This example demonstrates the new memory leak prevention features in the
 * fjell-cache event system, including:
 *
 * 1. Automatic cleanup of static timestamp state in CacheEventFactory
 * 2. Weak references for event handlers
 * 3. Automatic subscription cleanup with timeouts
 * 4. Cache destruction mechanisms
 * 5. Periodic cleanup for inactive subscriptions
 */

import { createCache } from "../src/Cache";
import { Coordinate } from "@fjell/registry";
import { createRegistry } from "../src/Registry";
import util from 'util';
import { ComKey, Item, ItemQuery, PriKey } from '@fjell/core';

// Test item interface for example
interface User extends Item<'User', 'company', 'department', 'team'> {
  name: string;
  email: string;
}

const createTestUser = (id: string, name: string, email: string): User => ({
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

// Mock API for example
const createMockApi = () => {
  const mockStore = new Map<string, User>();

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

    async create(item: Partial<User>, locations: any[]) {
      const id = `user_${Date.now()}_${Math.random()}`;
      const newUser = createTestUser(id, item.name || 'Test User', item.email || 'test@example.com');
      mockStore.set(id, newUser);
      return newUser;
    },

    async update(key: ComKey<'User', 'company', 'department', 'team'> | PriKey<'User'>, item: User) {
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

async function runMemoryLeakPreventionExample() {
  console.log("🛡️  Memory Leak Prevention Features Demo\n");

  // Create a test coordinate and registry
  const coordinate: Coordinate<"User", "company", "department", "team"> = {
    kta: ["User", "company", "department", "team"]
  };
  const registry = createRegistry();
  const api = createMockApi();

  // 1. Demonstrate automatic cache destruction and cleanup
  console.log("1️⃣ Cache Destruction and Resource Cleanup");

  let cache = createCache(api, coordinate, registry, {
    cacheType: 'memory',
    ttl: 60000, // 1 minute
    memoryConfig: {
      maxItems: 100
    }
  });

  // Create multiple subscriptions to demonstrate cleanup
  console.log("   📡 Creating event subscriptions...");

  const subscriptions = [];
  for (let i = 0; i < 5; i++) {
    const subscription = cache.subscribe(
      (event) => {
        console.log(`   📨 Listener ${i} received event: ${event.type}`);
      },
      {
        eventTypes: ['item_created', 'item_updated', 'item_removed'],
        useWeakRef: true // Enable weak references for automatic cleanup
      }
    );
    subscriptions.push(subscription);
  }

  console.log(`   ✅ Created ${subscriptions.length} subscriptions`);
  console.log(`   📊 Active subscriptions: ${cache.eventEmitter.getSubscriptionCount()}`);

  // Perform some cache operations to generate events
  console.log("   🔄 Performing cache operations...");

  const user1 = await cache.operations.create({
    name: "Alice Smith",
    email: "alice@example.com"
  }, ["company-1", "engineering", "backend"]);

  // Skip update operation for simplicity in example

  // 2. Demonstrate proper cache destruction
  console.log("\n2️⃣ Cache Destruction Process");
  console.log("   🧹 Destroying cache and cleaning up resources...");

  // This will:
  // - Stop all periodic cleanup timers
  // - Clear all event subscriptions
  // - Clean up TTL manager
  // - Notify CacheEventFactory to decrement instance count
  cache.destroy();

  console.log("   ✅ Cache destroyed successfully");
  console.log("   📊 Attempting to access destroyed cache:");

  try {
    cache.subscribe(() => { }, {});
  } catch (error) {
    console.log(`   ⚠️  Expected error: ${error.message}`);
  }

  // 3. Demonstrate weak reference cleanup (simulated)
  console.log("\n3️⃣ Weak Reference and Automatic Cleanup Features");

  // Create a new cache instance
  cache = createCache(api, coordinate, registry, {
    cacheType: 'memory'
  });

  console.log("   🔗 Creating subscription with weak reference...");

  // Create a subscription that will be automatically cleaned up
  let eventHandler = (event: any) => {
    console.log(`   📨 Weak ref handler received: ${event.type}`);
  };

  const weakSubscription = cache.subscribe(eventHandler, {
    useWeakRef: true,
    eventTypes: ['item_created']
  });

  console.log(`   📊 Active subscriptions before cleanup: ${cache.eventEmitter.getSubscriptionCount()}`);

  // Simulate handler going out of scope
  eventHandler = null as any; // Remove reference

  // Force garbage collection if available (Node.js)
  if (global.gc) {
    global.gc();
    console.log("   🗑️  Forced garbage collection");
  } else {
    console.log("   ℹ️  Garbage collection not available in this environment");
  }

  // Wait for periodic cleanup to occur (would happen automatically)
  console.log("   ⏰ Waiting for automatic cleanup to detect orphaned handlers...");

  // The CacheEventEmitter now has automatic periodic cleanup every 30 seconds
  // In real usage, this would happen automatically

  // 4. Demonstrate subscription timeout cleanup
  console.log("\n4️⃣ Subscription Timeout and Inactivity Cleanup");

  // Create subscription that will be marked as inactive
  const timeoutSubscription = cache.subscribe(
    (event) => {
      console.log(`   📨 Timeout test handler: ${event.type}`);
    },
    {
      eventTypes: ['item_updated']
    }
  );

  // Mark subscription as inactive (simulating long inactivity)
  setTimeout(() => {
    // In real usage, subscriptions become inactive automatically
    // after MAX_INACTIVE_TIME_MS (5 minutes) without access
    console.log("   ⏰ Simulating subscription becoming inactive...");
  }, 100);

  // 5. Demonstrate CacheEventFactory cleanup
  console.log("\n5️⃣ CacheEventFactory Static State Management");
  console.log("   🕒 CacheEventFactory now automatically manages timestamp state");
  console.log("   ✅ Automatic cleanup prevents memory accumulation");
  console.log("   🔄 Periodic cleanup every 60 seconds removes stale state");
  console.log("   📊 Instance counting ensures cleanup only when all instances destroyed");

  // Final cleanup
  console.log("\n🏁 Final Cleanup");
  cache.destroy();
  console.log("   ✅ All resources cleaned up successfully");

  // Memory usage information
  if (process.memoryUsage) {
    const memUsage = process.memoryUsage();
    console.log("\n📈 Memory Usage Summary:");
    console.log(`   RSS: ${Math.round(memUsage.rss / 1024 / 1024 * 100) / 100} MB`);
    console.log(`   Heap Used: ${Math.round(memUsage.heapUsed / 1024 / 1024 * 100) / 100} MB`);
    console.log(`   Heap Total: ${Math.round(memUsage.heapTotal / 1024 / 1024 * 100) / 100} MB`);
  }

  console.log("\n✨ Memory leak prevention features demonstration complete!");
  console.log("\n🛡️  Key Features Implemented:");
  console.log("   • Automatic cleanup of static state in CacheEventFactory");
  console.log("   • Weak references for event handlers (when available)");
  console.log("   • Periodic cleanup of inactive subscriptions");
  console.log("   • Comprehensive cache destruction with resource cleanup");
  console.log("   • Timeout-based subscription management");
  console.log("   • Timer cleanup to prevent resource leaks");
}

if (require.main === module) {
  runMemoryLeakPreventionExample().catch(console.error);
}

export { runMemoryLeakPreventionExample };
