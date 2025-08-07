// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInstanceFactory } from '../../src/InstanceFactory';
import { createCache } from '../../src/Cache';
import { createInstance } from '../../src/Instance';
import { Options } from '../../src/Options';
import { MemoryCacheMap } from '../../src/memory/MemoryCacheMap';
import { Item } from '@fjell/core';
import { ClientApi } from '@fjell/client-api';

// Mock the dependencies
vi.mock('@fjell/client-api');
vi.mock('../../src/logger', () => ({
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

describe('Full Options Integration Tests', () => {
  let mockApi: ClientApi<TestItem, 'test'>;
  let mockRegistry: any;
  const testCoordinate = { kta: ['test'] as const, scopes: [] };

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

  describe('End-to-end option flow', () => {
    it('should maintain options consistency from factory to instance', () => {
      const options: Partial<Options<TestItem, 'test'>> = {
        cacheType: 'memory',
        memoryConfig: {
          maxItems: 1000,
          ttl: 300000
        },
        enableDebugLogging: true,
        autoSync: false,
        maxRetries: 5,
        retryDelay: 2000
      };

      // Test InstanceFactory
      const factory = createInstanceFactory(mockApi, options);
      const factoryInstance = factory(testCoordinate, { registry: mockRegistry });

      // Test createCache directly
      const cacheInstance = createCache(mockApi, testCoordinate, mockRegistry, options);

      // Test createInstance directly
      const instanceInstance = createInstance(mockRegistry, testCoordinate, mockApi, options);

      // All should have the same options
      const expectedOptions = {
        cacheType: 'memory',
        memoryConfig: { maxItems: 1000, ttl: 300000 },
        enableDebugLogging: true,
        autoSync: false,
        maxRetries: 5,
        retryDelay: 2000,
        indexedDBConfig: { dbName: 'fjell-cache', version: 1, storeName: 'cache' },
        webStorageConfig: { keyPrefix: 'fjell-cache:', compress: false }
      };

      expect(factoryInstance.options).toMatchObject(expectedOptions);
      expect(cacheInstance.options).toMatchObject(expectedOptions);
      expect(instanceInstance.options).toMatchObject(expectedOptions);
    });

    it('should create different cache map types based on options', () => {
      const memoryOptions: Partial<Options<TestItem, 'test'>> = {
        cacheType: 'memory'
      };

      const customCacheMap = new MemoryCacheMap(['test']);
      const customOptions: Partial<Options<TestItem, 'test'>> = {
        cacheType: 'custom',
        customCacheMapFactory: () => customCacheMap
      };

      const memoryFactory = createInstanceFactory(mockApi, memoryOptions);
      const customFactory = createInstanceFactory(mockApi, customOptions);

      const memoryInstance = memoryFactory(testCoordinate, { registry: mockRegistry });
      const customInstance = customFactory(testCoordinate, { registry: mockRegistry });

      expect(memoryInstance.cacheMap).toBeInstanceOf(MemoryCacheMap);
      expect(customInstance.cacheMap).toBe(customCacheMap);
      expect(memoryInstance.cacheMap).not.toBe(customInstance.cacheMap);
    });
  });

  describe('Configuration validation across all entry points', () => {
    it('should validate options consistently in all creation methods', () => {
      const invalidOptions: Partial<Options<TestItem, 'test'>> = {
        cacheType: 'custom'
        // Missing customCacheMapFactory
      };

      expect(() => createInstanceFactory(mockApi, invalidOptions))
        .toThrow('customCacheMapFactory is required when cacheType is "custom"');
    });

    it('should handle environment validation consistently', () => {
      const originalWindow = global.window;
      delete (global as any).window;

      const browserOptions: Partial<Options<TestItem, 'test'>> = {
        cacheType: 'localStorage'
      };

      expect(() => createInstanceFactory(mockApi, browserOptions))
        .toThrow('localStorage is not available in non-browser environments');

      global.window = originalWindow;
    });
  });

  describe('Complex configuration scenarios', () => {
    it('should handle multi-level nested configuration', () => {
      const complexOptions: Partial<Options<TestItem, 'test'>> = {
        cacheType: 'indexedDB',
        indexedDBConfig: {
          dbName: 'ComplexTestDB',
          version: 3,
          storeName: 'complexStore'
        },
        webStorageConfig: {
          keyPrefix: 'complex:app:',
          compress: true
        },
        memoryConfig: {
          maxItems: 2000,
          ttl: 600000
        },
        enableDebugLogging: true,
        autoSync: false,
        ttl: 1800000,
        maxRetries: 7,
        retryDelay: 3000
      };

      const factory = createInstanceFactory(mockApi, complexOptions);
      const instance = factory(testCoordinate, { registry: mockRegistry });

      expect(instance.options?.cacheType).toBe('indexedDB');
      expect(instance.options?.indexedDBConfig?.dbName).toBe('ComplexTestDB');
      expect(instance.options?.indexedDBConfig?.version).toBe(3);
      expect(instance.options?.indexedDBConfig?.storeName).toBe('complexStore');
      expect(instance.options?.webStorageConfig?.keyPrefix).toBe('complex:app:');
      expect(instance.options?.webStorageConfig?.compress).toBe(true);
      expect(instance.options?.memoryConfig?.maxItems).toBe(2000);
      expect(instance.options?.memoryConfig?.ttl).toBe(600000);
      expect(instance.options?.enableDebugLogging).toBe(true);
      expect(instance.options?.autoSync).toBe(false);
      expect(instance.options?.ttl).toBe(1800000);
      expect(instance.options?.maxRetries).toBe(7);
      expect(instance.options?.retryDelay).toBe(3000);
    });

    it('should maintain options immutability between instances', () => {
      const sharedOptions: Partial<Options<TestItem, 'test'>> = {
        cacheType: 'memory',
        memoryConfig: {
          maxItems: 500
        },
        enableDebugLogging: true
      };

      const factory = createInstanceFactory(mockApi, sharedOptions);
      const instance1 = factory(testCoordinate, { registry: mockRegistry });
      const instance2 = factory(testCoordinate, { registry: mockRegistry });

      // Modifying one instance's options should not affect the other
      if (instance1.options && instance1.options.memoryConfig) {
        instance1.options.memoryConfig.maxItems = 1000;
      }

      expect(instance2.options?.memoryConfig?.maxItems).toBe(500);
      expect(sharedOptions.memoryConfig?.maxItems).toBe(500);
    });
  });

  describe('Performance and memory considerations', () => {
    it('should create separate cache maps for each instance', () => {
      const options: Partial<Options<TestItem, 'test'>> = {
        cacheType: 'memory',
        memoryConfig: { maxItems: 100 }
      };

      const factory = createInstanceFactory(mockApi, options);
      const instances = Array.from({ length: 5 }, () =>
        factory(testCoordinate, { registry: mockRegistry })
      );

      // All cache maps should be different instances
      for (let i = 0; i < instances.length; i++) {
        for (let j = i + 1; j < instances.length; j++) {
          expect(instances[i].cacheMap).not.toBe(instances[j].cacheMap);
        }
      }

      // But all should be MemoryCacheMap instances
      instances.forEach(instance => {
        expect(instance.cacheMap).toBeInstanceOf(MemoryCacheMap);
      });
    });

    it('should reuse factory function for multiple instance creation', () => {
      const options: Partial<Options<TestItem, 'test'>> = {
        cacheType: 'memory',
        enableDebugLogging: true
      };

      const factory = createInstanceFactory(mockApi, options);

      // Factory should be reusable
      const instance1 = factory(testCoordinate, { registry: mockRegistry });
      const instance2 = factory(testCoordinate, { registry: mockRegistry });
      const instance3 = factory(testCoordinate, { registry: mockRegistry });

      expect(instance1.options?.enableDebugLogging).toBe(true);
      expect(instance2.options?.enableDebugLogging).toBe(true);
      expect(instance3.options?.enableDebugLogging).toBe(true);

      // All should have same configuration but be separate instances
      expect(instance1).not.toBe(instance2);
      expect(instance2).not.toBe(instance3);
    });
  });

  describe('Custom cache map factory integration', () => {
    it('should call custom factory with correct parameters', () => {
      const customFactory = vi.fn((kta) => new MemoryCacheMap(kta));

      const options: Partial<Options<TestItem, 'test'>> = {
        cacheType: 'custom',
        customCacheMapFactory: customFactory
      };

      const factory = createInstanceFactory(mockApi, options);
      const instance = factory(testCoordinate, { registry: mockRegistry });

      expect(customFactory).toHaveBeenCalledTimes(1);
      expect(customFactory).toHaveBeenCalledWith(['test']);
      expect(instance.cacheMap).toBeInstanceOf(MemoryCacheMap);
    });

    it('should support complex custom cache map scenarios', () => {
      const customCacheMaps = new Map();
      const customFactory = vi.fn((kta) => {
        const key = kta.join(':');
        if (!customCacheMaps.has(key)) {
          customCacheMaps.set(key, new MemoryCacheMap(kta));
        }
        return customCacheMaps.get(key);
      });

      const options: Partial<Options<TestItem, 'test'>> = {
        cacheType: 'custom',
        customCacheMapFactory: customFactory
      };

      const factory = createInstanceFactory(mockApi, options);

      // Create multiple instances with same coordinate
      const instance1 = factory(testCoordinate, { registry: mockRegistry });
      const instance2 = factory(testCoordinate, { registry: mockRegistry });

      // Create instance with different coordinate
      const differentCoordinate = { kta: ['user'] as const };
      const instance3 = factory(differentCoordinate as any, { registry: mockRegistry });

      expect(customFactory).toHaveBeenCalledTimes(3);
      expect(instance1.cacheMap).toBe(instance2.cacheMap); // Same coordinate, same cache
      expect(instance1.cacheMap).not.toBe(instance3.cacheMap); // Different coordinate, different cache
    });
  });
});
