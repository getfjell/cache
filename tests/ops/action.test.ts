import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { action } from '../../src/ops/action';
import { CacheContext } from '../../src/CacheContext';
import { ComKey, Item, PriKey, UUID } from '@fjell/core';
import { ClientApi } from '@fjell/client-api';
import { CacheMap } from '../../src/CacheMap';

// Test data types
interface TestItem extends Item<'test', 'container'> {
  id: string;
  name: string;
  value: number;
}

type TestPriKey = PriKey<'test'>;
type TestComKey = ComKey<'test', 'container'>;

describe('action operation', () => {
  // Test keys
  const priKey1: TestPriKey = { kt: 'test', pk: '1' as UUID };
  const comKey1: TestComKey = {
    kt: 'test',
    pk: '2' as UUID,
    loc: [{ kt: 'container', lk: 'container1' as UUID }]
  };

  // Test items
  const testItem: TestItem = {
    key: priKey1,
    id: '1',
    name: 'Test Item',
    value: 100
  } as TestItem;

  const updatedItem: TestItem = {
    key: priKey1,
    id: '1',
    name: 'Updated Item',
    value: 150
  } as TestItem;

  const actionName = 'increment';
  const actionBody = { amount: 50 };

  let mockApi: ClientApi<TestItem, 'test', 'container'>;
  let mockCacheMap: CacheMap<TestItem, 'test', 'container'>;
  let mockEventEmitter: any;
  let mockTtlManager: any;
  let mockEvictionManager: any;
  let context: CacheContext<TestItem, 'test', 'container'>;

  afterEach(() => {
    // Clear timers to prevent memory leaks
    vi.clearAllTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock API
    mockApi = {
      action: vi.fn().mockResolvedValue(updatedItem)
    } as any;

    // Mock CacheMap
    mockCacheMap = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      invalidateItemKeys: vi.fn(),
      includesKey: vi.fn(),
      clear: vi.fn(),
      keys: vi.fn(),
      values: vi.fn(),
      entries: vi.fn(),
      size: vi.fn(),
      getMetadata: vi.fn(),
      setMetadata: vi.fn(),
      deleteMetadata: vi.fn(),
      getAllMetadata: vi.fn(),
      clearMetadata: vi.fn(),
      getCurrentSize: vi.fn(),
      getSizeLimits: vi.fn()
    } as any;

    // Mock EventEmitter
    mockEventEmitter = {
      emit: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      getSubscriptionCount: vi.fn(),
      getSubscriptions: vi.fn(),
      destroy: vi.fn()
    } as any;

    // Mock TTLManager
    mockTtlManager = {
      isTTLEnabled: vi.fn().mockReturnValue(false),
      getDefaultTTL: vi.fn().mockReturnValue(undefined),
      validateItem: vi.fn().mockReturnValue(true),
      onItemAdded: vi.fn(),
      onItemAccessed: vi.fn(),
      removeExpiredItems: vi.fn().mockReturnValue([]),
      getExpirationTime: vi.fn(),
      setExpirationTime: vi.fn(),
      clearExpirationTime: vi.fn(),
      getAllExpirationTimes: vi.fn().mockReturnValue(new Map()),
      clearAllExpirationTimes: vi.fn()
    } as any;

    // Mock EvictionManager
    mockEvictionManager = {
      onItemAdded: vi.fn().mockReturnValue([]),
      onItemAccessed: vi.fn(),
      evictItems: vi.fn().mockReturnValue([]),
      getEvictionStrategy: vi.fn(),
      setEvictionStrategy: vi.fn(),
      isEvictionEnabled: vi.fn().mockReturnValue(false),
      getCurrentSize: vi.fn().mockReturnValue(0),
      getMaxSize: vi.fn().mockReturnValue(undefined)
    } as any;

    // Create context
    context = {
      api: mockApi,
      cacheMap: mockCacheMap,
      pkType: 'test',
      eventEmitter: mockEventEmitter,
      ttlManager: mockTtlManager,
      evictionManager: mockEvictionManager,
      options: {}
    } as CacheContext<TestItem, 'test', 'container'>;
  });

  describe('successful action operations', () => {
    it('should execute action with primary key', async () => {
      // Execute
      const [resultContext, resultItem] = await action(priKey1, actionName, actionBody, context);

      // Verify API call
      expect(mockApi.action).toHaveBeenCalledWith(priKey1, actionName, actionBody);

      // Verify cache invalidation before action
      expect(mockCacheMap.invalidateItemKeys).toHaveBeenCalledWith([priKey1]);

      // Verify cache set after action
      expect(mockCacheMap.set).toHaveBeenCalledWith(updatedItem.key, updatedItem);

      // Verify TTL management
      expect(mockTtlManager.onItemAdded).toHaveBeenCalledWith(
        JSON.stringify(updatedItem.key),
        mockCacheMap
      );

      // Verify eviction management
      expect(mockEvictionManager.onItemAdded).toHaveBeenCalledWith(
        JSON.stringify(updatedItem.key),
        updatedItem,
        mockCacheMap
      );

      // Verify return values
      expect(resultContext).toBe(context);
      expect(resultItem).toEqual(updatedItem);
    });

    it('should execute action with composite key', async () => {
      // Setup
      const comUpdatedItem = { ...updatedItem, key: comKey1 };
      (mockApi.action as any).mockResolvedValue(comUpdatedItem);

      // Execute
      const [resultContext, resultItem] = await action(comKey1, actionName, actionBody, context);

      // Verify API call
      expect(mockApi.action).toHaveBeenCalledWith(comKey1, actionName, actionBody);

      // Verify cache operations
      expect(mockCacheMap.invalidateItemKeys).toHaveBeenCalledWith([comKey1]);
      expect(mockCacheMap.set).toHaveBeenCalledWith(comKey1, comUpdatedItem);

      // Verify return values
      expect(resultContext).toBe(context);
      expect(resultItem).toEqual(comUpdatedItem);
    });

    it('should execute action without body parameter', async () => {
      // Execute without body
      const [resultContext, resultItem] = await action(priKey1, actionName, undefined, context);

      // Verify API call with empty body
      expect(mockApi.action).toHaveBeenCalledWith(priKey1, actionName, {});

      // Verify return values
      expect(resultContext).toBe(context);
      expect(resultItem).toEqual(updatedItem);
    });

    it('should execute action with empty body', async () => {
      // Execute with empty body
      const [resultContext, resultItem] = await action(priKey1, actionName, {}, context);

      // Verify API call
      expect(mockApi.action).toHaveBeenCalledWith(priKey1, actionName, {});

      // Verify return values
      expect(resultContext).toBe(context);
      expect(resultItem).toEqual(updatedItem);
    });
  });

  describe('cache invalidation and setting', () => {
    it('should invalidate cache before executing action', async () => {
      // Execute
      await action(priKey1, actionName, actionBody, context);

      // Verify invalidation happened before API call
      expect(mockCacheMap.invalidateItemKeys).toHaveBeenCalledWith([priKey1]);
      expect(mockCacheMap.invalidateItemKeys).toHaveBeenCalledBefore(mockApi.action as any);
    });

    it('should cache the action result after execution', async () => {
      // Execute
      await action(priKey1, actionName, actionBody, context);

      // Verify caching happened after API call
      expect(mockCacheMap.set).toHaveBeenCalledWith(updatedItem.key, updatedItem);
      expect(mockApi.action).toHaveBeenCalledBefore(mockCacheMap.set as any);
    });

    it('should use the updated item key for caching', async () => {
      // Setup - return item with different key than input
      const differentKeyItem = { ...updatedItem, key: comKey1 };
      (mockApi.action as any).mockResolvedValue(differentKeyItem);

      // Execute
      await action(priKey1, actionName, actionBody, context);

      // Verify caching uses the returned item's key
      expect(mockCacheMap.set).toHaveBeenCalledWith(comKey1, differentKeyItem);
    });
  });

  describe('TTL management', () => {
    it('should register item with TTL manager after caching', async () => {
      // Execute
      await action(priKey1, actionName, actionBody, context);

      // Verify TTL registration
      expect(mockTtlManager.onItemAdded).toHaveBeenCalledWith(
        JSON.stringify(updatedItem.key),
        mockCacheMap
      );

      // Verify it happens after caching
      expect(mockCacheMap.set).toHaveBeenCalledBefore(mockTtlManager.onItemAdded as any);
    });

    it('should use JSON stringified key for TTL registration', async () => {
      // Setup with composite key
      const comUpdatedItem = { ...updatedItem, key: comKey1 };
      (mockApi.action as any).mockResolvedValue(comUpdatedItem);

      // Execute
      await action(comKey1, actionName, actionBody, context);

      // Verify TTL registration with correct key format
      expect(mockTtlManager.onItemAdded).toHaveBeenCalledWith(
        JSON.stringify(comKey1),
        mockCacheMap
      );
    });
  });

  describe('eviction management', () => {
    it('should handle eviction when cache is full', async () => {
      // Setup
      const evictedKeys = [JSON.stringify(priKey1), JSON.stringify(comKey1)];
      (mockEvictionManager.onItemAdded as any).mockReturnValue(evictedKeys);

      // Execute
      await action(priKey1, actionName, actionBody, context);

      // Verify eviction manager called
      expect(mockEvictionManager.onItemAdded).toHaveBeenCalledWith(
        JSON.stringify(updatedItem.key),
        updatedItem,
        mockCacheMap
      );

      // Verify evicted items are removed from cache
      expect(mockCacheMap.delete).toHaveBeenCalledTimes(2);
      expect(mockCacheMap.delete).toHaveBeenCalledWith(priKey1);
      expect(mockCacheMap.delete).toHaveBeenCalledWith(comKey1);
    });

    it('should handle empty eviction list', async () => {
      // Setup
      (mockEvictionManager.onItemAdded as any).mockReturnValue([]);

      // Execute
      await action(priKey1, actionName, actionBody, context);

      // Verify no deletions occurred
      expect(mockCacheMap.delete).not.toHaveBeenCalled();
    });

    it('should parse evicted keys correctly before deletion', async () => {
      // Setup with complex key structure
      const complexKey = { kt: 'test', pk: 'complex-id' as UUID, loc: [{ kt: 'container', lk: 'comp-1' as UUID }] };
      const evictedKeys = [JSON.stringify(complexKey)];
      (mockEvictionManager.onItemAdded as any).mockReturnValue(evictedKeys);

      // Execute
      await action(priKey1, actionName, actionBody, context);

      // Verify deletion with parsed key
      expect(mockCacheMap.delete).toHaveBeenCalledWith(complexKey);
    });
  });

  describe('input validation', () => {
    it('should throw error for invalid item key', async () => {
      // Setup invalid key
      const invalidKey = { invalid: 'key' } as any;

      // Execute and verify error
      await expect(action(invalidKey, actionName, actionBody, context))
        .rejects.toThrow('Key for Action is not a valid ItemKey');

      // Verify API was not called
      expect(mockApi.action).not.toHaveBeenCalled();
      expect(mockCacheMap.invalidateItemKeys).not.toHaveBeenCalled();
    });

    it('should throw error for null key', async () => {
      // Execute and verify error - null key causes a property access error before validation
      await expect(action(null as any, actionName, actionBody, context))
        .rejects.toThrow('Cannot read properties of null');

      // Verify API was not called
      expect(mockApi.action).not.toHaveBeenCalled();
    });

    it('should throw error for undefined key', async () => {
      // Execute and verify error
      await expect(action(undefined as any, actionName, actionBody, context))
        .rejects.toThrow('Key for Action is not a valid ItemKey');

      // Verify API was not called
      expect(mockApi.action).not.toHaveBeenCalled();
    });

    it('should validate key before any cache operations', async () => {
      // Setup invalid key
      const invalidKey = { kt: 'test' } as any; // Missing pk

      // Execute and verify error
      await expect(action(invalidKey, actionName, actionBody, context))
        .rejects.toThrow('Key for Action is not a valid ItemKey');

      // Verify no cache operations occurred
      expect(mockCacheMap.invalidateItemKeys).not.toHaveBeenCalled();
      expect(mockCacheMap.set).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should propagate API errors', async () => {
      // Setup API error
      const apiError = new Error('API action failed');
      (mockApi.action as any).mockRejectedValue(apiError);

      // Execute and verify error propagation
      await expect(action(priKey1, actionName, actionBody, context))
        .rejects.toThrow('API action failed');

      // Verify cache invalidation still occurred
      expect(mockCacheMap.invalidateItemKeys).toHaveBeenCalledWith([priKey1]);

      // Verify no caching occurred after error
      expect(mockCacheMap.set).not.toHaveBeenCalled();
      expect(mockTtlManager.onItemAdded).not.toHaveBeenCalled();
      expect(mockEvictionManager.onItemAdded).not.toHaveBeenCalled();
    });

    it('should handle cache invalidation errors gracefully', async () => {
      // Setup cache invalidation error
      const cacheError = new Error('Cache invalidation failed');
      (mockCacheMap.invalidateItemKeys as any).mockImplementation(() => {
        throw cacheError;
      });

      // Execute and verify error propagation
      await expect(action(priKey1, actionName, actionBody, context))
        .rejects.toThrow('Cache invalidation failed');

      // Verify API was not called after cache error
      expect(mockApi.action).not.toHaveBeenCalled();
    });

    it('should handle eviction errors gracefully', async () => {
      // Setup eviction error
      const evictionError = new Error('Eviction failed');
      (mockEvictionManager.onItemAdded as any).mockImplementation(() => {
        throw evictionError;
      });

      // Execute and verify error propagation
      await expect(action(priKey1, actionName, actionBody, context))
        .rejects.toThrow('Eviction failed');

      // Verify basic operations completed before eviction
      expect(mockApi.action).toHaveBeenCalled();
      expect(mockCacheMap.set).toHaveBeenCalled();
      expect(mockTtlManager.onItemAdded).toHaveBeenCalled();
    });
  });

  describe('return value validation', () => {
    it('should return validated item using validatePK', async () => {
      // Execute
      const [resultContext, resultItem] = await action(priKey1, actionName, actionBody, context);

      // Verify return values structure
      expect(Array.isArray([resultContext, resultItem])).toBe(true);
      expect(resultContext).toBe(context);
      expect(resultItem).toEqual(updatedItem);
    });

    it('should handle different return item types', async () => {
      // Setup different item type
      const differentItem = {
        ...updatedItem,
        additionalField: 'test',
        key: comKey1
      };
      (mockApi.action as any).mockResolvedValue(differentItem);

      // Execute
      const [resultContext, resultItem] = await action(comKey1, actionName, actionBody, context);

      // Verify return values
      expect(resultContext).toBe(context);
      expect(resultItem).toEqual(differentItem);
    });
  });

  describe('operation sequence', () => {
    it('should execute operations in correct order', async () => {
      // Execute
      await action(priKey1, actionName, actionBody, context);

      // Verify operation order
      const calls = [
        mockCacheMap.invalidateItemKeys,
        mockApi.action,
        mockCacheMap.set,
        mockTtlManager.onItemAdded,
        mockEvictionManager.onItemAdded
      ];

      // Check that each operation was called after the previous one
      for (let i = 1; i < calls.length; i++) {
        expect(calls[i - 1]).toHaveBeenCalledBefore(calls[i] as any);
      }
    });

    it('should not proceed if early operation fails', async () => {
      // Setup early failure
      (mockCacheMap.invalidateItemKeys as any).mockImplementation(() => {
        throw new Error('Early failure');
      });

      // Execute and verify
      await expect(action(priKey1, actionName, actionBody, context))
        .rejects.toThrow('Early failure');

      // Verify subsequent operations did not execute
      expect(mockApi.action).not.toHaveBeenCalled();
      expect(mockCacheMap.set).not.toHaveBeenCalled();
    });
  });

  describe('eviction key parsing error handling', () => {
    beforeEach(() => {
      // Reset specific mocks for this test group
      vi.clearAllMocks();
    });

    it('should handle malformed evicted keys gracefully', async () => {
      // Setup eviction manager to return malformed JSON keys
      const malformedKeys = [
        'invalid-json',
        '{"circular": "[Circular]"}', // valid JSON but unusual object
        '{incomplete json',
        '{"kt":"test","pk":"key1"}' // valid key
      ];
      (mockEvictionManager.onItemAdded as any).mockReturnValue(malformedKeys);

      // Mock logger to capture error logs
      const loggerSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

      // Execute action
      const [resultContext, resultItem] = await action(priKey1, actionName, actionBody, context);

      // Verify operation completed successfully despite malformed keys
      expect(resultContext).toBe(context);
      expect(resultItem).toEqual(updatedItem);

      // Verify cache operations
      expect(mockCacheMap.set).toHaveBeenCalledWith(updatedItem.key, updatedItem);

      // Verify that delete was called for both valid JSON keys
      // Note: '{"circular": "[Circular]"}' is valid JSON that parses to { circular: '[Circular]' }
      expect(mockCacheMap.delete).toHaveBeenCalledTimes(2);
      expect(mockCacheMap.delete).toHaveBeenCalledWith({ circular: '[Circular]' });
      expect(mockCacheMap.delete).toHaveBeenCalledWith({ "kt": "test", "pk": "key1" });

      // Cleanup
      loggerSpy.mockRestore();
    });

    it('should continue processing when JSON parse fails on evicted keys', async () => {
      // Setup eviction manager to return keys that will cause JSON.parse to fail
      const problematicKeys = [
        'null', // valid JSON but parses to null value
        'undefined',
        '{circular_ref}',
        '{"kt":"test","pk":"valid1"}',
        'invalid',
        '{"kt":"test","pk":"valid2"}'
      ];
      (mockEvictionManager.onItemAdded as any).mockReturnValue(problematicKeys);

      // Execute action
      await action(priKey1, actionName, actionBody, context);

      // Verify that valid keys were processed despite parsing errors
      // Note: "null" is valid JSON and will be parsed to null, then passed to delete
      expect(mockCacheMap.delete).toHaveBeenCalledWith(null);
      expect(mockCacheMap.delete).toHaveBeenCalledWith({ "kt": "test", "pk": "valid1" });
      expect(mockCacheMap.delete).toHaveBeenCalledWith({ "kt": "test", "pk": "valid2" });

      // Should have been called three times: null + two valid keys
      expect(mockCacheMap.delete).toHaveBeenCalledTimes(3);
    });
  });
});
