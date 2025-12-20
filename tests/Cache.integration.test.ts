// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCache, isCache } from '../src/Cache';
import { Options } from '../src/Options';
import { MemoryCacheMap } from '../src/memory/MemoryCacheMap';
import { Item } from '@fjell/types';
import { ClientApi } from '@fjell/client-api';

// Mock the dependencies
vi.mock('@fjell/client-api');
vi.mock('../src/logger', () => ({
  default: {
    get: () => ({
      debug: vi.fn()
    })
  }
}));

interface TestItem extends Item<'test'> {
  id: string;
  name: string;
}

describe('Cache Integration with Options', () => {
  let mockApi: ClientApi<TestItem, 'test'>;
  let mockRegistry: any;
  const testCoordinate = { kta: ['test'] as const };

  beforeEach(() => {
    mockApi = {
      create: vi.fn(),
      get: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      all: vi.fn(),
      find: vi.fn()
    } as any;

    mockRegistry = {
      register: vi.fn(),
      get: vi.fn()
    };
  });

  it('should create cache with default options', () => {
    const cache = createCache(mockApi, testCoordinate, mockRegistry);

    expect(cache.coordinate).toBe(testCoordinate);
    expect(cache.registry).toBe(mockRegistry);
    expect(cache.api).toBe(mockApi);
    expect(cache.cacheMap).toBeInstanceOf(MemoryCacheMap);
    expect(cache.operations).toBeDefined();
    expect(cache.options).toBeDefined();
    expect(cache.options?.cacheType).toBe('memory');
  });

  it('should create cache with memory options', () => {
    const options: Partial<Options<TestItem, 'test'>> = {
      cacheType: 'memory',
      memoryConfig: {
        maxItems: 1000
      },
      ttl: 300000,
      enableDebugLogging: true
    };

    const cache = createCache(mockApi, testCoordinate, mockRegistry, options);

    expect(cache.options?.cacheType).toBe('memory');
    expect(cache.options?.memoryConfig?.maxItems).toBe(1000);
    expect(cache.options?.ttl).toBe(300000);
    expect(cache.options?.enableDebugLogging).toBe(true);
  });

  it('should create cache with custom cache map factory', () => {
    const customCacheMap = new MemoryCacheMap(['test']);
    const customFactory = vi.fn(() => customCacheMap);

    const options: Partial<Options<TestItem, 'test'>> = {
      cacheType: 'custom',
      customCacheMapFactory: customFactory
    };

    const cache = createCache(mockApi, testCoordinate, mockRegistry, options);

    expect(customFactory).toHaveBeenCalledWith(['test']);
    expect(cache.cacheMap).toBe(customCacheMap);
    expect(cache.options?.cacheType).toBe('custom');
  });

  it('should have all required operations', () => {
    const cache = createCache(mockApi, testCoordinate, mockRegistry);

    expect(cache.operations.get).toBeTypeOf('function');
    expect(cache.operations.set).toBeTypeOf('function');
    expect(cache.operations.all).toBeTypeOf('function');
    expect(cache.operations.create).toBeTypeOf('function');
    expect(cache.operations.update).toBeTypeOf('function');
    expect(cache.operations.remove).toBeTypeOf('function');
  });

  it('should pass isCache type guard', () => {
    const cache = createCache(mockApi, testCoordinate, mockRegistry);
    expect(isCache(cache)).toBe(true);
  });

  it('should merge partial options correctly', () => {
    const partialOptions: Partial<Options<TestItem, 'test'>> = {
      enableDebugLogging: true,
      maxRetries: 5
    };

    const cache = createCache(mockApi, testCoordinate, mockRegistry, partialOptions);

    expect(cache.options?.enableDebugLogging).toBe(true);
    expect(cache.options?.maxRetries).toBe(5);
    expect(cache.options?.cacheType).toBe('memory'); // default
    expect(cache.options?.autoSync).toBe(true); // default
  });
});
