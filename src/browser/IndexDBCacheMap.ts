
import {
  AllItemTypeArrays,
  ComKey,
  Item,
  ItemQuery,
  LocKeyArray,
  PriKey
} from "@fjell/core";
import { CacheMap } from "../CacheMap";
import { AsyncIndexDBCacheMap } from "./AsyncIndexDBCacheMap";

/**
 * Synchronous wrapper for IndexedDB CacheMap implementation.
 *
 * WARNING: This implementation throws errors for all synchronous operations
 * since IndexedDB is inherently asynchronous. Use AsyncIndexDBCacheMap instead
 * for proper IndexedDB functionality.
 *
 * This class exists only to satisfy the CacheMap interface requirements.
 */
export class IndexDBCacheMap<
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
> extends CacheMap<V, S, L1, L2, L3, L4, L5> {

  public asyncCache: AsyncIndexDBCacheMap<V, S, L1, L2, L3, L4, L5>;

  public constructor(
    types: AllItemTypeArrays<S, L1, L2, L3, L4, L5>,
    dbName: string = 'fjell-indexdb-cache',
    storeName: string = 'cache',
    version: number = 1
  ) {
    super(types);
    this.asyncCache = new AsyncIndexDBCacheMap<V, S, L1, L2, L3, L4, L5>(types, dbName, storeName, version);
  }

  public get(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): V | null {
    void key; // Suppress unused parameter warning
    throw new Error('IndexedDB operations are asynchronous. Use asyncCache.get() instead.');
  }

  public getWithTTL(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>, ttl: number): V | null {
    void key; void ttl; // Suppress unused parameter warnings
    throw new Error('IndexedDB operations are asynchronous. Use asyncCache.getWithTTL() instead.');
  }

  public set(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>, value: V): void {
    void key; void value; // Suppress unused parameter warnings
    throw new Error('IndexedDB operations are asynchronous. Use asyncCache.set() instead.');
  }

  public includesKey(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): boolean {
    void key; // Suppress unused parameter warning
    throw new Error('IndexedDB operations are asynchronous. Use asyncCache.includesKey() instead.');
  }

  public delete(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): void {
    void key; // Suppress unused parameter warning
    throw new Error('IndexedDB operations are asynchronous. Use asyncCache.delete() instead.');
  }

  public allIn(locations: LocKeyArray<L1, L2, L3, L4, L5> | []): V[] {
    void locations; // Suppress unused parameter warning
    throw new Error('IndexedDB operations are asynchronous. Use asyncCache.allIn() instead.');
  }

  public contains(query: ItemQuery, locations: LocKeyArray<L1, L2, L3, L4, L5> | []): boolean {
    void query; void locations; // Suppress unused parameter warnings
    throw new Error('IndexedDB operations are asynchronous. Use asyncCache.contains() instead.');
  }

  public queryIn(query: ItemQuery, locations: LocKeyArray<L1, L2, L3, L4, L5> | []): V[] {
    void query; void locations; // Suppress unused parameter warnings
    throw new Error('IndexedDB operations are asynchronous. Use asyncCache.queryIn() instead.');
  }

  public clone(): IndexDBCacheMap<V, S, L1, L2, L3, L4, L5> {
    return new IndexDBCacheMap<V, S, L1, L2, L3, L4, L5>(this.types);
  }

  public keys(): (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[] {
    throw new Error('IndexedDB operations are asynchronous. Use asyncCache.keys() instead.');
  }

  public values(): V[] {
    throw new Error('IndexedDB operations are asynchronous. Use asyncCache.values() instead.');
  }

  public clear(): void {
    throw new Error('IndexedDB operations are asynchronous. Use asyncCache.clear() instead.');
  }

  // Query result caching methods implementation

  public setQueryResult(queryHash: string, itemKeys: (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[], ttl?: number): void {
    void queryHash; void itemKeys; void ttl; // Suppress unused parameter warnings
    throw new Error('IndexedDB operations are asynchronous. Use asyncCache.setQueryResult() instead.');
  }

  public getQueryResult(queryHash: string): (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[] | null {
    void queryHash; // Suppress unused parameter warning
    throw new Error('IndexedDB operations are asynchronous. Use asyncCache.getQueryResult() instead.');
  }

  public hasQueryResult(queryHash: string): boolean {
    void queryHash; // Suppress unused parameter warning
    throw new Error('IndexedDB operations are asynchronous. Use asyncCache.hasQueryResult() instead.');
  }

  public deleteQueryResult(queryHash: string): void {
    void queryHash; // Suppress unused parameter warning
    throw new Error('IndexedDB operations are asynchronous. Use asyncCache.deleteQueryResult() instead.');
  }

  public invalidateItemKeys(keys: (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[]): void {
    void keys; // Suppress unused parameter warning
    throw new Error('IndexedDB operations are asynchronous. Use asyncCache.invalidateItemKeys() instead.');
  }

  public invalidateLocation(locations: LocKeyArray<L1, L2, L3, L4, L5> | []): void {
    void locations; // Suppress unused parameter warning
    throw new Error('IndexedDB operations are asynchronous. Use asyncCache.invalidateLocation() instead.');
  }

  public clearQueryResults(): void {
    throw new Error('IndexedDB operations are asynchronous. Use asyncCache.clearQueryResults() instead.');
  }
}
