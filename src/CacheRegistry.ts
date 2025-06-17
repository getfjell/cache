import { Item } from "@fjell/core";
import { Cache } from "./Cache";
import LibLogger from './logger';

const logger = LibLogger.get('CacheRegistry');

export class CacheRegistry {

  private static instance: CacheRegistry;

  public constructor() {
    logger.debug('CacheRegistry instance created');
  }

  // TODO: My use of Generics has Boxed me into a corner where I can't reference AbstractCache without the types
  private cacheMap: { [kt: string]: any } = {};

  public registerCache = async <
    S extends string,
    L1 extends string = never,
    L2 extends string = never,
    L3 extends string = never,
    L4 extends string = never,
    L5 extends string = never
  >(cache: Cache<Item<S, L1, L2, L3, L4, L5>, S, L1, L2, L3, L4, L5>): Promise<void> => {
    try {
      logger.debug('Attempting to register cache with pkTypes:', cache.pkTypes);
      const key = JSON.stringify(cache.pkTypes);
      if (this.cacheMap[key]) {
        logger.debug(`Cache with pkTypes ${key} already exists, will be overwritten`);
      }
      this.cacheMap[key] = cache;
      logger.debug('Cache registered successfully with key:', key);
    } catch (error) {
      logger.error('Failed to register cache:', error);
      throw error;
    }
  };

  public getCache = (kts: string[]): any => {
    logger.debug('Attempting to get cache for key types:', kts);
    
    const key = JSON.stringify(kts);
    logger.debug('Looking up cache with key:', key);
    
    const cache = this.cacheMap[key];
    if (!cache) {
      logger.warning(`No cache found for key types: ${key}`);
    }
    return cache;
  };

  public printRegisteredCaches = (): void => {
    logger.debug('Printing all registered caches:');
    const cacheCount = Object.keys(this.cacheMap).length;
    logger.debug(`Total number of registered caches: ${cacheCount}`);
    
    if (cacheCount === 0) {
      logger.debug('No caches are currently registered');
    }
    
    Object.entries(this.cacheMap).forEach(([keyTypes]) => {
      logger.debug(`Cache with key types: ${keyTypes}`);
    });
  };
}