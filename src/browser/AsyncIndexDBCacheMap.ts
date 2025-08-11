import {
  AllItemTypeArrays,
  ComKey,
  isComKey,
  isQueryMatch,
  Item,
  ItemQuery,
  LocKeyArray,
  PriKey
} from "@fjell/core";
import { createNormalizedHashFunction, isLocKeyArrayEqual } from "../normalization";
import { CacheItemMetadata } from "../eviction/EvictionStrategy";
import LibLogger from "../logger";
import safeStringify from 'fast-safe-stringify';

const logger = LibLogger.get("AsyncIndexDBCacheMap");

interface StoredItem<V> {
  originalKey: ComKey<any, any, any, any, any, any> | PriKey<any>;
  value: V;
  metadata?: CacheItemMetadata;
  version: number; // For future migration support
}

/**
 * IndexedDB implementation of CacheMap for browser environments.
 * Data persists long-term with much larger storage limits than localStorage/sessionStorage.
 *
 * Note: IndexedDB is asynchronous and can store structured data.
 * Storage limit is hundreds of MB or more depending on browser and user.
 * This implementation uses promises for all operations.
 */
export class AsyncIndexDBCacheMap<
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
> {
  protected types: AllItemTypeArrays<S, L1, L2, L3, L4, L5>;
  private dbName: string;
  private storeName: string;
  private version: number;
  private normalizedHashFunction: (key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>) => string;
  private dbPromise: Promise<IDBDatabase> | null = null;

  // Current storage format version
  private static readonly CURRENT_VERSION = 1;

  public constructor(
    types: AllItemTypeArrays<S, L1, L2, L3, L4, L5>,
    dbName: string = 'fjell-indexdb-cache',
    storeName: string = 'cache',
    version: number = 1
  ) {
    this.types = types;
    this.dbName = dbName;
    this.storeName = storeName;
    this.version = version;
    this.normalizedHashFunction = createNormalizedHashFunction<ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>>();
  }

  private async getDB(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        // Check if IndexedDB is available (not in server-side environment)
        if (typeof indexedDB === 'undefined') {
          reject(new Error('IndexedDB is not available in this environment'));
          return;
        }

        const request = indexedDB.open(this.dbName, this.version);

        request.onerror = () => {
          logger.error('Error opening IndexedDB', { error: request.error });
          reject(request.error);
        };

        request.onsuccess = () => {
          logger.debug('IndexedDB opened successfully');
          resolve(request.result);
        };

        request.onupgradeneeded = (event) => {
          logger.debug('IndexedDB upgrade needed');
          const db = (event.target as IDBOpenDBRequest).result;

          if (!db.objectStoreNames.contains(this.storeName)) {
            db.createObjectStore(this.storeName);
            logger.debug('Created object store', { storeName: this.storeName });
          }
        };
      });
    }

    return this.dbPromise;
  }

  private getStorageKey(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): string {
    return this.normalizedHashFunction(key);
  }

  public async get(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): Promise<V | null> {
    logger.trace('get', { key });
    try {
      const db = await this.getDB();
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const storageKey = this.getStorageKey(key);

      return new Promise((resolve, reject) => {
        const request = store.get(storageKey);

        request.onerror = () => {
          logger.error('Error getting from IndexedDB', { key, error: request.error });
          reject(request.error);
        };

        request.onsuccess = () => {
          const stored: StoredItem<V> | undefined = request.result;
          if (stored && this.normalizedHashFunction(stored.originalKey) === this.normalizedHashFunction(key)) {
            resolve(stored.value);
          } else {
            resolve(null);
          }
        };
      });
    } catch (error) {
      logger.error('Error in IndexedDB get operation', { key, error });
      return null;
    }
  }

  /**
   * Get both the value and metadata for an item
   */
  public async getWithMetadata(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): Promise<{ value: V; metadata?: CacheItemMetadata } | null> {
    logger.trace('getWithMetadata', { key });
    try {
      const db = await this.getDB();
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const storageKey = this.getStorageKey(key);

      return new Promise((resolve, reject) => {
        const request = store.get(storageKey);

        request.onerror = () => {
          logger.error('Error getting from IndexedDB', { key, error: request.error });
          reject(request.error);
        };

        request.onsuccess = () => {
          const stored: StoredItem<V> | undefined = request.result;
          if (stored && this.normalizedHashFunction(stored.originalKey) === this.normalizedHashFunction(key)) {
            resolve({
              value: stored.value,
              metadata: stored.metadata
            });
          } else {
            resolve(null);
          }
        };
      });
    } catch (error) {
      logger.error('Error in IndexedDB getWithMetadata operation', { key, error });
      return null;
    }
  }

  public async set(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>, value: V, metadata?: CacheItemMetadata): Promise<void> {
    logger.trace('set', { key, value, hasMetadata: !!metadata });
    try {
      const db = await this.getDB();
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const storageKey = this.getStorageKey(key);

      const storedItem: StoredItem<V> = {
        originalKey: key,
        value: value,
        metadata: metadata,
        version: AsyncIndexDBCacheMap.CURRENT_VERSION
      };

      return new Promise((resolve, reject) => {
        const request = store.put(storedItem, storageKey);

        request.onerror = () => {
          logger.error('Error setting in IndexedDB', { key, value, error: request.error });
          reject(request.error);
        };

        request.onsuccess = () => {
          resolve();
        };
      });
    } catch (error) {
      logger.error('Error in IndexedDB set operation', { key, value, error });
      throw new Error(`Failed to store item in IndexedDB: ${error}`);
    }
  }

  /**
   * Update only the metadata for an existing item
   */
  public async setMetadata(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>, metadata: CacheItemMetadata): Promise<void> {
    logger.trace('setMetadata', { key, metadata });
    try {
      const existing = await this.getWithMetadata(key);
      if (existing) {
        await this.set(key, existing.value, metadata);
      } else {
        logger.warning('Attempted to set metadata for non-existent item', { key });
      }
    } catch (error) {
      logger.error('Error in IndexedDB setMetadata operation', { key, error });
      throw new Error(`Failed to update metadata in IndexedDB: ${error}`);
    }
  }

  public async includesKey(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): Promise<boolean> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const storageKey = this.getStorageKey(key);

      return new Promise((resolve, reject) => {
        const request = store.get(storageKey);

        request.onerror = () => {
          logger.error('Error checking key in IndexedDB', { key, error: request.error });
          reject(request.error);
        };

        request.onsuccess = () => {
          const stored: StoredItem<V> | undefined = request.result;
          if (stored) {
            const matches = this.normalizedHashFunction(stored.originalKey) === this.normalizedHashFunction(key);
            resolve(matches);
          } else {
            resolve(false);
          }
        };
      });
    } catch (error) {
      logger.error('Error in IndexedDB includesKey operation', { key, error });
      return false;
    }
  }

  public async delete(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): Promise<void> {
    logger.trace('delete', { key });
    try {
      const db = await this.getDB();
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const storageKey = this.getStorageKey(key);

      return new Promise((resolve, reject) => {
        const request = store.delete(storageKey);

        request.onerror = () => {
          logger.error('Error deleting from IndexedDB', { key, error: request.error });
          reject(request.error);
        };

        request.onsuccess = () => {
          resolve();
        };
      });
    } catch (error) {
      logger.error('Error in IndexedDB delete operation', { key, error });
    }
  }

  public async allIn(locations: LocKeyArray<L1, L2, L3, L4, L5> | []): Promise<V[]> {
    const allKeys = await this.keys();

    if (locations.length === 0) {
      logger.debug('Returning all items, LocKeys is empty');
      const promises = allKeys.map(key => this.get(key));
      const results = await Promise.all(promises);
      return results.filter(item => item !== null) as V[];
    } else {
      const locKeys: LocKeyArray<L1, L2, L3, L4, L5> | [] = locations;
      logger.debug('allIn', { locKeys, keys: allKeys.length });
      const filteredKeys = allKeys
        .filter((key) => key && isComKey(key))
        .filter((key) => {
          const ComKey = key as ComKey<S, L1, L2, L3, L4, L5>;
          logger.debug('Comparing Location Keys', {
            locKeys,
            ComKey,
          });
          return isLocKeyArrayEqual(locKeys, ComKey.loc);
        });

      const promises = filteredKeys.map(key => this.get(key));
      const results = await Promise.all(promises);
      return results.filter(item => item !== null) as V[];
    }
  }

  public async contains(query: ItemQuery, locations: LocKeyArray<L1, L2, L3, L4, L5> | []): Promise<boolean> {
    logger.debug('contains', { query, locations });
    const items = await this.allIn(locations);
    return items.some((item) => isQueryMatch(item, query));
  }

  public async queryIn(
    query: ItemQuery,
    locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = []
  ): Promise<V[]> {
    logger.debug('queryIn', { query, locations });
    const items = await this.allIn(locations);
    return items.filter((item) => isQueryMatch(item, query));
  }

  public clone(): AsyncIndexDBCacheMap<V, S, L1, L2, L3, L4, L5> {
    // IndexedDB is shared globally, so clone creates a new instance with same db config
    return new AsyncIndexDBCacheMap<V, S, L1, L2, L3, L4, L5>(this.types, this.dbName, this.storeName, this.version);
  }

  public async keys(): Promise<(ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[]> {
    const keys: (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[] = [];

    try {
      const db = await this.getDB();
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);

      return new Promise((resolve, reject) => {
        const request = store.openCursor();

        request.onerror = () => {
          logger.error('Error getting keys from IndexedDB', { error: request.error });
          reject(request.error);
        };

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor) {
            const stored: StoredItem<V> = cursor.value;
            keys.push(stored.originalKey);
            cursor.continue();
          } else {
            resolve(keys);
          }
        };
      });
    } catch (error) {
      logger.error('Error in IndexedDB keys operation', { error });
      return [];
    }
  }

  /**
   * Get all metadata entries from IndexedDB
   */
  public async getAllMetadata(): Promise<Map<string, CacheItemMetadata>> {
    const metadataMap = new Map<string, CacheItemMetadata>();

    try {
      const db = await this.getDB();
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);

      return new Promise((resolve, reject) => {
        const request = store.openCursor();

        request.onerror = () => {
          logger.error('Error getting metadata from IndexedDB', { error: request.error });
          reject(request.error);
        };

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor) {
            const stored: StoredItem<V> = cursor.value;
            if (stored.metadata) {
              const keyStr = JSON.stringify(stored.originalKey);
              metadataMap.set(keyStr, stored.metadata);
            }
            cursor.continue();
          } else {
            resolve(metadataMap);
          }
        };
      });
    } catch (error) {
      logger.error('Error in IndexedDB getAllMetadata operation', { error });
      return metadataMap;
    }
  }

  public async values(): Promise<V[]> {
    const values: V[] = [];

    try {
      const db = await this.getDB();
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);

      return new Promise((resolve, reject) => {
        const request = store.openCursor();

        request.onerror = () => {
          logger.error('Error getting values from IndexedDB', { error: request.error });
          reject(request.error);
        };

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor) {
            const stored: StoredItem<V> = cursor.value;
            values.push(stored.value);
            cursor.continue();
          } else {
            resolve(values);
          }
        };
      });
    } catch (error) {
      logger.error('Error in IndexedDB values operation', { error });
      return [];
    }
  }

  public async clear(): Promise<void> {
    logger.debug('Clearing IndexedDB cache');
    try {
      const db = await this.getDB();
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);

      return new Promise((resolve, reject) => {
        const request = store.clear();

        request.onerror = () => {
          logger.error('Error clearing IndexedDB cache', { error: request.error });
          reject(request.error);
        };

        request.onsuccess = () => {
          resolve();
        };
      });
    } catch (error) {
      logger.error('Error in IndexedDB clear operation', { error });
    }
  }

  // Async Query result caching methods

  async setQueryResult(queryHash: string, itemKeys: (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[]): Promise<void> {
    logger.trace('setQueryResult', { queryHash, itemKeys });
    try {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(this.dbName, this.version);

        request.onerror = () => {
          logger.error('Failed to open database for setQueryResult', { error: request.error });
          reject(request.error);
        };

        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction([this.storeName], 'readwrite');
          const store = transaction.objectStore(this.storeName);

          const entry = {
            itemKeys
          };

          const queryKey = `query:${queryHash}`;
          const putRequest = store.put(safeStringify(entry), queryKey);

          putRequest.onerror = () => {
            logger.error('Failed to store query result', { queryHash, error: putRequest.error });
            reject(putRequest.error);
          };

          putRequest.onsuccess = () => {
            resolve();
          };
        };
      });
    } catch (error) {
      logger.error('Error in setQueryResult', { queryHash, error });
      throw error;
    }
  }

  async getQueryResult(queryHash: string): Promise<(ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[] | null> {
    logger.trace('getQueryResult', { queryHash });
    try {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(this.dbName, this.version);

        request.onerror = () => {
          logger.error('Failed to open database for getQueryResult', { error: request.error });
          reject(request.error);
        };

        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction([this.storeName], 'readonly');
          const store = transaction.objectStore(this.storeName);

          const queryKey = `query:${queryHash}`;
          const getRequest = store.get(queryKey);

          getRequest.onerror = () => {
            logger.error('Failed to retrieve query result', { queryHash, error: getRequest.error });
            reject(getRequest.error);
          };

          getRequest.onsuccess = () => {
            try {
              const result = getRequest.result;
              if (!result) {
                resolve(null);
                return;
              }

              const entry = JSON.parse(result);

              // Handle both old format (just array) and new format
              if (Array.isArray(entry)) {
                // Old format - return as is
                resolve(entry);
                return;
              }

              // New format

              resolve(entry.itemKeys || null);
            } catch (parseError) {
              logger.error('Failed to parse query result', { queryHash, error: parseError });
              resolve(null);
            }
          };
        };
      });
    } catch (error) {
      logger.error('Error in getQueryResult', { queryHash, error });
      return null;
    }
  }

  async hasQueryResult(queryHash: string): Promise<boolean> {
    logger.trace('hasQueryResult', { queryHash });
    try {
      const result = await this.getQueryResult(queryHash);
      return result !== null;
    } catch (error) {
      logger.error('Error in hasQueryResult', { queryHash, error });
      return false;
    }
  }

  async deleteQueryResult(queryHash: string): Promise<void> {
    logger.trace('deleteQueryResult', { queryHash });
    try {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(this.dbName, this.version);

        request.onerror = () => {
          logger.error('Failed to open database for deleteQueryResult', { error: request.error });
          reject(request.error);
        };

        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction([this.storeName], 'readwrite');
          const store = transaction.objectStore(this.storeName);

          const queryKey = `query:${queryHash}`;
          const deleteRequest = store.delete(queryKey);

          deleteRequest.onerror = () => {
            logger.error('Failed to delete query result', { queryHash, error: deleteRequest.error });
            reject(deleteRequest.error);
          };

          deleteRequest.onsuccess = () => {
            resolve();
          };
        };
      });
    } catch (error) {
      logger.error('Error in deleteQueryResult', { queryHash, error });
      throw error;
    }
  }

  async invalidateItemKeys(keys: (ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>)[]): Promise<void> {
    logger.debug('invalidateItemKeys', { keys });
    for (const key of keys) {
      await this.delete(key);
    }
  }

  async invalidateLocation(locations: LocKeyArray<L1, L2, L3, L4, L5> | []): Promise<void> {
    logger.debug('invalidateLocation', { locations });

    if (locations.length === 0) {
      // For primary items (no location), this would require getting all items and filtering
      // For now, we'll just clear all query results
      await this.clearQueryResults();
    } else {
      // For contained items, get all items in the location and invalidate them
      const itemsInLocation = await this.allIn(locations);
      const keysToInvalidate = itemsInLocation.map(item => item.key);
      await this.invalidateItemKeys(keysToInvalidate);
    }

    // Clear all query results that might be affected
    await this.clearQueryResults();
  }

  async clearQueryResults(): Promise<void> {
    logger.trace('clearQueryResults');
    try {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(this.dbName, this.version);

        request.onerror = () => {
          logger.error('Failed to open database for clearQueryResults', { error: request.error });
          reject(request.error);
        };

        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction([this.storeName], 'readwrite');
          const store = transaction.objectStore(this.storeName);

          // Use cursor to iterate through keys and delete those that start with 'query:'
          const cursorRequest = store.openCursor();
          const keysToDelete: string[] = [];

          cursorRequest.onerror = () => {
            logger.error('Failed to open cursor for clearQueryResults', { error: cursorRequest.error });
            reject(cursorRequest.error);
          };

          cursorRequest.onsuccess = () => {
            const cursor = cursorRequest.result;
            if (cursor) {
              const key = cursor.key;
              if (typeof key === 'string' && key.startsWith('query:')) {
                keysToDelete.push(key);
              }
              cursor.continue();
            } else {
              // No more entries, now delete all query keys
              if (keysToDelete.length === 0) {
                resolve();
                return;
              }

              let deletedCount = 0;
              const totalToDelete = keysToDelete.length;

              keysToDelete.forEach(queryKey => {
                const deleteRequest = store.delete(queryKey);

                deleteRequest.onerror = () => {
                  logger.error('Failed to delete query key', { queryKey, error: deleteRequest.error });
                  deletedCount++;
                  if (deletedCount === totalToDelete) {
                    resolve(); // Continue even if some deletions failed
                  }
                };

                deleteRequest.onsuccess = () => {
                  deletedCount++;
                  if (deletedCount === totalToDelete) {
                    resolve();
                  }
                };
              });
            }
          };
        };
      });
    } catch (error) {
      logger.error('Error in clearQueryResults', { error });
      throw error;
    }
  }
}
