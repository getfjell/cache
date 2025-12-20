import {
  AllItemTypeArrays,
  Item
} from "@fjell/types";
import { CacheMap } from "../CacheMap";
import { TwoLayerCacheMap } from "./layers/TwoLayerCacheMap";
import { TwoLayerCacheOptions } from "./types/TwoLayerTypes";
import { MemoryCacheMap } from "../memory/MemoryCacheMap";
import { EnhancedMemoryCacheMap } from "../memory/EnhancedMemoryCacheMap";
import { IndexDBCacheMap } from "../browser/IndexDBCacheMap";
import { LocalStorageCacheMap } from "../browser/LocalStorageCacheMap";
import { SessionStorageCacheMap } from "../browser/SessionStorageCacheMap";
import LibLogger from "../logger";

const logger = LibLogger.get('TwoLayerFactory');

/**
 * Configuration for creating two-layer cache instances
 */
export interface TwoLayerConfig {
  enabled: boolean;
  itemLayer: {
    type: 'memory' | 'enhanced-memory' | 'localStorage' | 'sessionStorage' | 'indexedDB';
    options?: any;
  };
  queryLayer?: {
    // Query layer uses same implementation as item layer by default
    // but can be overridden for hybrid approaches
    type?: 'memory' | 'enhanced-memory' | 'localStorage' | 'sessionStorage' | 'indexedDB';
    options?: any;
  };
  options?: TwoLayerCacheOptions;
}

/**
 * Factory for creating two-layer cache instances that work with any CacheMap implementation
 */
export class TwoLayerFactory {
  
  /**
   * Create a two-layer cache by wrapping an existing CacheMap implementation
   */
  static create<
    V extends Item<S, L1, L2, L3, L4, L5>,
    S extends string,
    L1 extends string = never,
    L2 extends string = never,
    L3 extends string = never,
    L4 extends string = never,
    L5 extends string = never
  >(
    underlyingCache: CacheMap<V, S, L1, L2, L3, L4, L5>,
    options: TwoLayerCacheOptions = {}
  ): TwoLayerCacheMap<V, S, L1, L2, L3, L4, L5> {
    
    return new TwoLayerCacheMap(underlyingCache, options);
  }

  /**
   * Create a two-layer cache from configuration
   */
  static createFromConfig<
    V extends Item<S, L1, L2, L3, L4, L5>,
    S extends string,
    L1 extends string = never,
    L2 extends string = never,
    L3 extends string = never,
    L4 extends string = never,
    L5 extends string = never
  >(
    types: AllItemTypeArrays<S, L1, L2, L3, L4, L5>,
    config: TwoLayerConfig
  ): TwoLayerCacheMap<V, S, L1, L2, L3, L4, L5> | CacheMap<V, S, L1, L2, L3, L4, L5> {
    
    if (!config.enabled) {
      // Return a regular cache implementation if two-layer is disabled
      return this.createSingleLayerCache(types, config.itemLayer);
    }

    // Create the underlying cache based on item layer configuration
    const underlyingCache = this.createSingleLayerCache<V, S, L1, L2, L3, L4, L5>(types, config.itemLayer);

    // Wrap it with two-layer functionality
    const twoLayerCache = new TwoLayerCacheMap(underlyingCache, config.options);

    logger.debug('Created two-layer cache from config', {
      itemLayerType: config.itemLayer.type,
      queryTTL: config.options?.queryTTL,
      facetTTL: config.options?.facetTTL
    });

    return twoLayerCache;
  }

  /**
   * Create appropriate memory-based two-layer cache based on environment
   */
  static createMemoryTwoLayer<
    V extends Item<S, L1, L2, L3, L4, L5>,
    S extends string,
    L1 extends string = never,
    L2 extends string = never,
    L3 extends string = never,
    L4 extends string = never,
    L5 extends string = never
  >(
    types: AllItemTypeArrays<S, L1, L2, L3, L4, L5>,
    options: TwoLayerCacheOptions = {}
  ): TwoLayerCacheMap<V, S, L1, L2, L3, L4, L5> {
    
    const underlyingCache = new MemoryCacheMap<V, S, L1, L2, L3, L4, L5>(types);
    return new TwoLayerCacheMap(underlyingCache, options);
  }

  /**
   * Create enhanced memory two-layer cache with size limits
   */
  static createEnhancedMemoryTwoLayer<
    V extends Item<S, L1, L2, L3, L4, L5>,
    S extends string,
    L1 extends string = never,
    L2 extends string = never,
    L3 extends string = never,
    L4 extends string = never,
    L5 extends string = never
  >(
    types: AllItemTypeArrays<S, L1, L2, L3, L4, L5>,
    sizeConfig: { maxItems?: number; maxSizeBytes?: string } = {},
    twoLayerOptions: TwoLayerCacheOptions = {}
  ): TwoLayerCacheMap<V, S, L1, L2, L3, L4, L5> {
    
    const underlyingCache = new EnhancedMemoryCacheMap<V, S, L1, L2, L3, L4, L5>(
      types,
      sizeConfig,
      undefined
    );
    return new TwoLayerCacheMap(underlyingCache, twoLayerOptions);
  }

  /**
   * Create IndexedDB-based two-layer cache for browser environments
   */
  static createIndexedDBTwoLayer<
    V extends Item<S, L1, L2, L3, L4, L5>,
    S extends string,
    L1 extends string = never,
    L2 extends string = never,
    L3 extends string = never,
    L4 extends string = never,
    L5 extends string = never
  >(
    types: AllItemTypeArrays<S, L1, L2, L3, L4, L5>,
    dbConfig: {
      dbName?: string;
      version?: number;
      storeName?: string;
    } = {},
    twoLayerOptions: TwoLayerCacheOptions = {}
  ): TwoLayerCacheMap<V, S, L1, L2, L3, L4, L5> {
    
    const config = {
      dbName: 'fjell-cache-items',
      storeName: 'items',
      version: 1,
      ...dbConfig
    };

    const underlyingCache = new IndexDBCacheMap<V, S, L1, L2, L3, L4, L5>(
      types,
      config.dbName,
      config.storeName,
      config.version
    );
    return new TwoLayerCacheMap(underlyingCache, twoLayerOptions);
  }

  /**
   * Create localStorage-based two-layer cache with space management
   */
  static createLocalStorageTwoLayer<
    V extends Item<S, L1, L2, L3, L4, L5>,
    S extends string,
    L1 extends string = never,
    L2 extends string = never,
    L3 extends string = never,
    L4 extends string = never,
    L5 extends string = never
  >(
    types: AllItemTypeArrays<S, L1, L2, L3, L4, L5>,
    storageConfig: {
      keyPrefix?: string;
      compress?: boolean;
      maxSizeBytes?: number;
    } = {},
    twoLayerOptions: TwoLayerCacheOptions = {}
  ): TwoLayerCacheMap<V, S, L1, L2, L3, L4, L5> {
    
    const config = {
      keyPrefix: 'fjell:i:',
      compress: false,
      ...storageConfig
    };

    const underlyingCache = new LocalStorageCacheMap<V, S, L1, L2, L3, L4, L5>(types, config.keyPrefix);
    return new TwoLayerCacheMap(underlyingCache, {
      // Shorter TTLs for localStorage due to space constraints
      queryTTL: 180,  // 3 minutes instead of 5
      facetTTL: 30,   // 30 seconds instead of 1 minute
      ...twoLayerOptions
    });
  }

  /**
   * Create sessionStorage-based two-layer cache
   */
  static createSessionStorageTwoLayer<
    V extends Item<S, L1, L2, L3, L4, L5>,
    S extends string,
    L1 extends string = never,
    L2 extends string = never,
    L3 extends string = never,
    L4 extends string = never,
    L5 extends string = never
  >(
    types: AllItemTypeArrays<S, L1, L2, L3, L4, L5>,
    storageConfig: {
      keyPrefix?: string;
      compress?: boolean;
    } = {},
    twoLayerOptions: TwoLayerCacheOptions = {}
  ): TwoLayerCacheMap<V, S, L1, L2, L3, L4, L5> {
    
    const config = {
      keyPrefix: 'fjell:q:',
      compress: false,
      ...storageConfig
    };

    const underlyingCache = new SessionStorageCacheMap<V, S, L1, L2, L3, L4, L5>(types, config.keyPrefix);
    return new TwoLayerCacheMap(underlyingCache, {
      // Even shorter TTLs for sessionStorage
      queryTTL: 120,  // 2 minutes
      facetTTL: 30,   // 30 seconds
      ...twoLayerOptions
    });
  }

  /**
   * Create hybrid two-layer cache (localStorage for items, sessionStorage for queries)
   */
  static createHybridTwoLayer<
    V extends Item<S, L1, L2, L3, L4, L5>,
    S extends string,
    L1 extends string = never,
    L2 extends string = never,
    L3 extends string = never,
    L4 extends string = never,
    L5 extends string = never
  >(
    types: AllItemTypeArrays<S, L1, L2, L3, L4, L5>,
    twoLayerOptions: TwoLayerCacheOptions = {}
  ): TwoLayerCacheMap<V, S, L1, L2, L3, L4, L5> {
    
    // Use localStorage for items (persistent)
    const underlyingCache = new LocalStorageCacheMap<V, S, L1, L2, L3, L4, L5>(types, 'fjell:hybrid:');
    
    // Note: In a full hybrid implementation, we might want separate query storage
    // For now, this uses the same underlying cache but with hybrid-optimized settings
    return new TwoLayerCacheMap(underlyingCache, {
      itemTTL: 7200,   // 2 hours for persistent items
      queryTTL: 300,   // 5 minutes for queries
      facetTTL: 60,    // 1 minute for facets
      ...twoLayerOptions
    });
  }

  // ===== PRIVATE HELPER METHODS =====

  /**
   * Create a single-layer cache based on configuration
   */
  private static createSingleLayerCache<
    V extends Item<S, L1, L2, L3, L4, L5>,
    S extends string,
    L1 extends string = never,
    L2 extends string = never,
    L3 extends string = never,
    L4 extends string = never,
    L5 extends string = never
  >(
    types: AllItemTypeArrays<S, L1, L2, L3, L4, L5>,
    layerConfig: { type: string; options?: any }
  ): CacheMap<V, S, L1, L2, L3, L4, L5> {
    
    switch (layerConfig.type) {
      case 'memory':
        return new MemoryCacheMap(types);
      
      case 'enhanced-memory':
        return new EnhancedMemoryCacheMap(
          types,
          layerConfig.options || { maxItems: 10000 },
          undefined
        );
      
      case 'indexedDB':
        const indexedDBOptions = layerConfig.options || {};
        return new IndexDBCacheMap(
          types,
          indexedDBOptions.dbName || 'fjell-cache',
          indexedDBOptions.storeName || 'cache',
          indexedDBOptions.version || 1
        );
      
      case 'localStorage':
        const lsPrefix = layerConfig.options?.keyPrefix || 'fjell:cache:';
        return new LocalStorageCacheMap(types, lsPrefix);
      
      case 'sessionStorage':
        const ssPrefix = layerConfig.options?.keyPrefix || 'fjell:cache:';
        return new SessionStorageCacheMap(types, ssPrefix);
      
      default:
        logger.debug('Unknown cache type, falling back to memory', { type: layerConfig.type });
        return new MemoryCacheMap(types);
    }
  }

  /**
   * Auto-detect the best cache type for the current environment
   */
  static detectBestCacheType(): string {
    if (typeof window === 'undefined') {
      // Server environment
      return 'enhanced-memory';
    }

    // Browser environment
    if ('indexedDB' in window) {
      return 'indexedDB';
    } else if ('localStorage' in window) {
      return 'localStorage';
    } else {
      return 'memory';
    }
  }

  /**
   * Create auto-detected two-layer cache for current environment
   */
  static createAuto<
    V extends Item<S, L1, L2, L3, L4, L5>,
    S extends string,
    L1 extends string = never,
    L2 extends string = never,
    L3 extends string = never,
    L4 extends string = never,
    L5 extends string = never
  >(
    types: AllItemTypeArrays<S, L1, L2, L3, L4, L5>,
    options: TwoLayerCacheOptions = {}
  ): TwoLayerCacheMap<V, S, L1, L2, L3, L4, L5> {
    
    const bestType = this.detectBestCacheType();
    
    const config: TwoLayerConfig = {
      enabled: true,
      itemLayer: { type: bestType as any },
      options
    };

    const result = this.createFromConfig(types, config);
    
    // The result should always be a TwoLayerCacheMap since enabled: true
    return result as TwoLayerCacheMap<V, S, L1, L2, L3, L4, L5>;
  }
}
