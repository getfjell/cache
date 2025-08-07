import { beforeEach, describe, expect, it, vi } from 'vitest';
import { set } from '../../src/ops/set';
import { CacheContext } from '../../src/CacheContext';
import { CacheMap } from '../../src/CacheMap';
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
  let context: CacheContext<TestItem, 'test', 'container'>;

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

    // Mock CacheMap
    mockCacheMap = {
      get: vi.fn(),
      getWithTTL: vi.fn(),
      set: vi.fn(),
      includesKey: vi.fn(),
      remove: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
      keys: vi.fn(),
      values: vi.fn(),
      size: 0
    } as any;

    // Setup context
    context = {
      api: mockApi,
      cacheMap: mockCacheMap,
      pkType: 'test',
      options: {},
      itemTtl: void 0,
      queryTtl: void 0
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
      const originalTtl = context.itemTtl;

      const [returnedContext] = await set(priKey1, testItem1, context);

      expect(returnedContext).toBe(context);
      expect(returnedContext.options).toBe(originalOptions);
      expect(returnedContext.itemTtl).toBe(originalTtl);
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
});
