import { Item } from '@fjell/core';
import { CacheMap } from './CacheMap';
import { MemoryCacheMap } from './memory/MemoryCacheMap';
import { EnhancedMemoryCacheMap } from './memory/EnhancedMemoryCacheMap';
import { LocalStorageCacheMap } from './browser/LocalStorageCacheMap';
import { SessionStorageCacheMap } from './browser/SessionStorageCacheMap';
import { IndexDBCacheMap } from './browser/IndexDBCacheMap';
import { TwoLayerCacheOptions } from './cache/types/TwoLayerTypes';
import { TwoLayerCacheMap } from './cache/layers/TwoLayerCacheMap';
import { TTLConfig } from './ttl/TTLConfig';

import { validateSizeConfig } from './utils/CacheSize';
import { EvictionStrategyConfigs } from './eviction/EvictionStrategyConfig';
import LibLogger from './logger';

const logger = LibLogger.get('Options');

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
  /** @deprecated Eviction policy is now handled by Cache-level EvictionManager via evictionConfig */
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

  /** Whether to completely bypass cache and always fetch from API */
  bypassCache?: boolean;

  /** Maximum number of retry attempts for failed operations */
  maxRetries?: number;

  /** Delay between retry attempts in milliseconds */
  retryDelay?: number;

  /** Two-layer cache configuration for preventing cache poisoning */
  twoLayer?: TwoLayerCacheOptions;

  /** Enhanced TTL configuration for smart cache expiration */
  ttlConfig?: TTLConfig;
}

/**
 * Default cache options
 */
const DEFAULT_CACHE_OPTIONS: Partial<Options<any, any, any, any, any, any, any>> = {
  cacheType: 'memory',
  enableDebugLogging: false,
  autoSync: true,
  bypassCache: false,
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

  const result = {
    ...DEFAULT_CACHE_OPTIONS,
    ...cacheOptions,
    indexedDBConfig,
    webStorageConfig,
    memoryConfig
  } as Options<V, S, L1, L2, L3, L4, L5>;

  // Validate the final options to catch any typos or invalid configurations
  validateOptions(result);

  return result;
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
  
  // First create the underlying cache implementation
  let underlyingCache: CacheMap<V, S, L1, L2, L3, L4, L5>;
  
  switch (options.cacheType) {
    case 'memory':
      // Use enhanced memory cache if size configuration is provided
      if (options.memoryConfig?.size &&
        (options.memoryConfig.size.maxSizeBytes || options.memoryConfig.size.maxItems)) {
        // Create size config without evictionPolicy since that's handled by Cache-level EvictionManager
        const sizeConfig = {
          maxSizeBytes: options.memoryConfig.size.maxSizeBytes,
          maxItems: options.memoryConfig.size.maxItems
        };
        underlyingCache = new EnhancedMemoryCacheMap<V, S, L1, L2, L3, L4, L5>(
          kta as any,
          sizeConfig
        );
      } else {
        underlyingCache = new MemoryCacheMap<V, S, L1, L2, L3, L4, L5>(kta as any);
      }
      break;

    case 'localStorage':
      underlyingCache = new LocalStorageCacheMap<V, S, L1, L2, L3, L4, L5>(
        kta as any,
        options.webStorageConfig?.keyPrefix
      );
      break;

    case 'sessionStorage':
      underlyingCache = new SessionStorageCacheMap<V, S, L1, L2, L3, L4, L5>(
        kta as any,
        options.webStorageConfig?.keyPrefix
      );
      break;

    case 'indexedDB':
      underlyingCache = new IndexDBCacheMap<V, S, L1, L2, L3, L4, L5>(
        kta as any,
        options.indexedDBConfig?.dbName,
        options.indexedDBConfig?.storeName,
        options.indexedDBConfig?.version
      );
      break;

    case 'custom':
      if (!options.customCacheMapFactory) {
        logger.error('Custom cache map factory missing', {
          component: 'cache',
          operation: 'createCacheMap',
          cacheType: 'custom',
          suggestion: 'Provide customCacheMapFactory function in cache options when using cacheType: "custom"'
        });
        throw new Error(
          'Custom cache map factory is required when cacheType is "custom". ' +
          'Provide customCacheMapFactory in cache options.'
        );
      }
      underlyingCache = options.customCacheMapFactory(kta);
      break;

    default:
      logger.error('Unsupported cache type', {
        component: 'cache',
        operation: 'createCacheMap',
        cacheType: options.cacheType,
        validTypes: ['memory', 'localStorage', 'sessionStorage', 'indexedDB', 'asyncIndexedDB', 'custom'],
        suggestion: 'Use one of: memory, localStorage, sessionStorage, indexedDB, asyncIndexedDB, or custom'
      });
      throw new Error(
        `Unsupported cache type: ${options.cacheType}. ` +
        `Valid types: memory, localStorage, sessionStorage, indexedDB, asyncIndexedDB, custom.`
      );
  }

  // Wrap with TwoLayerCacheMap if two-layer caching is enabled
  if (options.twoLayer && Object.keys(options.twoLayer).length > 0) {
    return new TwoLayerCacheMap<V, S, L1, L2, L3, L4, L5>(underlyingCache, options.twoLayer);
  }

  // Return the underlying cache if two-layer is not enabled
  return underlyingCache;
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
  // First, validate that no unknown properties are present
  const validProperties = new Set([
    // Core options
    'cacheType',
    'enableDebugLogging',
    'autoSync',
    'ttl',
    'bypassCache',
    'maxRetries',
    'retryDelay',

    // Config objects
    'indexedDBConfig',
    'webStorageConfig',
    'memoryConfig',
    'customCacheMapFactory',
    'evictionConfig',
    
    // Two-layer cache configuration
    'twoLayer'
  ]);

  // Check for unknown properties and suggest corrections
  const unknownProperties: string[] = [];
  const propertySuggestions: Record<string, string[]> = {
    'byPassCache': ['bypassCache'],
    'bypasscache': ['bypassCache'],
    'bypass_cache': ['bypassCache'],
    'cacheType': ['cacheType'],
    'cachetype': ['cacheType'],
    'cache_type': ['cacheType'],
    'enableDebugLogging': ['enableDebugLogging'],
    'enabledebuglogging': ['enableDebugLogging'],
    'enable_debug_logging': ['enableDebugLogging'],
    'autoSync': ['autoSync'],
    'autosync': ['autoSync'],
    'auto_sync': ['autoSync'],
    'maxRetries': ['maxRetries'],
    'maxretries': ['maxRetries'],
    'max_retries': ['maxRetries'],
    'retryDelay': ['retryDelay'],
    'retrydelay': ['retryDelay'],
    'retry_delay': ['retryDelay'],
    'indexedDBConfig': ['indexedDBConfig'],
    'indexeddbconfig': ['indexedDBConfig'],
    'indexed_db_config': ['indexedDBConfig'],
    'webStorageConfig': ['webStorageConfig'],
    'webstorageconfig': ['webStorageConfig'],
    'web_storage_config': ['webStorageConfig'],
    'memoryConfig': ['memoryConfig'],
    'memoryconfig': ['memoryConfig'],
    'memory_config': ['memoryConfig'],
    'customCacheMapFactory': ['customCacheMapFactory'],
    'customcachemapfactory': ['customCacheMapFactory'],
    'custom_cache_map_factory': ['customCacheMapFactory'],
    'evictionConfig': ['evictionConfig'],
    'evictionconfig': ['evictionConfig'],
    'eviction_config': ['evictionConfig']
  };

  for (const [key, value] of Object.entries(options)) {
    if (!validProperties.has(key)) {
      unknownProperties.push(key);
    }
  }

  if (unknownProperties.length > 0) {
    const suggestions = unknownProperties.map(prop => {
      const suggestion = propertySuggestions[prop];
      if (suggestion) {
        return `"${prop}" → "${suggestion[0]}"`;
      }
      return `"${prop}"`;
    });

    const errorMessage = `Unknown configuration properties detected: ${unknownProperties.join(', ')}.\n` +
      `Valid properties are: ${Array.from(validProperties).join(', ')}.\n` +
      `Did you mean: ${suggestions.join(', ')}?`;

    throw new Error(errorMessage);
  }

  // Validate required properties
  if (options.cacheType === 'custom' && !options.customCacheMapFactory) {
    throw new Error(
      'customCacheMapFactory is required when cacheType is "custom". ' +
      'Provide a factory function that creates your custom CacheMap implementation.'
    );
  }

  if (typeof options.maxRetries === 'number' && options.maxRetries < 0) {
    throw new Error(
      `maxRetries must be non-negative, got ${options.maxRetries}. ` +
      `Suggestion: Use 0 or positive integer for retry attempts.`
    );
  }

  if (typeof options.retryDelay === 'number' && options.retryDelay < 0) {
    throw new Error(
      `retryDelay must be non-negative, got ${options.retryDelay}ms. ` +
      `Suggestion: Use 0 or positive number for delay in milliseconds.`
    );
  }

  if (typeof options.ttl === 'number' && options.ttl <= 0) {
    throw new Error(
      `ttl must be positive, got ${options.ttl}. ` +
      `Suggestion: Use positive number for TTL in seconds, or 0 to disable TTL.`
    );
  }

  if (typeof options.memoryConfig?.maxItems === 'number' && options.memoryConfig.maxItems <= 0) {
    throw new Error(
      `memoryConfig.maxItems must be positive, got ${options.memoryConfig.maxItems}. ` +
      `Suggestion: Use positive integer for maximum cache items.`
    );
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

  // Validate nested configuration objects for unknown properties
  if (options.indexedDBConfig) {
    const validIndexedDBProps = new Set(['dbName', 'version', 'storeName', 'size']);
    const unknownIndexedDBProps = Object.keys(options.indexedDBConfig).filter(key => !validIndexedDBProps.has(key));

    if (unknownIndexedDBProps.length > 0) {
      const suggestions = unknownIndexedDBProps.map(prop => {
        const suggestion = {
          'dbname': 'dbName',
          'db_name': 'dbName',
          'storename': 'storeName',
          'store_name': 'storeName'
        }[prop];
        return suggestion ? `"${prop}" → "${suggestion}"` : `"${prop}"`;
      });

      throw new Error(`Unknown IndexedDB configuration properties: ${unknownIndexedDBProps.join(', ')}.\n` +
        `Valid properties are: ${Array.from(validIndexedDBProps).join(', ')}.\n` +
        `Did you mean: ${suggestions.join(', ')}?`);
    }
  }

  if (options.webStorageConfig) {
    const validWebStorageProps = new Set(['keyPrefix', 'compress', 'size']);
    const unknownWebStorageProps = Object.keys(options.webStorageConfig).filter(key => !validWebStorageProps.has(key));

    if (unknownWebStorageProps.length > 0) {
      const suggestions = unknownWebStorageProps.map(prop => {
        const suggestion = {
          'keyprefix': 'keyPrefix',
          'key_prefix': 'keyPrefix'
        }[prop];
        return suggestion ? `"${prop}" → "${suggestion}"` : `"${prop}"`;
      });

      throw new Error(`Unknown WebStorage configuration properties: ${unknownWebStorageProps.join(', ')}.\n` +
        `Valid properties are: ${Array.from(validWebStorageProps).join(', ')}.\n` +
        `Did you mean: ${suggestions.join(', ')}?`);
    }
  }

  if (options.memoryConfig) {
    const validMemoryProps = new Set(['maxItems', 'size']);
    const unknownMemoryProps = Object.keys(options.memoryConfig).filter(key => !validMemoryProps.has(key));

    if (unknownMemoryProps.length > 0) {
      const suggestions = unknownMemoryProps.map(prop => {
        const suggestion = {
          'maxitems': 'maxItems',
          'max_items': 'maxItems'
        }[prop];
        return suggestion ? `"${prop}" → "${suggestion}"` : `"${prop}"`;
      });

      throw new Error(`Unknown Memory configuration properties: ${unknownMemoryProps.join(', ')}.\n` +
        `Valid properties are: ${Array.from(validMemoryProps).join(', ')}.\n` +
        `Did you mean: ${suggestions.join(', ')}?`);
    }
  }

  // Validate eviction config for unknown properties
  if (options.evictionConfig) {
    const validEvictionProps = new Set(['type', 'config']);
    const unknownEvictionProps = Object.keys(options.evictionConfig).filter(key => !validEvictionProps.has(key));

    if (unknownEvictionProps.length > 0) {
      const suggestions = unknownEvictionProps.map(prop => {
        const suggestion = {
          'evictionstrategy': 'type',
          'eviction_strategy': 'type',
          'evictionconfig': 'config',
          'eviction_config': 'config'
        }[prop];
        return suggestion ? `"${prop}" → "${suggestion}"` : `"${prop}"`;
      });

      throw new Error(`Unknown Eviction configuration properties: ${unknownEvictionProps.join(', ')}.\n` +
        `Valid properties are: ${Array.from(validEvictionProps).join(', ')}.\n` +
        `Did you mean: ${suggestions.join(', ')}?`);
    }

    // Validate eviction strategy type
    if (options.evictionConfig.type) {
      const validTypes = new Set(['lru', 'lfu', 'fifo', 'mru', 'random', 'arc', '2q']);
      if (!validTypes.has(options.evictionConfig.type)) {
        const suggestions = {
          'LRU': 'lru',
          'LFU': 'lfu',
          'FIFO': 'fifo',
          'MRU': 'mru',
          'RANDOM': 'random',
          'ARC': 'arc',
          '2Q': '2q',
          'twoqueue': '2q',
          'two_queue': '2q'
        }[options.evictionConfig.type];

        const suggestionText = suggestions ? ` Did you mean "${suggestions}"?` : '';
        throw new Error(`Invalid eviction strategy type: "${options.evictionConfig.type}".` +
          ` Valid types are: ${Array.from(validTypes).join(', ')}.${suggestionText}`);
      }
    }
  }

  // Browser storage validation
  if (['localStorage', 'sessionStorage'].includes(options.cacheType)) {
    // Check if we're in a real browser environment
    const isRealBrowser = typeof window !== 'undefined' &&
      typeof window.document !== 'undefined' &&
      typeof window.document.createElement === 'function';

    if (!isRealBrowser) {
      logger.error('Browser cache type used in non-browser environment', {
        component: 'cache',
        operation: 'validateOptions',
        cacheType: options.cacheType,
        environment: typeof window === 'undefined' ? 'node' : 'unknown',
        suggestion: 'Use cacheType: "memory" for Node.js/server environments, or ensure code runs in browser'
      });
      throw new Error(
        `${options.cacheType} is not available in non-browser environments. ` +
        `Detected environment: ${typeof window === 'undefined' ? 'Node.js/server' : 'non-browser'}. ` +
        `Suggestion: Use cacheType: "memory" for server-side caching.`
      );
    }
  }

  // IndexedDB validation
  if (options.cacheType === 'indexedDB') {
    if (typeof window === 'undefined' || !window.indexedDB) {
      logger.error('IndexedDB not available', {
        component: 'cache',
        operation: 'validateOptions',
        cacheType: 'indexedDB',
        hasWindow: typeof window !== 'undefined',
        hasIndexedDB: typeof window !== 'undefined' && !!window.indexedDB,
        suggestion: 'Use memory cache for Node.js, or check browser IndexedDB support'
      });
      throw new Error(
        `IndexedDB is not available in this environment. ` +
        `Browser support required. ` +
        `Suggestion: Use cacheType: "memory" for server-side or unsupported browsers.`
      );
    }
  }

  // AsyncIndexedDB validation - should not be used with synchronous cache factory
  if (options.cacheType === 'asyncIndexedDB') {
    logger.error('AsyncIndexedDB cannot be used with sync factory', {
      component: 'cache',
      operation: 'validateOptions',
      cacheType: 'asyncIndexedDB',
      suggestion: 'Use AsyncIndexDBCacheMap directly for async operations, or use cacheType: "indexedDB" for sync wrapper'
    });
    throw new Error(
      'asyncIndexedDB cannot be used with synchronous cache factory. ' +
      'Use AsyncIndexDBCacheMap directly for async operations, or use cacheType: "indexedDB" for the sync wrapper.'
    );
  }
};
