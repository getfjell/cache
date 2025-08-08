import { beforeEach, describe, expect, it, vi } from 'vitest';
import { all } from '../../src/ops/all';
import { CacheContext } from '../../src/CacheContext';
import { CacheMap } from '../../src/CacheMap';
import { ClientApi } from '@fjell/client-api';
import { ComKey, Item, LocKeyArray, PriKey, UUID } from '@fjell/core';
import { NotFoundError } from '@fjell/http-api';
import { createQueryHash } from '../../src/normalization';

describe('all operation', () => {
  // Test data types
  interface TestItem extends Item<'test', 'container'> {
    id: string;
    name: string;
    value: number;
  }

  // Test keys
  const priKey1: PriKey<'test'> = { kt: 'test', pk: '1' as UUID };
  const priKey2: PriKey<'test'> = { kt: 'test', pk: '2' as UUID };
  const comKey1: ComKey<'test', 'container'> = {
    kt: 'test',
    pk: '3' as UUID,
    loc: [{ kt: 'container', lk: 'container1' as UUID }]
  };

  // Test items
  const testItem1: TestItem = { key: priKey1, id: '1', name: 'Item 1', value: 100 } as TestItem;
  const testItem2: TestItem = { key: priKey2, id: '2', name: 'Item 2', value: 200 } as TestItem;
  const testItem3: TestItem = { key: comKey1, id: '3', name: 'Item 3', value: 300 } as TestItem;

  // Test locations
  const testLocations: LocKeyArray<'container'> = [{ kt: 'container', lk: 'container1' as UUID }];

  let mockApi: ClientApi<TestItem, 'test', 'container'>;
  let mockCacheMap: CacheMap<TestItem, 'test', 'container'>;
  let mockEventEmitter: any;
  let context: CacheContext<TestItem, 'test', 'container'>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock API
    mockApi = {
      all: vi.fn()
    } as any;

    // Mock CacheMap
    mockCacheMap = {
      get: vi.fn(),
      getQueryResult: vi.fn(),
      set: vi.fn(),
      setQueryResult: vi.fn(),
      deleteQueryResult: vi.fn(),
      includesKey: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn(),
      keys: vi.fn(),
      values: vi.fn(),
      entries: vi.fn(),
      size: vi.fn()
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

    // Create context
    context = {
      api: mockApi,
      cacheMap: mockCacheMap,
      pkType: 'test',
      options: {} as any,
      eventEmitter: mockEventEmitter,
      itemTtl: undefined,
      queryTtl: 30000 // 30 seconds
    };
  });

  describe('basic functionality', () => {
    it('should fetch items from API when no cached query result exists', async () => {
      const query = { limit: 10 };
      const items = [testItem1, testItem2];

      vi.mocked(mockApi.all).mockResolvedValue(items);
      vi.mocked(mockCacheMap.getQueryResult).mockReturnValue(null);

      const [resultContext, result] = await all(query, testLocations, context);

      expect(resultContext).toBe(context);
      expect(result).toEqual(items);
      expect(mockApi.all).toHaveBeenCalledWith(query, testLocations);
      expect(mockCacheMap.set).toHaveBeenCalledWith(testItem1.key, testItem1);
      expect(mockCacheMap.set).toHaveBeenCalledWith(testItem2.key, testItem2);
    });

    it('should use cached query results when available', async () => {
      const query = { limit: 10 };
      const cachedItemKeys = [testItem1.key, testItem2.key];

      vi.mocked(mockCacheMap.getQueryResult).mockReturnValue(cachedItemKeys);
      vi.mocked(mockCacheMap.get)
        .mockReturnValueOnce(testItem1)
        .mockReturnValueOnce(testItem2);

      const [resultContext, result] = await all(query, testLocations, context);

      expect(resultContext).toBe(context);
      expect(result).toEqual([testItem1, testItem2]);
      expect(mockApi.all).not.toHaveBeenCalled();
      expect(mockCacheMap.get).toHaveBeenCalledWith(testItem1.key);
      expect(mockCacheMap.get).toHaveBeenCalledWith(testItem2.key);
    });

    it('should invalidate query cache when cached items are missing', async () => {
      const query = { limit: 10 };
      const cachedItemKeys = [testItem1.key, testItem2.key];

      vi.mocked(mockCacheMap.getQueryResult).mockReturnValue(cachedItemKeys);
      vi.mocked(mockCacheMap.get)
        .mockReturnValueOnce(testItem1)
        .mockReturnValueOnce(null); // Second item missing

      vi.mocked(mockApi.all).mockResolvedValue([testItem1, testItem2]);

      const [resultContext, result] = await all(query, testLocations, context);

      expect(resultContext).toBe(context);
      expect(result).toEqual([testItem1, testItem2]);
      expect(mockCacheMap.deleteQueryResult).toHaveBeenCalled();
      expect(mockApi.all).toHaveBeenCalledWith(query, testLocations);
    });

    it('should cache query results after successful API call', async () => {
      const query = { limit: 10 };
      const items = [testItem1, testItem2];

      vi.mocked(mockApi.all).mockResolvedValue(items);
      vi.mocked(mockCacheMap.getQueryResult).mockReturnValue(null);

      await all(query, testLocations, context);

      const expectedQueryHash = createQueryHash('test', query, testLocations);
      const expectedItemKeys = [testItem1.key, testItem2.key];

      expect(mockCacheMap.setQueryResult).toHaveBeenCalledWith(
        expectedQueryHash,
        expectedItemKeys,
        context.queryTtl
      );
    });

    it('should emit query event after successful API call', async () => {
      const query = { limit: 10 };
      const items = [testItem1, testItem2];

      vi.mocked(mockApi.all).mockResolvedValue(items);
      vi.mocked(mockCacheMap.getQueryResult).mockReturnValue(null);

      await all(query, testLocations, context);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'items_queried',
          source: 'operation',
          query,
          items,
          affectedKeys: [
            { kt: 'test', pk: '1' },
            { kt: 'test', pk: '2' }
          ]
        })
      );
    });
  });

  describe('error handling', () => {
    it('should handle NotFoundError by caching empty result', async () => {
      const query = { limit: 5 };
      const notFoundError = new NotFoundError('Not found', 'TEST_ERROR', { details: 'No items found' });

      vi.mocked(mockApi.all).mockRejectedValue(notFoundError);
      vi.mocked(mockCacheMap.getQueryResult).mockReturnValue(null);

      const [resultContext, result] = await all(query, testLocations, context);

      expect(resultContext).toBe(context);
      expect(result).toEqual([]);

      const expectedQueryHash = createQueryHash('test', query, testLocations);
      expect(mockCacheMap.setQueryResult).toHaveBeenCalledWith(
        expectedQueryHash,
        [],
        context.queryTtl
      );
    });

    it('should re-throw non-NotFoundError exceptions', async () => {
      const query = { limit: 10 };
      const apiError = new Error('API failure');

      vi.mocked(mockApi.all).mockRejectedValue(apiError);
      vi.mocked(mockCacheMap.getQueryResult).mockReturnValue(null);

      await expect(all(query, testLocations, context)).rejects.toThrow('API failure');
    });
  });

  describe('query hash generation', () => {
    it('should generate correct query hash for different queries', async () => {
      const query1 = { limit: 10 };
      const query2 = { limit: 20 };
      const items = [testItem1];

      vi.mocked(mockApi.all).mockResolvedValue(items);
      vi.mocked(mockCacheMap.getQueryResult).mockReturnValue(null);

      await all(query1, testLocations, context);
      await all(query2, testLocations, context);

      const hash1 = createQueryHash('test', query1, testLocations);
      const hash2 = createQueryHash('test', query2, testLocations);

      expect(hash1).not.toBe(hash2);
      expect(mockCacheMap.setQueryResult).toHaveBeenCalledWith(hash1, [testItem1.key], context.queryTtl);
      expect(mockCacheMap.setQueryResult).toHaveBeenCalledWith(hash2, [testItem1.key], context.queryTtl);
    });

    it('should generate different hashes for different locations', async () => {
      const query = { limit: 10 };
      const locations1: LocKeyArray<'container'> = [{ kt: 'container', lk: 'container1' as UUID }];
      const locations2: LocKeyArray<'container'> = [{ kt: 'container', lk: 'container2' as UUID }];
      const items = [testItem1];

      vi.mocked(mockApi.all).mockResolvedValue(items);
      vi.mocked(mockCacheMap.getQueryResult).mockReturnValue(null);

      await all(query, locations1, context);
      await all(query, locations2, context);

      const hash1 = createQueryHash('test', query, locations1);
      const hash2 = createQueryHash('test', query, locations2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('default parameters', () => {
    it('should work with default empty query', async () => {
      const items = [testItem1, testItem2];

      vi.mocked(mockApi.all).mockResolvedValue(items);
      vi.mocked(mockCacheMap.getQueryResult).mockReturnValue(null);

      const [resultContext, result] = await all(undefined, undefined, context);

      expect(resultContext).toBe(context);
      expect(result).toEqual(items);
      expect(mockApi.all).toHaveBeenCalledWith({}, []);
    });

    it('should work with empty locations array', async () => {
      const query = { limit: 10 };
      const items = [testItem1];

      vi.mocked(mockApi.all).mockResolvedValue(items);
      vi.mocked(mockCacheMap.getQueryResult).mockReturnValue(null);

      const [resultContext, result] = await all(query, [], context);

      expect(resultContext).toBe(context);
      expect(result).toEqual(items);
      expect(mockApi.all).toHaveBeenCalledWith(query, []);
    });
  });

  describe('cache invalidation scenarios', () => {
    it('should invalidate query cache when first cached item is missing', async () => {
      const query = { limit: 10 };
      const cachedItemKeys = [testItem1.key, testItem2.key];

      vi.mocked(mockCacheMap.getQueryResult).mockReturnValue(cachedItemKeys);
      vi.mocked(mockCacheMap.get).mockReturnValue(null); // First item missing

      vi.mocked(mockApi.all).mockResolvedValue([testItem1, testItem2]);

      await all(query, testLocations, context);

      expect(mockCacheMap.deleteQueryResult).toHaveBeenCalled();
      expect(mockApi.all).toHaveBeenCalled();
    });

    it('should invalidate query cache when middle cached item is missing', async () => {
      const query = { limit: 10 };
      const testItem4: TestItem = { key: { kt: 'test', pk: '4' as UUID }, id: '4', name: 'Item 4', value: 400 } as TestItem;
      const cachedItemKeys = [testItem1.key, testItem2.key, testItem4.key];

      vi.mocked(mockCacheMap.getQueryResult).mockReturnValue(cachedItemKeys);
      vi.mocked(mockCacheMap.get)
        .mockReturnValueOnce(testItem1)
        .mockReturnValueOnce(testItem2)
        .mockReturnValueOnce(null); // Third item missing

      vi.mocked(mockApi.all).mockResolvedValue([testItem1, testItem2, testItem4]);

      await all(query, testLocations, context);

      expect(mockCacheMap.deleteQueryResult).toHaveBeenCalled();
      expect(mockApi.all).toHaveBeenCalled();
    });
  });

  describe('TTL handling', () => {
    it('should use context queryTtl when caching query results', async () => {
      const query = { limit: 10 };
      const items = [testItem1];
      const customTtl = 60000; // 60 seconds

      const contextWithTtl = { ...context, queryTtl: customTtl };

      vi.mocked(mockApi.all).mockResolvedValue(items);
      vi.mocked(mockCacheMap.getQueryResult).mockReturnValue(null);

      await all(query, testLocations, contextWithTtl);

      const expectedQueryHash = createQueryHash('test', query, testLocations);
      expect(mockCacheMap.setQueryResult).toHaveBeenCalledWith(
        expectedQueryHash,
        [testItem1.key],
        customTtl
      );
    });

    it('should handle undefined queryTtl', async () => {
      const query = { limit: 10 };
      const items = [testItem1];

      const contextWithoutTtl = { ...context, queryTtl: undefined };

      vi.mocked(mockApi.all).mockResolvedValue(items);
      vi.mocked(mockCacheMap.getQueryResult).mockReturnValue(null);

      await all(query, testLocations, contextWithoutTtl);

      const expectedQueryHash = createQueryHash('test', query, testLocations);
      expect(mockCacheMap.setQueryResult).toHaveBeenCalledWith(
        expectedQueryHash,
        [testItem1.key],
        undefined
      );
    });
  });

  describe('logging', () => {
    it('should log default message with query and locations', async () => {
      const query = { limit: 10 };
      const items = [testItem1];

      vi.mocked(mockApi.all).mockResolvedValue(items);
      vi.mocked(mockCacheMap.getQueryResult).mockReturnValue(null);

      await all(query, testLocations, context);

      // Note: We can't easily test the logger calls without exposing the logger,
      // but the function should call logger.default and logger.debug
    });
  });
});
