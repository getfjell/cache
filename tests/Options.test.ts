import { afterEach, describe, expect, it } from 'vitest';
import { CacheType, createCacheMap, createOptions, Options, validateOptions } from '../src/Options';
import { MemoryCacheMap } from '../src/memory/MemoryCacheMap';
import { Item } from '@fjell/core';

interface TestItem extends Item<'test'> {
  id: string;
  name: string;
}

describe('Options', () => {
  const testKta: ['test'] = ['test'];

  describe('createOptions', () => {
    it('should create default options', () => {
      const options = createOptions<TestItem, 'test'>();

      expect(options.cacheType).toBe('memory');
      expect(options.enableDebugLogging).toBe(false);
      expect(options.autoSync).toBe(true);
      expect(options.maxRetries).toBe(3);
      expect(options.retryDelay).toBe(1000);
    });

    it('should merge provided options with defaults', () => {
      const customOptions: Partial<Options<TestItem, 'test'>> = {
        cacheType: 'localStorage',
        enableDebugLogging: true,
        webStorageConfig: {
          keyPrefix: 'custom:',
          compress: true
        }
      };

      const options = createOptions(customOptions);

      expect(options.cacheType).toBe('localStorage');
      expect(options.enableDebugLogging).toBe(true);
      expect(options.webStorageConfig?.keyPrefix).toBe('custom:');
      expect(options.webStorageConfig?.compress).toBe(true);
      // Should still have defaults for other options
      expect(options.autoSync).toBe(true);
      expect(options.maxRetries).toBe(3);
    });
  });

  describe('validateOptions', () => {
    it('should validate memory cache options', () => {
      const options = createOptions<TestItem, 'test'>({
        cacheType: 'memory',
        memoryConfig: {
          maxItems: 100,

        }
      });

      expect(() => validateOptions(options)).not.toThrow();
    });

    it('should throw error for custom cache without factory', () => {
      expect(() => createOptions<TestItem, 'test'>({
        cacheType: 'custom'
      })).toThrow('customCacheMapFactory is required when cacheType is "custom"');
    });

    it('should throw error for negative maxRetries', () => {
      expect(() => createOptions<TestItem, 'test'>({
        maxRetries: -1
      })).toThrow('maxRetries must be non-negative');
    });

    it('should throw error for negative retryDelay', () => {
      expect(() => createOptions<TestItem, 'test'>({
        retryDelay: -1
      })).toThrow('retryDelay must be non-negative');
    });

    it('should throw error for invalid ttl', () => {
      expect(() => createOptions<TestItem, 'test'>({
        ttl: 0
      })).toThrow('ttl must be positive');
    });

    it('should throw error for invalid memory config', () => {
      expect(() => createOptions<TestItem, 'test'>({
        memoryConfig: {
          maxItems: 0
        }
      })).toThrow('memoryConfig.maxItems must be positive');
    });
  });

  describe('configuration validation', () => {
    it('should validate options successfully', () => {
      const options = createOptions({
        cacheType: 'memory',
        enableDebugLogging: true,
        autoSync: false,
        bypassCache: true,
        maxRetries: 5,
        retryDelay: 2000
      });

      expect(() => validateOptions(options)).not.toThrow();
    });

    it('should throw error for unknown top-level properties', () => {
      const invalidOptions = {
        cacheType: 'memory',
        byPassCache: true, // Typo: should be bypassCache
        enableDebugLogging: true
      } as any;

      expect(() => validateOptions(invalidOptions)).toThrow(
        'Unknown configuration properties detected: byPassCache.\n' +
        'Valid properties are: cacheType, enableDebugLogging, autoSync, ttl, bypassCache, maxRetries, retryDelay, indexedDBConfig, webStorageConfig, memoryConfig, customCacheMapFactory, evictionConfig, twoLayer.\n' +
        'Did you mean: "byPassCache" → "bypassCache"?'
      );
    });

    it('should throw error for multiple unknown properties with suggestions', () => {
      const invalidOptions = {
        cacheType: 'memory',
        byPassCache: true, // Typo: should be bypassCache
        cachetype: 'localStorage', // Typo: should be cacheType
        enableDebugLogging: true
      } as any;

      expect(() => validateOptions(invalidOptions)).toThrow(
        'Unknown configuration properties detected: byPassCache, cachetype.\n' +
        'Valid properties are: cacheType, enableDebugLogging, autoSync, ttl, bypassCache, maxRetries, retryDelay, indexedDBConfig, webStorageConfig, memoryConfig, customCacheMapFactory, evictionConfig, twoLayer.\n' +
        'Did you mean: "byPassCache" → "bypassCache", "cachetype" → "cacheType"?'
      );
    });

    it('should throw error for unknown IndexedDB config properties', () => {
      expect(() => createOptions({
        cacheType: 'indexedDB',
        indexedDBConfig: {
          dbname: 'test', // Typo: should be dbName
          storename: 'cache' // Typo: should be storeName
        } as any
      })).toThrow(
        'Unknown IndexedDB configuration properties: dbname, storename.\n' +
        'Valid properties are: dbName, version, storeName, size.\n' +
        'Did you mean: "dbname" → "dbName", "storename" → "storeName"?'
      );
    });

    it('should throw error for unknown WebStorage config properties', () => {
      expect(() => createOptions({
        cacheType: 'localStorage',
        webStorageConfig: {
          keyprefix: 'test:' // Typo: should be keyPrefix
        } as any
      })).toThrow(
        'Unknown WebStorage configuration properties: keyprefix.\n' +
        'Valid properties are: keyPrefix, compress, size.\n' +
        'Did you mean: "keyprefix" → "keyPrefix"?'
      );
    });

    it('should throw error for unknown Memory config properties', () => {
      expect(() => createOptions({
        cacheType: 'memory',
        memoryConfig: {
          maxitems: 1000 // Typo: should be maxItems
        } as any
      })).toThrow(
        'Unknown Memory configuration properties: maxitems.\n' +
        'Valid properties are: maxItems, size.\n' +
        'Did you mean: "maxitems" → "maxItems"?'
      );
    });

    it('should throw error for unknown Eviction config properties', () => {
      expect(() => createOptions({
        cacheType: 'memory',
        evictionConfig: {
          evictionstrategy: 'lru' // Typo: should be type
        } as any
      })).toThrow(
        'Unknown Eviction configuration properties: evictionstrategy.\n' +
        'Valid properties are: type, config.\n' +
        'Did you mean: "evictionstrategy" → "type"?'
      );
    });

    it('should throw error for invalid eviction strategy type', () => {
      expect(() => createOptions({
        cacheType: 'memory',
        evictionConfig: {
          type: 'LRU' // Typo: should be 'lru'
        } as any
      })).toThrow(
        'Invalid eviction strategy type: "LRU". Valid types are: lru, lfu, fifo, mru, random, arc, 2q. Did you mean "lru"?'
      );
    });

    it('should throw error for invalid eviction strategy type with underscore', () => {
      expect(() => createOptions({
        cacheType: 'memory',
        evictionConfig: {
          type: 'two_queue' // Typo: should be '2q'
        } as any
      })).toThrow(
        'Invalid eviction strategy type: "two_queue". Valid types are: lru, lfu, fifo, mru, random, arc, 2q. Did you mean "2q"?'
      );
    });

    it('should validate eviction config successfully', () => {
      const validOptions = createOptions({
        cacheType: 'memory',
        evictionConfig: {
          type: 'lru'
        }
      });

      expect(() => validateOptions(validOptions)).not.toThrow();
    });

    it('should catch typos when creating options with createOptions', () => {
      expect(() => createOptions({
        cacheType: 'memory',
        byPassCache: true // Typo: should be bypassCache
      } as any)).toThrow(
        'Unknown configuration properties detected: byPassCache.\n' +
        'Valid properties are: cacheType, enableDebugLogging, autoSync, ttl, bypassCache, maxRetries, retryDelay, indexedDBConfig, webStorageConfig, memoryConfig, customCacheMapFactory, evictionConfig, twoLayer.\n' +
        'Did you mean: "byPassCache" → "bypassCache"?'
      );
    });

    it('should catch nested config typos when creating options', () => {
      expect(() => createOptions({
        cacheType: 'indexedDB',
        indexedDBConfig: {
          dbname: 'test' // Typo: should be dbName
        } as any
      })).toThrow(
        'Unknown IndexedDB configuration properties: dbname.\n' +
        'Valid properties are: dbName, version, storeName, size.\n' +
        'Did you mean: "dbname" → "dbName"?'
      );
    });
  });

  describe('createCacheMap', () => {
    it('should create memory cache map by default', () => {
      const options = createOptions<TestItem, 'test'>();
      const cacheMap = createCacheMap(testKta, options);

      expect(cacheMap).toBeInstanceOf(MemoryCacheMap);
    });

    it('should create memory cache map when specified', () => {
      const options = createOptions<TestItem, 'test'>({
        cacheType: 'memory'
      });
      const cacheMap = createCacheMap(testKta, options);

      expect(cacheMap).toBeInstanceOf(MemoryCacheMap);
    });

    it('should create custom cache map when factory provided', () => {
      const customFactory = (kta: ['test', ...string[]]) => new MemoryCacheMap<TestItem, 'test'>(kta as any);
      const options = createOptions<TestItem, 'test'>({
        cacheType: 'custom',
        customCacheMapFactory: customFactory
      });

      const cacheMap = createCacheMap(testKta, options);
      expect(cacheMap).toBeInstanceOf(MemoryCacheMap);
    });

    it('should throw error for unsupported cache type', () => {
      const options = createOptions<TestItem, 'test'>({
        cacheType: 'invalid' as CacheType
      });

      expect(() => createCacheMap(testKta, options)).toThrow('Unsupported cache type: invalid');
    });

    it('should throw error for custom cache without factory', () => {
      expect(() => createOptions<TestItem, 'test'>({
        cacheType: 'custom'
      })).toThrow('customCacheMapFactory is required when cacheType is "custom"');
    });
  });

  describe('cache type configurations', () => {
    it('should handle localStorage configuration', () => {
      const options = createOptions<TestItem, 'test'>({
        cacheType: 'localStorage',
        webStorageConfig: {
          keyPrefix: 'test:',
          compress: false
        }
      });

      expect(options.webStorageConfig?.keyPrefix).toBe('test:');
      expect(options.webStorageConfig?.compress).toBe(false);
    });

    it('should handle sessionStorage configuration', () => {
      const options = createOptions<TestItem, 'test'>({
        cacheType: 'sessionStorage',
        webStorageConfig: {
          keyPrefix: 'session:',
          compress: true
        }
      });

      expect(options.webStorageConfig?.keyPrefix).toBe('session:');
      expect(options.webStorageConfig?.compress).toBe(true);
    });

    it('should handle indexedDB configuration', () => {
      const options = createOptions<TestItem, 'test'>({
        cacheType: 'indexedDB',
        indexedDBConfig: {
          dbName: 'TestDB',
          version: 2,
          storeName: 'testStore'
        }
      });

      expect(options.indexedDBConfig?.dbName).toBe('TestDB');
      expect(options.indexedDBConfig?.version).toBe(2);
      expect(options.indexedDBConfig?.storeName).toBe('testStore');
    });

    it('should handle indexedDB configuration', () => {
      const options = createOptions<TestItem, 'test'>({
        cacheType: 'indexedDB',
        indexedDBConfig: {
          dbName: 'AsyncTestDB',
          version: 1,
          storeName: 'asyncStore'
        }
      });

      expect(options.indexedDBConfig?.dbName).toBe('AsyncTestDB');
      expect(options.indexedDBConfig?.version).toBe(1);
      expect(options.indexedDBConfig?.storeName).toBe('asyncStore');
    });
  });

  describe('complex configuration scenarios', () => {
    it('should handle deep configuration merging', () => {
      const options = createOptions<TestItem, 'test'>({
        cacheType: 'localStorage',
        webStorageConfig: {
          keyPrefix: 'custom:'
          // compress not specified, should use default
        },
        indexedDBConfig: {
          dbName: 'CustomDB'
          // version and storeName should use defaults
        }
      });

      expect(options.webStorageConfig?.keyPrefix).toBe('custom:');
      expect(options.webStorageConfig?.compress).toBe(false); // default
      expect(options.indexedDBConfig?.dbName).toBe('CustomDB');
      expect(options.indexedDBConfig?.version).toBe(1); // default
      expect(options.indexedDBConfig?.storeName).toBe('cache'); // default
    });

    it('should handle all performance options', () => {
      const options = createOptions<TestItem, 'test'>({
        cacheType: 'memory',
        ttl: 60000,
        maxRetries: 5,
        retryDelay: 2000,
        autoSync: false,
        enableDebugLogging: true,
        memoryConfig: {
          maxItems: 500,

        }
      });

      expect(options.ttl).toBe(60000);
      expect(options.maxRetries).toBe(5);
      expect(options.retryDelay).toBe(2000);
      expect(options.autoSync).toBe(false);
      expect(options.enableDebugLogging).toBe(true);
      expect(options.memoryConfig?.maxItems).toBe(500);

    });
  });

  describe('environment validation', () => {
    const originalWindow = global.window;
    const originalIndexedDB = global.indexedDB;

    afterEach(() => {
      global.window = originalWindow;
      global.indexedDB = originalIndexedDB;
    });

    it('should validate browser storage availability in browser environment', () => {
      // Mock browser environment
      global.window = {} as any;

      expect(() => createOptions<TestItem, 'test'>({ cacheType: 'localStorage' })).toThrow('localStorage is not available in non-browser environments');
      expect(() => createOptions<TestItem, 'test'>({ cacheType: 'sessionStorage' })).toThrow('sessionStorage is not available in non-browser environments');
    });

    it('should validate IndexedDB availability', () => {
      // Mock browser environment without IndexedDB
      global.window = {} as any;
      delete (global as any).indexedDB;

      expect(() => createOptions<TestItem, 'test'>({ cacheType: 'indexedDB' })).toThrow('indexedDB is not available in this environment');
    });

    it('should pass validation in node environment for memory cache', () => {
      // Ensure we're in node environment
      delete (global as any).window;

      const memoryOptions = createOptions<TestItem, 'test'>({ cacheType: 'memory' });
      expect(() => validateOptions(memoryOptions)).not.toThrow();
    });
  });

  describe('edge cases and error conditions', () => {
    it('should handle undefined options gracefully', () => {
      const options = createOptions<TestItem, 'test'>();
      expect(options.cacheType).toBe('memory');
      expect(options.enableDebugLogging).toBe(false);
    });

    it('should handle null config objects', () => {
      const options = createOptions<TestItem, 'test'>({
        webStorageConfig: null as any,
        indexedDBConfig: null as any,
        memoryConfig: null as any
      });

      expect(options.webStorageConfig?.keyPrefix).toBe('fjell-cache:'); // default
      expect(options.indexedDBConfig?.dbName).toBe('fjell-cache'); // default
    });

    it('should validate all numeric options boundaries', () => {
      const invalidOptions = [
        { maxRetries: -5 },
        { retryDelay: -100 },
        { ttl: -1 },
        { memoryConfig: { maxItems: -10 } }
      ];

      invalidOptions.forEach(opts => {
        expect(() => createOptions<TestItem, 'test'>(opts)).toThrow();
      });
    });

    it('should handle zero values correctly', () => {
      const options = createOptions<TestItem, 'test'>({
        maxRetries: 0,
        retryDelay: 0
      });

      expect(() => validateOptions(options)).not.toThrow();
      expect(options.maxRetries).toBe(0);
      expect(options.retryDelay).toBe(0);
    });
  });
});
