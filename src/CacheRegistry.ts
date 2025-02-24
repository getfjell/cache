import { Item } from "@fjell/core";
import { Cache } from "./Cache";
import LibLogger from './logger';

const logger = LibLogger.get('CacheRegistry');

export class CacheRegistry {

  private static instance: CacheRegistry;
  private configured: boolean = false;

  public constructor() {
    logger.debug('CacheRegistry created');
  }

  public static getInstance(
  ): CacheRegistry {
    if (!CacheRegistry.instance) {
      CacheRegistry.instance = new CacheRegistry();
    }
    return CacheRegistry.instance;
  }

  // TODO: My use of Generics has Boxed me into a corner where I can't reference AbstractCache without the types
  private cacheMap: { [kt: string]: any } = {};

  public registerCache = <
    S extends string,
    L1 extends string = never,
    L2 extends string = never,
    L3 extends string = never,
    L4 extends string = never,
    L5 extends string = never
  >(cache: Cache<Item<S, L1, L2, L3, L4, L5>, S, L1, L2, L3, L4, L5>): void => {
    this.cacheMap[JSON.stringify(cache.pkTypes)] = cache;
  };

  public isConfigured = (): boolean => {
    return this.configured;
  }

  public markConfigured = (): void => {
    this.configured = true;
  }

  public getCache = (kts: string[]): any => {
    if (!this.configured) {
      logger.error('CacheRegistry must be configured before use');
      throw new Error("CacheRegistry must be configured before use");
    }
    return this.cacheMap[JSON.stringify(kts)];
  };

}