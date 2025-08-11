import { describe, expect, it } from 'vitest';
import { createCacheMap, createOptions, validateOptions } from '../src/Options';
import { EnhancedMemoryCacheMap } from '../src/memory/EnhancedMemoryCacheMap';
import { MemoryCacheMap } from '../src/memory/MemoryCacheMap';
import { Item } from '@fjell/core';

// Test item type
interface TestItem extends Item<'test'> {
  id: string;
  name: string;
  value: number;
}

describe('Enhanced Options System Tests', () => {
  describe('createOptions with size configuration', () => {
    it('should create options with size configuration', () => {
      const options = createOptions<TestItem, 'test'>({
        cacheType: 'memory',
        memoryConfig: {
          size: {
            maxSizeBytes: '10MB',
            maxItems: 1000,
            evictionPolicy: 'lru'
          }
        }
      });

      expect(options.cacheType).toBe('memory');
      expect(options.memoryConfig?.size?.maxSizeBytes).toBe('10MB');
      expect(options.memoryConfig?.size?.maxItems).toBe(1000);
      expect(options.memoryConfig?.size?.evictionPolicy).toBe('lru');
    });

    it('should merge with default options correctly', () => {
      const options = createOptions<TestItem, 'test'>({
        cacheType: 'memory',
        memoryConfig: {

          size: {
            maxItems: 500,
            evictionPolicy: 'lfu'
          }
        }
      });

      expect(options.memoryConfig?.size?.maxItems).toBe(500);
      expect(options.memoryConfig?.size?.evictionPolicy).toBe('lfu');
      expect(options.memoryConfig?.size?.maxSizeBytes).toBeUndefined();
    });

    it('should handle all eviction policy types', () => {
      const policies = ['lru', 'lfu', 'fifo', 'mru', 'random', 'arc', '2q'] as const;

      policies.forEach(policy => {
        const options = createOptions<TestItem, 'test'>({
          cacheType: 'memory',
          memoryConfig: {
            size: {
              maxItems: 100,
              evictionPolicy: policy
            }
          }
        });

        expect(options.memoryConfig?.size?.evictionPolicy).toBe(policy);
      });
    });

    it('should handle size configuration for all cache types', () => {
      // Memory cache
      const memoryOptions = createOptions<TestItem, 'test'>({
        cacheType: 'memory',
        memoryConfig: {
          size: {
            maxSizeBytes: '5MB',
            evictionPolicy: 'lru'
          }
        }
      });
      expect(memoryOptions.memoryConfig?.size?.maxSizeBytes).toBe('5MB');

      // Web storage cache
      const webOptions = createOptions<TestItem, 'test'>({
        cacheType: 'localStorage',
        webStorageConfig: {
          keyPrefix: 'test:',
          size: {
            maxSizeBytes: '1MB',
            maxItems: 500,
            evictionPolicy: 'fifo'
          }
        }
      });
      expect(webOptions.webStorageConfig?.size?.maxSizeBytes).toBe('1MB');
      expect(webOptions.webStorageConfig?.size?.maxItems).toBe(500);

      // IndexedDB cache
      const indexedDBOptions = createOptions<TestItem, 'test'>({
        cacheType: 'indexedDB',
        indexedDBConfig: {
          dbName: 'testDB',
          size: {
            maxSizeBytes: '100MB',
            evictionPolicy: 'arc'
          }
        }
      });
      expect(indexedDBOptions.indexedDBConfig?.size?.maxSizeBytes).toBe('100MB');
    });
  });

  describe('validateOptions with size configuration', () => {
    it('should validate correct size configurations', () => {
      const validConfigs = [
        {
          cacheType: 'memory' as const,
          memoryConfig: {
            size: {
              maxSizeBytes: '1MB',
              maxItems: 100,
              evictionPolicy: 'lru' as const
            }
          }
        },
        {
          cacheType: 'memory' as const,
          memoryConfig: {
            size: {
              maxSizeBytes: '500KB'
            }
          }
        },
        {
          cacheType: 'memory' as const,
          memoryConfig: {
            size: {
              maxItems: 1000,
              evictionPolicy: 'random' as const
            }
          }
        }
      ];

      validConfigs.forEach(config => {
        const options = createOptions<TestItem, 'test'>(config);
        expect(() => validateOptions(options)).not.toThrow();
      });
    });

    it('should reject invalid size configurations', () => {
      const invalidConfigs = [
        {
          cacheType: 'memory' as const,
          memoryConfig: {
            size: {
              maxSizeBytes: 'invalid',
              evictionPolicy: 'lru' as const
            }
          }
        },
        {
          cacheType: 'memory' as const,
          memoryConfig: {
            size: {
              maxSizeBytes: '-1MB',
              evictionPolicy: 'lru' as const
            }
          }
        },
        {
          cacheType: 'memory' as const,
          memoryConfig: {
            size: {
              maxItems: 0,
              evictionPolicy: 'lru' as const
            }
          }
        },
        {
          cacheType: 'memory' as const,
          memoryConfig: {
            size: {
              maxItems: -5,
              evictionPolicy: 'lru' as const
            }
          }
        },
        {
          cacheType: 'memory' as const,
          memoryConfig: {
            size: {
              maxItems: 1.5,
              evictionPolicy: 'lru' as const
            }
          }
        }
      ];

      invalidConfigs.forEach(config => {
        const options = createOptions<TestItem, 'test'>(config);
        expect(() => validateOptions(options)).toThrow();
      });
    });

    it('should validate size configurations for all cache types', () => {
      // Web storage with invalid size
      const webOptions = createOptions<TestItem, 'test'>({
        cacheType: 'localStorage',
        webStorageConfig: {
          size: {
            maxSizeBytes: '0KB'
          }
        }
      });
      expect(() => validateOptions(webOptions)).toThrow();

      // IndexedDB with invalid size
      const indexedDBOptions = createOptions<TestItem, 'test'>({
        cacheType: 'indexedDB',
        indexedDBConfig: {
          size: {
            maxItems: -1
          }
        }
      });
      expect(() => validateOptions(indexedDBOptions)).toThrow();
    });

    it('should handle edge case validation scenarios', () => {
      // Valid edge cases
      const edgeCases = [
        {
          cacheType: 'memory' as const,
          memoryConfig: {
            size: {
              maxSizeBytes: '1',
              maxItems: 1,
              evictionPolicy: 'lru' as const
            }
          }
        },
        {
          cacheType: 'memory' as const,
          memoryConfig: {
            size: {
              maxSizeBytes: '1TB',
              maxItems: 1000000,
              evictionPolicy: 'arc' as const
            }
          }
        }
      ];

      edgeCases.forEach(config => {
        const options = createOptions<TestItem, 'test'>(config);
        expect(() => validateOptions(options)).not.toThrow();
      });
    });
  });

  describe('createCacheMap with enhanced configuration', () => {
    it('should create enhanced memory cache when size limits are configured', () => {
      const options = createOptions<TestItem, 'test'>({
        cacheType: 'memory',
        memoryConfig: {
          size: {
            maxSizeBytes: '1MB',
            maxItems: 100,
            evictionPolicy: 'lru'
          }
        }
      });

      const cacheMap = createCacheMap(['test'], options);
      expect(cacheMap).toBeInstanceOf(EnhancedMemoryCacheMap);
    });

    it('should create regular memory cache when no size limits are configured', () => {
      const options = createOptions<TestItem, 'test'>({
        cacheType: 'memory',
        memoryConfig: {

          // No size configuration
        }
      });

      const cacheMap = createCacheMap(['test'], options);
      expect(cacheMap).toBeInstanceOf(MemoryCacheMap);
    });

    it('should create enhanced memory cache with partial size configuration', () => {
      // Only maxItems
      const options1 = createOptions<TestItem, 'test'>({
        cacheType: 'memory',
        memoryConfig: {
          size: {
            maxItems: 100
          }
        }
      });

      const cacheMap1 = createCacheMap(['test'], options1);
      expect(cacheMap1).toBeInstanceOf(EnhancedMemoryCacheMap);

      // Only maxSizeBytes
      const options2 = createOptions<TestItem, 'test'>({
        cacheType: 'memory',
        memoryConfig: {
          size: {
            maxSizeBytes: '1MB'
          }
        }
      });

      const cacheMap2 = createCacheMap(['test'], options2);
      expect(cacheMap2).toBeInstanceOf(EnhancedMemoryCacheMap);

      // Only evictionPolicy (should not trigger enhanced cache)
      const options3 = createOptions<TestItem, 'test'>({
        cacheType: 'memory',
        memoryConfig: {
          size: {
            evictionPolicy: 'lru'
          }
        }
      });

      const cacheMap3 = createCacheMap(['test'], options3);
      expect(cacheMap3).toBeInstanceOf(MemoryCacheMap);
    });

    it('should pass correct configuration to enhanced memory cache', () => {
      const options = createOptions<TestItem, 'test'>({
        cacheType: 'memory',
        memoryConfig: {
          size: {
            maxSizeBytes: '5MB',
            maxItems: 500,
            evictionPolicy: 'lfu'
          }
        }
      });

      const cacheMap = createCacheMap(['test'], options) as EnhancedMemoryCacheMap<TestItem, 'test'>;
      const stats = cacheMap.getStats();

      expect(stats.maxSizeBytes).toBe(5000000);
      expect(stats.maxItems).toBe(500);
    });

    it('should maintain backwards compatibility with existing configurations', () => {
      // Old style configuration without size
      const oldOptions = createOptions<TestItem, 'test'>({
        cacheType: 'memory',
        memoryConfig: {
          maxItems: 100,

        }
      });

      const oldCacheMap = createCacheMap(['test'], oldOptions);
      expect(oldCacheMap).toBeInstanceOf(MemoryCacheMap);

      // New style configuration
      const newOptions = createOptions<TestItem, 'test'>({
        cacheType: 'memory',
        memoryConfig: {
          maxItems: 100,

          size: {
            maxItems: 200,
            evictionPolicy: 'lru'
          }
        }
      });

      const newCacheMap = createCacheMap(['test'], newOptions);
      expect(newCacheMap).toBeInstanceOf(EnhancedMemoryCacheMap);
    });
  });

  describe('Options integration with all cache types', () => {
    it('should handle localStorage with size configuration', () => {
      const options = createOptions<TestItem, 'test'>({
        cacheType: 'localStorage',
        webStorageConfig: {
          keyPrefix: 'test:',
          compress: true,
          size: {
            maxSizeBytes: '2MB',
            maxItems: 1000,
            evictionPolicy: 'fifo'
          }
        }
      });

      expect(() => validateOptions(options)).not.toThrow();

      // Note: Currently only memory cache supports enhanced features
      // This tests that the configuration is accepted but doesn't break other cache types
      const cacheMap = createCacheMap(['test'], options);
      expect(cacheMap).toBeDefined();
    });

    it('should handle sessionStorage with size configuration', () => {
      const options = createOptions<TestItem, 'test'>({
        cacheType: 'sessionStorage',
        webStorageConfig: {
          keyPrefix: 'session:',
          size: {
            maxSizeBytes: '500KB',
            evictionPolicy: 'mru'
          }
        }
      });

      expect(() => validateOptions(options)).not.toThrow();
      const cacheMap = createCacheMap(['test'], options);
      expect(cacheMap).toBeDefined();
    });

    it('should handle indexedDB with size configuration', () => {
      const options = createOptions<TestItem, 'test'>({
        cacheType: 'indexedDB',
        indexedDBConfig: {
          dbName: 'testDB',
          version: 2,
          storeName: 'testStore',
          size: {
            maxSizeBytes: '50MB',
            maxItems: 10000,
            evictionPolicy: 'arc'
          }
        }
      });

      expect(() => validateOptions(options)).not.toThrow();

      // Note: IndexedDB creation might fail in test environment
      // This just tests the configuration validation
      expect(options.indexedDBConfig?.size?.maxSizeBytes).toBe('50MB');
    });

    it('should handle custom cache with size configuration', () => {
      const customFactory = (kta: string[]) => {
        return new MemoryCacheMap<TestItem, 'test'>(kta as any);
      };

      const options = createOptions<TestItem, 'test'>({
        cacheType: 'custom',
        customCacheMapFactory: customFactory
      });

      expect(() => validateOptions(options)).not.toThrow();
      const cacheMap = createCacheMap(['test'], options);
      expect(cacheMap).toBeInstanceOf(MemoryCacheMap);
    });
  });

  describe('Complex configuration scenarios', () => {
    it('should handle full configuration with all options', () => {
      const options = createOptions<TestItem, 'test'>({
        cacheType: 'memory',
        enableDebugLogging: true,
        autoSync: false,
        ttl: 300000,
        maxRetries: 5,
        retryDelay: 2000,
        memoryConfig: {
          maxItems: 1000,

          size: {
            maxSizeBytes: '10MB',
            maxItems: 2000, // Different from memoryConfig.maxItems
            evictionPolicy: 'lru'
          }
        }
      });

      expect(() => validateOptions(options)).not.toThrow();

      expect(options.enableDebugLogging).toBe(true);
      expect(options.autoSync).toBe(false);
      expect(options.ttl).toBe(300000);
      expect(options.maxRetries).toBe(5);
      expect(options.retryDelay).toBe(2000);
      expect(options.memoryConfig?.maxItems).toBe(1000);

      expect(options.memoryConfig?.size?.maxSizeBytes).toBe('10MB');
      expect(options.memoryConfig?.size?.maxItems).toBe(2000);
      expect(options.memoryConfig?.size?.evictionPolicy).toBe('lru');
    });

    it('should handle conflicting configurations appropriately', () => {
      // Size config takes precedence for enhanced cache
      const options = createOptions<TestItem, 'test'>({
        cacheType: 'memory',
        memoryConfig: {
          maxItems: 500, // This will be ignored in favor of size.maxItems
          size: {
            maxItems: 1000,
            evictionPolicy: 'lru'
          }
        }
      });

      const cacheMap = createCacheMap(['test'], options) as EnhancedMemoryCacheMap<TestItem, 'test'>;
      const stats = cacheMap.getStats();

      // Enhanced cache should use size.maxItems
      expect(stats.maxItems).toBe(1000);
    });

    it('should validate complex nested configurations', () => {
      const complexOptions = createOptions<TestItem, 'test'>({
        cacheType: 'memory',
        memoryConfig: {
          size: {
            maxSizeBytes: '0.5GB',
            maxItems: 50000,
            evictionPolicy: '2q'
          }
        },
        webStorageConfig: {
          size: {
            maxSizeBytes: '100MB',
            evictionPolicy: 'arc'
          }
        },
        indexedDBConfig: {
          size: {
            maxItems: 100000,
            evictionPolicy: 'random'
          }
        }
      });

      expect(() => validateOptions(complexOptions)).not.toThrow();
    });
  });
});
