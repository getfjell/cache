import {
  AllItemTypeArrays,
  ComKey,
  Item,
  ItemQuery,
  LocKeyArray,
  PriKey
} from "@fjell/core";

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
 * Abstract base interface for cache map implementations.
 * Defines the contract that all cache map implementations must follow.
 *
 * @template V - The type of the data model item, extending Item
 * @template S - The string literal type representing the model's key type
 * @template L1-L5 - Optional string literal types for location hierarchy levels
 */
export abstract class CacheMap<
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
> {
  protected types: AllItemTypeArrays<S, L1, L2, L3, L4, L5>;

  /**
   * The implementation type identifier in the format "<category>/<implementation>"
   * Examples: "memory/memory", "memory/enhanced", "browser/localStorage"
   */
  public abstract readonly implementationType: string;

  public constructor(types: AllItemTypeArrays<S, L1, L2, L3, L4, L5>) {
    this.types = types;
  }

  /**
   * Get cache configuration information for client applications
   * Provides visibility into implementation type, eviction policy, TTL settings, and capabilities
   */
  public abstract getCacheInfo(): CacheInfo;

  /**
   * Retrieve an item by its key
   */
  public abstract get(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): V | null;

  /**
   * Retrieve an item by its key with TTL awareness
   * Returns null if item doesn't exist or has expired based on the provided TTL
   */
  public abstract getWithTTL(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>, ttl: number): V | null;

  /**
   * Store an item with its key
   */
  public abstract set(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>, value: V): void;

  /**
   * Check if a key exists in the cache
   */
  public abstract includesKey(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): boolean;

  /**
   * Delete an item by its key
   */
  public abstract delete(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): void;

  /**
   * Get all items in the specified locations
   */
  public abstract allIn(locations: LocKeyArray<L1, L2, L3, L4, L5> | []): V[];

  /**
   * Check if any items match the query in the specified locations
   */
  public abstract contains(query: ItemQuery, locations: LocKeyArray<L1, L2, L3, L4, L5> | []): boolean;

  /**
   * Get all items that match the query in the specified locations
   */
  public abstract queryIn(query: ItemQuery, locations: LocKeyArray<L1, L2, L3, L4, L5> | []): V[];

  /**
   * Create a clone of this cache map
   */
  public abstract clone(): CacheMap<V, S, L1, L2, L3, L4, L5>;

  /**
   * Get all keys in the cache
   */
  public abstract keys(): (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[];

  /**
   * Get all values in the cache
   */
  public abstract values(): V[];

  /**
   * Clear all items from the cache
   */
  public abstract clear(): void;

  // Query result caching methods

  /**
   * Set a query result as a collection of item keys
   */
  public abstract setQueryResult(queryHash: string, itemKeys: (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[], ttl?: number): void;

  /**
   * Get a query result as a collection of item keys
   */
  public abstract getQueryResult(queryHash: string): (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[] | null;

  /**
   * Check if a query result exists in cache
   */
  public abstract hasQueryResult(queryHash: string): boolean;

  /**
   * Delete a specific query result
   */
  public abstract deleteQueryResult(queryHash: string): void;

  /**
   * Invalidate all cached items by their keys
   */
  public abstract invalidateItemKeys(keys: (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[]): void;

  /**
   * Invalidate all items in specified locations and clear related query results
   */
  public abstract invalidateLocation(locations: LocKeyArray<L1, L2, L3, L4, L5> | []): void;

  /**
   * Clear all query result cache entries
   */
  public abstract clearQueryResults(): void;
}
