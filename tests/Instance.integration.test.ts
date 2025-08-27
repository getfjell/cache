// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInstance, isInstance } from '../src/Instance';
import { Options } from '../src/Options';
import { MemoryCacheMap } from '../src/memory/MemoryCacheMap';
import { Item } from '@fjell/core';
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

describe('Instance Integration with Options', () => {
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

  it('should create instance with default options', () => {
    const instance = createInstance(mockRegistry, testCoordinate, mockApi);

    expect(instance.coordinate).toBe(testCoordinate);
    expect(instance.registry).toBe(mockRegistry);
    expect(instance.api).toBe(mockApi);
    expect(instance.cacheMap).toBeInstanceOf(MemoryCacheMap);
    expect(instance.operations).toBeDefined();
    expect(instance.options).toBeDefined();
    expect(instance.options?.cacheType).toBe('memory');
  });

  it('should create instance with custom options', () => {
    const options: Partial<Options<TestItem, 'test'>> = {
      cacheType: 'memory',
      memoryConfig: {
        maxItems: 500
      },
      ttl: 120000,
      enableDebugLogging: true,
      autoSync: false
    };

    const instance = createInstance(mockRegistry, testCoordinate, mockApi, options);

    expect(instance.options?.cacheType).toBe('memory');
    expect(instance.options?.memoryConfig?.maxItems).toBe(500);
    expect(instance.options?.ttl).toBe(120000);
    expect(instance.options?.enableDebugLogging).toBe(true);
    expect(instance.options?.autoSync).toBe(false);
  });

  it('should create instance with localStorage options', () => {
    const options: Partial<Options<TestItem, 'test'>> = {
      cacheType: 'localStorage',
      webStorageConfig: {
        keyPrefix: 'test-instance:',
        compress: true
      }
    };

    const instance = createInstance(mockRegistry, testCoordinate, mockApi, options);

    expect(instance.options?.cacheType).toBe('localStorage');
    expect(instance.options?.webStorageConfig?.keyPrefix).toBe('test-instance:');
    expect(instance.options?.webStorageConfig?.compress).toBe(true);
  });

  it('should create instance with IndexedDB options', () => {
    const options: Partial<Options<TestItem, 'test'>> = {
      cacheType: 'indexedDB',
      indexedDBConfig: {
        dbName: 'InstanceTestDB',
        version: 2,
        storeName: 'instances'
      }
    };

    const instance = createInstance(mockRegistry, testCoordinate, mockApi, options);

    expect(instance.options?.cacheType).toBe('indexedDB');
    expect(instance.options?.indexedDBConfig?.dbName).toBe('InstanceTestDB');
    expect(instance.options?.indexedDBConfig?.version).toBe(2);
    expect(instance.options?.indexedDBConfig?.storeName).toBe('instances');
  });

  it('should create instance with custom cache map factory', () => {
    const customCacheMap = new MemoryCacheMap(['test']);
    const customFactory = vi.fn(() => customCacheMap);

    const options: Partial<Options<TestItem, 'test'>> = {
      cacheType: 'custom',
      customCacheMapFactory: customFactory,
      enableDebugLogging: true
    };

    const instance = createInstance(mockRegistry, testCoordinate, mockApi, options);

    expect(customFactory).toHaveBeenCalledWith(['test']);
    expect(instance.cacheMap).toBe(customCacheMap);
    expect(instance.options?.cacheType).toBe('custom');
    expect(instance.options?.enableDebugLogging).toBe(true);
  });

  it('should pass isInstance type guard', () => {
    const instance = createInstance(mockRegistry, testCoordinate, mockApi);
    expect(isInstance(instance)).toBe(true);
  });

  it('should have all required instance properties', () => {
    const instance = createInstance(mockRegistry, testCoordinate, mockApi);

    expect(instance).toHaveProperty('coordinate');
    expect(instance).toHaveProperty('registry');
    expect(instance).toHaveProperty('api');
    expect(instance).toHaveProperty('cacheMap');
    expect(instance).toHaveProperty('operations');
    expect(instance).toHaveProperty('options');
  });

  it('should have all required operations', () => {
    const instance = createInstance(mockRegistry, testCoordinate, mockApi);

    expect(instance.operations.get).toBeTypeOf('function');
    expect(instance.operations.set).toBeTypeOf('function');
    expect(instance.operations.all).toBeTypeOf('function');
    expect(instance.operations.create).toBeTypeOf('function');
    expect(instance.operations.update).toBeTypeOf('function');
    expect(instance.operations.remove).toBeTypeOf('function');
  });

  it('should merge partial options with defaults', () => {
    const partialOptions: Partial<Options<TestItem, 'test'>> = {
      enableDebugLogging: true,
      maxRetries: 7
    };

    const instance = createInstance(mockRegistry, testCoordinate, mockApi, partialOptions);

    expect(instance.options?.enableDebugLogging).toBe(true);
    expect(instance.options?.maxRetries).toBe(7);
    expect(instance.options?.cacheType).toBe('memory'); // default
    expect(instance.options?.autoSync).toBe(true); // default
    expect(instance.options?.retryDelay).toBe(1000); // default
  });

  it('should handle complex nested config merging', () => {
    const options: Partial<Options<TestItem, 'test'>> = {
      webStorageConfig: {
        keyPrefix: 'complex:'
        // compress should use default
      },
      indexedDBConfig: {
        dbName: 'ComplexDB'
        // version and storeName should use defaults
      },
      memoryConfig: {
        // maxItems should be undefined
      },
      ttl: 180000
    };

    const instance = createInstance(mockRegistry, testCoordinate, mockApi, options);

    expect(instance.options?.webStorageConfig?.keyPrefix).toBe('complex:');
    expect(instance.options?.webStorageConfig?.compress).toBe(false); // default
    expect(instance.options?.indexedDBConfig?.dbName).toBe('ComplexDB');
    expect(instance.options?.indexedDBConfig?.version).toBe(1); // default
    expect(instance.options?.indexedDBConfig?.storeName).toBe('cache'); // default
    expect(instance.options?.ttl).toBe(180000);
    expect(instance.options?.memoryConfig?.maxItems).toBeUndefined();
  });

  it('should create separate instances with independent options', () => {
    const options1: Partial<Options<TestItem, 'test'>> = {
      enableDebugLogging: true,
      maxRetries: 3
    };

    const options2: Partial<Options<TestItem, 'test'>> = {
      enableDebugLogging: false,
      maxRetries: 5
    };

    const instance1 = createInstance(mockRegistry, testCoordinate, mockApi, options1);
    const instance2 = createInstance(mockRegistry, testCoordinate, mockApi, options2);

    expect(instance1.options?.enableDebugLogging).toBe(true);
    expect(instance1.options?.maxRetries).toBe(3);
    expect(instance2.options?.enableDebugLogging).toBe(false);
    expect(instance2.options?.maxRetries).toBe(5);

    // Instances should be separate objects
    expect(instance1).not.toBe(instance2);
    expect(instance1.cacheMap).not.toBe(instance2.cacheMap);
    expect(instance1.operations).not.toBe(instance2.operations);
  });
});
