import { Item } from "@fjell/core";
import { Instance as BaseInstance, Registry } from "@fjell/registry";
import { ClientApi } from "@fjell/client-api";
import { CacheMap } from "./CacheMap";
import { createOperations, Operations } from "./Operations";
import { createCacheMap, createOptions, Options } from "./Options";
import { EvictionManager } from "./eviction/EvictionManager";
import { createEvictionStrategy } from "./eviction/EvictionStrategyFactory";
import { TTLManager } from "./ttl/TTLManager";
import LibLogger from "./logger";
import { CacheEventEmitter } from "./events/CacheEventEmitter";
import { CacheEventListener, CacheSubscription, CacheSubscriptionOptions } from "./events/CacheEventTypes";
import { CacheEventFactory } from "./events/CacheEventFactory";
import { CacheStats, CacheStatsManager } from "./CacheStats";
import { Coordinate } from "@fjell/core";

const logger = LibLogger.get('Cache');

/**
 * Cache configuration information exposed to client applications
 */
export interface CacheInfo {
  /** The implementation type in format "<category>/<implementation>" */
  implementationType: string;
  /** The eviction policy being used (if any) */
  evictionPolicy?: string;
  /** Default TTL in milliseconds (if configured) */
  defaultTTL?: number;
  /** Whether TTL is supported by this implementation */
  supportsTTL: boolean;
  /** Whether eviction is supported by this implementation */
  supportsEviction: boolean;
}

/**
 * The Cache interface extends the base Instance from @fjell/registry and adds cache operations
 * for interacting with cached data.
 *
 * The interface extends the base Instance (which provides coordinate and registry) with:
 * - api: Provides methods for interacting with server API
 * - cacheMap: Local cache storage for items
 * - operations: All cache operations (get, set, all, etc.) that work with both cache and API
 *
 * @template V - The type of the data model item, extending Item
 * @template S - The string literal type representing the model's key type
 * @template L1-L5 - Optional string literal types for location hierarchy levels
 */
export interface Cache<
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
> extends BaseInstance<S, L1, L2, L3, L4, L5> {
  /** The API client for interacting with server endpoints */
  api: ClientApi<V, S, L1, L2, L3, L4, L5>;

  /** The cache map that stores cached items */
  cacheMap: CacheMap<V, S, L1, L2, L3, L4, L5>;

  /** All cache operations that work with both cache and API */
  operations: Operations<V, S, L1, L2, L3, L4, L5>;

  /** Cache configuration options */
  options?: Options<V, S, L1, L2, L3, L4, L5>;

  /** Event emitter for cache events */
  eventEmitter: CacheEventEmitter<V, S, L1, L2, L3, L4, L5>;

  /** Eviction manager for handling cache eviction independently of storage */
  evictionManager: EvictionManager;

  /** TTL manager for handling time-to-live independently of storage */
  ttlManager: TTLManager;

  /** Statistics manager for tracking cache metrics */
  statsManager: CacheStatsManager;

  /**
   * Get cache configuration information for client applications
   * Provides visibility into implementation type, eviction policy, TTL settings, and capabilities
   */
  getCacheInfo(): CacheInfo;

  /**
   * Get current cache statistics
   * @returns Current cache statistics including hits, misses, requests, and subscription counts
   */
  getStats(): CacheStats;

  /**
   * Subscribe to cache events
   * @param listener Function to call when events occur
   * @param options Optional filters for which events to receive
   * @returns Subscription object with unsubscribe method
   */
  subscribe(
    listener: CacheEventListener<V, S, L1, L2, L3, L4, L5>,
    options?: CacheSubscriptionOptions<S, L1, L2, L3, L4, L5>
  ): CacheSubscription;

  /**
   * Unsubscribe from cache events
   * @param subscription Subscription to cancel
   * @returns True if subscription was found and cancelled
   */
  unsubscribe(subscription: CacheSubscription): boolean;

  /**
   * Destroy the cache and clean up all resources
   */
  destroy(): void;
}

export const createCache = <
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
>(
    api: ClientApi<V, S, L1, L2, L3, L4, L5>,
    coordinate: Coordinate<S, L1, L2, L3, L4, L5>,
    registry: Registry,
    options?: Partial<Options<V, S, L1, L2, L3, L4, L5>>
  ): Cache<V, S, L1, L2, L3, L4, L5> => {
  logger.debug('createCache', { coordinate, registry, options });

  // Create complete options with defaults
  const completeOptions = createOptions(options);

  // Create the cache map using the options
  const cacheMap = createCacheMap<V, S, L1, L2, L3, L4, L5>(coordinate.kta, completeOptions);

  // Get the primary key type from the coordinate
  const pkType = coordinate.kta[0] as S;

  // Create event emitter
  const eventEmitter = new CacheEventEmitter<V, S, L1, L2, L3, L4, L5>();

  // Create eviction manager
  const evictionManager = new EvictionManager();

  // Determine eviction configuration - prioritize top-level evictionConfig
  const evictionConfig = completeOptions.evictionConfig;
  if (!evictionConfig &&
    completeOptions.memoryConfig?.size?.evictionPolicy &&
    (completeOptions.memoryConfig.size.maxItems || completeOptions.memoryConfig.size.maxSizeBytes)) {
  }

  if (evictionConfig) {
    // Set eviction strategy from unified config
    const strategy = createEvictionStrategy(
      evictionConfig.type || 'lru',
      completeOptions.memoryConfig?.maxItems,
      evictionConfig
    );
    evictionManager.setEvictionStrategy(strategy);
  }

  // Create TTL manager with proper configuration priority: memoryConfig.ttl || ttl
  const ttlManager = new TTLManager({
    defaultTTL: completeOptions.ttl,
    autoCleanup: true,
    validateOnAccess: true
  });

  // Create statistics manager
  const statsManager = new CacheStatsManager();

  // Note: EvictionManager operates independently of CacheMap implementations
  // and is passed through CacheContext to operations for external eviction management

  // Create operations with event emitter, eviction manager, and stats manager
  const operations = createOperations(api, coordinate, cacheMap, pkType, completeOptions, eventEmitter, ttlManager, evictionManager, statsManager, registry);

  const cache = {
    coordinate,
    registry,
    api,
    cacheMap,
    operations,
    options: completeOptions,
    eventEmitter,
    evictionManager,
    ttlManager,
    statsManager,
    getCacheInfo: () => {
      const evictionStrategyName = evictionManager.getEvictionStrategyName();
      const cacheInfo: CacheInfo = {
        implementationType: cacheMap.implementationType,
        defaultTTL: ttlManager.getDefaultTTL(),
        // Cache supports TTL if the CacheMap supports it OR if TTL is configured
        supportsTTL: (cacheMap as any).supportsTTL?.() || !!ttlManager.getDefaultTTL(),
        supportsEviction: evictionManager.isEvictionSupported()
      };

      if (evictionStrategyName) {
        cacheInfo.evictionPolicy = evictionStrategyName;
      }

      return cacheInfo;
    },
    getStats: () => statsManager.getStats(),
    subscribe: (listener, options) => {
      statsManager.incrementSubscriptions();
      const subscription = eventEmitter.subscribe(listener, options);
      return subscription;
    },
    unsubscribe: (subscription) => {
      const result = eventEmitter.unsubscribe(subscription.id);
      if (result) {
        statsManager.incrementUnsubscriptions();
      }
      return result;
    },
    destroy: () => {
      // Clean up event emitter
      eventEmitter.destroy();

      // Clean up TTL manager
      if (ttlManager && typeof ttlManager.destroy === 'function') {
        ttlManager.destroy();
      }

      // Clean up eviction manager (EvictionManager doesn't need explicit cleanup)
      // evictionManager is stateless and doesn't require destruction

      // Clean up cache map if it has a destroy method
      if (cacheMap && typeof (cacheMap as any).destroy === 'function') {
        (cacheMap as any).destroy();
      }

      // Notify CacheEventFactory that an instance is being destroyed
      CacheEventFactory.destroyInstance();
    }
  } as Cache<V, S, L1, L2, L3, L4, L5>;

  return cache;
};

export const isCache = (cache: any): cache is Cache<any, any, any, any, any, any, any> => {
  return cache !== null &&
    typeof cache === 'object' &&
    'coordinate' in cache &&
    'registry' in cache &&
    'api' in cache &&
    'cacheMap' in cache &&
    'operations' in cache;
};
