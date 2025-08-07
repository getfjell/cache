/* eslint-disable no-undefined */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from '../../src/ops/get';
import { CacheContext } from '../../src/CacheContext';
import { CacheMap } from '../../src/CacheMap';
import { ClientApi } from '@fjell/client-api';
import { ComKey, Item, PriKey, UUID } from '@fjell/core';

describe('get operation', () => {
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

  let mockApi: ClientApi<TestItem, 'test', 'container'>;
  let mockCacheMap: CacheMap<TestItem, 'test', 'container'>;
  let context: CacheContext<TestItem, 'test', 'container'>;

  beforeEach(() => {
    // Mock API
    mockApi = {
      get: vi.fn()
    } as any;

    // Mock CacheMap
    mockCacheMap = {
      get: vi.fn(),
      getWithTTL: vi.fn(),
      set: vi.fn(),
      includesKey: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn(),
      keys: vi.fn(),
      values: vi.fn(),
      entries: vi.fn(),
      size: vi.fn()
    } as any;

    // Create context
    context = {
      api: mockApi,
      cacheMap: mockCacheMap,
      pkType: 'test',
      options: {} as any,
      itemTtl: undefined,
      queryTtl: undefined
    };
  });

  describe('input validation', () => {
    it('should throw error for invalid key', async () => {
      const invalidKey = { invalid: 'key' } as any;

      await expect(get(invalidKey, context)).rejects.toThrow('Key for Get is not a valid ItemKey');
    });

    it('should accept valid primary key', async () => {
      vi.mocked(mockApi.get).mockResolvedValue(testItem1);

      const [resultContext] = await get(priKey1, context);

      expect(resultContext).toBe(context);
      expect(mockApi.get).toHaveBeenCalledWith(priKey1);
    });

    it('should accept valid composite key', async () => {
      vi.mocked(mockApi.get).mockResolvedValue(testItem3);

      await get(comKey1, context);

      expect(mockApi.get).toHaveBeenCalledWith(comKey1);
    });
  });

  describe('when TTL is not configured', () => {
    beforeEach(() => {
      context.itemTtl = undefined;
    });

    it('should skip cache and fetch from API', async () => {
      vi.mocked(mockApi.get).mockResolvedValue(testItem1);

      const [resultContext, result] = await get(priKey1, context);

      expect(mockCacheMap.getWithTTL).not.toHaveBeenCalled();
      expect(mockApi.get).toHaveBeenCalledWith(priKey1);
      expect(mockCacheMap.set).toHaveBeenCalledWith(priKey1, testItem1);
      expect(result).toEqual(testItem1);
      expect(resultContext).toBe(context);
    });

    it('should return null when API returns null', async () => {
      vi.mocked(mockApi.get).mockResolvedValue(null);

      const [resultContext, result] = await get(priKey1, context);

      expect(mockApi.get).toHaveBeenCalledWith(priKey1);
      expect(mockCacheMap.set).not.toHaveBeenCalled();
      expect(result).toBeNull();
      expect(resultContext).toBe(context);
    });
  });

  describe('when TTL is 0', () => {
    beforeEach(() => {
      context.itemTtl = 0;
    });

    it('should skip cache and fetch from API', async () => {
      vi.mocked(mockApi.get).mockResolvedValue(testItem1);

      const [, result] = await get(priKey1, context);

      expect(mockCacheMap.getWithTTL).not.toHaveBeenCalled();
      expect(mockApi.get).toHaveBeenCalledWith(priKey1);
      expect(mockCacheMap.set).toHaveBeenCalledWith(priKey1, testItem1);
      expect(result).toEqual(testItem1);
    });
  });

  describe('when TTL is configured', () => {
    beforeEach(() => {
      context.itemTtl = 300000; // 5 minutes
    });

    describe('cache hit scenarios', () => {
      it('should return cached item when cache hit', async () => {
        vi.mocked(mockCacheMap.getWithTTL).mockReturnValue(testItem1);

        const [resultContext, result] = await get(priKey1, context);

        expect(mockCacheMap.getWithTTL).toHaveBeenCalledWith(priKey1, 300000);
        expect(mockApi.get).not.toHaveBeenCalled();
        expect(mockCacheMap.set).not.toHaveBeenCalled();
        expect(result).toEqual(testItem1);
        expect(resultContext).toBe(context);
      });

      it('should work with composite keys from cache', async () => {
        vi.mocked(mockCacheMap.getWithTTL).mockReturnValue(testItem3);

        const [, result] = await get(comKey1, context);

        expect(mockCacheMap.getWithTTL).toHaveBeenCalledWith(comKey1, 300000);
        expect(mockApi.get).not.toHaveBeenCalled();
        expect(result).toEqual(testItem3);
      });
    });

    describe('cache miss scenarios', () => {
      it('should fetch from API when cache miss', async () => {
        vi.mocked(mockCacheMap.getWithTTL).mockReturnValue(null);
        vi.mocked(mockApi.get).mockResolvedValue(testItem1);

        const [, result] = await get(priKey1, context);

        expect(mockCacheMap.getWithTTL).toHaveBeenCalledWith(priKey1, 300000);
        expect(mockApi.get).toHaveBeenCalledWith(priKey1);
        expect(mockCacheMap.set).toHaveBeenCalledWith(priKey1, testItem1);
        expect(result).toEqual(testItem1);
      });

      it('should cache the fetched item', async () => {
        vi.mocked(mockCacheMap.getWithTTL).mockReturnValue(null);
        vi.mocked(mockApi.get).mockResolvedValue(testItem2);

        await get(priKey2, context);

        expect(mockCacheMap.set).toHaveBeenCalledWith(priKey2, testItem2);
      });

      it('should return null when API returns null and not cache it', async () => {
        vi.mocked(mockCacheMap.getWithTTL).mockReturnValue(null);
        vi.mocked(mockApi.get).mockResolvedValue(null);

        const [, result] = await get(priKey1, context);

        expect(mockCacheMap.getWithTTL).toHaveBeenCalledWith(priKey1, 300000);
        expect(mockApi.get).toHaveBeenCalledWith(priKey1);
        expect(mockCacheMap.set).not.toHaveBeenCalled();
        expect(result).toBeNull();
      });
    });

    describe('cache expiration scenarios', () => {
      it('should fetch from API when cache entry expired', async () => {
        vi.mocked(mockCacheMap.getWithTTL).mockReturnValue(null); // Simulate expired entry
        vi.mocked(mockApi.get).mockResolvedValue(testItem1);

        const [, result] = await get(priKey1, context);

        expect(mockCacheMap.getWithTTL).toHaveBeenCalledWith(priKey1, 300000);
        expect(mockApi.get).toHaveBeenCalledWith(priKey1);
        expect(mockCacheMap.set).toHaveBeenCalledWith(priKey1, testItem1);
        expect(result).toEqual(testItem1);
      });
    });
  });

  describe('error handling', () => {
    it('should propagate API errors', async () => {
      const apiError = new Error('API failure');
      vi.mocked(mockApi.get).mockRejectedValue(apiError);

      await expect(get(priKey1, context)).rejects.toThrow('API failure');
      expect(mockApi.get).toHaveBeenCalledWith(priKey1);
    });

    it('should propagate API errors even with TTL configured', async () => {
      context.itemTtl = 300000;
      vi.mocked(mockCacheMap.getWithTTL).mockReturnValue(null);

      const apiError = new Error('Network error');
      vi.mocked(mockApi.get).mockRejectedValue(apiError);

      await expect(get(priKey1, context)).rejects.toThrow('Network error');
      expect(mockCacheMap.getWithTTL).toHaveBeenCalledWith(priKey1, 300000);
      expect(mockApi.get).toHaveBeenCalledWith(priKey1);
    });

    it('should handle API errors with stack trace', async () => {
      const apiError = new Error('Detailed API error');
      apiError.stack = 'Error stack trace';
      vi.mocked(mockApi.get).mockRejectedValue(apiError);

      await expect(get(priKey1, context)).rejects.toThrow('Detailed API error');
    });
  });

  describe('primary key validation', () => {
    it('should validate returned items have correct primary key type', async () => {
      const itemWithCorrectPK = { ...testItem1, key: priKey1 };
      vi.mocked(mockApi.get).mockResolvedValue(itemWithCorrectPK);

      const [, result] = await get(priKey1, context);

      expect(result).toEqual(itemWithCorrectPK);
    });

    it('should validate cached items have correct primary key type', async () => {
      context.itemTtl = 300000;
      const cachedItemWithCorrectPK = { ...testItem1, key: priKey1 };
      vi.mocked(mockCacheMap.getWithTTL).mockReturnValue(cachedItemWithCorrectPK);

      const [, result] = await get(priKey1, context);

      expect(result).toEqual(cachedItemWithCorrectPK);
    });
  });

  describe('different TTL values', () => {
    it('should work with small TTL values', async () => {
      context.itemTtl = 1000; // 1 second
      vi.mocked(mockCacheMap.getWithTTL).mockReturnValue(testItem1);

      await get(priKey1, context);

      expect(mockCacheMap.getWithTTL).toHaveBeenCalledWith(priKey1, 1000);
    });

    it('should work with large TTL values', async () => {
      context.itemTtl = 86400000; // 24 hours
      vi.mocked(mockCacheMap.getWithTTL).mockReturnValue(null);
      vi.mocked(mockApi.get).mockResolvedValue(testItem1);

      await get(priKey1, context);

      expect(mockCacheMap.getWithTTL).toHaveBeenCalledWith(priKey1, 86400000);
    });

    it('should treat negative TTL as no TTL', async () => {
      context.itemTtl = -1;
      vi.mocked(mockApi.get).mockResolvedValue(testItem1);

      await get(priKey1, context);

      expect(mockCacheMap.getWithTTL).not.toHaveBeenCalled();
      expect(mockApi.get).toHaveBeenCalledWith(priKey1);
    });
  });

  describe('context preservation', () => {
    it('should return the same context instance', async () => {
      vi.mocked(mockApi.get).mockResolvedValue(testItem1);

      const [resultContext] = await get(priKey1, context);

      expect(resultContext).toBe(context);
      expect(resultContext.api).toBe(mockApi);
      expect(resultContext.cacheMap).toBe(mockCacheMap);
      expect(resultContext.pkType).toBe('test');
    });

    it('should preserve context with TTL configuration', async () => {
      context.itemTtl = 300000;
      vi.mocked(mockCacheMap.getWithTTL).mockReturnValue(testItem1);

      const [resultContext] = await get(priKey1, context);

      expect(resultContext).toBe(context);
      expect(resultContext.itemTtl).toBe(300000);
    });
  });
});
