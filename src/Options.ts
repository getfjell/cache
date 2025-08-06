import { Item } from '@fjell/core';
import { CacheMap } from './CacheMap';
import { MemoryCacheMap } from './memory/MemoryCacheMap';
import { EnhancedMemoryCacheMap } from './memory/EnhancedMemoryCacheMap';
import { LocalStorageCacheMap } from './browser/LocalStorageCacheMap';
import { SessionStorageCacheMap } from './browser/SessionStorageCacheMap';
import { IndexDBCacheMap } from './browser/IndexDBCacheMap';
import { AsyncIndexDBCacheMap } from './browser/AsyncIndexDBCacheMap';
import { validateSizeConfig } from './utils/CacheSize';
import { EvictionStrategyConfigs } from './eviction/EvictionStrategyConfig';

/**
 * Available cache types for the cache instance
 */
export type CacheType = 'memory' | 'localStorage' | 'sessionStorage' | 'indexedDB' | 'asyncIndexedDB' | 'custom';

/**
 * Cache eviction policies for when cache size limits are reached
 */
export type EvictionPolicy =
  | 'lru'     // Least Recently Used - removes oldest recently-accessed item
  | 'lfu'     // Least Frequently Used - removes item with lowest access frequency
  | 'fifo'    // First-In, First-Out - removes oldest added item
  | 'mru'     // Most Recently Used - removes most recently used item
  | 'random'  // Random Replacement - evicts a random item
  | 'arc'     // Adaptive Replacement Cache - balances recency and frequency
  | '2q';     // Two Queues - keeps separate LRU lists for recent and frequent entries

/**
 * Cache size configuration supporting bytes and item count limits
 */
export interface CacheSizeConfig {
  /** Maximum cache size in bytes (e.g., '100', '5KB', '10MB', '2GB', '1KiB', '512MiB') */
  maxSizeBytes?: string;
  /** Maximum number of items in cache */
  maxItems?: number;
  /** Eviction policy to use when limits are exceeded (default: 'lru') */
  evictionPolicy?: EvictionPolicy;
}

/**
 * Configuration for IndexedDB-based cache maps
 */
export interface IndexedDBConfig {
  /** Database name (default: 'fjell-cache') */
  dbName?: string;
  /** Database version (default: 1) */
  version?: number;
  /** Object store name (default: 'cache') */
  storeName?: string;
  /** Size configuration for IndexedDB cache */
  size?: CacheSizeConfig;
}

/**
 * Configuration for localStorage/sessionStorage-based cache maps
 */
export interface WebStorageConfig {
  /** Key prefix for storage items (default: 'fjell-cache:') */
  keyPrefix?: string;
  /** Whether to compress stored data (default: false) */
  compress?: boolean;
  /** Size configuration for web storage cache */
  size?: CacheSizeConfig;
}

/**
 * Configuration for memory-based cache maps
 */
export interface MemoryConfig {
  /** Maximum number of items to keep in memory (default: unlimited) */
  maxItems?: number;
  /** Time to live for cached items in milliseconds (default: unlimited) */
  ttl?: number;
  /** Size configuration for memory cache */
  size?: CacheSizeConfig;
}

/**
 * Factory function for creating custom cache map instances
 */
export type CacheMapFactory<
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
> = (kta: [S, ...string[]]) => CacheMap<V, S, L1, L2, L3, L4, L5>;

/**
 * Cache options interface for configuring cache instances
 */
export interface Options<
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
> {
  /** The type of cache to use */
  cacheType: CacheType;

  /** Configuration for IndexedDB cache types */
  indexedDBConfig?: IndexedDBConfig;

  /** Configuration for web storage cache types */
  webStorageConfig?: WebStorageConfig;

  /** Configuration for memory cache type */
  memoryConfig?: MemoryConfig;

  /** Custom cache map factory for 'custom' cache type */
  customCacheMapFactory?: CacheMapFactory<V, S, L1, L2, L3, L4, L5>;

  /** Eviction strategy configuration - independent of cache implementation */
  evictionConfig?: EvictionStrategyConfigs;

  /** Whether to enable debug logging for cache operations */
  enableDebugLogging?: boolean;

  /** Whether to automatically sync with the API on cache misses */
  autoSync?: boolean;

  /** Cache expiration time in milliseconds (default: unlimited) */
  ttl?: number;

  /** Maximum number of retry attempts for failed operations */
  maxRetries?: number;

  /** Delay between retry attempts in milliseconds */
  retryDelay?: number;
}

/**
 * Default cache options
 */
const DEFAULT_CACHE_OPTIONS: Partial<Options<any, any, any, any, any, any, any>> = {
  cacheType: 'memory',
  enableDebugLogging: false,
  autoSync: true,
  maxRetries: 3,
  retryDelay: 1000,
  indexedDBConfig: {
    dbName: 'fjell-cache',
    version: 1,
    storeName: 'cache',
    size: {
      evictionPolicy: 'lru'
    }
  },
  webStorageConfig: {
    keyPrefix: 'fjell-cache:',
    compress: false,
    size: {
      evictionPolicy: 'lru'
    }
  },
  memoryConfig: {
    // No limits by default
    size: {
      evictionPolicy: 'lru'
    }
  }
};

/**
 * Create cache options with defaults
 */
export const createOptions = <
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
>(cacheOptions?: Partial<Options<V, S, L1, L2, L3, L4, L5>>): Options<V, S, L1, L2, L3, L4, L5> => {
  // Deep clone nested config objects to prevent mutation between instances
  const indexedDBConfig = cacheOptions?.indexedDBConfig ? {
    ...DEFAULT_CACHE_OPTIONS.indexedDBConfig,
    ...cacheOptions.indexedDBConfig,
    size: cacheOptions.indexedDBConfig.size ? {
      ...DEFAULT_CACHE_OPTIONS.indexedDBConfig?.size,
      ...cacheOptions.indexedDBConfig.size
    } : DEFAULT_CACHE_OPTIONS.indexedDBConfig?.size
  } : { ...DEFAULT_CACHE_OPTIONS.indexedDBConfig };

  const webStorageConfig = cacheOptions?.webStorageConfig ? {
    ...DEFAULT_CACHE_OPTIONS.webStorageConfig,
    ...cacheOptions.webStorageConfig,
    size: cacheOptions.webStorageConfig.size ? {
      ...DEFAULT_CACHE_OPTIONS.webStorageConfig?.size,
      ...cacheOptions.webStorageConfig.size
    } : DEFAULT_CACHE_OPTIONS.webStorageConfig?.size
  } : { ...DEFAULT_CACHE_OPTIONS.webStorageConfig };

  const memoryConfig = cacheOptions?.memoryConfig ? {
    ...DEFAULT_CACHE_OPTIONS.memoryConfig,
    ...cacheOptions.memoryConfig,
    size: cacheOptions.memoryConfig.size ? {
      ...DEFAULT_CACHE_OPTIONS.memoryConfig?.size,
      ...cacheOptions.memoryConfig.size
    } : DEFAULT_CACHE_OPTIONS.memoryConfig?.size
  } : { ...DEFAULT_CACHE_OPTIONS.memoryConfig };

  return {
    ...DEFAULT_CACHE_OPTIONS,
    ...cacheOptions,
    indexedDBConfig,
    webStorageConfig,
    memoryConfig
  } as Options<V, S, L1, L2, L3, L4, L5>;
};

/**
 * Create a cache map instance based on the provided options
 */
export const createCacheMap = <
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
>(
    kta: [S, ...string[]],
    options: Options<V, S, L1, L2, L3, L4, L5>
  ): CacheMap<V, S, L1, L2, L3, L4, L5> => {
  switch (options.cacheType) {
    case 'memory':
      // Use enhanced memory cache if size configuration is provided
      if (options.memoryConfig?.size &&
          (options.memoryConfig.size.maxSizeBytes || options.memoryConfig.size.maxItems)) {
        return new EnhancedMemoryCacheMap<V, S, L1, L2, L3, L4, L5>(
          kta as any,
          options.memoryConfig.size
        );
      }
      return new MemoryCacheMap<V, S, L1, L2, L3, L4, L5>(kta as any);

    case 'localStorage':
      return new LocalStorageCacheMap<V, S, L1, L2, L3, L4, L5>(
        kta as any,
        options.webStorageConfig?.keyPrefix
      );

    case 'sessionStorage':
      return new SessionStorageCacheMap<V, S, L1, L2, L3, L4, L5>(
        kta as any,
        options.webStorageConfig?.keyPrefix
      );

    case 'indexedDB':
      return new IndexDBCacheMap<V, S, L1, L2, L3, L4, L5>(
        kta as any,
        options.indexedDBConfig?.dbName,
        options.indexedDBConfig?.storeName,
        options.indexedDBConfig?.version
      );

    case 'asyncIndexedDB':
      return new AsyncIndexDBCacheMap<V, S, L1, L2, L3, L4, L5>(
        kta as any,
        options.indexedDBConfig?.dbName,
        options.indexedDBConfig?.storeName,
        options.indexedDBConfig?.version
      ) as any;

    case 'custom':
      if (!options.customCacheMapFactory) {
        throw new Error('Custom cache map factory is required when cacheType is "custom"');
      }
      return options.customCacheMapFactory(kta);

    default:
      throw new Error(`Unsupported cache type: ${options.cacheType}`);
  }
};

/**
 * Validate cache options
 */
export const validateOptions = <
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
>(options: Options<V, S, L1, L2, L3, L4, L5>): void => {
  if (options.cacheType === 'custom' && !options.customCacheMapFactory) {
    throw new Error('customCacheMapFactory is required when cacheType is "custom"');
  }

  if (typeof options.maxRetries === 'number' && options.maxRetries < 0) {
    throw new Error('maxRetries must be non-negative');
  }

  if (typeof options.retryDelay === 'number' && options.retryDelay < 0) {
    throw new Error('retryDelay must be non-negative');
  }

  if (typeof options.ttl === 'number' && options.ttl <= 0) {
    throw new Error('ttl must be positive');
  }

  if (typeof options.memoryConfig?.maxItems === 'number' && options.memoryConfig.maxItems <= 0) {
    throw new Error('memoryConfig.maxItems must be positive');
  }

  if (typeof options.memoryConfig?.ttl === 'number' && options.memoryConfig.ttl <= 0) {
    throw new Error('memoryConfig.ttl must be positive');
  }

  // Validate size configurations
  if (options.memoryConfig?.size) {
    validateSizeConfig(options.memoryConfig.size);
  }
  if (options.webStorageConfig?.size) {
    validateSizeConfig(options.webStorageConfig.size);
  }
  if (options.indexedDBConfig?.size) {
    validateSizeConfig(options.indexedDBConfig.size);
  }

  // Browser storage validation
  if (['localStorage', 'sessionStorage'].includes(options.cacheType)) {
    if (typeof window === 'undefined' || !window[options.cacheType as 'localStorage' | 'sessionStorage']) {
      throw new Error(`${options.cacheType} is not available in non-browser environments`);
    }
  }

  // IndexedDB validation
  if (['indexedDB', 'asyncIndexedDB'].includes(options.cacheType)) {
    if (typeof window === 'undefined' || !window.indexedDB) {
      throw new Error(`${options.cacheType} is not available in this environment`);
    }
  }
};
