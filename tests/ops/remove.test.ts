import { beforeEach, describe, expect, it, vi } from 'vitest';
import { remove } from '../../src/ops/remove';
import { CacheContext } from '../../src/CacheContext';
import { ComKey, Item, PriKey } from '@fjell/core';

type TestItem = Item<'test', 'container'>;
type TestPriKey = PriKey<'test'>;
type TestComKey = ComKey<'test', 'container'>;

describe('remove operation', () => {
  let mockApi: any;
  let mockCacheMap: any;
  let context: CacheContext<TestItem, 'test', 'container'>;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Setup mock API
    mockApi = {
      remove: vi.fn().mockResolvedValue(void 0),
    };

    // Setup mock cache map
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
      getSizeLimits: vi.fn(),
      size: 0
    };

    // Mock EventEmitter
    const mockEventEmitter = {
      emit: vi.fn()
    };

    // Mock TTLManager
    const mockTtlManager = {
      isTTLEnabled: vi.fn().mockReturnValue(false),
      getDefaultTTL: vi.fn().mockReturnValue(undefined),
      validateItem: vi.fn().mockReturnValue(true),
      onItemAdded: vi.fn(),
      onItemAccessed: vi.fn(),
      removeExpiredItems: vi.fn()
    } as any;

    // Mock EvictionManager
    const mockEvictionManager = {
      onItemAdded: vi.fn().mockReturnValue([]),
      onItemAccessed: vi.fn(),
      getPolicy: vi.fn()
    } as any;

    // Setup context
    context = {
      api: mockApi,
      cacheMap: mockCacheMap,
      eventEmitter: mockEventEmitter,
      pkType: 'test',
      options: { cacheType: 'memory' },
      ttlManager: mockTtlManager,
      evictionManager: mockEvictionManager
    } as any;
  });

  describe('input validation', () => {
    it('should throw error for null key', async () => {
      const invalidKey = null as any;

      await expect(remove(invalidKey, context)).rejects.toThrow('Cannot read properties of null');

      expect(mockApi.remove).not.toHaveBeenCalled();
      expect(mockCacheMap.delete).not.toHaveBeenCalled();
    });

    it('should throw error for undefined key', async () => {
      const invalidKey = void 0 as any;

      await expect(remove(invalidKey, context)).rejects.toThrow('Key for Remove is not a valid ItemKey');

      expect(mockApi.remove).not.toHaveBeenCalled();
      expect(mockCacheMap.delete).not.toHaveBeenCalled();
    });

    it('should throw error for empty object', async () => {
      const invalidKey = {} as any;

      await expect(remove(invalidKey, context)).rejects.toThrow('Key for Remove is not a valid ItemKey');

      expect(mockApi.remove).not.toHaveBeenCalled();
      expect(mockCacheMap.delete).not.toHaveBeenCalled();
    });

    it('should throw error for malformed key', async () => {
      const invalidKey = { invalid: 'key' } as any;

      await expect(remove(invalidKey, context)).rejects.toThrow('Key for Remove is not a valid ItemKey');

      expect(mockApi.remove).not.toHaveBeenCalled();
      expect(mockCacheMap.delete).not.toHaveBeenCalled();
    });

    it('should throw error for incomplete primary key', async () => {
      const invalidKey = { kt: 'test' } as any; // Missing pk

      await expect(remove(invalidKey, context)).rejects.toThrow('Key for Remove is not a valid ItemKey');

      expect(mockApi.remove).not.toHaveBeenCalled();
      expect(mockCacheMap.delete).not.toHaveBeenCalled();
    });

    it('should throw error for null pk', async () => {
      const invalidKey = { kt: 'test', pk: null } as any;

      await expect(remove(invalidKey, context)).rejects.toThrow('Key for Remove is not a valid ItemKey');

      expect(mockApi.remove).not.toHaveBeenCalled();
      expect(mockCacheMap.delete).not.toHaveBeenCalled();
    });

    it('should throw error for empty string pk', async () => {
      const invalidKey = { kt: 'test', pk: '' } as any;

      await expect(remove(invalidKey, context)).rejects.toThrow('Key for Remove is not a valid ItemKey');

      expect(mockApi.remove).not.toHaveBeenCalled();
      expect(mockCacheMap.delete).not.toHaveBeenCalled();
    });
  });

  describe('successful operation', () => {
    it('should successfully remove item with primary key', async () => {
      const validPriKey: TestPriKey = {
        kt: 'test',
        pk: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = await remove(validPriKey, context);

      expect(mockApi.remove).toHaveBeenCalledWith(validPriKey);
      expect(mockCacheMap.delete).toHaveBeenCalledWith(validPriKey);
      expect(result).toBe(context);
    });

    it('should successfully remove item with composite key', async () => {
      const validComKey: TestComKey = {
        kt: 'test',
        pk: '123e4567-e89b-12d3-a456-426614174000',
        loc: [{ kt: 'container', lk: '123e4567-e89b-12d3-a456-426614174100' }],
      };

      const result = await remove(validComKey, context);

      expect(mockApi.remove).toHaveBeenCalledWith(validComKey);
      expect(mockCacheMap.delete).toHaveBeenCalledWith(validComKey);
      expect(result).toBe(context);
    });

    it('should return original context object', async () => {
      const validKey: TestPriKey = {
        kt: 'test',
        pk: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = await remove(validKey, context);

      expect(result).toBe(context);
      expect(result.api).toBe(mockApi);
      expect(result.cacheMap).toBe(mockCacheMap);
    });

    it('should handle deeply nested composite key', async () => {
      const deepComKey: ComKey<'test', 'container', 'subcont', 'subsub'> = {
        kt: 'test',
        pk: '123e4567-e89b-12d3-a456-426614174000',
        loc: [
          { kt: 'container', lk: '123e4567-e89b-12d3-a456-426614174100' },
          { kt: 'subcont', lk: '123e4567-e89b-12d3-a456-426614174200' },
          { kt: 'subsub', lk: '123e4567-e89b-12d3-a456-426614174300' },
        ],
      };

      const result = await remove(deepComKey, context as any);

      expect(mockApi.remove).toHaveBeenCalledWith(deepComKey);
      expect(mockCacheMap.delete).toHaveBeenCalledWith(deepComKey);
      expect(result).toBe(context);
    });
  });

  describe('error handling', () => {
    it('should propagate API errors and not delete from cache', async () => {
      const validKey: TestPriKey = {
        kt: 'test',
        pk: '123e4567-e89b-12d3-a456-426614174000',
      };
      const apiError = new Error('API failure');
      mockApi.remove.mockRejectedValue(apiError);

      await expect(remove(validKey, context)).rejects.toThrow('API failure');

      expect(mockApi.remove).toHaveBeenCalledWith(validKey);
      expect(mockCacheMap.delete).not.toHaveBeenCalled();
    });

    it('should handle network errors', async () => {
      const validKey: TestPriKey = {
        kt: 'test',
        pk: '123e4567-e89b-12d3-a456-426614174000',
      };
      const networkError = new Error('Network timeout');
      mockApi.remove.mockRejectedValue(networkError);

      await expect(remove(validKey, context)).rejects.toThrow('Network timeout');

      expect(mockCacheMap.delete).not.toHaveBeenCalled();
    });

    it('should handle API errors with additional properties', async () => {
      const validKey: TestComKey = {
        kt: 'test',
        pk: '123e4567-e89b-12d3-a456-426614174000',
        loc: [{ kt: 'container', lk: '123e4567-e89b-12d3-a456-426614174100' }],
      };
      const complexError = new Error('Detailed API error');
      (complexError as any).statusCode = 404;
      (complexError as any).details = { message: 'Item not found' };
      mockApi.remove.mockRejectedValue(complexError);

      await expect(remove(validKey, context)).rejects.toThrow(complexError);

      expect(mockCacheMap.delete).not.toHaveBeenCalled();
    });

    it('should handle string errors from API', async () => {
      const validKey: TestPriKey = {
        kt: 'test',
        pk: '123e4567-e89b-12d3-a456-426614174000',
      };
      const stringError = 'String error message';
      mockApi.remove.mockRejectedValue(stringError);

      await expect(remove(validKey, context)).rejects.toThrow(stringError);

      expect(mockCacheMap.delete).not.toHaveBeenCalled();
    });

    it('should handle non-Error objects thrown by API', async () => {
      const validKey: TestPriKey = {
        kt: 'test',
        pk: '123e4567-e89b-12d3-a456-426614174000',
      };
      const objectError = { code: 'REMOVE_FAILED', message: 'Object error' };
      mockApi.remove.mockRejectedValue(objectError);

      try {
        await remove(validKey, context);
        expect.fail('Expected an error to be thrown');
      } catch (error) {
        expect(error).toBe(objectError);
      }

      expect(mockCacheMap.delete).not.toHaveBeenCalled();
    });
  });

  describe('operation sequence', () => {
    it('should call operations in correct order for successful removal', async () => {
      const validKey: TestPriKey = {
        kt: 'test',
        pk: '123e4567-e89b-12d3-a456-426614174000',
      };
      const callOrder: string[] = [];

      mockApi.remove.mockImplementation(() => {
        callOrder.push('api.remove');
        return Promise.resolve();
      });

      mockCacheMap.delete.mockImplementation(() => {
        callOrder.push('cacheMap.delete');
      });

      await remove(validKey, context);

      expect(callOrder).toEqual(['api.remove', 'cacheMap.delete']);
    });

    it('should not call cache deletion if API call fails', async () => {
      const validKey: TestPriKey = {
        kt: 'test',
        pk: '123e4567-e89b-12d3-a456-426614174000',
      };
      const callOrder: string[] = [];

      mockApi.remove.mockImplementation(() => {
        callOrder.push('api.remove');
        return Promise.reject(new Error('API failed'));
      });

      mockCacheMap.delete.mockImplementation(() => {
        callOrder.push('cacheMap.delete');
      });

      await expect(remove(validKey, context)).rejects.toThrow();

      expect(callOrder).toEqual(['api.remove']);
      expect(mockCacheMap.delete).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle API returning undefined', async () => {
      const validKey: TestPriKey = {
        kt: 'test',
        pk: '123e4567-e89b-12d3-a456-426614174000',
      };
      mockApi.remove.mockResolvedValue(void 0);

      const result = await remove(validKey, context);

      expect(result).toBe(context);
      expect(mockCacheMap.delete).toHaveBeenCalledWith(validKey);
    });

    it('should handle API returning null', async () => {
      const validKey: TestPriKey = {
        kt: 'test',
        pk: '123e4567-e89b-12d3-a456-426614174000',
      };
      mockApi.remove.mockResolvedValue(null);

      const result = await remove(validKey, context);

      expect(result).toBe(context);
      expect(mockCacheMap.delete).toHaveBeenCalledWith(validKey);
    });

    it('should handle composite key with empty loc array as valid', async () => {
      const keyWithEmptyLoc: any = {
        kt: 'test',
        pk: '123e4567-e89b-12d3-a456-426614174000',
        loc: [],
      };

      // Empty loc array is actually valid according to the validation logic
      const result = await remove(keyWithEmptyLoc, context);

      expect(mockApi.remove).toHaveBeenCalledWith(keyWithEmptyLoc);
      expect(mockCacheMap.delete).toHaveBeenCalledWith(keyWithEmptyLoc);
      expect(result).toBe(context);
    });

    it('should handle composite key with invalid location key', async () => {
      const keyWithInvalidLoc: any = {
        kt: 'test',
        pk: '123e4567-e89b-12d3-a456-426614174000',
        loc: [{ kt: 'container', lk: '' }], // empty lk
      };

      await expect(remove(keyWithInvalidLoc, context)).rejects.toThrow('Key for Remove is not a valid ItemKey');

      expect(mockApi.remove).not.toHaveBeenCalled();
      expect(mockCacheMap.delete).not.toHaveBeenCalled();
    });

    it('should handle key with unexpected additional properties', async () => {
      const keyWithExtraProps: any = {
        kt: 'test',
        pk: '123e4567-e89b-12d3-a456-426614174000',
        extraProp: 'should not affect validation',
      };

      const result = await remove(keyWithExtraProps, context);

      expect(mockApi.remove).toHaveBeenCalledWith(keyWithExtraProps);
      expect(mockCacheMap.delete).toHaveBeenCalledWith(keyWithExtraProps);
      expect(result).toBe(context);
    });

    it('should handle very long primary key', async () => {
      const longPkKey: TestPriKey = {
        kt: 'test',
        pk: 'a'.repeat(1000), // Very long primary key
      };

      const result = await remove(longPkKey, context);

      expect(mockApi.remove).toHaveBeenCalledWith(longPkKey);
      expect(mockCacheMap.delete).toHaveBeenCalledWith(longPkKey);
      expect(result).toBe(context);
    });

    it('should handle special characters in primary key', async () => {
      const specialCharsKey: TestPriKey = {
        kt: 'test',
        pk: 'key-with-special!@#$%^&*()_+={[}];:"|<>?,./',
      };

      const result = await remove(specialCharsKey, context);

      expect(mockApi.remove).toHaveBeenCalledWith(specialCharsKey);
      expect(mockCacheMap.delete).toHaveBeenCalledWith(specialCharsKey);
      expect(result).toBe(context);
    });
  });

  describe('comprehensive error scenarios', () => {
    it('should handle promise rejection with null error', async () => {
      const validKey: TestPriKey = {
        kt: 'test',
        pk: '123e4567-e89b-12d3-a456-426614174000',
      };
      mockApi.remove.mockRejectedValue(null);

      await expect(remove(validKey, context)).rejects.toBeNull();

      expect(mockCacheMap.delete).not.toHaveBeenCalled();
    });

    it('should handle promise rejection with undefined error', async () => {
      const validKey: TestPriKey = {
        kt: 'test',
        pk: '123e4567-e89b-12d3-a456-426614174000',
      };

      mockApi.remove.mockRejectedValue(undefined);

      await expect(remove(validKey, context)).rejects.toBeUndefined();

      expect(mockCacheMap.delete).not.toHaveBeenCalled();
    });

    it('should handle API remove throwing synchronously', async () => {
      const validKey: TestPriKey = {
        kt: 'test',
        pk: '123e4567-e89b-12d3-a456-426614174000',
      };

      // Mock to throw synchronously rather than return rejected promise
      mockApi.remove.mockImplementation(() => {
        throw new Error('Synchronous error');
      });

      await expect(remove(validKey, context)).rejects.toThrow('Synchronous error');

      expect(mockCacheMap.delete).not.toHaveBeenCalled();
    });
  });
});
