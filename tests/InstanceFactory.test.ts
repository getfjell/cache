// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInstanceFactory } from '../src/InstanceFactory';
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

interface TestRegistry {
  register: (instance: any) => void;
  get: (key: any) => any;
}

describe('InstanceFactory Integration Tests', () => {
  let mockApi: ClientApi<TestItem, 'test'>;
  let mockRegistry: TestRegistry;
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

  describe('createInstanceFactory with default options', () => {
    it('should create instance factory with default memory cache', () => {
      const factory = createInstanceFactory(mockApi);

      expect(factory).toBeTypeOf('function');

      const instance = factory(testCoordinate, { registry: mockRegistry });

      expect(instance.coordinate).toEqual(testCoordinate);
      expect(instance.registry).toBe(mockRegistry);
      expect(instance.api).toBe(mockApi);
      expect(instance.cacheMap).toBeInstanceOf(MemoryCacheMap);
      expect(instance.operations).toBeDefined();
      expect(instance.options).toBeDefined();
      expect(instance.options?.cacheType).toBe('memory');
    });

    it('should create instance with default options values', () => {
      const factory = createInstanceFactory(mockApi);
      const instance = factory(testCoordinate, { registry: mockRegistry });

      expect(instance.options?.enableDebugLogging).toBe(false);
      expect(instance.options?.autoSync).toBe(true);
      expect(instance.options?.maxRetries).toBe(3);
      expect(instance.options?.retryDelay).toBe(1000);
    });
  });

  describe('createInstanceFactory with custom options', () => {
    it('should create instance factory with memory cache options', () => {
      const options: Partial<Options<TestItem, 'test'>> = {
        cacheType: 'memory',
        memoryConfig: {
          maxItems: 500,
          ttl: 60000
        },
        enableDebugLogging: true,
        maxRetries: 5
      };

      const factory = createInstanceFactory(mockApi, options);
      const instance = factory(testCoordinate, { registry: mockRegistry });

      expect(instance.cacheMap).toBeInstanceOf(MemoryCacheMap);
      expect(instance.options?.cacheType).toBe('memory');
      expect(instance.options?.memoryConfig?.maxItems).toBe(500);
      expect(instance.options?.memoryConfig?.ttl).toBe(60000);
      expect(instance.options?.enableDebugLogging).toBe(true);
      expect(instance.options?.maxRetries).toBe(5);
    });

    it('should create instance factory with custom cache map factory', () => {
      const customCacheMap = new MemoryCacheMap(['test']);
      const customFactory = vi.fn(() => customCacheMap);

      const options: Partial<Options<TestItem, 'test'>> = {
        cacheType: 'custom',
        customCacheMapFactory: customFactory,
        enableDebugLogging: true
      };

      const factory = createInstanceFactory(mockApi, options);
      const instance = factory(testCoordinate, { registry: mockRegistry });

      expect(customFactory).toHaveBeenCalledWith(['test']);
      expect(instance.cacheMap).toBe(customCacheMap);
      expect(instance.options?.cacheType).toBe('custom');
      expect(instance.options?.enableDebugLogging).toBe(true);
    });

    it('should create instance with localStorage configuration', () => {
      const options: Partial<Options<TestItem, 'test'>> = {
        cacheType: 'localStorage',
        webStorageConfig: {
          keyPrefix: 'test-app:',
          compress: true
        },
        autoSync: false
      };

      const factory = createInstanceFactory(mockApi, options);
      const instance = factory(testCoordinate, { registry: mockRegistry });

      expect(instance.options?.cacheType).toBe('localStorage');
      expect(instance.options?.webStorageConfig?.keyPrefix).toBe('test-app:');
      expect(instance.options?.webStorageConfig?.compress).toBe(true);
      expect(instance.options?.autoSync).toBe(false);
    });

    it('should create instance with sessionStorage configuration', () => {
      const options: Partial<Options<TestItem, 'test'>> = {
        cacheType: 'sessionStorage',
        webStorageConfig: {
          keyPrefix: 'session:',
          compress: false
        },
        ttl: 1800000
      };

      const factory = createInstanceFactory(mockApi, options);
      const instance = factory(testCoordinate, { registry: mockRegistry });

      expect(instance.options?.cacheType).toBe('sessionStorage');
      expect(instance.options?.webStorageConfig?.keyPrefix).toBe('session:');
      expect(instance.options?.webStorageConfig?.compress).toBe(false);
      expect(instance.options?.ttl).toBe(1800000);
    });

    it('should create instance with IndexedDB configuration', () => {
      const options: Partial<Options<TestItem, 'test'>> = {
        cacheType: 'indexedDB',
        indexedDBConfig: {
          dbName: 'TestAppDB',
          version: 2,
          storeName: 'testStore'
        },
        maxRetries: 7,
        retryDelay: 2500
      };

      const factory = createInstanceFactory(mockApi, options);
      const instance = factory(testCoordinate, { registry: mockRegistry });

      expect(instance.options?.cacheType).toBe('indexedDB');
      expect(instance.options?.indexedDBConfig?.dbName).toBe('TestAppDB');
      expect(instance.options?.indexedDBConfig?.version).toBe(2);
      expect(instance.options?.indexedDBConfig?.storeName).toBe('testStore');
      expect(instance.options?.maxRetries).toBe(7);
      expect(instance.options?.retryDelay).toBe(2500);
    });
  });

  describe('options validation in factory creation', () => {
    it('should throw error for invalid custom cache configuration', () => {
      const options: Partial<Options<TestItem, 'test'>> = {
        cacheType: 'custom'
        // Missing customCacheMapFactory
      };

      expect(() => createInstanceFactory(mockApi, options))
        .toThrow('customCacheMapFactory is required when cacheType is "custom"');
    });

    it('should throw error for negative maxRetries', () => {
      const options: Partial<Options<TestItem, 'test'>> = {
        maxRetries: -1
      };

      expect(() => createInstanceFactory(mockApi, options))
        .toThrow('maxRetries must be non-negative');
    });

    it('should throw error for negative retryDelay', () => {
      const options: Partial<Options<TestItem, 'test'>> = {
        retryDelay: -500
      };

      expect(() => createInstanceFactory(mockApi, options))
        .toThrow('retryDelay must be non-negative');
    });

    it('should throw error for invalid ttl', () => {
      const options: Partial<Options<TestItem, 'test'>> = {
        ttl: 0
      };

      expect(() => createInstanceFactory(mockApi, options))
        .toThrow('ttl must be positive');
    });

    it('should throw error for invalid memory config', () => {
      const options: Partial<Options<TestItem, 'test'>> = {
        memoryConfig: {
          maxItems: -10
        }
      };

      expect(() => createInstanceFactory(mockApi, options))
        .toThrow('memoryConfig.maxItems must be positive');
    });
  });

  describe('environment-based validation', () => {
    const originalWindow = global.window;
    const originalIndexedDB = global.indexedDB;

    afterEach(() => {
      global.window = originalWindow;
      global.indexedDB = originalIndexedDB;
    });

    it('should throw error for localStorage in non-browser environment', () => {
      delete (global as any).window;

      const options: Partial<Options<TestItem, 'test'>> = {
        cacheType: 'localStorage'
      };

      expect(() => createInstanceFactory(mockApi, options))
        .toThrow('localStorage is not available in non-browser environments');
    });

    it('should throw error for sessionStorage in non-browser environment', () => {
      delete (global as any).window;

      const options: Partial<Options<TestItem, 'test'>> = {
        cacheType: 'sessionStorage'
      };

      expect(() => createInstanceFactory(mockApi, options))
        .toThrow('sessionStorage is not available in non-browser environments');
    });

    it('should throw error for IndexedDB when not available', () => {
      global.window = {} as any;
      delete (global as any).indexedDB;

      const options: Partial<Options<TestItem, 'test'>> = {
        cacheType: 'indexedDB'
      };

      expect(() => createInstanceFactory(mockApi, options))
        .toThrow('indexedDB is not available in this environment');
    });
  });

  describe('factory function behavior', () => {
    it('should create multiple instances with same configuration', () => {
      const options: Partial<Options<TestItem, 'test'>> = {
        cacheType: 'memory',
        enableDebugLogging: true
      };

      const factory = createInstanceFactory(mockApi, options);

      const instance1 = factory(testCoordinate, { registry: mockRegistry });
      const instance2 = factory(testCoordinate, { registry: mockRegistry });

      // Instances should be different objects
      expect(instance1).not.toBe(instance2);

      // But should have same configuration
      expect(instance1.options?.cacheType).toBe(instance2.options?.cacheType);
      expect(instance1.options?.enableDebugLogging).toBe(instance2.options?.enableDebugLogging);

      // Should have separate cache maps
      expect(instance1.cacheMap).not.toBe(instance2.cacheMap);
      expect(instance1.cacheMap).toBeInstanceOf(MemoryCacheMap);
      expect(instance2.cacheMap).toBeInstanceOf(MemoryCacheMap);
    });

    it('should pass through coordinate and registry correctly', () => {
      const customCoordinate = { kta: ['user', 'organization'] as const };
      const customRegistry = { register: vi.fn(), get: vi.fn() };

      const factory = createInstanceFactory(mockApi);
      const instance = factory(customCoordinate, { registry: customRegistry });

      expect(instance.coordinate).toBe(customCoordinate);
      expect(instance.registry).toBe(customRegistry);
      expect(instance.api).toBe(mockApi);
    });

    it('should create operations with correct parameters', () => {
      const factory = createInstanceFactory(mockApi);
      const instance = factory(testCoordinate, { registry: mockRegistry });

      expect(instance.operations).toBeDefined();
      expect(instance.operations.get).toBeTypeOf('function');
      expect(instance.operations.set).toBeTypeOf('function');
      expect(instance.operations.all).toBeTypeOf('function');
      expect(instance.operations.create).toBeTypeOf('function');
      expect(instance.operations.update).toBeTypeOf('function');
      expect(instance.operations.remove).toBeTypeOf('function');
    });
  });

  describe('options merging and defaults', () => {
    it('should merge partial options with defaults correctly', () => {
      const partialOptions: Partial<Options<TestItem, 'test'>> = {
        cacheType: 'memory',
        enableDebugLogging: true,
        memoryConfig: {
          maxItems: 500
        }
      };

      const factory = createInstanceFactory(mockApi, partialOptions);
      const instance = factory(testCoordinate, { registry: mockRegistry });

      // Should have specified values
      expect(instance.options?.cacheType).toBe('memory');
      expect(instance.options?.enableDebugLogging).toBe(true);
      expect(instance.options?.memoryConfig?.maxItems).toBe(500);

      // Should have default values for unspecified options
      expect(instance.options?.autoSync).toBe(true);
      expect(instance.options?.maxRetries).toBe(3);
      expect(instance.options?.retryDelay).toBe(1000);
    });

    it('should handle nested config merging correctly', () => {
      const options: Partial<Options<TestItem, 'test'>> = {
        indexedDBConfig: {
          dbName: 'CustomDB'
          // version and storeName should use defaults
        },
        memoryConfig: {
          ttl: 120000
          // maxItems should be undefined (no default)
        }
      };

      const factory = createInstanceFactory(mockApi, options);
      const instance = factory(testCoordinate, { registry: mockRegistry });

      expect(instance.options?.indexedDBConfig?.dbName).toBe('CustomDB');
      expect(instance.options?.indexedDBConfig?.version).toBe(1); // default
      expect(instance.options?.indexedDBConfig?.storeName).toBe('cache'); // default
      expect(instance.options?.memoryConfig?.ttl).toBe(120000);
      expect(instance.options?.memoryConfig?.maxItems).toBeUndefined();
    });
  });
});
