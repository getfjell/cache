import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { retrieve } from '../../src/ops/retrieve';
import { CacheContext } from '../../src/CacheContext';
import { MemoryCacheMap } from '../../src/memory/MemoryCacheMap';
import { ComKey, Item, PriKey, UUID } from '@fjell/core';
import * as getOp from '../../src/ops/get';
import { CacheStatsManager } from '../../src/CacheStats';

// Mock the logger
vi.mock('../../src/logger', () => ({
  default: {
    get: () => ({
      default: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      trace: vi.fn()
    })
  }
}));

// Mock the get operation
vi.mock('../../src/ops/get', () => ({
  get: vi.fn()
}));

// Test interfaces
interface TestItem extends Item<'test'> {
  id: string;
  name: string;
  value: number;
}

interface ContainedTestItem extends Item<'test', 'container'> {
  id: string;
  name: string;
  data: string;
}

// Helper function to create test items
const createTestItem = (key: PriKey<'test'>, id: string, name: string, value: number): TestItem => ({
  key,
  id,
  name,
  value,
  events: {} as any
});

const createContainedTestItem = (key: ComKey<'test', 'container'>, id: string, name: string, data: string): ContainedTestItem => ({
  key,
  id,
  name,
  data,
  events: {} as any
});

describe('retrieve operation', () => {
  let cacheMap: MemoryCacheMap<TestItem, 'test'>;
  let context: CacheContext<TestItem, 'test'>;
  let mockApi: any;
  let mockEventEmitter: any;
  let mockTTLManager: any;
  let mockEvictionManager: any;
  let mockStatsManager: CacheStatsManager;

  // Test keys
  const key1: PriKey<'test'> = { kt: 'test', pk: 'item1' as UUID };
  const key2: PriKey<'test'> = { kt: 'test', pk: 'item2' as UUID };
  const comKey1: ComKey<'test', 'container'> = {
    kt: 'test',
    pk: 'item1' as UUID,
    loc: [{ kt: 'container', lk: 'container1' as UUID }]
  };

  afterEach(() => {
    // Clear timers to prevent memory leaks
    vi.clearAllTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();

    cacheMap = new MemoryCacheMap(['test']);

    mockApi = {
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      all: vi.fn(),
      find: vi.fn()
    };

    mockEventEmitter = {
      emit: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn()
    };

    mockTTLManager = {
      isTTLEnabled: vi.fn(() => false),
      validateItem: vi.fn(() => true),
      getTTL: vi.fn(() => null),
      setTTL: vi.fn()
    };

    mockEvictionManager = {
      onItemAccessed: vi.fn(),
      onItemAdded: vi.fn(),
      onItemRemoved: vi.fn()
    };

    mockStatsManager = new CacheStatsManager();

    context = {
      api: mockApi,
      cacheMap,
      pkType: 'test',
      options: {
        cacheType: 'memory' as const,
        enableDebugLogging: false,
        autoSync: true,
        maxRetries: 3,
        retryDelay: 1000
      },
      eventEmitter: mockEventEmitter,
      ttlManager: mockTTLManager,
      evictionManager: mockEvictionManager,
      statsManager: mockStatsManager
    };
  });

  describe('cache hit scenarios', () => {
    it('should return item from cache when present', async () => {
      const item1 = createTestItem(key1, 'item1', 'Test Item 1', 100);
      cacheMap.set(key1, item1);

      const [returnedContext, result] = await retrieve(key1, context);

      expect(returnedContext).toBeNull(); // No context returned for cache hits
      expect(result).toEqual(item1);
      expect(getOp.get).not.toHaveBeenCalled(); // Should not call API
    });

    it('should return composite key item from cache when present', async () => {
      const containedCacheMap = new MemoryCacheMap(['test', 'container']);
      const containedContext = { ...context, cacheMap: containedCacheMap };

      const item1 = createContainedTestItem(comKey1, 'item1', 'Contained Item 1', 'data1');
      containedCacheMap.set(comKey1, item1);

      const [returnedContext, result] = await retrieve(comKey1, containedContext as any);

      expect(returnedContext).toBeNull(); // No context returned for cache hits
      expect(result).toEqual(item1);
      expect(getOp.get).not.toHaveBeenCalled(); // Should not call API
    });

    it('should handle cache hit with null value', async () => {
      // Mock includesKey to return true but get to return null
      const mockCacheMap = {
        includesKey: vi.fn(() => true),
        get: vi.fn(() => null),
        set: vi.fn(),
        delete: vi.fn(),
        clear: vi.fn(),
        keys: vi.fn(() => []),
        values: vi.fn(() => []),
        clone: vi.fn(() => mockCacheMap),
        allIn: vi.fn(() => []),
        contains: vi.fn(() => false),
        queryIn: vi.fn(() => []),
        setQueryResult: vi.fn(),
        getQueryResult: vi.fn(() => null),
        hasQueryResult: vi.fn(() => false),
        deleteQueryResult: vi.fn(),
        clearQueryResults: vi.fn(),
        invalidateItemKeys: vi.fn(),
        invalidateLocation: vi.fn()
      };

      const contextWithMockCache = { ...context, cacheMap: mockCacheMap as any };

      const [returnedContext, result] = await retrieve(key1, contextWithMockCache);

      expect(returnedContext).toBeNull(); // No context returned for cache hits
      expect(result).toBeNull();
      expect(getOp.get).not.toHaveBeenCalled(); // Should not call API for cache hits
    });
  });

  describe('when bypassCache is enabled', () => {
    beforeEach(() => {
      context.options = { ...context.options, bypassCache: true };
    });

    it('should fetch directly from API without checking cache', async () => {
      const item1 = createTestItem(key1, 'item1', 'Test Item 1', 100);
      mockApi.get.mockResolvedValue(item1);

      const [returnedContext, result] = await retrieve(key1, context);

      expect(returnedContext).toBeNull();
      expect(result).toEqual(item1);
      expect(mockApi.get).toHaveBeenCalledWith(key1);
      expect(getOp.get).not.toHaveBeenCalled(); // Should not call the get operation
    });

    it('should return null when API returns null', async () => {
      mockApi.get.mockResolvedValue(null);

      const [returnedContext, result] = await retrieve(key1, context);

      expect(returnedContext).toBeNull();
      expect(result).toBeNull();
      expect(mockApi.get).toHaveBeenCalledWith(key1);
      expect(getOp.get).not.toHaveBeenCalled();
    });

    it('should handle API errors properly', async () => {
      const apiError = new Error('API Error');
      mockApi.get.mockRejectedValue(apiError);

      await expect(retrieve(key1, context)).rejects.toThrow('API Error');

      expect(mockApi.get).toHaveBeenCalledWith(key1);
      expect(getOp.get).not.toHaveBeenCalled();
    });

    it('should work with composite keys', async () => {
      const item1 = createContainedTestItem(comKey1, 'item1', 'Contained Item 1', 'data1');
      mockApi.get.mockResolvedValue(item1);

      const [returnedContext, result] = await retrieve(comKey1, context);

      expect(returnedContext).toBeNull();
      expect(result).toEqual(item1);
      expect(mockApi.get).toHaveBeenCalledWith(comKey1);
      expect(getOp.get).not.toHaveBeenCalled();
    });

    it('should increment cache misses when bypassing cache', async () => {
      const item1 = createTestItem(key1, 'item1', 'Test Item 1', 100);
      mockApi.get.mockResolvedValue(item1);

      await retrieve(key1, context);

      expect(context.statsManager.getStats().numMisses).toBe(1);
    });
  });

  describe('cache miss scenarios', () => {
    it('should fetch from API when item not in cache', async () => {
      const item1 = createTestItem(key1, 'item1', 'Test Item 1', 100);
      (getOp.get as any).mockResolvedValue([context, item1]);

      const [returnedContext, result] = await retrieve(key1, context);

      expect(returnedContext).toBe(context); // Context returned for cache misses
      expect(result).toEqual(item1);
      expect(getOp.get).toHaveBeenCalledWith(key1, context);
    });

    it('should handle API returning null', async () => {
      (getOp.get as any).mockResolvedValue([context, null]);

      const [returnedContext, result] = await retrieve(key1, context);

      expect(returnedContext).toBe(context); // Context returned for cache misses
      expect(result).toBeNull();
      expect(getOp.get).toHaveBeenCalledWith(key1, context);
    });

    it('should handle API errors gracefully', async () => {
      const apiError = new Error('API fetch failed');
      (getOp.get as any).mockRejectedValue(apiError);

      await expect(retrieve(key1, context)).rejects.toThrow('API fetch failed');
      expect(getOp.get).toHaveBeenCalledWith(key1, context);
    });

    it('should fetch composite key item from API when not in cache', async () => {
      const containedCacheMap = new MemoryCacheMap(['test', 'container']);
      const containedContext = { ...context, cacheMap: containedCacheMap };

      const item1 = createContainedTestItem(comKey1, 'item1', 'Contained Item 1', 'data1');
      (getOp.get as any).mockResolvedValue([containedContext, item1]);

      const [returnedContext, result] = await retrieve(comKey1, containedContext as any);

      expect(returnedContext).toBe(containedContext); // Context returned for cache misses
      expect(result).toEqual(item1);
      expect(getOp.get).toHaveBeenCalledWith(comKey1, containedContext);
    });
  });

  describe('input validation', () => {
    it('should throw error for invalid key - undefined', async () => {
      await expect(retrieve(undefined as any, context))
        .rejects.toThrow('Key for Retrieve is not a valid ItemKey');
    });

    it('should throw error for invalid key - empty object', async () => {
      await expect(retrieve({} as any, context))
        .rejects.toThrow('Key for Retrieve is not a valid ItemKey');
    });

    it('should throw error for invalid key - malformed', async () => {
      const malformedKey = { invalid: 'key' };
      await expect(retrieve(malformedKey as any, context))
        .rejects.toThrow('Key for Retrieve is not a valid ItemKey');
    });

    it('should throw error for incomplete primary key', async () => {
      const incompleteKey = { kt: 'test' }; // Missing pk
      await expect(retrieve(incompleteKey as any, context))
        .rejects.toThrow('Key for Retrieve is not a valid ItemKey');
    });

    it('should throw error for null pk', async () => {
      const nullPkKey = { kt: 'test', pk: null };
      await expect(retrieve(nullPkKey as any, context))
        .rejects.toThrow('Key for Retrieve is not a valid ItemKey');
    });

    it('should throw error for empty string pk', async () => {
      const emptyPkKey = { kt: 'test', pk: '' };
      await expect(retrieve(emptyPkKey as any, context))
        .rejects.toThrow('Key for Retrieve is not a valid ItemKey');
    });

    it('should throw error for invalid composite key - incomplete location', async () => {
      const invalidComKey = {
        kt: 'test',
        pk: 'item1' as UUID,
        loc: [{ kt: 'container' }] // Missing lk
      };
      await expect(retrieve(invalidComKey as any, context))
        .rejects.toThrow('Key for Retrieve is not a valid ItemKey');
    });

    it('should throw error for invalid composite key - empty location key', async () => {
      const invalidComKey = {
        kt: 'test',
        pk: 'item1' as UUID,
        loc: [{ kt: 'container', lk: '' }]
      };
      await expect(retrieve(invalidComKey as any, context))
        .rejects.toThrow('Key for Retrieve is not a valid ItemKey');
    });
  });

  describe('primary key validation', () => {
    it('should validate pk type on cache hit', async () => {
      const item1 = createTestItem(key1, 'item1', 'Test Item 1', 100);
      cacheMap.set(key1, item1);

      // Mock validatePK to return the item
      vi.doMock('@fjell/core', async () => {
        const actual = await vi.importActual('@fjell/core');
        return {
          ...actual,
          validatePK: vi.fn((item) => item)
        };
      });

      const [returnedContext, result] = await retrieve(key1, context);

      expect(result).toEqual(item1);
    });

    it('should validate pk type on cache miss', async () => {
      const item1 = createTestItem(key1, 'item1', 'Test Item 1', 100);
      (getOp.get as any).mockResolvedValue([context, item1]);

      // Mock validatePK to return the item
      vi.doMock('@fjell/core', async () => {
        const actual = await vi.importActual('@fjell/core');
        return {
          ...actual,
          validatePK: vi.fn((item) => item)
        };
      });

      const [returnedContext, result] = await retrieve(key1, context);

      expect(result).toEqual(item1);
    });

    it('should handle null result correctly in validation', async () => {
      (getOp.get as any).mockResolvedValue([context, null]);

      const [returnedContext, result] = await retrieve(key1, context);

      expect(result).toBeNull();
      expect(returnedContext).toBe(context);
    });
  });

  describe('context handling', () => {
    it('should return null context for cache hits', async () => {
      const item1 = createTestItem(key1, 'item1', 'Test Item 1', 100);
      cacheMap.set(key1, item1);

      const [returnedContext, result] = await retrieve(key1, context);

      expect(returnedContext).toBeNull();
      expect(result).toEqual(item1);
    });

    it('should return original context for cache misses', async () => {
      const item1 = createTestItem(key1, 'item1', 'Test Item 1', 100);
      (getOp.get as any).mockResolvedValue([context, item1]);

      const [returnedContext, result] = await retrieve(key1, context);

      expect(returnedContext).toBe(context);
      expect(result).toEqual(item1);
    });

    it('should handle context mutations from get operation', async () => {
      const item1 = createTestItem(key1, 'item1', 'Test Item 1', 100);
      const modifiedContext = { ...context, modified: true };
      (getOp.get as any).mockResolvedValue([modifiedContext, item1]);

      const [returnedContext, result] = await retrieve(key1, context);

      expect(returnedContext).toBe(modifiedContext);
      expect(result).toEqual(item1);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle very large items', async () => {
      const largeData = 'x'.repeat(100000);
      const largeItem = createTestItem(key1, 'item1', largeData, 100);
      cacheMap.set(key1, largeItem);

      const [returnedContext, result] = await retrieve(key1, context);

      expect(returnedContext).toBeNull();
      expect(result?.name).toBe(largeData);
    });

    it('should handle items with special characters in IDs', async () => {
      const specialKey: PriKey<'test'> = {
        kt: 'test',
        pk: 'item-with-!@#$%^&*()_+{}[]|\\:";\'<>?,./' as UUID
      };
      const specialItem = createTestItem(specialKey, 'special-id', 'Special Item', 100);
      cacheMap.set(specialKey, specialItem);

      const [returnedContext, result] = await retrieve(specialKey, context);

      expect(returnedContext).toBeNull();
      expect(result).toEqual(specialItem);
    });

    it('should handle concurrent retrieve operations', async () => {
      const item1 = createTestItem(key1, 'item1', 'Test Item 1', 100);
      const item2 = createTestItem(key2, 'item2', 'Test Item 2', 200);

      cacheMap.set(key1, item1);
      (getOp.get as any).mockResolvedValue([context, item2]);

      // Simulate concurrent operations
      const [result1, result2] = await Promise.all([
        retrieve(key1, context), // Cache hit
        retrieve(key2, context)  // Cache miss
      ]);

      expect(result1[0]).toBeNull(); // Cache hit context
      expect(result1[1]).toEqual(item1);

      expect(result2[0]).toBe(context); // Cache miss context
      expect(result2[1]).toEqual(item2);
    });

    it('should handle cache map errors gracefully', async () => {
      const errorCacheMap = {
        includesKey: vi.fn(() => { throw new Error('Cache error'); }),
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
        clear: vi.fn(),
        keys: vi.fn(() => []),
        values: vi.fn(() => []),
        clone: vi.fn(),
        allIn: vi.fn(() => []),
        contains: vi.fn(() => false),
        queryIn: vi.fn(() => []),
        setQueryResult: vi.fn(),
        getQueryResult: vi.fn(() => null),
        hasQueryResult: vi.fn(() => false),
        deleteQueryResult: vi.fn(),
        clearQueryResults: vi.fn(),
        invalidateItemKeys: vi.fn(),
        invalidateLocation: vi.fn()
      };

      const errorContext = { ...context, cacheMap: errorCacheMap as any };

      await expect(retrieve(key1, errorContext))
        .rejects.toThrow('Cache error');
    });

    it('should handle memory pressure scenarios', async () => {
      // Fill cache with many items
      for (let i = 0; i < 1000; i++) {
        const key: PriKey<'test'> = { kt: 'test', pk: `item${i}` as UUID };
        const item = createTestItem(key, `item${i}`, `Test Item ${i}`, i);
        cacheMap.set(key, item);
      }

      const targetKey: PriKey<'test'> = { kt: 'test', pk: 'item500' as UUID };
      const [returnedContext, result] = await retrieve(targetKey, context);

      expect(returnedContext).toBeNull(); // Should be cache hit
      expect(result?.id).toBe('item500');
    });

    it('should handle items with circular references', async () => {
      const circularItem: any = createTestItem(key1, 'item1', 'Circular Item', 100);
      circularItem.self = circularItem; // Create circular reference

      cacheMap.set(key1, circularItem);

      const [returnedContext, result] = await retrieve(key1, context);

      expect(returnedContext).toBeNull();
      expect(result?.id).toBe('item1');
      expect(result?.self).toBe(result); // Circular reference preserved
    });
  });

  describe('logging behavior', () => {
    it('should log cache hit path', async () => {
      const item1 = createTestItem(key1, 'item1', 'Test Item 1', 100);
      cacheMap.set(key1, item1);

      await retrieve(key1, context);

      // We can't directly test logger calls due to mocking, but we verify the operation completed
      expect(await cacheMap.get(key1)).toEqual(item1);
    });

    it('should log cache miss path', async () => {
      const item1 = createTestItem(key1, 'item1', 'Test Item 1', 100);
      (getOp.get as any).mockResolvedValue([context, item1]);

      await retrieve(key1, context);

      // We can't directly test logger calls due to mocking, but we verify the operation completed
      expect(getOp.get).toHaveBeenCalledWith(key1, context);
    });

    it('should log error for invalid key', async () => {
      try {
        await retrieve(undefined as any, context);
      } catch (error) {
        // We can't directly test logger calls due to mocking, but we verify the error was thrown
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  describe('type safety and generic constraints', () => {
    it('should maintain type safety with different item types', async () => {
      interface UserItem extends Item<'user'> {
        id: string;
        name: string;
        email: string;
      }

      const userCacheMap = new MemoryCacheMap(['user']);
      const userContext = {
        ...context,
        cacheMap: userCacheMap,
        pkType: 'user' as const
      } as any;

      const userKey: PriKey<'user'> = { kt: 'user', pk: 'user1' as UUID };
      const userItem: UserItem = {
        key: userKey,
        id: 'user1',
        name: 'John Doe',
        email: 'john@example.com',
        events: {} as any
      };

      userCacheMap.set(userKey, userItem);

      const [returnedContext, result] = await retrieve(userKey, userContext);

      expect(returnedContext).toBeNull();
      expect(result?.email).toBe('john@example.com'); // Type-specific property
    });

    it('should handle complex location hierarchies', async () => {
      interface CommentItem extends Item<'comment', 'document', 'user'> {
        id: string;
        content: string;
        authorId: string;
      }

      const commentCacheMap = new MemoryCacheMap(['comment', 'document', 'user']);
      const commentContext = {
        ...context,
        cacheMap: commentCacheMap,
        pkType: 'comment' as const
      } as any;

      const commentKey: ComKey<'comment', 'document', 'user'> = {
        kt: 'comment',
        pk: 'comment1' as UUID,
        loc: [
          { kt: 'document', lk: 'doc1' as UUID },
          { kt: 'user', lk: 'user1' as UUID }
        ]
      };

      const commentItem: CommentItem = {
        key: commentKey,
        id: 'comment1',
        content: 'This is a comment',
        authorId: 'user1',
        events: {} as any
      };

      commentCacheMap.set(commentKey, commentItem);

      const [returnedContext, result] = await retrieve(commentKey, commentContext);

      expect(returnedContext).toBeNull();
      expect(result?.content).toBe('This is a comment');
      expect(result?.authorId).toBe('user1');
    });
  });
});
