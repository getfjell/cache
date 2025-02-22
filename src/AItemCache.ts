/* eslint-disable no-undefined, max-params */

import { ClientApi } from "@fjell/client-api";
import {
  AItemService,
  ComKey,
  isValidItemKey,
  Item,
  ItemQuery,
  LocKeyArray,
  PriKey,
  TypesProperties,
  validatePK
} from "@fjell/core";
import { NotFoundError } from "@fjell/http-api";
import { Cache } from "./Cache";
import { CacheMap } from "./CacheMap";
import LibLogger from "./logger";

const logger = LibLogger.get('AItemCache');

export class AItemCache<
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
> extends AItemService<S, L1, L2, L3, L4, L5> implements Cache<V, S, L1, L2, L3, L4, L5> {

  protected cacheName: string;
  protected api: ClientApi<V, S, L1, L2, L3, L4, L5>;

  public cacheMap: CacheMap<V, S, L1, L2, L3, L4, L5>;

  public constructor(
    cacheName: string,
    api: ClientApi<V, S, L1, L2, L3, L4, L5>,
    pkType: S,
    parentCache?: AItemCache<Item<L1, L2, L3, L4, L5>, L1, L2, L3, L4, L5>
  ) {
    super(pkType, parentCache);
    this.cacheName = cacheName;
    this.api = api;
    // TODO: I wonder if this is even going to work - can you access an instance of a class in a constructor?
    this.cacheMap =
      new CacheMap<V, S, L1, L2, L3, L4, L5>(this.getKeyTypes());
  }

  public async all(
    query: ItemQuery = {},
    locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = []
  ):
    Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V[]]> {
    logger.default('all', { query, locations });
    let ret: V[] = [];
    try {
      ret = await this.api.all(query, {}, locations);
      ret.forEach((v) => {
        this.cacheMap.set(v.key, v);
      });
    } catch (e: unknown) {
      if (e instanceof NotFoundError) {
      } else {
        throw e;
      }

    }
    return [this.cacheMap, validatePK(ret, this.getPkType()) as V[]];
  }

  public async one(
    query: ItemQuery = {},
    locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = []
  ):
      Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V | null]> {
    logger.default('one', { query, locations });

    let retItem: V | null = null;
    try {
      retItem = await this.api.one(query, {}, locations);
      if (retItem) {
        this.cacheMap.set(retItem.key, retItem);
      }
    } catch (e: unknown) {
      if (e instanceof NotFoundError) {
      } else {
        throw e;
      }

    }
    return [
      this.cacheMap,
      retItem ?
        validatePK(retItem, this.getPkType()) as V :
        null
    ];
  }

  public async action(
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
    action: string,
    body: any = {},
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V]> {
    logger.default('action', { key, action, body });

    if (!isValidItemKey(key)) {
      logger.error('Key for Action is not a valid ItemKey: %j', key);
      throw new Error('Key for Action is not a valid ItemKey');
    }

    const updated = await this.api.action(key, action, body, {});
    this.cacheMap.set(updated.key, updated);
    return [this.cacheMap, validatePK(updated, this.getPkType()) as V];
  }

  public async allAction(
    action: string,
    body: any = {},
    locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = []
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V[]]> {
    logger.default('allAction', { action, body, locations });
    let ret: V[] = [];
    try {
      ret = await this.api.allAction(action, body, {}, locations);
      ret.forEach((v) => {
        this.cacheMap.set(v.key, v);
      });
    } catch (e: unknown) {
      // istanbul ignore next
      if (e instanceof NotFoundError) {
      } else {
        throw e;
      }

    }
    return [this.cacheMap, validatePK(ret, this.getPkType()) as V[]];
  }

  public async create(
    v: TypesProperties<V, S, L1, L2, L3, L4, L5>,
    locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = []
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V]> {
    logger.default('create', { v, locations });
    const created = await this.api.create(v, {}, locations);
    this.cacheMap.set(created.key, created);
    return [this.cacheMap, validatePK(created, this.getPkType()) as V];
  }

  public async get(
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V | null]> {
    logger.default('get', { key });
    if (!isValidItemKey(key)) {
      logger.error('Key for Get is not a valid ItemKey: %j', key);
      throw new Error('Key for Get is not a valid ItemKey');
    }
    let ret: V | null;
    try {
      ret = await this.api.get(key, {});
      if (ret) {
        this.cacheMap.set(ret.key, ret);
      }
    } catch (e: any) {
      logger.error("Error getting item for key", { key, message: e.message, stack: e.stack });
      throw e;
    }
    return [
      this.cacheMap,
      ret ?
        validatePK(ret, this.getPkType()) as V :
        null
    ];
  }

  public async retrieve(
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5> | null, V | null]> {
    logger.default('retrieve', { key });
    if (!isValidItemKey(key)) {
      logger.error('Key for Retrieve is not a valid ItemKey: %j', key);
      throw new Error('Key for Retrieve is not a valid ItemKey');
    }
    const containsItemKey = this.cacheMap.includesKey(key);

    let retrieved: V | null;
    if (containsItemKey) {
      logger.default('Looking for Object in Cache', key);
      retrieved = this.cacheMap.get(key);
    } else {
      logger.default('Object Not Found in Cache, Retrieving from Server API', { key });
      [, retrieved] = await this.get(key);
    }
    const retValue: [CacheMap<V, S, L1, L2, L3, L4, L5> | null, V | null] = [
      containsItemKey ? null : this.cacheMap,
      retrieved ?
        validatePK(retrieved, this.getPkType()) as V:
        null
    ];
    // logger.debug('Returning from retrieve', { retValue });
    return retValue;
  }

  public async remove(
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
  ): Promise<CacheMap<V, S, L1, L2, L3, L4, L5>> {
    logger.default('remove', { key });
    if (!isValidItemKey(key)) {
      logger.error('Key for Remove is not a valid ItemKey: %j', key);
      throw new Error('Key for Remove is not a valid ItemKey');
    }
    try {
      await this.api.remove(key, {});
      this.cacheMap.delete(key);
    } catch (e) {
      logger.error("Error deleting item", { error: e });
      throw e;
    }
    return this.cacheMap;
  }

  public async update(
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
    v: TypesProperties<V, S, L1, L2, L3, L4, L5>,
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V]> {
    logger.default('update', { key, v });

    if (!isValidItemKey(key)) {
      logger.error('Key for Update is not a valid ItemKey: %j', key);
      throw new Error('Key for Update is not a valid ItemKey');
    }

    try {
      const updated = await this.api.update(key, v, {});
      // }
      this.cacheMap.set(updated.key, updated);
      return [this.cacheMap, validatePK(updated, this.getPkType()) as V];
    } catch (e) {
      logger.error("Error updating chat", { error: e });
      throw e;
    }
  }

  public async find(
    finder: string,
    finderParams: Record<string, string | number | boolean | Date | Array<string | number | boolean | Date>>,
    locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = []
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V[]]> {
    logger.default('find', { finder, finderParams, locations });
    const ret: V[] = await this.api.find(finder, finderParams, {}, locations);
    ret.forEach((v) => {
      this.cacheMap.set(v.key, v);
    });
    return [this.cacheMap, validatePK(ret, this.getPkType()) as V[]];
  }

  public loadCache = async (cache: CacheMap<V, S, L1, L2, L3, L4, L5>) => {
    this.cacheMap = cache;
  }

}
