
/**
 * Basic Cache Example
 *
 * This example demonstrates the fundamental usage of fjell-cache for caching data models.
 * It shows how to create caches, perform basic operations like get/set/all, and manage
 * cached data with mock storage operations.
 *
 * Perfect for understanding the basics of fjell-cache before moving to advanced features.
 */

import { createCache } from '../src/Cache';
import { createInstance } from '../src/Instance';
import { createRegistry } from '../src/Registry';
import { ClientApi } from '@fjell/client-api';
import { Item, PriKey } from "@fjell/types";
import { createCoordinate } from '@fjell/core';

// Define our data models
interface User extends Item<'user'> {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user' | 'guest';
}

interface Task extends Item<'task'> {
  id: string;
  title: string;
  description: string;
  assignedTo?: string;
  status: 'pending' | 'in-progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
}

// Mock storage for demonstration (in real apps, this would be your database/API)
const mockUserStorage = new Map<string, User>();
const mockTaskStorage = new Map<string, Task>();

// Simple mock API for Users (simplified to avoid type issues)
const createUserApi = (): Partial<ClientApi<User, 'user'>> => ({
  async all(query = {}) {
    console.log('📦 Fetching all users from storage...');
    const items = Array.from(mockUserStorage.values());
    return { items, metadata: { total: items.length, returned: items.length, offset: 0, hasMore: false } };
  },

  async one(query = {}) {
    const result = await this.all!(query);
    return result.items[0] || null;
  },

  async get(key: PriKey<'user'>) {
    console.log(`🔍 Getting user with key: ${key.pk}`);
    const user = mockUserStorage.get(String(key.pk));
    if (!user) {
      throw new Error(`User not found: ${key.pk}`);
    }
    return user;
  },

  async find(finder = 'all') {
    const result = await this.all!({});
    // find() now returns FindOperationResult, not array
    return {
      items: result.items,
      metadata: result.metadata
    };
  }
});

// Simple mock API for Tasks
const createTaskApi = (): Partial<ClientApi<Task, 'task'>> => ({
  async all(query = {}) {
    console.log('📦 Fetching all tasks from storage...');
    const items = Array.from(mockTaskStorage.values());
    return { items, metadata: { total: items.length, returned: items.length, offset: 0, hasMore: false } };
  },

  async one(query = {}) {
    const result = await this.all!(query);
    return result.items[0] || null;
  },

  async get(key: PriKey<'task'>) {
    console.log(`🔍 Getting task with key: ${key.pk}`);
    const task = mockTaskStorage.get(String(key.pk));
    if (!task) {
      throw new Error(`Task not found: ${key.pk}`);
    }
    return task;
  },

  async find(finder = 'all') {
    const result = await this.all!({});
    // find() now returns FindOperationResult, not array
    return {
      items: result.items,
      metadata: result.metadata
    };
  }
});

// Helper function to create test data
const createTestUser = (id: string, name: string, email: string, role: 'admin' | 'user' | 'guest'): User => {
  const user: User = {
    id,
    name,
    email,
    role,
    key: { kt: 'user', pk: id },
    events: {
      created: { at: new Date() },
      updated: { at: new Date() },
      deleted: { at: null }
    }
  };
  mockUserStorage.set(id, user);
  console.log(`✅ Created user: ${user.name} (${user.email})`);
  return user;
};

const createTestTask = (id: string, title: string, description: string, assignedTo: string, status: 'pending' | 'in-progress' | 'completed', priority: 'low' | 'medium' | 'high'): Task => {
  const task: Task = {
    id,
    title,
    description,
    assignedTo,
    status,
    priority,
    key: { kt: 'task', pk: id },
    events: {
      created: { at: new Date() },
      updated: { at: new Date() },
      deleted: { at: null }
    }
  };
  mockTaskStorage.set(id, task);
  console.log(`✅ Created task: ${task.title}`);
  return task;
};

// Main example function
export const runBasicCacheExample = async (): Promise<void> => {
  console.log('\n🚀 Fjell-Cache Basic Example');
  console.log('============================\n');

  console.log('This example demonstrates basic cache operations with User and Task models.\n');

  // Step 1: Create registry and cache instances
  console.log('Step 1: Setting up cache infrastructure');
  console.log('--------------------------------------');

  const registry = createRegistry();
  console.log('✅ Created cache registry');

  const userApi = createUserApi() as ClientApi<User, 'user'>;
  const taskApi = createTaskApi() as ClientApi<Task, 'task'>;
  console.log('✅ Created mock APIs for users and tasks');

  const userCache = await createCache(userApi, createCoordinate('user'), registry);
  const taskCache = await createCache(taskApi, createCoordinate('task'), registry);
  console.log('✅ Created cache instances (which are now also instances)');
  console.log('✅ Created cache model instances\n');

  // Step 2: Create some test data
  console.log('Step 2: Creating test data');
  console.log('-------------------------');

  const user1 = createTestUser('user-1', 'Alice Johnson', 'alice@example.com', 'admin');
  const user2 = createTestUser('user-2', 'Bob Smith', 'bob@example.com', 'user');

  const task1 = createTestTask('task-1', 'Setup project repository', 'Initialize Git repo and create basic structure', user1.id, 'completed', 'high');
  const task2 = createTestTask('task-2', 'Implement user authentication', 'Add login and registration functionality', user2.id, 'in-progress', 'medium');

  console.log('✅ Created test users and tasks\n');

  // Step 3: Cache operations - Fetch and cache all items
  console.log('Step 3: Cache operations - Fetching all items');
  console.log('----------------------------------------------');

  const allUsers = await userCache.operations.all();
  console.log(`📋 Cached ${allUsers.items.length} users:`, allUsers.items.map((u: User) => u.name));

  const allTasks = await taskCache.operations.all();
  console.log(`📋 Cached ${allTasks.items.length} tasks:`, allTasks.items.map((t: Task) => t.title));
  console.log('');

  // Step 4: Individual item retrieval from cache
  console.log('Step 4: Individual item retrieval');
  console.log('---------------------------------');

  const cachedUser1 = await userCache.operations.get(user1.key);
  console.log(`👤 Retrieved from cache: ${cachedUser1?.name} (${cachedUser1?.email})`);

  const cachedTask1 = await taskCache.operations.get(task1.key);
  console.log(`📝 Retrieved from cache: ${cachedTask1?.title} - Status: ${cachedTask1?.status}`);
  console.log('');

  // Step 5: Cache hit vs miss demonstration
  console.log('Step 5: Cache behavior demonstration');
  console.log('-----------------------------------');

  // This should hit the cache (no API call)
  console.log('🎯 Second retrieval (should hit cache):');
  const cachedUser1Again = await userCache.operations.retrieve(user1.key);
  console.log(`👤 Retrieved: ${cachedUser1Again?.name} (cache hit)`);

  // Create a new user and demonstrate cache miss
  const user3 = createTestUser('user-3', 'Charlie Brown', 'charlie@example.com', 'guest');

  console.log('🎯 New item retrieval (cache miss, will fetch from API):');
  const cachedUser3 = await userCache.operations.get(user3.key);
  console.log(`👤 Retrieved: ${cachedUser3?.name} (fetched from API and cached)`);
  console.log('');

  // Step 6: Cache updates
  console.log('Step 6: Cache updates');
  console.log('--------------------');

  const updatedTask2 = { ...task2, status: 'completed' as const, description: 'Add login and registration functionality - COMPLETED!' };
  mockTaskStorage.set(task2.id, updatedTask2);

  // Update cache with new version
  await taskCache.operations.set(updatedTask2.key, updatedTask2);
  console.log(`🔄 Updated task in cache: ${updatedTask2.title} - New status: ${updatedTask2.status}`);
  console.log('');

  // Step 7: Query operations
  console.log('Step 7: Query operations');
  console.log('-----------------------');

  const foundTasksResult = await taskCache.operations.find('all');
  // find() now returns FindOperationResult
  console.log(`🔍 Found ${foundTasksResult.items.length} tasks through cache query`);

  const oneTask = await taskCache.operations.one();
  console.log(`📝 Retrieved one task: ${oneTask?.title}`);
  console.log('');

  // Step 8: Cache statistics and management
  console.log('Step 8: Cache management');
  console.log('-----------------------');

  console.log('📊 Cache Statistics:');
  console.log(`   👥 Users in cache: ${allUsers.items.length}`);
  console.log(`   📝 Tasks in cache: ${allTasks.items.length}`);
  console.log(`   🎯 User cache coordinate: ${userCache.coordinate.kta[0]}`);
  console.log(`   🎯 Task cache coordinate: ${taskCache.coordinate.kta[0]}`);
  console.log('');

  // Step 9: Cleanup demonstration
  console.log('Step 9: Cleanup demonstration');
  console.log('-----------------------------');

  mockUserStorage.delete('user-3');
  console.log('🗑️ Removed user from storage');

  // Cache still has the old data until next fetch
  const stillCachedUser3 = await userCache.operations.retrieve(user3.key);
  console.log(`🎯 Cache still contains removed user: ${stillCachedUser3?.name || 'null'}`);

  // Fresh fetch will update cache
  const freshAllUsers = await userCache.operations.all();
  console.log(`📋 Fresh fetch shows ${freshAllUsers.items.length} users (cache updated)`);
  console.log('');

  console.log('🎉 Basic Cache Example Complete!');
  console.log('================================\n');

  console.log('Key concepts demonstrated:');
  console.log('• Cache creation with registry and instances');
  console.log('• Basic cache operations (get, set, all, find, one)');
  console.log('• Cache hits vs misses');
  console.log('• Cache updates and management');
  console.log('• Integration with mock storage APIs');
  console.log('• Cache lifecycle and data consistency\n');
};

// Run the example if this file is executed directly
// Run the example if this file is executed directly
if (typeof import.meta !== 'undefined' && import.meta.url) {
  runBasicCacheExample().catch(console.error);
}
