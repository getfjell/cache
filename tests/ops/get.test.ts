
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from '../../src/ops/get';
import { CacheContext } from '../../src/CacheContext';
import { CacheMap } from '../../src/CacheMap';
import { CacheStatsManager } from '../../src/CacheStats';

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
  let mockEventEmitter: any;
  let mockTtlManager: any;
  let mockEvictionManager: any;
  let mockStatsManager: CacheStatsManager;
  let context: CacheContext<TestItem, 'test', 'container'>;

  beforeEach(() => {
    // Mock API
    mockApi = {
      get: vi.fn()
    } as any;

    // Mock CacheMap
    mockCacheMap = {
      get: vi.fn(),
      set: vi.fn(),
      includesKey: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
      keys: vi.fn(),
      values: vi.fn(),
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
      removeExpiredItems: vi.fn()
    } as any;

    // Mock EvictionManager
    mockEvictionManager = {
      onItemAdded: vi.fn().mockReturnValue([]),
      onItemAccessed: vi.fn(),
      getPolicy: vi.fn()
    } as any;

    // Mock stats manager
    mockStatsManager = new CacheStatsManager();

    // Create context
    context = {
      api: mockApi,
      cacheMap: mockCacheMap,
      pkType: 'test',
      options: {} as any,
      eventEmitter: mockEventEmitter,
      ttlManager: mockTtlManager,
      evictionManager: mockEvictionManager,
      statsManager: mockStatsManager
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
      vi.mocked(mockTtlManager.isTTLEnabled).mockReturnValue(false);
    });

    it('should check cache and fetch from API on cache miss', async () => {
      vi.mocked(mockCacheMap.get).mockReturnValue(null); // Cache miss
      vi.mocked(mockApi.get).mockResolvedValue(testItem1);

      const [resultContext, result] = await get(priKey1, context);

      expect(mockCacheMap.get).toHaveBeenCalledWith(priKey1);
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
      vi.mocked(mockTtlManager.isTTLEnabled).mockReturnValue(false);
    });

    it('should check cache and fetch from API on cache miss', async () => {
      vi.mocked(mockCacheMap.get).mockReturnValue(null); // Cache miss
      vi.mocked(mockApi.get).mockResolvedValue(testItem1);

      const [, result] = await get(priKey1, context);

      expect(mockCacheMap.get).toHaveBeenCalledWith(priKey1);
      expect(mockApi.get).toHaveBeenCalledWith(priKey1);
      expect(mockCacheMap.set).toHaveBeenCalledWith(priKey1, testItem1);
      expect(result).toEqual(testItem1);
    });
  });

  describe('when TTL is configured', () => {
    beforeEach(() => {
      vi.mocked(mockTtlManager.isTTLEnabled).mockReturnValue(true);
      vi.mocked(mockTtlManager.getDefaultTTL).mockReturnValue(300000);
    });

    describe('cache hit scenarios', () => {
      it('should return cached item when cache hit', async () => {
        vi.mocked(mockCacheMap.get).mockReturnValue(testItem1);
        vi.mocked(mockTtlManager.validateItem).mockReturnValue(true);

        const [resultContext, result] = await get(priKey1, context);

        expect(mockCacheMap.get).toHaveBeenCalledWith(priKey1);
        expect(mockTtlManager.validateItem).toHaveBeenCalled();
        expect(mockApi.get).not.toHaveBeenCalled();
        expect(mockCacheMap.set).not.toHaveBeenCalled();
        expect(result).toEqual(testItem1);
        expect(resultContext).toBe(context);
      });

      it('should work with composite keys from cache', async () => {
        vi.mocked(mockCacheMap.get).mockReturnValue(testItem3);
        vi.mocked(mockTtlManager.validateItem).mockReturnValue(true);

        const [, result] = await get(comKey1, context);

        expect(mockCacheMap.get).toHaveBeenCalledWith(comKey1);
        expect(mockTtlManager.validateItem).toHaveBeenCalled();
        expect(mockApi.get).not.toHaveBeenCalled();
        expect(result).toEqual(testItem3);
      });
    });

    describe('cache miss scenarios', () => {
      it('should fetch from API when cache miss', async () => {
        vi.mocked(mockCacheMap.get).mockReturnValue(null);
        vi.mocked(mockApi.get).mockResolvedValue(testItem1);

        const [, result] = await get(priKey1, context);

        expect(mockCacheMap.get).toHaveBeenCalledWith(priKey1);
        expect(mockApi.get).toHaveBeenCalledWith(priKey1);
        expect(mockCacheMap.set).toHaveBeenCalledWith(priKey1, testItem1);
        expect(result).toEqual(testItem1);
      });

      it('should cache the fetched item', async () => {
        vi.mocked(mockCacheMap.get).mockReturnValue(null);
        vi.mocked(mockApi.get).mockResolvedValue(testItem2);

        await get(priKey2, context);

        expect(mockCacheMap.set).toHaveBeenCalledWith(priKey2, testItem2);
      });

      it('should return null when API returns null and not cache it', async () => {
        vi.mocked(mockCacheMap.get).mockReturnValue(null);
        vi.mocked(mockApi.get).mockResolvedValue(null);

        const [, result] = await get(priKey1, context);

        expect(mockCacheMap.get).toHaveBeenCalledWith(priKey1);
        expect(mockApi.get).toHaveBeenCalledWith(priKey1);
        expect(mockCacheMap.set).not.toHaveBeenCalled();
        expect(result).toBeNull();
      });
    });

    describe('cache expiration scenarios', () => {
      it('should fetch from API when cache entry expired', async () => {
        vi.mocked(mockCacheMap.get).mockReturnValue(testItem1);
        vi.mocked(mockTtlManager.validateItem).mockReturnValue(false); // Simulate expired entry
        vi.mocked(mockApi.get).mockResolvedValue(testItem1);

        const [, result] = await get(priKey1, context);

        expect(mockCacheMap.get).toHaveBeenCalledWith(priKey1);
        expect(mockTtlManager.validateItem).toHaveBeenCalled();
        expect(mockCacheMap.delete).toHaveBeenCalledWith(priKey1);
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
      vi.mocked(mockTtlManager.isTTLEnabled).mockReturnValue(true);
      vi.mocked(mockCacheMap.get).mockReturnValue(null);

      const apiError = new Error('Network error');
      vi.mocked(mockApi.get).mockRejectedValue(apiError);

      await expect(get(priKey1, context)).rejects.toThrow('Network error');
      expect(mockCacheMap.get).toHaveBeenCalledWith(priKey1);
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
      vi.mocked(mockTtlManager.isTTLEnabled).mockReturnValue(true);
      const cachedItemWithCorrectPK = { ...testItem1, key: priKey1 };
      vi.mocked(mockCacheMap.get).mockReturnValue(cachedItemWithCorrectPK);
      vi.mocked(mockTtlManager.validateItem).mockReturnValue(true);

      const [, result] = await get(priKey1, context);

      expect(result).toEqual(cachedItemWithCorrectPK);
    });
  });

  describe('different TTL values', () => {
    it('should work with small TTL values', async () => {
      vi.mocked(mockTtlManager.isTTLEnabled).mockReturnValue(true);
      vi.mocked(mockTtlManager.getDefaultTTL).mockReturnValue(1000);
      vi.mocked(mockCacheMap.get).mockReturnValue(testItem1);
      vi.mocked(mockTtlManager.validateItem).mockReturnValue(true);

      await get(priKey1, context);

      expect(mockCacheMap.get).toHaveBeenCalledWith(priKey1);
      expect(mockTtlManager.validateItem).toHaveBeenCalled();
    });

    it('should work with large TTL values', async () => {
      vi.mocked(mockTtlManager.isTTLEnabled).mockReturnValue(true);
      vi.mocked(mockTtlManager.getDefaultTTL).mockReturnValue(86400000);
      vi.mocked(mockCacheMap.get).mockReturnValue(null);
      vi.mocked(mockApi.get).mockResolvedValue(testItem1);

      await get(priKey1, context);

      expect(mockCacheMap.get).toHaveBeenCalledWith(priKey1);
      expect(mockApi.get).toHaveBeenCalledWith(priKey1);
    });

    it('should treat disabled TTL as no TTL', async () => {
      vi.mocked(mockTtlManager.isTTLEnabled).mockReturnValue(false);
      vi.mocked(mockCacheMap.get).mockReturnValue(null); // Cache miss
      vi.mocked(mockApi.get).mockResolvedValue(testItem1);

      await get(priKey1, context);

      expect(mockCacheMap.get).toHaveBeenCalledWith(priKey1);
      expect(mockApi.get).toHaveBeenCalledWith(priKey1);
    });
  });

  describe('request coalescing with key normalization', () => {
    it('should coalesce requests for logically identical keys with different types', async () => {
      // Create keys with same logical value but different types
      const stringKey: PriKey<'test'> = { kt: 'test', pk: '1' as UUID };
      const numericKey: PriKey<'test'> = { kt: 'test', pk: 1 as any as UUID }; // Simulating number pk

      // Mock a slow API response to test coalescing
      let resolvePromise: (value: TestItem) => void;
      const slowApiPromise = new Promise<TestItem>((resolve) => {
        resolvePromise = resolve;
      });
      vi.mocked(mockApi.get).mockReturnValue(slowApiPromise);

      // Start both requests simultaneously
      const request1Promise = get(stringKey, context);
      const request2Promise = get(numericKey, context);

      // Resolve the API call
      resolvePromise!(testItem1);

      // Wait for both requests to complete
      const [, result1] = await request1Promise;
      const [, result2] = await request2Promise;

      // Both should return the same result
      expect(result1).toEqual(testItem1);
      expect(result2).toEqual(testItem1);

      // API should only be called once due to coalescing
      expect(mockApi.get).toHaveBeenCalledTimes(1);
    });

    it('should coalesce requests for composite keys with normalized location keys', async () => {
      // Create composite keys with same logical location values but different types
      const stringLocKey: ComKey<'test', 'container'> = {
        kt: 'test',
        pk: '3' as UUID,
        loc: [{ kt: 'container', lk: '1' as UUID }]
      };
      const numericLocKey: ComKey<'test', 'container'> = {
        kt: 'test',
        pk: '3' as UUID,
        loc: [{ kt: 'container', lk: 1 as any as UUID }] // Simulating numeric lk that normalizes to string
      };

      // Mock a slow API response
      let resolvePromise: (value: TestItem) => void;
      const slowApiPromise = new Promise<TestItem>((resolve) => {
        resolvePromise = resolve;
      });
      vi.mocked(mockApi.get).mockReturnValue(slowApiPromise);

      // Start both requests simultaneously
      const request1Promise = get(stringLocKey, context);
      const request2Promise = get(numericLocKey, context);

      // Resolve the API call
      resolvePromise!(testItem3);

      // Wait for both requests to complete
      const [, result1] = await request1Promise;
      const [, result2] = await request2Promise;

      // Both should return the same result
      expect(result1).toEqual(testItem3);
      expect(result2).toEqual(testItem3);

      // API should only be called once due to coalescing
      expect(mockApi.get).toHaveBeenCalledTimes(1);
    });

    it('should not coalesce requests for truly different keys', async () => {
      const key1: PriKey<'test'> = { kt: 'test', pk: '1' as UUID };
      const key2: PriKey<'test'> = { kt: 'test', pk: '2' as UUID };

      vi.mocked(mockApi.get).mockImplementation((key) => {
        if (key.pk === '1') return Promise.resolve(testItem1);
        if (key.pk === '2') return Promise.resolve(testItem2);
        return Promise.resolve(null);
      });

      // Start both requests simultaneously
      const [, result1] = await get(key1, context);
      const [, result2] = await get(key2, context);

      // Each should return different results
      expect(result1).toEqual(testItem1);
      expect(result2).toEqual(testItem2);

      // API should be called twice for different keys
      expect(mockApi.get).toHaveBeenCalledTimes(2);
      expect(mockApi.get).toHaveBeenCalledWith(key1);
      expect(mockApi.get).toHaveBeenCalledWith(key2);
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
      vi.mocked(mockTtlManager.isTTLEnabled).mockReturnValue(true);
      vi.mocked(mockTtlManager.getDefaultTTL).mockReturnValue(300000);
      vi.mocked(mockCacheMap.get).mockReturnValue(testItem1);
      vi.mocked(mockTtlManager.validateItem).mockReturnValue(true);

      const [resultContext] = await get(priKey1, context);

      expect(resultContext).toBe(context);
      expect(resultContext.ttlManager).toBe(mockTtlManager);
    });
  });
});
