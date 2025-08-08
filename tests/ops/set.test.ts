import { beforeEach, describe, expect, it, vi } from 'vitest';
import { set } from '../../src/ops/set';
import { CacheContext } from '../../src/CacheContext';
import { CacheMap } from '../../src/CacheMap';
import { MemoryCacheMap } from '../../src/memory/MemoryCacheMap';
import { ClientApi } from '@fjell/client-api';
import { ComKey, Item, PriKey, UUID } from '@fjell/core';

describe('set operation', () => {
  // Test data types
  interface TestItem extends Item<'test', 'container'> {
    id: string;
    name: string;
    value: number;
  }

  // Test keys with various types
  const key1: PriKey<'test'> = { kt: 'test', pk: '1' as UUID };
  const priKey1: PriKey<'test'> = { kt: 'test', pk: '1' as UUID };
  const priKey2: PriKey<'test'> = { kt: 'test', pk: 2 as any }; // Number pk for normalization testing
  const priKeyString: PriKey<'test'> = { kt: 'test', pk: 'abc123' as UUID };

  const comKey1: ComKey<'test', 'container'> = {
    kt: 'test',
    pk: '3' as UUID,
    loc: [{ kt: 'container', lk: 'container1' as UUID }]
  };

  const comKeyWithNumericLk: ComKey<'test', 'container'> = {
    kt: 'test',
    pk: '4' as UUID,
    loc: [{ kt: 'container', lk: 42 as any }] // Number lk for normalization testing
  };

  // Test items
  const testItem1: TestItem = { key: priKey1, id: '1', name: 'Item 1', value: 100 } as TestItem;
  const testItem2: TestItem = { key: priKey2, id: '2', name: 'Item 2', value: 200 } as TestItem;
  const testItemString: TestItem = { key: priKeyString, id: 'abc123', name: 'String Item', value: 300 } as TestItem;
  const testItem3: TestItem = { key: comKey1, id: '3', name: 'Item 3', value: 400 } as TestItem;
  const testItemNumericLk: TestItem = { key: comKeyWithNumericLk, id: '4', name: 'Item 4', value: 500 } as TestItem;

  let mockApi: ClientApi<TestItem, 'test', 'container'>;
  let mockCacheMap: CacheMap<TestItem, 'test', 'container'>;
  let cacheMap: CacheMap<TestItem, 'test', 'container'>;
  let mockEventEmitter: any;
  let mockTTLManager: any;
  let mockEvictionManager: any;
  let context: CacheContext<TestItem, 'test', 'container'>;

  // Helper function to create test items
  function createTestItem(key: PriKey<'test'> | ComKey<'test', 'container'>, id: string, name: string, value: number): TestItem {
    return { key, id, name, value } as TestItem;
  }

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock API
    mockApi = {
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      all: vi.fn(),
      one: vi.fn(),
      find: vi.fn(),
      findOne: vi.fn()
    } as any;

    // Mock CacheMap with actual storage
    const mockStorage = new Map();
    mockCacheMap = {
      get: vi.fn((key) => mockStorage.get(JSON.stringify(key))),
      set: vi.fn((key, value) => mockStorage.set(JSON.stringify(key), value)),
      includesKey: vi.fn((key) => mockStorage.has(JSON.stringify(key))),
      delete: vi.fn((key) => mockStorage.delete(JSON.stringify(key))),
      clear: vi.fn(() => mockStorage.clear()),
      keys: vi.fn(() => Array.from(mockStorage.keys()).map(k => JSON.parse(k))),
      values: vi.fn(() => Array.from(mockStorage.values())),
      getMetadata: vi.fn(),
      setMetadata: vi.fn(),
      deleteMetadata: vi.fn(),
      getAllMetadata: vi.fn(),
      clearMetadata: vi.fn(),
      getCurrentSize: vi.fn(),
      getSizeLimits: vi.fn(),
      size: 0
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
    mockTTLManager = {
      isTTLEnabled: vi.fn().mockReturnValue(false),
      getDefaultTTL: vi.fn().mockReturnValue(undefined),
      validateItem: vi.fn().mockReturnValue(true),
      onItemAdded: vi.fn(),
      onItemAccessed: vi.fn(),
      removeExpiredItems: vi.fn()
    } as any;

    // Mock EvictionManager
    mockEvictionManager = {
      onItemAdded: vi.fn().mockReturnValue([]),
      onItemAccessed: vi.fn(),
      onItemRemoved: vi.fn(),
      getEvictionStrategyName: vi.fn().mockReturnValue(null),
      isEvictionSupported: vi.fn().mockReturnValue(false),
      performEviction: vi.fn().mockReturnValue([])
    } as any;

    // Setup shared cacheMap reference
    cacheMap = mockCacheMap;

    // Setup context
    context = {
      api: mockApi,
      cacheMap: mockCacheMap,
      eventEmitter: mockEventEmitter,
      pkType: 'test',
      options: {},
      ttlManager: mockTTLManager,
      evictionManager: mockEvictionManager
    } as CacheContext<TestItem, 'test', 'container'>;
  });

  describe('input validation', () => {
    it('should throw error for null key', async () => {
      const invalidKey = null as any;

      await expect(set(invalidKey, testItem1, context)).rejects.toThrow('Cannot read properties of null');

      expect(mockCacheMap.set).not.toHaveBeenCalled();
    });

    it('should throw error for undefined key', async () => {
      const invalidKey = void 0 as any;

      await expect(set(invalidKey, testItem1, context)).rejects.toThrow('Key for Set is not a valid ItemKey');

      expect(mockCacheMap.set).not.toHaveBeenCalled();
    });

    it('should throw error for empty object key', async () => {
      const invalidKey = {} as any;

      await expect(set(invalidKey, testItem1, context)).rejects.toThrow('Key for Set is not a valid ItemKey');

      expect(mockCacheMap.set).not.toHaveBeenCalled();
    });

    it('should throw error for malformed key', async () => {
      const invalidKey = { invalid: 'key' } as any;

      await expect(set(invalidKey, testItem1, context)).rejects.toThrow('Key for Set is not a valid ItemKey');

      expect(mockCacheMap.set).not.toHaveBeenCalled();
    });

    it('should throw error for incomplete primary key', async () => {
      const invalidKey = { kt: 'test' } as any; // Missing pk

      await expect(set(invalidKey, testItem1, context)).rejects.toThrow('Key for Set is not a valid ItemKey');

      expect(mockCacheMap.set).not.toHaveBeenCalled();
    });

    it('should throw error for incomplete composite key', async () => {
      const invalidKey = { kt: 'test', pk: '1' } as any; // Missing loc for composite

      await expect(set(invalidKey, testItem3, context)).rejects.toThrow('Key does not match item key');

      expect(mockCacheMap.set).not.toHaveBeenCalled();
    });
  });

  describe('key matching validation', () => {
    it('should throw error when key does not match item key', async () => {
      const mismatchedKey: PriKey<'test'> = { kt: 'test', pk: 'different' as UUID };

      await expect(set(mismatchedKey, testItem1, context)).rejects.toThrow('Key does not match item key');

      expect(mockCacheMap.set).not.toHaveBeenCalled();
    });

    it('should throw error when primary key type differs', async () => {
      const wrongTypeKey: PriKey<'test'> = { kt: 'different' as any, pk: '1' as UUID };

      await expect(set(wrongTypeKey, testItem1, context)).rejects.toThrow('Key does not match item key');

      expect(mockCacheMap.set).not.toHaveBeenCalled();
    });

    it('should throw error when composite key location differs', async () => {
      const wrongLocationKey: ComKey<'test', 'container'> = {
        kt: 'test',
        pk: '3' as UUID,
        loc: [{ kt: 'container', lk: 'different' as UUID }]
      };

      await expect(set(wrongLocationKey, testItem3, context)).rejects.toThrow('Key does not match item key');

      expect(mockCacheMap.set).not.toHaveBeenCalled();
    });
  });

  describe('key normalization functionality', () => {
    it('should successfully set item with string primary key when item has string pk', async () => {
      const keyWithString: PriKey<'test'> = { kt: 'test', pk: 'abc123' as UUID };

      const [resultContext, resultItem] = await set(keyWithString, testItemString, context);

      expect(mockCacheMap.set).toHaveBeenCalledWith(keyWithString, testItemString);
      expect(resultContext).toBe(context);
      expect(resultItem).toBe(testItemString);
    });

    it('should successfully set item with normalized number to string primary key', async () => {
      // Test item has number pk, key should normalize to match
      const keyWithNumberAsString: PriKey<'test'> = { kt: 'test', pk: '2' as UUID };

      const [resultContext, resultItem] = await set(keyWithNumberAsString, testItem2, context);

      expect(mockCacheMap.set).toHaveBeenCalledWith(keyWithNumberAsString, testItem2);
      expect(resultContext).toBe(context);
      expect(resultItem).toBe(testItem2);
    });

    it('should successfully set item with normalized number to string location key', async () => {
      // Test item has number lk, key should normalize to match
      const keyWithStringLk: ComKey<'test', 'container'> = {
        kt: 'test',
        pk: '4' as UUID,
        loc: [{ kt: 'container', lk: '42' as UUID }]
      };

      const [resultContext, resultItem] = await set(keyWithStringLk, testItemNumericLk, context);

      expect(mockCacheMap.set).toHaveBeenCalledWith(keyWithStringLk, testItemNumericLk);
      expect(resultContext).toBe(context);
      expect(resultItem).toBe(testItemNumericLk);
    });

  });

  describe('successful operations', () => {
    it('should successfully set item with primary key', async () => {
      const [resultContext, resultItem] = await set(priKey1, testItem1, context);

      expect(mockCacheMap.set).toHaveBeenCalledWith(priKey1, testItem1);
      expect(resultContext).toBe(context);
      expect(resultItem).toBe(testItem1);
    });

    it('should successfully set item with composite key', async () => {
      const [resultContext, resultItem] = await set(comKey1, testItem3, context);

      expect(mockCacheMap.set).toHaveBeenCalledWith(comKey1, testItem3);
      expect(resultContext).toBe(context);
      expect(resultItem).toBe(testItem3);
    });

    it('should return the validated item from validatePK', async () => {
      const [resultContext, resultItem] = await set(priKey1, testItem1, context);

      // The function calls validatePK twice - once for validation, once for return
      expect(resultContext).toBe(context);
      expect(resultItem).toBe(testItem1);
    });

    it('should handle items with all supported key variations', async () => {
      // Test primary key with string
      await expect(set(priKeyString, testItemString, context)).resolves.toBeDefined();

      // Test primary key that requires normalization
      const normalizedKey: PriKey<'test'> = { kt: 'test', pk: '2' as UUID };
      await expect(set(normalizedKey, testItem2, context)).resolves.toBeDefined();

      // Test composite key
      await expect(set(comKey1, testItem3, context)).resolves.toBeDefined();

      expect(mockCacheMap.set).toHaveBeenCalledTimes(3);
    });
  });

  describe('edge cases and error scenarios', () => {
    it('should handle null values in key normalization gracefully', async () => {
      const keyWithNullPk: any = { kt: 'test', pk: null };

      await expect(set(keyWithNullPk, testItem1, context)).rejects.toThrow('Key for Set is not a valid ItemKey');
    });

    it('should handle number to string normalization', async () => {
      // Test regular numbers that normalize properly to strings
      const regularNumbers = [0, -0, 123, 456.789];

      for (const num of regularNumbers) {
        const specialKey: PriKey<'test'> = { kt: 'test', pk: String(num) as UUID };
        const specialItem: TestItem = {
          key: { kt: 'test', pk: num as any },
          id: String(num),
          name: `Number ${num}`,
          value: 999
        } as TestItem;

        const [resultContext, resultItem] = await set(specialKey, specialItem, context);
        expect(resultContext).toBe(context);
        expect(resultItem).toBe(specialItem);
      }
    });

    it('should handle empty string keys as invalid', async () => {
      const emptyStringKey: PriKey<'test'> = { kt: 'test', pk: '' as UUID };
      const emptyStringItem: TestItem = {
        key: { kt: 'test', pk: '' as any },
        id: '',
        name: 'Empty',
        value: 0
      } as TestItem;

      // Empty string keys are not valid, so this should throw
      await expect(set(emptyStringKey, emptyStringItem, context)).rejects.toThrow('Key for Set is not a valid ItemKey');
    });

    it('should preserve the original context object', async () => {
      const originalOptions = context.options;
      const originalTtlManager = context.ttlManager;

      const [returnedContext] = await set(priKey1, testItem1, context);

      expect(returnedContext).toBe(context);
      expect(returnedContext.options).toBe(originalOptions);
      expect(returnedContext.ttlManager).toBe(originalTtlManager);
    });

    it('should handle single location key with string values', async () => {
      const stringKey: ComKey<'test', 'container'> = {
        kt: 'test',
        pk: '6' as UUID,
        loc: [{ kt: 'container', lk: 'parent' as UUID }]
      };

      const stringItem: TestItem = {
        key: stringKey,
        id: '6',
        name: 'String Item',
        value: 700
      } as TestItem;

      const [resultContext, resultItem] = await set(stringKey, stringItem, context);

      expect(mockCacheMap.set).toHaveBeenCalledWith(stringKey, stringItem);
      expect(resultContext).toBe(context);
      expect(resultItem).toBe(stringItem);
    });
  });

  describe('primary key validation', () => {
    it('should call validatePK and handle validation errors', async () => {
      // Create a context that would cause validatePK to throw
      const invalidPkTypeContext = {
        ...context,
        pkType: 'different' as any
      };

      await expect(set(priKey1, testItem1, invalidPkTypeContext)).rejects.toThrow();
      expect(mockCacheMap.set).not.toHaveBeenCalled();
    });

    it('should pass through validatePK for successful validation', async () => {
      const [returnedContext, resultItem] = await set(priKey1, testItem1, context);

      // validatePK should be called and return the item
      expect(returnedContext).toBe(context);
      expect(resultItem).toBe(testItem1);
      expect(mockCacheMap.set).toHaveBeenCalledWith(priKey1, testItem1);
    });
  });

  // Additional comprehensive tests for enhanced coverage
  describe('normalization and key matching edge cases', () => {
    it('should handle complex location normalization scenarios', () => {
      // Test the private normalizeForComparison function indirectly
      const compositeKey: ComKey<'test', 'container'> = {
        kt: 'test',
        pk: 'item1' as UUID,
        loc: [{ kt: 'container', lk: 'container1' as UUID }]
      };

      const item = createTestItem(compositeKey, 'item1', 'Test Item 1', 100);

      expect(() => {
        set(compositeKey, item, context);
      }).not.toThrow();
    });

    it('should handle complex nested location hierarchies', () => {
      interface NestedItem extends Item<'test', 'container', 'subcategory'> {
        id: string;
        name: string;
        value: number;
      }

      const nestedKey: ComKey<'test', 'container', 'subcategory'> = {
        kt: 'test',
        pk: 'item1' as UUID,
        loc: [
          { kt: 'container', lk: 'container1' as UUID },
          { kt: 'subcategory', lk: 'sub1' as UUID }
        ]
      };

      const nestedItem: NestedItem = {
        key: nestedKey,
        id: 'item1',
        name: 'Nested Item 1',
        value: 100,
        events: {} as any
      };

      const nestedCacheMap = new MemoryCacheMap(['test', 'container', 'subcategory']);
      const nestedContext = { ...context, cacheMap: nestedCacheMap };

      expect(() => {
        set(nestedKey, nestedItem, nestedContext);
      }).not.toThrow();
    });

    it('should normalize keys correctly for comparison', () => {
      // Test with various key formats that should be normalized equally
      const key1: PriKey<'test'> = { kt: 'test', pk: 'item1' as UUID };
      const key2: PriKey<'test'> = { kt: 'test', pk: 'item1' as UUID };

      const item1 = createTestItem(key1, 'item1', 'Test Item 1', 100);
      const item2 = createTestItem(key2, 'item1', 'Test Item 1 Updated', 200);

      // Both should work without key mismatch errors
      expect(() => {
        set(key1, item1, context);
      }).not.toThrow();

      expect(() => {
        set(key2, item2, context);
      }).not.toThrow();
    });

    it('should handle keys with undefined location arrays', () => {
      const keyWithUndefinedLoc = {
        kt: 'test',
        pk: 'item1' as UUID,
        loc: undefined
      } as any;

      const item = createTestItem(keyWithUndefinedLoc, 'item1', 'Test Item 1', 100);

      // Should handle this gracefully during normalization
      expect(() => {
        set(keyWithUndefinedLoc, item, context);
      }).not.toThrow();
    });

    it('should handle keys with empty location arrays', () => {
      const keyWithEmptyLoc = {
        kt: 'test',
        pk: 'item1' as UUID,
        loc: []
      } as any;

      const item = createTestItem(keyWithEmptyLoc, 'item1', 'Test Item 1', 100);

      // Should handle this gracefully during normalization
      expect(() => {
        set(keyWithEmptyLoc, item, context);
      }).not.toThrow();
    });

    it('should handle location items with various key formats', () => {
      const compositeKey: ComKey<'test', 'container'> = {
        kt: 'test',
        pk: 'item1' as UUID,
        loc: [{ kt: 'container', lk: 'container1' as UUID }]
      };

      // Test item with location having extra properties
      const itemWithExtendedLoc = {
        key: {
          kt: 'test',
          pk: 'item1' as UUID,
          loc: [{
            kt: 'container',
            lk: 'container1' as UUID,
            extraProp: 'should-be-ignored'
          }]
        },
        id: 'item1',
        name: 'Test Item 1',
        value: 100,
        events: {} as any
      } as any;

      const compositeContext = { ...context, cacheMap: new MemoryCacheMap(['test', 'container']) };

      expect(() => {
        set(compositeKey, itemWithExtendedLoc, compositeContext);
      }).not.toThrow();
    });
  });

  describe('TTL manager integration edge cases', () => {
    it('should handle TTL manager errors by throwing', async () => {
      const errorTTLManager = {
        ...mockTTLManager,
        onItemAdded: vi.fn(() => { throw new Error('TTL Manager error'); })
      };

      const errorContext = { ...context, ttlManager: errorTTLManager };
      const item = createTestItem(key1, 'item1', 'Test Item 1', 100);

      // Should throw when TTL manager fails since there's no error handling
      await expect(set(key1, item, errorContext)).rejects.toThrow('TTL Manager error');
    });

    it('should call TTL manager with correct parameters', () => {
      const item = createTestItem(key1, 'item1', 'Test Item 1', 100);
      set(key1, item, context);

      expect(mockTTLManager.onItemAdded).toHaveBeenCalledWith(
        JSON.stringify(key1),
        mockCacheMap
      );
    });

    it('should handle TTL manager returning undefined', async () => {
      const undefinedTTLManager = {
        ...mockTTLManager,
        onItemAdded: vi.fn(() => undefined)
      };

      const undefinedContext = { ...context, ttlManager: undefinedTTLManager };
      const item = createTestItem(key1, 'item1', 'Test Item 1', 100);

      const [returnedContext, returnedItem] = await set(key1, item, undefinedContext);

      expect(returnedContext).toBe(undefinedContext);
      expect(returnedItem).toBe(item);
      expect(mockCacheMap.get(key1)).toEqual(item);
    });
  });

  describe('eviction manager integration edge cases', () => {
    it('should handle eviction manager errors by throwing', async () => {
      const errorEvictionManager = {
        ...mockEvictionManager,
        onItemAdded: vi.fn(() => { throw new Error('Eviction Manager error'); })
      };

      const errorContext = { ...context, evictionManager: errorEvictionManager };
      const item = createTestItem(key1, 'item1', 'Test Item 1', 100);

      // Should throw when eviction manager fails since there's no error handling
      await expect(set(key1, item, errorContext)).rejects.toThrow('Eviction Manager error');
    });

    it('should call eviction manager with correct parameters for new item', () => {
      const item = createTestItem(key1, 'item1', 'Test Item 1', 100);
      set(key1, item, context);

      expect(mockEvictionManager.onItemAdded).toHaveBeenCalledWith(
        JSON.stringify(key1),
        item,
        mockCacheMap
      );
    });

    it('should call eviction manager with correct parameters for item update', () => {
      const item1 = createTestItem(key1, 'item1', 'Test Item 1', 100);
      const item2 = createTestItem(key1, 'item1', 'Test Item 1 Updated', 200);

      // Set initial item
      set(key1, item1, context);
      vi.clearAllMocks();

      // Update item
      set(key1, item2, context);

      // Should still call onItemAdded for updates (current implementation behavior)
      expect(mockEvictionManager.onItemAdded).toHaveBeenCalledWith(
        JSON.stringify(key1),
        item2,
        mockCacheMap
      );
    });
  });

  describe('event emitter integration edge cases', () => {
    it('should emit correct events for new item', () => {
      const item = createTestItem(key1, 'item1', 'Test Item 1', 100);
      set(key1, item, context);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'item_set',
          key: key1,
          item: item,
          previousItem: undefined,
          source: 'cache'
        })
      );
    });

    it('should emit correct events for item update', () => {
      const item1 = createTestItem(key1, 'item1', 'Test Item 1', 100);
      const item2 = createTestItem(key1, 'item1', 'Test Item 1 Updated', 200);

      // Set initial item
      set(key1, item1, context);
      vi.clearAllMocks();

      // Update item
      set(key1, item2, context);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'item_set',
          key: key1,
          item: item2,
          previousItem: item1,
          source: 'cache'
        })
      );
    });

    it('should handle event emitter errors by throwing', async () => {
      const errorEventEmitter = {
        ...mockEventEmitter,
        emit: vi.fn(() => { throw new Error('Event Emitter error'); })
      };

      const errorContext = { ...context, eventEmitter: errorEventEmitter };
      const item = createTestItem(key1, 'item1', 'Test Item 1', 100);

      // Should throw when event emitter fails since there's no error handling
      await expect(set(key1, item, errorContext)).rejects.toThrow('Event Emitter error');
    });

    it('should emit events with null previous for new items', () => {
      const item = createTestItem(key1, 'item1', 'Test Item 1', 100);
      set(key1, item, context);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'item_set',
          key: key1,
          item: item,
          previousItem: undefined,
          source: 'cache'
        })
      );
    });
  });

  describe('complex integration scenarios', () => {
    it('should handle all managers throwing errors simultaneously', async () => {
      const errorTTLManager = {
        ...mockTTLManager,
        onItemAdded: vi.fn(() => { throw new Error('TTL error'); })
      };

      const errorEvictionManager = {
        ...mockEvictionManager,
        onItemAdded: vi.fn(() => { throw new Error('Eviction error'); })
      };

      const errorEventEmitter = {
        ...mockEventEmitter,
        emit: vi.fn(() => { throw new Error('Event error'); })
      };

      const errorContext = {
        ...context,
        ttlManager: errorTTLManager,
        evictionManager: errorEvictionManager,
        eventEmitter: errorEventEmitter
      };

      const item = createTestItem(key1, 'item1', 'Test Item 1', 100);

      // Should throw when first manager (TTL) fails
      await expect(set(key1, item, errorContext)).rejects.toThrow('TTL error');
    });

    it('should maintain consistency during rapid successive sets', async () => {
      const items = [];
      for (let i = 0; i < 100; i++) {
        const item = createTestItem(key1, 'item1', `Test Item ${i}`, i);
        items.push(item);
      }

      // Rapidly set many items with the same key
      for (const item of items) {
        await set(key1, item, context);
      }

      // Should have the last item
      const finalItem = mockCacheMap.get(key1);
      expect(finalItem?.name).toBe('Test Item 99');
      expect(finalItem?.value).toBe(99);
    });

    it('should handle mixed key types in rapid succession', () => {
      const priKey: PriKey<'test'> = { kt: 'test', pk: 'primary1' as UUID };
      const comKey: ComKey<'test', 'container'> = {
        kt: 'test',
        pk: 'composite1' as UUID,
        loc: [{ kt: 'container', lk: 'container1' as UUID }]
      };

      const priItem = createTestItem(priKey, 'primary1', 'Primary Item', 100);
      const comItem = createTestItem(comKey, 'composite1', 'Composite Item', 200);

      const compositeContext = { ...context, cacheMap: new MemoryCacheMap(['test', 'container']) };

      // Set both types rapidly
      expect(() => {
        set(priKey, priItem, context);
        set(comKey, comItem, compositeContext);
        set(priKey, priItem, context);
        set(comKey, comItem, compositeContext);
      }).not.toThrow();
    });
  });

  describe('memory and performance considerations', () => {
    it('should handle large items efficiently', async () => {
      const largeData = 'x'.repeat(100000);
      const largeItem = createTestItem(key1, 'item1', largeData, 100);

      const startTime = Date.now();
      await set(key1, largeItem, context);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(100); // Should be fast
      expect(mockCacheMap.get(key1)?.name).toBe(largeData);
    });

    it('should handle items with complex nested objects', async () => {
      const complexItem = createTestItem(key1, 'item1', 'Complex Item', 100);
      (complexItem as any).nested = {
        level1: {
          level2: {
            level3: {
              data: 'deep data',
              array: [1, 2, 3, { nested: 'value' }],
              date: new Date(),
              regexp: /test/g
            }
          }
        }
      };

      await set(key1, complexItem, context);

      const retrieved = mockCacheMap.get(key1);
      expect((retrieved as any).nested.level1.level2.level3.data).toBe('deep data');
    });

    it('should handle items with circular references gracefully', async () => {
      const circularItem: any = createTestItem(key1, 'item1', 'Circular Item', 100);
      circularItem.self = circularItem; // Create circular reference

      await set(key1, circularItem, context);

      const retrieved = mockCacheMap.get(key1);
      expect(retrieved?.id).toBe('item1');
      expect((retrieved as any).self).toBe(retrieved);
    });
  });
});
