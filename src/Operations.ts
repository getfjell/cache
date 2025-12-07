import {
  AffectedKeys,
  AllOperationResult,
  AllOptions,
  Operations as CoreOperations,
  createAllFacetWrapper,
  createAllWrapper,
  createCreateWrapper,
  createGetWrapper,
  createOneWrapper,
  CreateOptions,
  createRemoveWrapper,
  createUpdateWrapper,
  FindOperationResult,
  FindOptions,
  isOperationComKey as isComKey,
  isOperationPriKey as isPriKey,
  OperationParams
} from "@fjell/core";
import { ComKey, Item, ItemQuery, LocKeyArray, PriKey } from "@fjell/core";
import { ClientApi } from "@fjell/client-api";
import { Coordinate } from "@fjell/core";
import { Options } from "./Options";
import { Registry } from "@fjell/registry";
import LibLogger from "./logger";

// Import two-layer cache components
import { ItemCache } from "./cache/layers/ItemCache";
import { QueryCache } from "./cache/layers/QueryCache";
import { TwoLayerCacheMap } from "./cache/layers/TwoLayerCacheMap";
import { QueryMetadata, TwoLayerCacheOptions } from "./cache/types/TwoLayerTypes";

// Import traditional cache components
import { CacheMap } from "./CacheMap";
import { createCacheContext } from "./CacheContext";
import { CacheEventEmitter } from "./events/CacheEventEmitter";

// Import all operation functions
import { all } from "./ops/all";
import { one } from "./ops/one";
import { create } from "./ops/create";
import { get } from "./ops/get";
import { retrieve } from "./ops/retrieve";
import { remove } from "./ops/remove";
import { update } from "./ops/update";
import { action } from "./ops/action";
import { allAction } from "./ops/allAction";
import { facet } from "./ops/facet";
import { allFacet } from "./ops/allFacet";
import { find } from "./ops/find";
import { findOne } from "./ops/findOne";
import { set } from "./ops/set";
import { reset } from "./ops/reset";
import { TTLManager } from "./ttl/TTLManager";
import { EvictionManager } from "./eviction/EvictionManager";
import { CacheStatsManager } from "./CacheStats";

// Import enhanced TTL components
import { TTLCalculator } from "./ttl/TTLCalculator";
import { defaultTTLConfig, TTLConfig } from "./ttl/TTLConfig";
import { StaleWhileRevalidateCache } from "./cache/patterns/StaleWhileRevalidateCache";
import { CacheWarmer } from "./cache/warming/CacheWarmer";

// Re-export core types
export type { OperationParams, AffectedKeys, CreateOptions };
export { isPriKey, isComKey };

const logger = LibLogger.get('Operations');

/**
 * Two-Layer Cache Operations - Prevents cache poisoning by separating item and query storage
 *
 * Cache Poisoning Prevention:
 * - Layer 1 (ItemCache): Stores individual entities by full composite keys
 * - Layer 2 (QueryCache): Stores query results as arrays of item keys + completeness metadata
 * - Complete queries get cached for 5 minutes, partial queries for 1 minute only
 */
export interface Operations<
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never,
> extends CoreOperations<V, S, L1, L2, L3, L4, L5> {
  retrieve(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): Promise<V | null>;
  set(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>, item: Item<S, L1, L2, L3, L4, L5>): Promise<V>;
  reset(): Promise<void>;
}

/**
 * Traditional Cache Operations - Works with any CacheMap implementation including TwoLayerCacheMap
 *
 * This class delegates to the individual operation functions in the ops/ directory
 * and works through the CacheContext pattern for maximum compatibility.
 */
export class CacheMapOperations<
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
> implements Operations<V, S, L1, L2, L3, L4, L5> {

  constructor(
    private api: ClientApi<V, S, L1, L2, L3, L4, L5>,
    private coordinate: Coordinate<S, L1, L2, L3, L4, L5>,
    private cacheMap: CacheMap<V, S, L1, L2, L3, L4, L5>,
    private pkType: S,
    private options: Options<V, S, L1, L2, L3, L4, L5>,
    private eventEmitter: CacheEventEmitter<V, S, L1, L2, L3, L4, L5>,
    private ttlManager: TTLManager,
    private evictionManager: EvictionManager,
    private statsManager: CacheStatsManager,
    private registry: Registry
  ) {
    if (this.options.enableDebugLogging) {
      logger.debug('CacheMapOperations initialized', {
        cacheType: this.cacheMap.implementationType,
        isTwoLayer: this.cacheMap instanceof TwoLayerCacheMap
      });
    }
  }

  // Create the cache context once and reuse it across all operations
  private get context() {
    return createCacheContext(
      this.api,
      this.cacheMap,
      this.pkType,
      this.options,
      this.eventEmitter,
      this.ttlManager,
      this.evictionManager,
      this.statsManager,
      this.registry,
      this.coordinate
    );
  }

  async all(query: ItemQuery = {}, locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = [], allOptions?: AllOptions): Promise<AllOperationResult<V>> {
    return all(query, locations, this.context, allOptions).then(([ctx, result]) => result);
  }

  async one(query: ItemQuery = {}, locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = []): Promise<V | null> {
    return one(query, locations, this.context).then(([ctx, result]) => result);
  }

  async create(item: Partial<V>, options?: CreateOptions<S, L1, L2, L3, L4, L5>): Promise<V> {
    const locations = options?.locations || [] as LocKeyArray<L1, L2, L3, L4, L5>;
    return create(item, locations, this.context).then(([ctx, result]) => result);
  }

  async get(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): Promise<V | null> {
    return get(key, this.context).then(([ctx, result]) => result);
  }

  async retrieve(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): Promise<V | null> {
    return retrieve(key, this.context).then(([ctx, result]) => result);
  }

  async remove(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): Promise<void> {
    return remove(key, this.context).then((ctx) => undefined);
  }

  async update(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>, item: Partial<V>): Promise<V> {
    return update(key, item, this.context).then(([ctx, result]) => result);
  }

  async set(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>, item: V): Promise<V> {
    return set(key, item, this.context).then(([ctx, result]) => result);
  }

  async reset(): Promise<void> {
    await reset(this.coordinate, this.options);
    // Clear the existing cache after creating new one
    await this.cacheMap.clear();
  }

  async upsert(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>, itemProperties: Partial<V>, locations?: LocKeyArray<L1, L2, L3, L4, L5>): Promise<V> {
    const existing = await this.get(key);
    if (existing) {
      return this.update(key, itemProperties);
    } else {
      return this.create(itemProperties, { locations: locations || [] as LocKeyArray<L1, L2, L3, L4, L5> } as CreateOptions<S, L1, L2, L3, L4, L5>);
    }
  }

  async action(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>, actionName: string, body?: any): Promise<[any, any]> {
    return action(key, actionName, body, this.context).then(([ctx, result, affectedItems]) => [result, affectedItems]);
  }

  async allAction(actionName: string, body?: any, locations?: LocKeyArray<L1, L2, L3, L4, L5>): Promise<[any, any]> {
    return allAction(actionName, body, locations, this.context).then(([ctx, result, affectedItems]) => [result, affectedItems]);
  }

  async facet(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>, facetName: string, params?: Record<string, any>): Promise<any> {
    return facet(key, facetName, params, this.context);
  }

  async allFacet(facetName: string, params?: Record<string, any>, locations?: LocKeyArray<L1, L2, L3, L4, L5>): Promise<any> {
    return allFacet(facetName, params, locations, this.context);
  }

  async find(finder: string, params?: OperationParams, locations?: LocKeyArray<L1, L2, L3, L4, L5> | [], findOptions?: FindOptions): Promise<FindOperationResult<V>> {
    return find(finder, params || {}, locations || [], this.context, findOptions).then(([ctx, result]) => result);
  }

  async findOne(finder: string, params: Record<string, any>, locations?: LocKeyArray<L1, L2, L3, L4, L5>): Promise<V | null> {
    return findOne(finder, params, locations, this.context).then(([ctx, result]) => result);
  }
}

/**
 * Legacy Two-Layer Operations - Direct ItemCache + QueryCache implementation
 *
 * This is kept for backward compatibility but should be replaced by
 * using TwoLayerCacheMap + CacheMapOperations for better integration.
 */
export class TwoLayerOperations<
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never,
> implements Operations<V, S, L1, L2, L3, L4, L5> {

  private itemCache: ItemCache<V>;
  private queryCache: QueryCache;
  private options: TwoLayerCacheOptions;
  
  // Enhanced TTL components
  private ttlCalculator: TTLCalculator;
  private staleWhileRevalidateCache: StaleWhileRevalidateCache<V>;
  private cacheWarmer?: CacheWarmer<V>;

  constructor(
    private api: ClientApi<V, S, L1, L2, L3, L4, L5>,
    private coordinate: Coordinate<S, L1, L2, L3, L4, L5>,
    private pkType: S,
    options: Options<V, S, L1, L2, L3, L4, L5>,
    private registry: Registry
  ) {
    // Extract two-layer cache options
    this.options = {
      itemTTL: 3600,        // 1 hour for items (fallback if no TTL config)
      queryTTL: 300,        // 5 minutes for complete queries (fallback)
      facetTTL: 60,         // 1 minute for partial queries (fallback)
      ...options.twoLayer
    };

    // Initialize TTL calculator with provided config or defaults
    const ttlConfig = options.ttlConfig || defaultTTLConfig;
    this.ttlCalculator = new TTLCalculator(ttlConfig);

    // Initialize the two cache layers
    this.itemCache = new ItemCache<V>({
      defaultTTL: this.options.itemTTL
    });

    this.queryCache = new QueryCache({
      queryTTL: this.options.queryTTL,
      facetTTL: this.options.facetTTL
    });

    // Initialize stale-while-revalidate cache if enabled
    if (ttlConfig.adjustments?.staleWhileRevalidate) {
      this.staleWhileRevalidateCache = new StaleWhileRevalidateCache(this.itemCache, {
        ttlCalculator: this.ttlCalculator,
        maxConcurrentRefreshes: 10,
        refreshTimeout: 30000,
        extendTTLOnError: true,
        errorTTLExtension: 300
      });
    } else {
      // Create a simple pass-through version if SWR is disabled
      this.staleWhileRevalidateCache = {
        get: async (key, fetcher, ttl) => {
          const cached = await this.itemCache.get(key);
          return cached || await fetcher();
        }
      } as any;
    }

    // Initialize cache warming if enabled
    if (ttlConfig.warming?.enabled && ttlConfig.warming.queries.length > 0) {
      this.cacheWarmer = new CacheWarmer<V>({
        interval: ttlConfig.warming.interval,
        maxConcurrency: 5,
        operationTimeout: 30000,
        continueOnError: true
      });

      // Add warming operations from configuration
      this.cacheWarmer.addOperationsFromConfig(
        ttlConfig.warming.queries,
        (params: any) => async () => {
          const result = await this.api.all(params.query || {}, params.locations || []);
          return result.items;
        }
      );

      // Start periodic warming
      this.cacheWarmer.startPeriodicWarming();
    }
  }

  // ===== CORE QUERY OPERATIONS (THE CRITICAL PART) =====

  async all(query: ItemQuery = {}, locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = [], allOptions?: AllOptions): Promise<AllOperationResult<V>> {
    const queryKey = this.buildQueryKey('all', { query, locations, allOptions });

    // Helper to create AllOperationResult from cached items
    const createCachedResult = (items: V[]): AllOperationResult<V> => ({
      items,
      metadata: {
        total: items.length,
        returned: items.length,
        limit: allOptions?.limit ?? query?.limit,
        offset: allOptions?.offset ?? query?.offset ?? 0,
        hasMore: false  // When serving from cache, we assume we have all matching items
      }
    });

    // Check query cache first
    const cachedQuery = await this.queryCache.getResult(queryKey);
    
    if (cachedQuery && cachedQuery.metadata.isComplete) {
      // Try to retrieve items from item cache
      const items = await Promise.all(
        cachedQuery.itemKeys.map(key => this.itemCache.get(key))
      );
      
      const validItems = items.filter(item => item !== null) as V[];
      
      // If all items are still valid, return them (cache hit!)
      if (validItems.length === cachedQuery.itemKeys.length) {
        return createCachedResult(validItems);
      }
    }

    // Fetch fresh data from API
    const wrappedAll = createAllWrapper(
      this.coordinate,
      async (q, locs, opts) => await this.api.all(q ?? {}, locs ?? [], opts)
    );
    
    const freshResult = await wrappedAll(query, locations, allOptions);

    // Store in both layers - MARK AS COMPLETE
    await this.storeTwoLayer(freshResult.items, queryKey, true, 'all');

    return freshResult;
  }

  async allFacet(facet: string, params: Record<string, any> = {}, locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = []): Promise<any> {
    const queryKey = this.buildQueryKey(`facet:${facet}`, { params, locations });
    
    // Check query cache
    const cachedQuery = await this.queryCache.getResult(queryKey);
    if (cachedQuery) {
      const items = await Promise.all(
        cachedQuery.itemKeys.map(key => this.itemCache.get(key))
      );
      
      const validItems = items.filter(item => item !== null) as V[];
      
      // For faceted queries, we're more tolerant of missing items since they're partial anyway
      if (validItems.length > 0) {
        return validItems;
      }
    }
    
    // Fetch fresh data from API
    const wrappedAllFacet = createAllFacetWrapper(
      this.coordinate,
      async (f, p, locs) => await this.api.allFacet(f, p ?? {}, locs ?? [])
    );
    
    const freshItems = await wrappedAllFacet(facet, params, locations);
    
    // Ensure freshItems is an array
    const itemArray = Array.isArray(freshItems) ? freshItems : (freshItems ? [freshItems] : []);
    
    // CRITICAL: Store items in item cache AND mark query as INCOMPLETE
    await this.storeTwoLayer(itemArray as V[], queryKey, false, `facet:${facet}`);
    
    return freshItems;
  }

  async get(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): Promise<V | null> {
    const itemKey = this.buildItemKey(key);
    const itemType = this.coordinate.kta[0]; // Get first key type as item type

    // Calculate TTL for this item type
    const ttlResult = this.ttlCalculator.calculateItemTTL(itemType);
    
    // Use stale-while-revalidate cache for get operations
    return await this.staleWhileRevalidateCache.get(
      itemKey,
      async () => {
        // Fetch from API when cache miss or refresh needed
        const wrappedGet = createGetWrapper(
          this.coordinate,
          async (k) => await this.api.get(k)
        );
        
        const item = await wrappedGet(key);
        
        return item;
      },
      ttlResult.ttl,
      itemType
    );
  }

  async update(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>, updates: Partial<V>): Promise<V> {
    const wrappedUpdate = createUpdateWrapper(
      this.coordinate,
      async (k, u) => await this.api.update(k, u)
    );
    
    const result = await wrappedUpdate(key, updates);
    const updatedItem = result[0];

    // Update item cache
    const itemKey = this.buildItemKey(key);
    await this.itemCache.set(itemKey, updatedItem, this.options.itemTTL!);

    // Invalidate any queries that might contain this item
    await this.queryCache.invalidateQueriesContainingItem(itemKey);

    return updatedItem;
  }

  // ===== OTHER OPERATIONS (Delegate to API with item cache) =====

  async one(query: ItemQuery = {}, locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = []): Promise<V | null> {
    const wrappedOne = createOneWrapper(
      this.coordinate,
      async (q, locs) => await this.api.one(q ?? {}, locs ?? [])
    );
    
    const item = await wrappedOne(query, locations);
    
    if (item) {
      const itemKey = this.buildItemKey(item);
      await this.itemCache.set(itemKey, item, this.options.itemTTL!);
    }
    
    return item;
  }

  async create(item: Partial<V>, options?: CreateOptions<S, L1, L2, L3, L4, L5>): Promise<V> {
    const locations = options?.locations || [];
    
    const wrappedCreate = createCreateWrapper(
      this.coordinate,
      async (i, locs) => await this.api.create(i, locs)
    );
    
    const result = await wrappedCreate(item, { locations } as CreateOptions<S, L1, L2, L3, L4, L5>);
    const createdItem = result[0];
    
    // Store in item cache
    const itemKey = this.buildItemKey(createdItem);
    await this.itemCache.set(itemKey, createdItem, this.options.itemTTL!);
    
    // Invalidate queries (new item affects completeness)
    await this.queryCache.clear();
    
    return createdItem;
  }

  async remove(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): Promise<void> {
    const wrappedRemove = createRemoveWrapper(
      this.coordinate,
      async (k) => await this.api.remove(k)
    );
    
    await wrappedRemove(key);

    // Remove from item cache and invalidate queries
    const itemKey = this.buildItemKey(key);
    await this.itemCache.delete(itemKey);
    await this.queryCache.invalidateQueriesContainingItem(itemKey);
  }

  // ===== CACHE-SPECIFIC OPERATIONS =====

  async retrieve(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): Promise<V | null> {
    const itemKey = this.buildItemKey(key);
    return await this.itemCache.get(itemKey);
  }

  async set(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>, item: Item<S, L1, L2, L3, L4, L5>): Promise<V> {
    const itemKey = this.buildItemKey(key);
    await this.itemCache.set(itemKey, item as V, this.options.itemTTL!);
    return item as V;
  }

  async reset(): Promise<void> {
    await this.itemCache.clear();
    await this.queryCache.clear();
    
    // Clear stale-while-revalidate pending refreshes
    if (this.staleWhileRevalidateCache?.clearPendingRefreshes) {
      this.staleWhileRevalidateCache.clearPendingRefreshes();
    }
  }

  /**
   * Cleanup resources - call when shutting down
   */
  cleanup(): void {
    // Stop cache warming
    if (this.cacheWarmer) {
      this.cacheWarmer.cleanup();
    }

    // Clear pending refreshes
    if (this.staleWhileRevalidateCache?.clearPendingRefreshes) {
      this.staleWhileRevalidateCache.clearPendingRefreshes();
    }
  }

  /**
   * Get enhanced cache statistics
   */
  getEnhancedStats() {
    const baseStats = {
      itemCache: this.itemCache.getStats(),
      queryCache: this.queryCache.getStats()
    };

    const enhancedStats: any = { ...baseStats };

    // Add stale-while-revalidate stats if available
    if (this.staleWhileRevalidateCache?.getStats) {
      enhancedStats.staleWhileRevalidate = this.staleWhileRevalidateCache.getStats();
    }

    // Add cache warming stats if available
    if (this.cacheWarmer) {
      enhancedStats.cacheWarming = this.cacheWarmer.getStats();
    }

    return enhancedStats;
  }

  /**
   * Explain TTL calculation for debugging
   */
  explainTTL(itemType?: string, queryType?: string, isComplete?: boolean) {
    if (itemType) {
      return this.ttlCalculator.explainTTLCalculation({ itemType });
    }
    
    if (queryType && isComplete !== undefined) {
      return this.ttlCalculator.explainTTLCalculation({ queryType, isComplete });
    }
    
    throw new Error('Must provide either itemType or (queryType + isComplete)');
  }

  /**
   * Manually warm specific cache operations
   */
  async warmCache(operationIds?: string[]): Promise<any> {
    if (!this.cacheWarmer) {
      return { error: 'Cache warming not enabled' };
    }

    if (operationIds) {
      return await this.cacheWarmer.warmOperations(operationIds);
    } else {
      return await this.cacheWarmer.performWarmingCycle();
    }
  }

  // ===== UTILITY METHODS =====

  private async storeTwoLayer(
    items: V[],
    queryKey: string,
    isComplete: boolean,
    queryType: string
  ): Promise<void> {
    // Ensure items is an array
    if (!Array.isArray(items)) {
      items = items ? [items] as V[] : [];
    }

    // Get item type for TTL calculation
    const itemType = this.coordinate.kta[0];
    const itemTTLResult = this.ttlCalculator.calculateItemTTL(itemType);

    // Store individual items in item cache with calculated TTL
    const itemKeys: string[] = [];

    for (const item of items) {
      if (item) { // Only store valid items
        const itemKey = this.buildItemKey(item);
        await this.itemCache.set(itemKey, item, itemTTLResult.ttl);
        itemKeys.push(itemKey);
      }
    }

    // Calculate query TTL based on type and completeness
    const queryTTLResult = this.ttlCalculator.calculateQueryTTL(queryType, isComplete);

    // Store query result in query cache with calculated TTL
    await this.queryCache.setResult(queryKey, {
      itemKeys,
      metadata: {
        queryType,
        isComplete,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + queryTTLResult.ttl * 1000),
        ttl: queryTTLResult.ttl,
        baseTTL: queryTTLResult.baseTTL,
        adjustments: queryTTLResult.adjustments
      }
    });
  }

  private buildItemKey(item: V | ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): string {
    // Handle null/undefined cases
    if (!item) {
      throw new Error('Cannot build key for null/undefined item');
    }

    // Handle different key formats
    if (typeof item === 'object' && 'kt' in item && 'pk' in item) {
      // It's an item or ComKey
      const keys = [item.kt, item.pk];
      
      // Add location keys if present
      if ('loc' in item && item.loc) {
        for (const locItem of item.loc) {
          if ('kt' in locItem && 'lk' in locItem) {
            keys.push(`${locItem.kt}:${locItem.lk}`);
          }
        }
      }
      
      return keys.join(':');
    }
    
    // Fallback to string representation
    return JSON.stringify(item);
  }

  private buildQueryKey(queryType: string, params: any): string {
    const keys = ['query', this.coordinate.kta[0], queryType];
    
    if (params) {
      // Sort keys for consistent hashing
      const normalized = this.normalizeParams(params);
      const paramStr = JSON.stringify(normalized, Object.keys(normalized).sort());
      keys.push(paramStr);
    }
    
    return keys.join(':');
  }

  private normalizeParams(params: any): any {
    const normalized: any = {};
    for (const [key, value] of Object.entries(params)) {
      if (value instanceof Date) {
        normalized[key] = value.toISOString();
      } else if (Array.isArray(value)) {
        normalized[key] = [...value].sort();
      } else {
        normalized[key] = value;
      }
    }
    return normalized;
  }

  // ===== PLACEHOLDER METHODS (TO BE IMPLEMENTED) =====
  
  async upsert(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>, itemProperties: Partial<V>, locations?: LocKeyArray<L1, L2, L3, L4, L5>): Promise<V> {
    const existing = await this.get(key);
    if (existing) {
      return await this.update(key, itemProperties);
    } else {
      return await this.create(itemProperties, { locations: locations || [] as LocKeyArray<L1, L2, L3, L4, L5> });
    }
  }

  async action(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>, actionName: string, body?: any): Promise<[any, any]> {
    // Delegate to API and invalidate caches
    const result = await this.api.action(key, actionName, body || {});
    
    // Clear all caches as actions can affect multiple items
    await this.queryCache.clear();
    
    return result;
  }

  async allAction(actionName: string, body?: any, locations?: LocKeyArray<L1, L2, L3, L4, L5>): Promise<[any, any]> {
    const result = await this.api.allAction(actionName, body || {}, locations || []);
    
    // Clear all caches
    await this.queryCache.clear();
    
    return result;
  }

  async facet(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>, facetName: string, params?: Record<string, any>): Promise<any> {
    return await this.api.facet(key, facetName, params);
  }

  async find(finder: string, params?: OperationParams, locations?: LocKeyArray<L1, L2, L3, L4, L5> | [], findOptions?: FindOptions): Promise<FindOperationResult<V>> {
    const result = await (this.api.find as any)(finder, params || {}, locations || [], findOptions) as FindOperationResult<V>;
    
    // Store found items in cache
    for (const item of result.items) {
      const itemKey = this.buildItemKey(item);
      await this.itemCache.set(itemKey, item, this.options.itemTTL!);
    }
    
    return result;
  }

  async findOne(finder: string, params: Record<string, any> = {}, locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = []): Promise<V | null> {
    const item = await this.api.findOne(finder, params, locations);
    
    if (item) {
      const itemKey = this.buildItemKey(item);
      await this.itemCache.set(itemKey, item, this.options.itemTTL!);
    }
    
    return item;
  }
}

// ===== FACTORY FUNCTION FOR BACKWARD COMPATIBILITY =====

export const createOperations = <
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
    cacheMap: CacheMap<V, S, L1, L2, L3, L4, L5>,
    pkType: S,
    options: Options<V, S, L1, L2, L3, L4, L5>,
    eventEmitter: CacheEventEmitter<V, S, L1, L2, L3, L4, L5>,
    ttlManager: TTLManager,
    evictionManager: EvictionManager,
    statsManager: CacheStatsManager,
    registry: Registry
  ): Operations<V, S, L1, L2, L3, L4, L5> => {
  
  // Always use CacheMapOperations for maximum compatibility with existing infrastructure
  // This works with regular CacheMap, TwoLayerCacheMap, or any other CacheMap implementation
  return new CacheMapOperations(
    api,
    coordinate,
    cacheMap,
    pkType,
    options,
    eventEmitter,
    ttlManager,
    evictionManager,
    statsManager,
    registry
  ) as any as Operations<V, S, L1, L2, L3, L4, L5>;
  
  // Note: TwoLayerOperations is kept for reference but no longer used by default
  // The TwoLayerCacheMap + CacheMapOperations approach provides better integration
};