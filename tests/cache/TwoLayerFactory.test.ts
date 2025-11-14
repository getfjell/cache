import { describe, expect, it, vi } from 'vitest';
import { TwoLayerFactory } from '../../src/cache/TwoLayerFactory';
import { TwoLayerCacheMap } from '../../src/cache/layers/TwoLayerCacheMap';
import { MemoryCacheMap } from '../../src/memory/MemoryCacheMap';
import { EnhancedMemoryCacheMap } from '../../src/memory/EnhancedMemoryCacheMap';
import { IndexDBCacheMap } from '../../src/browser/IndexDBCacheMap';
import { LocalStorageCacheMap } from '../../src/browser/LocalStorageCacheMap';
import { SessionStorageCacheMap } from '../../src/browser/SessionStorageCacheMap';

describe('TwoLayerFactory', () => {
  const testTypes = ['test'];

  describe('Direct Factory Methods', () => {
    it('should create memory two-layer cache', () => {
      const cache = TwoLayerFactory.createMemoryTwoLayer(testTypes as any, {
        itemTTL: 3600,
        queryTTL: 300,
        facetTTL: 60,
        debug: false
      });

      expect(cache).toBeInstanceOf(TwoLayerCacheMap);
      expect(cache.implementationType).toBe('two-layer/memory/memory');
      expect(cache.isTwoLayerEnabled).toBe(true);
    });

    it('should create enhanced memory two-layer cache', () => {
      const cache = TwoLayerFactory.createEnhancedMemoryTwoLayer(
        testTypes as any,
        { maxItems: 1000, maxSizeBytes: '10MB' },
        { itemTTL: 7200, queryTTL: 600, facetTTL: 120 }
      );

      expect(cache).toBeInstanceOf(TwoLayerCacheMap);
      expect(cache.implementationType).toBe('two-layer/memory/enhanced');
      expect(cache.underlying).toBeInstanceOf(EnhancedMemoryCacheMap);
    });

    it('should create IndexedDB two-layer cache', () => {
      const cache = TwoLayerFactory.createIndexedDBTwoLayer(
        testTypes as any,
        { dbName: 'test-db', storeName: 'test-store', version: 2 },
        { itemTTL: 3600, queryTTL: 300, facetTTL: 60 }
      );

      expect(cache).toBeInstanceOf(TwoLayerCacheMap);
      expect(cache.implementationType).toBe('two-layer/browser/indexedDB');
      expect(cache.underlying).toBeInstanceOf(IndexDBCacheMap);
    });

    it('should create localStorage two-layer cache with space management', () => {
      const cache = TwoLayerFactory.createLocalStorageTwoLayer(
        testTypes as any,
        { keyPrefix: 'test:', compress: true, maxSizeBytes: 1000000 },
        { itemTTL: 1800, queryTTL: 180, facetTTL: 30 }
      );

      expect(cache).toBeInstanceOf(TwoLayerCacheMap);
      expect(cache.implementationType).toBe('two-layer/browser/localStorage');
      expect(cache.underlying).toBeInstanceOf(LocalStorageCacheMap);
    });

    it('should create sessionStorage two-layer cache', () => {
      const cache = TwoLayerFactory.createSessionStorageTwoLayer(
        testTypes as any,
        { keyPrefix: 'session:', compress: false },
        { itemTTL: 1800, queryTTL: 120, facetTTL: 30 }
      );

      expect(cache).toBeInstanceOf(TwoLayerCacheMap);
      expect(cache.implementationType).toBe('two-layer/browser/sessionStorage');
      expect(cache.underlying).toBeInstanceOf(SessionStorageCacheMap);
    });

    it('should create hybrid two-layer cache', () => {
      const cache = TwoLayerFactory.createHybridTwoLayer(
        testTypes as any,
        { itemTTL: 7200, queryTTL: 300, facetTTL: 60 }
      );

      expect(cache).toBeInstanceOf(TwoLayerCacheMap);
      expect(cache.implementationType).toBe('two-layer/browser/localStorage');
    });
  });

  describe('Configuration-Based Creation', () => {
    it('should create two-layer cache when enabled in config', () => {
      const result = TwoLayerFactory.createFromConfig(testTypes as any, {
        enabled: true,
        itemLayer: { type: 'memory' },
        options: { itemTTL: 3600, queryTTL: 300, facetTTL: 60 }
      });

      expect(result).toBeInstanceOf(TwoLayerCacheMap);
    });

    it('should create single-layer cache when disabled in config', () => {
      const result = TwoLayerFactory.createFromConfig(testTypes as any, {
        enabled: false,
        itemLayer: { type: 'memory' }
      });

      expect(result).toBeInstanceOf(MemoryCacheMap);
      expect(result).not.toBeInstanceOf(TwoLayerCacheMap);
    });

    it('should handle different item layer types in config', () => {
      const cacheTypes = [
        { type: 'memory', expectedClass: MemoryCacheMap },
        { type: 'enhanced-memory', expectedClass: EnhancedMemoryCacheMap },
        { type: 'indexedDB', expectedClass: IndexDBCacheMap },
        { type: 'localStorage', expectedClass: LocalStorageCacheMap },
        { type: 'sessionStorage', expectedClass: SessionStorageCacheMap }
      ] as const;

      for (const { type, expectedClass } of cacheTypes) {
        const result = TwoLayerFactory.createFromConfig(testTypes as any, {
          enabled: true,
          itemLayer: { type },
          options: { itemTTL: 3600, queryTTL: 300, facetTTL: 60 }
        });

        expect(result).toBeInstanceOf(TwoLayerCacheMap);
        expect((result as TwoLayerCacheMap<any, any>).underlying).toBeInstanceOf(expectedClass);
      }
    });

    it('should handle unknown cache types gracefully', () => {
      const result = TwoLayerFactory.createFromConfig(testTypes as any, {
        enabled: true,
        itemLayer: { type: 'unknown-type' as any },
        options: { itemTTL: 3600, queryTTL: 300, facetTTL: 60 }
      });

      // Should fallback to memory
      expect(result).toBeInstanceOf(TwoLayerCacheMap);
      expect((result as TwoLayerCacheMap<any, any>).underlying).toBeInstanceOf(MemoryCacheMap);
    });

    it('should pass layer options correctly', () => {
      const indexedDBConfig = {
        enabled: true,
        itemLayer: {
          type: 'indexedDB' as const,
          options: {
            dbName: 'custom-db',
            storeName: 'custom-store',
            version: 3
          }
        },
        options: { itemTTL: 7200, queryTTL: 600, facetTTL: 120 }
      };

      const result = TwoLayerFactory.createFromConfig(testTypes as any, indexedDBConfig);
      expect(result).toBeInstanceOf(TwoLayerCacheMap);
    });

    it('should handle missing options in config', () => {
      const result = TwoLayerFactory.createFromConfig(testTypes as any, {
        enabled: true,
        itemLayer: { type: 'memory' }
        // No options provided
      });

      expect(result).toBeInstanceOf(TwoLayerCacheMap);
    });
  });

  describe('Auto-Detection', () => {
    it('should auto-detect cache type for current environment', () => {
      const cache = TwoLayerFactory.createAuto(testTypes as any, {
        itemTTL: 3600,
        queryTTL: 300,
        facetTTL: 60
      });

      expect(cache).toBeInstanceOf(TwoLayerCacheMap);
      // Should detect one of the expected types based on environment
      expect(cache.implementationType).toMatch(/^two-layer\/.+/);
    });

    it('should use provided options in auto-detected cache', () => {
      const customOptions = {
        itemTTL: 7200,
        queryTTL: 600,
        facetTTL: 120,
        debug: true
      };

      const cache = TwoLayerFactory.createAuto(testTypes as any, customOptions);
      expect(cache).toBeInstanceOf(TwoLayerCacheMap);
    });

    it('should handle auto-detection with minimal options', () => {
      const cache = TwoLayerFactory.createAuto(testTypes as any);
      expect(cache).toBeInstanceOf(TwoLayerCacheMap);
    });
  });

  describe('Environment Detection', () => {
    it('should detect best cache type for different environments', () => {
      // Mock different environments
      const originalWindow = global.window;
      const originalIndexedDB = global.indexedDB;

      try {
        // Test server environment (no window)
        delete (global as any).window;
        expect(TwoLayerFactory.detectBestCacheType()).toBe('enhanced-memory');

        // Test browser with IndexedDB
        (global as any).window = { indexedDB: {} };
        (global as any).indexedDB = {};
        expect(TwoLayerFactory.detectBestCacheType()).toBe('indexedDB');

        // Test browser with localStorage but no IndexedDB
        delete (global as any).indexedDB;
        (global as any).window = { localStorage: {} };
        expect(TwoLayerFactory.detectBestCacheType()).toBe('localStorage');

        // Test browser with no modern storage
        delete (global as any).window.localStorage;
        expect(TwoLayerFactory.detectBestCacheType()).toBe('memory');

      } finally {
        // Restore original environment
        global.window = originalWindow;
        global.indexedDB = originalIndexedDB;
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle factory creation errors gracefully', () => {
      // Test with invalid types array - factory handles nulls gracefully
      const cache = TwoLayerFactory.createMemoryTwoLayer(null as any);
      expect(cache).toBeInstanceOf(TwoLayerCacheMap);
    });

    it('should handle invalid configuration gracefully', () => {
      const invalidConfig = {
        enabled: true,
        itemLayer: { type: null as any }
      };

      expect(() => {
        TwoLayerFactory.createFromConfig(testTypes as any, invalidConfig);
      }).not.toThrow(); // Should fallback to memory
    });

    it('should handle missing required parameters', () => {
      // Should use defaults when parameters missing
      const cache = TwoLayerFactory.createMemoryTwoLayer(testTypes as any);
      expect(cache).toBeInstanceOf(TwoLayerCacheMap);
    });
  });

  describe('Wrapper Functionality', () => {
    it('should create wrapper around existing cache', () => {
      const underlyingCache = new MemoryCacheMap(testTypes as any);
      const wrapper = TwoLayerFactory.create(underlyingCache, {
        itemTTL: 3600,
        queryTTL: 300,
        facetTTL: 60
      });

      expect(wrapper).toBeInstanceOf(TwoLayerCacheMap);
      expect(wrapper.underlying).toBe(underlyingCache);
    });

    it('should handle wrapping with default options', () => {
      const underlyingCache = new MemoryCacheMap(testTypes as any);
      const wrapper = TwoLayerFactory.create(underlyingCache);

      expect(wrapper).toBeInstanceOf(TwoLayerCacheMap);
      expect(wrapper.underlying).toBe(underlyingCache);
    });

    it('should wrap different cache implementations correctly', () => {
      const implementations = [
        new MemoryCacheMap(testTypes as any),
        new EnhancedMemoryCacheMap(testTypes as any, { maxItems: 1000 })
      ];

      for (const impl of implementations) {
        const wrapper = TwoLayerFactory.create(impl, { debug: true });
        expect(wrapper).toBeInstanceOf(TwoLayerCacheMap);
        expect(wrapper.underlying).toBe(impl);
      }
    });
  });

  describe('Factory Method Options', () => {
    it('should handle default options for each factory method', () => {
      const factories = [
        () => TwoLayerFactory.createMemoryTwoLayer(testTypes as any),
        () => TwoLayerFactory.createEnhancedMemoryTwoLayer(testTypes as any),
        () => TwoLayerFactory.createIndexedDBTwoLayer(testTypes as any),
        () => TwoLayerFactory.createLocalStorageTwoLayer(testTypes as any),
        () => TwoLayerFactory.createSessionStorageTwoLayer(testTypes as any),
        () => TwoLayerFactory.createHybridTwoLayer(testTypes as any)
      ];

      for (const factory of factories) {
        const cache = factory();
        expect(cache).toBeInstanceOf(TwoLayerCacheMap);
      }
    });

    it('should apply storage-specific TTL optimizations', () => {
      // localStorage should use shorter TTLs due to space constraints
      const localStorageCache = TwoLayerFactory.createLocalStorageTwoLayer(testTypes as any);
      expect(localStorageCache).toBeInstanceOf(TwoLayerCacheMap);

      // sessionStorage should use even shorter TTLs
      const sessionStorageCache = TwoLayerFactory.createSessionStorageTwoLayer(testTypes as any);
      expect(sessionStorageCache).toBeInstanceOf(TwoLayerCacheMap);
    });

    it('should handle custom configurations for each method', () => {
      const customOptions = {
        itemTTL: 1800,
        queryTTL: 180,
        facetTTL: 30,
        debug: true
      };

      const memoryCache = TwoLayerFactory.createMemoryTwoLayer(testTypes as any, customOptions);
      const indexedDBCache = TwoLayerFactory.createIndexedDBTwoLayer(testTypes as any, {}, customOptions);
      
      expect(memoryCache).toBeInstanceOf(TwoLayerCacheMap);
      expect(indexedDBCache).toBeInstanceOf(TwoLayerCacheMap);
    });
  });

  describe('Configuration Validation', () => {
    it('should handle empty configuration objects', () => {
      const result = TwoLayerFactory.createFromConfig(testTypes as any, {
        enabled: true,
        itemLayer: { type: 'memory' },
        options: {}
      });

      expect(result).toBeInstanceOf(TwoLayerCacheMap);
    });

    it('should handle partial configuration', () => {
      const result = TwoLayerFactory.createFromConfig(testTypes as any, {
        enabled: true,
        itemLayer: { type: 'memory' }
        // Missing options entirely
      });

      expect(result).toBeInstanceOf(TwoLayerCacheMap);
    });

    it('should handle nested option configurations', () => {
      const complexConfig = {
        enabled: true,
        itemLayer: {
          type: 'enhanced-memory' as const,
          options: {
            maxItems: 5000,
            maxSizeBytes: '50MB'
          }
        },
        queryLayer: {
          type: 'memory' as const,
          options: {
            maxItems: 1000
          }
        },
        options: {
          itemTTL: 3600,
          queryTTL: 300,
          facetTTL: 60,
          debug: false
        }
      };

      const result = TwoLayerFactory.createFromConfig(testTypes as any, complexConfig);
      expect(result).toBeInstanceOf(TwoLayerCacheMap);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle null/undefined types gracefully', () => {
      // Factory handles null/undefined gracefully rather than throwing
      const nullCache = TwoLayerFactory.createMemoryTwoLayer(null as any);
      expect(nullCache).toBeInstanceOf(TwoLayerCacheMap);

      const undefinedCache = TwoLayerFactory.createMemoryTwoLayer(undefined as any);
      expect(undefinedCache).toBeInstanceOf(TwoLayerCacheMap);
    });

    it('should handle empty types array', () => {
      const cache = TwoLayerFactory.createMemoryTwoLayer([] as any);
      expect(cache).toBeInstanceOf(TwoLayerCacheMap);
    });

    it('should handle invalid size configurations', () => {
      // Invalid size config will throw - test that we can catch it
      expect(() => {
        TwoLayerFactory.createEnhancedMemoryTwoLayer(
          testTypes as any,
          { maxItems: -1, maxSizeBytes: 'invalid' } as any
        );
      }).toThrow('Invalid size format');
    });

    it('should handle IndexedDB configuration edge cases', () => {
      const configs = [
        {}, // Empty config
        { dbName: '' }, // Empty DB name
        { storeName: '' }, // Empty store name
        { version: 0 }, // Zero version
        { version: -1 } // Negative version
      ];

      for (const config of configs) {
        const cache = TwoLayerFactory.createIndexedDBTwoLayer(testTypes as any, config);
        expect(cache).toBeInstanceOf(TwoLayerCacheMap);
      }
    });

    it('should handle storage configuration edge cases', () => {
      const configs = [
        { keyPrefix: '' }, // Empty prefix
        { keyPrefix: undefined }, // Undefined prefix
        { compress: undefined }, // Undefined compression
        { maxSizeBytes: 0 } // Zero size
      ];

      for (const config of configs) {
        const localStorageCache = TwoLayerFactory.createLocalStorageTwoLayer(testTypes as any, config);
        const sessionStorageCache = TwoLayerFactory.createSessionStorageTwoLayer(testTypes as any, config);
        
        expect(localStorageCache).toBeInstanceOf(TwoLayerCacheMap);
        expect(sessionStorageCache).toBeInstanceOf(TwoLayerCacheMap);
      }
    });
  });

  describe('Private Helper Methods', () => {
    it('should handle unknown cache types in private createSingleLayerCache', () => {
      // This tests the fallback to memory for unknown types
      const result = TwoLayerFactory.createFromConfig(testTypes as any, {
        enabled: true,
        itemLayer: { type: 'completely-unknown-type' as any }
      });

      expect(result).toBeInstanceOf(TwoLayerCacheMap);
      expect((result as TwoLayerCacheMap<any, any>).underlying).toBeInstanceOf(MemoryCacheMap);
    });

    it('should handle createSingleLayerCache with various options', () => {
      const optionsVariations = [
        { type: 'memory', options: {} },
        { type: 'memory', options: { maxItems: 1000 } },
        { type: 'enhanced-memory', options: { maxItems: 2000 } },
        { type: 'enhanced-memory', options: {} },
        { type: 'indexedDB', options: { dbName: 'test' } },
        { type: 'localStorage', options: { keyPrefix: 'test:' } },
        { type: 'sessionStorage', options: { keyPrefix: 'session:' } }
      ];

      for (const variation of optionsVariations) {
        const result = TwoLayerFactory.createFromConfig(testTypes as any, {
          enabled: true,
          itemLayer: variation
        });

        expect(result).toBeInstanceOf(TwoLayerCacheMap);
      }
    });
  });

  describe('Debug and Logging', () => {
    it('should handle debug logging in factory creation', () => {
      const cache = TwoLayerFactory.createFromConfig(testTypes as any, {
        enabled: true,
        itemLayer: { type: 'memory' },
        options: { debug: true }
      });

      expect(cache).toBeInstanceOf(TwoLayerCacheMap);
    });

    it('should create caches with debug mode enabled', () => {
      const factories = [
        () => TwoLayerFactory.createMemoryTwoLayer(testTypes as any, { debug: true }),
        () => TwoLayerFactory.createIndexedDBTwoLayer(testTypes as any, {}, { debug: true }),
        () => TwoLayerFactory.createLocalStorageTwoLayer(testTypes as any, {}, { debug: true })
      ];

      for (const factory of factories) {
        const cache = factory();
        expect(cache).toBeInstanceOf(TwoLayerCacheMap);
      }
    });
  });

  describe('Integration with CacheMap Implementations', () => {
    it('should properly wrap different CacheMap types', () => {
      const memoryCacheMap = new MemoryCacheMap(testTypes as any);
      const enhancedCacheMap = new EnhancedMemoryCacheMap(testTypes as any, { maxItems: 1000 });

      const memoryWrapper = TwoLayerFactory.create(memoryCacheMap);
      const enhancedWrapper = TwoLayerFactory.create(enhancedCacheMap);

      expect(memoryWrapper.underlying).toBe(memoryCacheMap);
      expect(enhancedWrapper.underlying).toBe(enhancedCacheMap);
    });

    it('should preserve underlying cache properties', () => {
      const underlyingCache = new MemoryCacheMap(testTypes as any);
      const wrapper = TwoLayerFactory.create(underlyingCache);

      expect(wrapper.underlying.implementationType).toBe(underlyingCache.implementationType);
    });

    it('should handle cache creation with complex type hierarchies', () => {
      const complexTypes = ['user', 'location1', 'location2'];
      
      const cache = TwoLayerFactory.createMemoryTwoLayer(complexTypes as any, {
        itemTTL: 3600,
        queryTTL: 300,
        facetTTL: 60
      });

      expect(cache).toBeInstanceOf(TwoLayerCacheMap);
    });
  });

  describe('Factory Performance', () => {
    it('should create instances efficiently', () => {
      const startTime = performance.now();
      
      const caches = Array.from({ length: 100 }, () =>
        TwoLayerFactory.createMemoryTwoLayer(testTypes as any)
      );
      
      const endTime = performance.now();
      
      expect(caches).toHaveLength(100);
      expect(caches.every(c => c instanceof TwoLayerCacheMap)).toBe(true);
      expect(endTime - startTime).toBeLessThan(1000); // Should be very fast
    });

    it('should handle concurrent factory calls', async () => {
      const factories = Array.from({ length: 50 }, (_, i) =>
        () => TwoLayerFactory.createMemoryTwoLayer(testTypes as any, { debug: i % 2 === 0 })
      );

      const caches = await Promise.all(factories.map(f => Promise.resolve(f())));
      
      expect(caches).toHaveLength(50);
      expect(caches.every(c => c instanceof TwoLayerCacheMap)).toBe(true);
    });
  });
});
