import {
  AllItemTypeArrays,
  ComKey,
  Item,
  ItemQuery,
  LocKeyArray,
  PriKey
} from "@fjell/core";
import { CacheItemMetadata, CacheMapMetadataProvider } from "./eviction/EvictionStrategy";
import { CacheInfo } from "./Cache";

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
> implements CacheMapMetadataProvider {
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
   * Retrieve an item by its key
   */
  public abstract get(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): Promise<V | null>;

  /**
   * Store an item with its key
   */
  public abstract set(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>, value: V): void;

  /**
   * Check if a key exists in the cache
   */
  public abstract includesKey(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): Promise<boolean>;

  /**
   * Delete an item by its key
   */
  public abstract delete(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): void;

  /**
   * Get all items in the specified locations
   */
  public abstract allIn(locations: LocKeyArray<L1, L2, L3, L4, L5> | []): Promise<V[]>;

  /**
   * Check if any items match the query in the specified locations
   */
  public abstract contains(query: ItemQuery, locations: LocKeyArray<L1, L2, L3, L4, L5> | []): Promise<boolean>;

  /**
   * Get all items that match the query in the specified locations
   */
  public abstract queryIn(query: ItemQuery, locations: LocKeyArray<L1, L2, L3, L4, L5> | []): Promise<V[]>;

  /**
   * Create a clone of this cache map
   */
  public abstract clone(): Promise<CacheMap<V, S, L1, L2, L3, L4, L5>>;

  /**
   * Get all keys in the cache
   */
  public abstract keys(): (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[];

  /**
   * Get all values in the cache
   */
  public abstract values(): Promise<V[]>;

  /**
   * Clear all items from the cache
   */
  public abstract clear(): void;

  // Query result caching methods

  /**
   * Set a query result as a collection of item keys
   */
  public abstract setQueryResult(queryHash: string, itemKeys: (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[]): void;

  /**
   * Get a query result as a collection of item keys
   */
  public abstract getQueryResult(queryHash: string): Promise<(ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[] | null>;

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
  public abstract invalidateLocation(locations: LocKeyArray<L1, L2, L3, L4, L5> | []): Promise<void>;

  /**
   * Clear all query result cache entries
   */
  public abstract clearQueryResults(): void;

  // CacheMapMetadataProvider implementation
  // These methods must be implemented by all CacheMap implementations to support eviction

  /**
   * Get metadata for a specific item
   * @param key - Item key
   * @returns Metadata if exists, null otherwise
   */
  public abstract getMetadata(key: string): CacheItemMetadata | null;

  /**
   * Set metadata for a specific item
   * @param key - Item key
   * @param metadata - Metadata to store
   */
  public abstract setMetadata(key: string, metadata: CacheItemMetadata): void;

  /**
   * Delete metadata for a specific item
   * @param key - Item key
   */
  public abstract deleteMetadata(key: string): void;

  /**
   * Get all metadata entries
   * @returns Map of all metadata entries
   */
  public abstract getAllMetadata(): Map<string, CacheItemMetadata>;

  /**
   * Clear all metadata
   */
  public abstract clearMetadata(): void;

  /**
   * Get current cache size information
   * @returns Object with current size metrics
   */
  public abstract getCurrentSize(): {
    itemCount: number;
    sizeBytes: number;
  };

  /**
   * Get cache size limits
   * @returns Object with size limits (null means unlimited)
   */
  public abstract getSizeLimits(): {
    maxItems: number | null;
    maxSizeBytes: number | null;
  };
}
