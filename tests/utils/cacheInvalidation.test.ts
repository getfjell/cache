import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ComKey, LocKeyArray, PriKey } from '@fjell/types';
import { Registry } from '@fjell/registry';
import { Cache } from '../../src/Cache';
import {
  extractKeysAndKeyTypesFromActionResult,
  handleActionCacheInvalidation,
  invalidateCachesByKeysAndKeyTypes
} from '../../src/utils/cacheInvalidation';

// Mock the Cache interface
const mockCache = {
  coordinate: { kta: ['test'] },
  operations: {
    reset: vi.fn().mockResolvedValue(undefined)
  },
  cacheMap: {
    invalidateItemKeys: vi.fn().mockResolvedValue(undefined),
    clearQueryResults: vi.fn().mockResolvedValue(undefined)
  }
} as unknown as Cache<any, any, any, any, any, any, any>;

// Mock the Registry interface
const mockRegistry = {
  get: vi.fn(),
  type: 'cache'
} as unknown as Registry;

describe('Cache Invalidation Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('extractKeyTypesFromActionResult', () => {
    it('should extract key types from PriKey', () => {
      const affectedItems: Array<PriKey<any> | ComKey<any, any, any, any, any, any> | LocKeyArray<any, any, any, any, any>> = [
        { kt: 'order', pk: '123' }
      ];

      const result = extractKeysAndKeyTypesFromActionResult(affectedItems);
      expect(result.keyTypeArrays).toEqual([['order']]);
    });

    it('should extract key types from ComKey', () => {
      const affectedItems: Array<PriKey<any> | ComKey<any, any, any, any, any, any> | LocKeyArray<any, any, any, any, any>> = [
        {
          kt: 'orderPhase',
          pk: '123',
          loc: [
            { kt: 'order', lk: '456' }
          ] as any
        }
      ];

      const result = extractKeysAndKeyTypesFromActionResult(affectedItems);
      expect(result.keyTypeArrays).toEqual([['orderPhase', 'order']]);
    });

    it('should extract key types from LocKeyArray', () => {
      const affectedItems: Array<PriKey<any> | ComKey<any, any, any, any, any, any> | LocKeyArray<any, any, any, any, any>> = [
        [
          { kt: 'order', lk: '123' },
          { kt: 'customer', lk: '456' }
        ] as any
      ];

      const result = extractKeysAndKeyTypesFromActionResult(affectedItems);
      expect(result.keyTypeArrays).toEqual([['order', 'customer']]);
    });

    it('should handle mixed types', () => {
      const affectedItems: Array<PriKey<any> | ComKey<any, any, any, any, any, any> | LocKeyArray<any, any, any, any, any>> = [
        { kt: 'order', pk: '123' },
        {
          kt: 'orderPhase',
          pk: '456',
          loc: [
            { kt: 'order', lk: '789' }
          ] as any
        },
        [
          { kt: 'customer', lk: '101' }
        ] as any
      ];

      const result = extractKeysAndKeyTypesFromActionResult(affectedItems);
      expect(result.keyTypeArrays).toEqual([
        ['order'],
        ['orderPhase', 'order'],
        ['customer']
      ]);
    });

    it('should handle empty array', () => {
      const affectedItems: Array<PriKey<any> | ComKey<any, any, any, any, any, any> | LocKeyArray<any, any, any, any, any>> = [];

      const result = extractKeysAndKeyTypesFromActionResult(affectedItems);
      expect(result.keyTypeArrays).toEqual([]);
    });
  });

  describe('invalidateCachesByKeyTypes', () => {
    it('should invalidate caches for found key types', async () => {
      mockRegistry.get = vi.fn().mockReturnValue(mockCache);

      const keyTypeArrays = [['order'], ['customer']];
      await invalidateCachesByKeysAndKeyTypes(mockRegistry, [], keyTypeArrays);

      expect(mockRegistry.get).toHaveBeenCalledTimes(2);
      expect(mockRegistry.get).toHaveBeenCalledWith(['order']);
      expect(mockRegistry.get).toHaveBeenCalledWith(['customer']);
      expect(mockCache.cacheMap.clearQueryResults).toHaveBeenCalledTimes(2);
    });

    it('should handle registry.get returning null', async () => {
      mockRegistry.get = vi.fn().mockReturnValue(null);

      const keyTypeArrays = [['order']];
      await invalidateCachesByKeysAndKeyTypes(mockRegistry, [], keyTypeArrays);

      expect(mockRegistry.get).toHaveBeenCalledWith(['order']);
      expect(mockCache.cacheMap.invalidateItemKeys).not.toHaveBeenCalled();
    });

    it('should handle registry.get throwing error', async () => {
      mockRegistry.get = vi.fn().mockImplementation(() => {
        throw new Error('Registry error');
      });

      const keyTypeArrays = [['order'], ['customer']];
      await invalidateCachesByKeysAndKeyTypes(mockRegistry, [], keyTypeArrays);

      // Should continue processing other key types
      expect(mockRegistry.get).toHaveBeenCalledTimes(2);
    });
  });

  describe('handleActionCacheInvalidation', () => {
    it('should handle cache invalidation for action results', async () => {
      mockRegistry.get = vi.fn().mockReturnValue(mockCache);

      const affectedItems: Array<PriKey<any> | ComKey<any, any, any, any, any, any> | LocKeyArray<any, any, any, any, any>> = [
        { kt: 'order', pk: '123' },
        { kt: 'customer', pk: '456' }
      ];

      await handleActionCacheInvalidation(mockRegistry, affectedItems);

      expect(mockRegistry.get).toHaveBeenCalledTimes(4);
      expect(mockCache.cacheMap.invalidateItemKeys).toHaveBeenCalledTimes(2);
    });

    it('should handle empty affected items', async () => {
      const affectedItems: Array<PriKey<any> | ComKey<any, any, any, any, any, any> | LocKeyArray<any, any, any, any, any>> = [];

      await handleActionCacheInvalidation(mockRegistry, affectedItems);

      expect(mockRegistry.get).not.toHaveBeenCalled();
      expect(mockCache.cacheMap.invalidateItemKeys).not.toHaveBeenCalled();
    });
  });
});
