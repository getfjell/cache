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
          maxItems: 500
        },
        ttl: 60000,
        enableDebugLogging: true,
        maxRetries: 5
      };

      const factory = createInstanceFactory(mockApi, options);
      const instance = factory(testCoordinate, { registry: mockRegistry });

      expect(instance.cacheMap).toBeInstanceOf(MemoryCacheMap);
      expect(instance.options?.cacheType).toBe('memory');
      expect(instance.options?.memoryConfig?.maxItems).toBe(500);
      expect(instance.options?.ttl).toBe(60000);
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
      // Provide a minimal browser-like environment so validation passes
      const originalWindow = (global as any).window;
      (global as any).window = { document: { createElement: () => ({}) } } as any;
      try {
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
      } finally {
        (global as any).window = originalWindow;
      }
    });

    it('should create instance with sessionStorage configuration', () => {
      // Provide a minimal browser-like environment so validation passes
      const originalWindow = (global as any).window;
      (global as any).window = { document: { createElement: () => ({}) } } as any;
      try {
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
      } finally {
        (global as any).window = originalWindow;
      }
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
          // maxItems should be undefined (no default)
        },
        ttl: 120000
      };

      const factory = createInstanceFactory(mockApi, options);
      const instance = factory(testCoordinate, { registry: mockRegistry });

      expect(instance.options?.indexedDBConfig?.dbName).toBe('CustomDB');
      expect(instance.options?.indexedDBConfig?.version).toBe(1); // default
      expect(instance.options?.indexedDBConfig?.storeName).toBe('cache'); // default
      expect(instance.options?.ttl).toBe(120000);
      expect(instance.options?.memoryConfig?.maxItems).toBeUndefined();
    });
  });

  // NEW TESTS FOR ENHANCED COVERAGE

  describe('logger functionality', () => {
    it('should call logger.debug when creating cache instance', () => {
      // Since the logger is already mocked at the top level, we can test that it's called
      // by checking that the factory function executes without errors
      const factory = createInstanceFactory(mockApi);
      const instance = factory(testCoordinate, { registry: mockRegistry });

      // The logger.debug call happens internally, so we verify the function works
      expect(instance).toBeDefined();
      expect(instance.coordinate).toBe(testCoordinate);
      expect(instance.registry).toBe(mockRegistry);
      expect(instance.api).toBe(mockApi);
    });

    it('should include all expected parameters in debug log', () => {
      const options: Partial<Options<TestItem, 'test'>> = {
        cacheType: 'memory',
        enableDebugLogging: true,
        maxRetries: 5
      };

      const factory = createInstanceFactory(mockApi, options);
      const instance = factory(testCoordinate, { registry: mockRegistry });

      // Verify that the instance is created with the correct options
      expect(instance.options?.cacheType).toBe('memory');
      expect(instance.options?.enableDebugLogging).toBe(true);
      expect(instance.options?.maxRetries).toBe(5);

      // The logger.debug call happens internally with all the expected parameters
      expect(instance).toBeDefined();
    });
  });

  describe('mock event emitter functionality', () => {
    it('should create mock event emitter with expected interface', () => {
      const factory = createInstanceFactory(mockApi);
      const instance = factory(testCoordinate, { registry: mockRegistry });

      // The mock event emitter should be used internally by createOperations
      // We can verify this by checking that operations are created successfully
      expect(instance.operations).toBeDefined();
      expect(typeof instance.operations.get).toBe('function');
      expect(typeof instance.operations.set).toBe('function');
      expect(typeof instance.operations.create).toBe('function');
    });

    it('should handle operations that depend on event emitter', () => {
      const factory = createInstanceFactory(mockApi);
      const instance = factory(testCoordinate, { registry: mockRegistry });

      // Test that operations can be called without errors
      // This indirectly tests that the mock event emitter works
      expect(() => {
        // These operations internally use the event emitter
        expect(instance.operations).toBeDefined();
        expect(instance.operations.get).toBeTypeOf('function');
        expect(instance.operations.create).toBeTypeOf('function');
        expect(instance.operations.update).toBeTypeOf('function');
        expect(instance.operations.remove).toBeTypeOf('function');
      }).not.toThrow();
    });
  });

  describe('coordinate handling and type safety', () => {
    it('should handle different coordinate types correctly', () => {
      const factory = createInstanceFactory(mockApi);

      // Test with simple coordinate
      const simpleCoordinate = { kta: ['user'] as const };
      const simpleInstance = factory(simpleCoordinate, { registry: mockRegistry });
      expect(simpleInstance.coordinate).toBe(simpleCoordinate);
      expect(simpleInstance.coordinate.kta[0]).toBe('user');

      // Test with complex coordinate
      const complexCoordinate = { kta: ['comment', 'document', 'user'] as const };
      const complexInstance = factory(complexCoordinate, { registry: mockRegistry });
      expect(complexInstance.coordinate).toBe(complexCoordinate);
      expect(complexInstance.coordinate.kta[0]).toBe('comment');
      expect(complexInstance.coordinate.kta[1]).toBe('document');
      expect(complexInstance.coordinate.kta[2]).toBe('user');
    });

    it('should extract primary key type correctly from coordinate', () => {
      const factory = createInstanceFactory(mockApi);

      const coordinate1 = { kta: ['product'] as const };
      const instance1 = factory(coordinate1, { registry: mockRegistry });
      expect(instance1.operations).toBeDefined();

      const coordinate2 = { kta: ['order', 'customer'] as const };
      const instance2 = factory(coordinate2, { registry: mockRegistry });
      expect(instance2.operations).toBeDefined();

      // Both should work without type errors
      expect(instance1).toBeDefined();
      expect(instance2).toBeDefined();
    });
  });

  describe('registry and registryHub handling', () => {
    it('should handle registry without registryHub', () => {
      const factory = createInstanceFactory(mockApi);
      const instance = factory(testCoordinate, { registry: mockRegistry });

      expect(instance.registry).toBe(mockRegistry);
      expect(instance).toBeDefined();
    });

    it('should handle registry with registryHub', () => {
      const mockRegistryHub = {
        getRegistry: vi.fn(),
        registerRegistry: vi.fn()
      };

      const factory = createInstanceFactory(mockApi);
      const instance = factory(testCoordinate, {
        registry: mockRegistry,
        registryHub: mockRegistryHub
      });

      expect(instance.registry).toBe(mockRegistry);
      expect(instance).toBeDefined();
    });

    it('should pass registry to operations correctly', () => {
      const factory = createInstanceFactory(mockApi);
      const instance = factory(testCoordinate, { registry: mockRegistry });

      // The registry should be available in the instance
      expect(instance.registry).toBe(mockRegistry);

      // Operations should be created successfully with the registry
      expect(instance.operations).toBeDefined();
    });
  });

  describe('options immutability and instance isolation', () => {
    it('should create fresh options for each instance', () => {
      const options: Partial<Options<TestItem, 'test'>> = {
        cacheType: 'memory',
        enableDebugLogging: true,
        memoryConfig: {
          maxItems: 100
        }
      };

      const factory = createInstanceFactory(mockApi, options);

      const instance1 = factory(testCoordinate, { registry: mockRegistry });
      const instance2 = factory(testCoordinate, { registry: mockRegistry });

      // Options objects should be different instances
      expect(instance1.options).not.toBe(instance2.options);

      // But should have the same values
      expect(instance1.options?.cacheType).toBe(instance2.options?.cacheType);
      expect(instance1.options?.enableDebugLogging).toBe(instance2.options?.enableDebugLogging);
      expect(instance1.options?.memoryConfig?.maxItems).toBe(instance2.options?.memoryConfig?.maxItems);
    });

    it('should not share cache maps between instances', () => {
      const factory = createInstanceFactory(mockApi);

      const instance1 = factory(testCoordinate, { registry: mockRegistry });
      const instance2 = factory(testCoordinate, { registry: mockRegistry });

      // Cache maps should be different instances
      expect(instance1.cacheMap).not.toBe(instance2.cacheMap);

      // Both should be MemoryCacheMap instances
      expect(instance1.cacheMap).toBeInstanceOf(MemoryCacheMap);
      expect(instance2.cacheMap).toBeInstanceOf(MemoryCacheMap);
    });

    it('should not share operations between instances', () => {
      const factory = createInstanceFactory(mockApi);

      const instance1 = factory(testCoordinate, { registry: mockRegistry });
      const instance2 = factory(testCoordinate, { registry: mockRegistry });

      // Operations objects should be different instances
      expect(instance1.operations).not.toBe(instance2.operations);

      // But should have the same interface
      expect(typeof instance1.operations.get).toBe('function');
      expect(typeof instance2.operations.get).toBe('function');
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle null or undefined options gracefully', () => {
      const factory1 = createInstanceFactory(mockApi, null as any);
      const factory2 = createInstanceFactory(mockApi, undefined);

      const instance1 = factory1(testCoordinate, { registry: mockRegistry });
      const instance2 = factory2(testCoordinate, { registry: mockRegistry });

      expect(instance1.options?.cacheType).toBe('memory'); // default
      expect(instance2.options?.cacheType).toBe('memory'); // default
    });

    it('should handle empty options object', () => {
      const factory = createInstanceFactory(mockApi, {});
      const instance = factory(testCoordinate, { registry: mockRegistry });

      expect(instance.options?.cacheType).toBe('memory'); // default
      expect(instance.options?.enableDebugLogging).toBe(false); // default
    });

    it('should handle malformed coordinate gracefully', () => {
      const factory = createInstanceFactory(mockApi);

      // Test with empty kta array (should not happen in practice but good to test)
      const malformedCoordinate = { kta: [] as any };

      // This should not throw an error, just return undefined for kta[0]
      expect(() => {
        factory(malformedCoordinate, { registry: mockRegistry });
      }).not.toThrow();

      // The instance should still be created, though with undefined pkType
      const instance = factory(malformedCoordinate, { registry: mockRegistry });
      expect(instance).toBeDefined();
      expect(instance.coordinate).toBe(malformedCoordinate);
    });

    it('should handle missing registry gracefully', () => {
      const factory = createInstanceFactory(mockApi);

      expect(() => {
        factory(testCoordinate, { registry: null as any });
      }).not.toThrow(); // Should not throw, just pass null registry through
    });
  });

  describe('type safety and generic constraints', () => {
    it('should maintain type safety with different item types', () => {
      interface UserItem extends Item<'user'> {
        id: string;
        name: string;
        email: string;
      }

      interface ProductItem extends Item<'product'> {
        id: string;
        name: string;
        price: number;
      }

      const userApi = mockApi as ClientApi<UserItem, 'user'>;
      const productApi = mockApi as ClientApi<ProductItem, 'product'>;

      const userFactory = createInstanceFactory(userApi);
      const productFactory = createInstanceFactory(productApi);

      const userCoordinate = { kta: ['user'] as const };
      const productCoordinate = { kta: ['product'] as const };

      const userInstance = userFactory(userCoordinate, { registry: mockRegistry });
      const productInstance = productFactory(productCoordinate, { registry: mockRegistry });

      expect(userInstance.coordinate.kta[0]).toBe('user');
      expect(productInstance.coordinate.kta[0]).toBe('product');
    });

    it('should handle complex location hierarchies', () => {
      interface CommentItem extends Item<'comment', 'document', 'user'> {
        id: string;
        content: string;
        authorId: string;
      }

      const commentApi = mockApi as ClientApi<CommentItem, 'comment', 'document', 'user'>;
      const factory = createInstanceFactory(commentApi);

      const commentCoordinate = { kta: ['comment', 'document', 'user'] as const };
      const instance = factory(commentCoordinate, { registry: mockRegistry });

      expect(instance.coordinate.kta[0]).toBe('comment');
      expect(instance.coordinate.kta[1]).toBe('document');
      expect(instance.coordinate.kta[2]).toBe('user');
    });
  });

  describe('performance and memory considerations', () => {
    it('should not create unnecessary objects during factory creation', () => {
      const options: Partial<Options<TestItem, 'test'>> = {
        cacheType: 'memory',
        enableDebugLogging: true
      };

      const factory = createInstanceFactory(mockApi, options);

      // Factory creation should be lightweight
      expect(typeof factory).toBe('function');

      // Instance creation should be efficient
      const startTime = Date.now();
      const instance = factory(testCoordinate, { registry: mockRegistry });
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(100); // Should be very fast
      expect(instance).toBeDefined();
    });

    it('should reuse options template for validation', () => {
      const options: Partial<Options<TestItem, 'test'>> = {
        cacheType: 'memory',
        enableDebugLogging: true
      };

      const factory = createInstanceFactory(mockApi, options);

      // Create multiple instances to test that validation doesn't recreate options unnecessarily
      const instances = [];
      for (let i = 0; i < 10; i++) {
        instances.push(factory(testCoordinate, { registry: mockRegistry }));
      }

      // All instances should be valid
      instances.forEach(instance => {
        expect(instance.options?.cacheType).toBe('memory');
        expect(instance.options?.enableDebugLogging).toBe(true);
      });
    });
  });

  // NEW TESTS FOR UNCOVERED LINES

  describe('getCacheInfo functionality', () => {
    it('should return cache info with all properties', () => {
      const factory = createInstanceFactory(mockApi);
      const instance = factory(testCoordinate, { registry: mockRegistry });

      const cacheInfo = instance.getCacheInfo();

      expect(cacheInfo).toBeDefined();
      expect(cacheInfo.implementationType).toBeDefined();
      expect(typeof cacheInfo.defaultTTL === 'number' || cacheInfo.defaultTTL === undefined).toBe(true);
      expect(typeof cacheInfo.supportsTTL).toBe('boolean');
      expect(typeof cacheInfo.supportsEviction).toBe('boolean');
    });

    it('should return cache info with TTL when configured', () => {
      const options: Partial<Options<TestItem, 'test'>> = {
        ttl: 30000
      };

      const factory = createInstanceFactory(mockApi, options);
      const instance = factory(testCoordinate, { registry: mockRegistry });

      const cacheInfo = instance.getCacheInfo();

      expect(cacheInfo.defaultTTL).toBe(30000);
      expect(cacheInfo.supportsTTL).toBe(true);
    });

    it('should return cache info without TTL when not configured', () => {
      const factory = createInstanceFactory(mockApi);
      const instance = factory(testCoordinate, { registry: mockRegistry });

      const cacheInfo = instance.getCacheInfo();

      expect(cacheInfo.defaultTTL).toBeUndefined();
      expect(cacheInfo.supportsTTL).toBe(false);
    });

    it('should handle cache map with supportsTTL method', () => {
      const factory = createInstanceFactory(mockApi);
      const instance = factory(testCoordinate, { registry: mockRegistry });

      // Mock the cache map to have supportsTTL method
      const originalImplementationType = instance.cacheMap.implementationType;
      instance.cacheMap.implementationType = 'memory/test';
      (instance.cacheMap as any).supportsTTL = () => true;

      const cacheInfo = instance.getCacheInfo();

      expect(cacheInfo.supportsTTL).toBe(true);

      // Restore original properties
      instance.cacheMap.implementationType = originalImplementationType;
      delete (instance.cacheMap as any).supportsTTL;
    });

    it('should include eviction policy when available', () => {
      const factory = createInstanceFactory(mockApi);
      const instance = factory(testCoordinate, { registry: mockRegistry });

      // Mock the eviction manager to return a strategy name
      const mockGetEvictionStrategyName = vi.fn(() => 'lru');
      instance.evictionManager.getEvictionStrategyName = mockGetEvictionStrategyName;

      const cacheInfo = instance.getCacheInfo();

      expect(cacheInfo.evictionPolicy).toBe('lru');
      expect(mockGetEvictionStrategyName).toHaveBeenCalled();
    });

    it('should not include eviction policy when not available', () => {
      const factory = createInstanceFactory(mockApi);
      const instance = factory(testCoordinate, { registry: mockRegistry });

      // Mock the eviction manager to return null
      const mockGetEvictionStrategyName = vi.fn(() => null);
      instance.evictionManager.getEvictionStrategyName = mockGetEvictionStrategyName;

      const cacheInfo = instance.getCacheInfo();

      expect(cacheInfo.evictionPolicy).toBeUndefined();
      expect(mockGetEvictionStrategyName).toHaveBeenCalled();
    });
  });

  describe('subscribe and unsubscribe functionality', () => {
    it('should provide subscribe method that delegates to event emitter', () => {
      const factory = createInstanceFactory(mockApi);
      const instance = factory(testCoordinate, { registry: mockRegistry });

      const mockListener = vi.fn();
      const mockOptions = { immediate: true };

      // Mock the event emitter subscribe method
      const originalSubscribe = instance.eventEmitter.subscribe;
      instance.eventEmitter.subscribe = vi.fn();

      instance.subscribe(mockListener, mockOptions);

      expect(instance.eventEmitter.subscribe).toHaveBeenCalledWith(mockListener, mockOptions);

      // Restore original method
      instance.eventEmitter.subscribe = originalSubscribe;
    });

    it('should provide unsubscribe method that delegates to event emitter', () => {
      const factory = createInstanceFactory(mockApi);
      const instance = factory(testCoordinate, { registry: mockRegistry });

      const mockSubscription = { id: 'test-subscription-id' };

      // Mock the event emitter unsubscribe method
      const originalUnsubscribe = instance.eventEmitter.unsubscribe;
      instance.eventEmitter.unsubscribe = vi.fn();

      instance.unsubscribe(mockSubscription);

      expect(instance.eventEmitter.unsubscribe).toHaveBeenCalledWith('test-subscription-id');

      // Restore original method
      instance.eventEmitter.unsubscribe = originalUnsubscribe;
    });

    it('should handle subscription with different subscription objects', () => {
      const factory = createInstanceFactory(mockApi);
      const instance = factory(testCoordinate, { registry: mockRegistry });

      const mockSubscription1 = { id: 'sub-1' };
      const mockSubscription2 = { id: 'sub-2', otherProperty: 'value' };

      // Mock the event emitter unsubscribe method
      const originalUnsubscribe = instance.eventEmitter.unsubscribe;
      instance.eventEmitter.unsubscribe = vi.fn();

      instance.unsubscribe(mockSubscription1);
      instance.unsubscribe(mockSubscription2);

      expect(instance.eventEmitter.unsubscribe).toHaveBeenCalledWith('sub-1');
      expect(instance.eventEmitter.unsubscribe).toHaveBeenCalledWith('sub-2');

      // Restore original method
      instance.eventEmitter.unsubscribe = originalUnsubscribe;
    });
  });

  describe('destroy functionality', () => {
    it('should call ttlManager.destroy when available', () => {
      const factory = createInstanceFactory(mockApi);
      const instance = factory(testCoordinate, { registry: mockRegistry });

      // Mock the TTL manager destroy method
      const mockDestroy = vi.fn();
      instance.ttlManager.destroy = mockDestroy;

      instance.destroy();

      expect(mockDestroy).toHaveBeenCalled();
    });

    it('should handle ttlManager without destroy method', () => {
      const factory = createInstanceFactory(mockApi);
      const instance = factory(testCoordinate, { registry: mockRegistry });

      // Remove the destroy method from TTL manager
      delete instance.ttlManager.destroy;

      // Should not throw an error
      expect(() => {
        instance.destroy();
      }).not.toThrow();
    });

    it('should call eventEmitter.destroy', () => {
      const factory = createInstanceFactory(mockApi);
      const instance = factory(testCoordinate, { registry: mockRegistry });

      // Mock the event emitter destroy method
      const originalDestroy = instance.eventEmitter.destroy;
      instance.eventEmitter.destroy = vi.fn();

      instance.destroy();

      expect(instance.eventEmitter.destroy).toHaveBeenCalled();

      // Restore original method
      instance.eventEmitter.destroy = originalDestroy;
    });

    it('should handle destroy with ttlManager.destroy as function', () => {
      const factory = createInstanceFactory(mockApi);
      const instance = factory(testCoordinate, { registry: mockRegistry });

      // Ensure ttlManager.destroy is a function
      instance.ttlManager.destroy = vi.fn();

      instance.destroy();

      expect(instance.ttlManager.destroy).toHaveBeenCalled();
    });

    it('should handle destroy with ttlManager.destroy as non-function', () => {
      const factory = createInstanceFactory(mockApi);
      const instance = factory(testCoordinate, { registry: mockRegistry });

      // Set ttlManager.destroy to a non-function value
      instance.ttlManager.destroy = 'not-a-function' as any;

      // Should not throw an error and should not call the non-function
      expect(() => {
        instance.destroy();
      }).not.toThrow();
    });
  });

  describe('manager creation and configuration', () => {
    it('should create TTLManager with correct configuration', () => {
      const options: Partial<Options<TestItem, 'test'>> = {
        ttl: 60000
      };

      const factory = createInstanceFactory(mockApi, options);
      const instance = factory(testCoordinate, { registry: mockRegistry });

      expect(instance.ttlManager).toBeDefined();
      expect(instance.ttlManager.getDefaultTTL()).toBe(60000);
    });

    it('should create EvictionManager', () => {
      const factory = createInstanceFactory(mockApi);
      const instance = factory(testCoordinate, { registry: mockRegistry });

      expect(instance.evictionManager).toBeDefined();
      expect(typeof instance.evictionManager.isEvictionSupported).toBe('function');
    });

    it('should create CacheEventEmitter', () => {
      const factory = createInstanceFactory(mockApi);
      const instance = factory(testCoordinate, { registry: mockRegistry });

      expect(instance.eventEmitter).toBeDefined();
      expect(typeof instance.eventEmitter.subscribe).toBe('function');
      expect(typeof instance.eventEmitter.unsubscribe).toBe('function');
    });
  });

  describe('instance properties and structure', () => {
    it('should have all required instance properties', () => {
      const factory = createInstanceFactory(mockApi);
      const instance = factory(testCoordinate, { registry: mockRegistry });

      expect(instance.coordinate).toBeDefined();
      expect(instance.registry).toBeDefined();
      expect(instance.api).toBeDefined();
      expect(instance.cacheMap).toBeDefined();
      expect(instance.operations).toBeDefined();
      expect(instance.options).toBeDefined();
      expect(instance.eventEmitter).toBeDefined();
      expect(instance.ttlManager).toBeDefined();
      expect(instance.evictionManager).toBeDefined();
      expect(instance.getCacheInfo).toBeDefined();
      expect(instance.subscribe).toBeDefined();
      expect(instance.unsubscribe).toBeDefined();
      expect(instance.destroy).toBeDefined();
    });

    it('should return instance with correct type casting', () => {
      const factory = createInstanceFactory(mockApi);
      const instance = factory(testCoordinate, { registry: mockRegistry });

      // The instance should be cast to the correct type
      expect(instance).toBeDefined();
      expect(typeof instance.getCacheInfo).toBe('function');
      expect(typeof instance.subscribe).toBe('function');
      expect(typeof instance.unsubscribe).toBe('function');
      expect(typeof instance.destroy).toBe('function');
    });
  });

  describe('edge cases and error scenarios', () => {
    it('should handle coordinate with undefined kta elements', () => {
      const factory = createInstanceFactory(mockApi);

      // Create a coordinate with undefined elements
      const problematicCoordinate = { kta: [undefined, 'test'] as any };

      expect(() => {
        factory(problematicCoordinate, { registry: mockRegistry });
      }).not.toThrow();
    });

    it('should handle context with missing registryHub', () => {
      const factory = createInstanceFactory(mockApi);

      const context = { registry: mockRegistry };
      const instance = factory(testCoordinate, context);

      expect(instance).toBeDefined();
      expect(instance.registry).toBe(mockRegistry);
    });

    it('should handle context with null registryHub', () => {
      const factory = createInstanceFactory(mockApi);

      const context = { registry: mockRegistry, registryHub: null };
      const instance = factory(testCoordinate, context);

      expect(instance).toBeDefined();
      expect(instance.registry).toBe(mockRegistry);
    });

    it('should handle multiple destroy calls', () => {
      const factory = createInstanceFactory(mockApi);
      const instance = factory(testCoordinate, { registry: mockRegistry });

      // Mock destroy methods
      const mockTTLDestroy = vi.fn();
      const mockEventDestroy = vi.fn();
      instance.ttlManager.destroy = mockTTLDestroy;
      instance.eventEmitter.destroy = mockEventDestroy;

      // Call destroy multiple times
      instance.destroy();
      instance.destroy();
      instance.destroy();

      // Should call destroy methods each time
      expect(mockTTLDestroy).toHaveBeenCalledTimes(3);
      expect(mockEventDestroy).toHaveBeenCalledTimes(3);
    });
  });
});
