/* eslint-disable no-undefined, max-params */

import { ClientApi } from "@fjell/client-api";
import { Item, ItemQuery, PriKey, TypesProperties } from "@fjell/core";
import { AItemCache } from "./AItemCache";
import { CacheMap } from "./CacheMap";
import LibLogger from './logger';

const logger = LibLogger.get('PItemCache');
export class PItemCache<
  V extends Item<S>,
  S extends string
> extends AItemCache<V,S> {

  public constructor(
    cacheName: string,
    api: ClientApi<V, S>,
    pkType: S,
  ) {
    super(cacheName, api, pkType);
  }

  public async all(
    query: ItemQuery = {},
  ):
    Promise<[CacheMap<V, S>, V[]]> {
    logger.default('all', { query });
    return await super.all(query) as [CacheMap<V, S>, V[]];
  }

  public async one(
    query: ItemQuery = {},
  ):
    Promise<[CacheMap<V, S>, V | null]> {
    logger.default('one', { query });
    return await super.one(query) as [CacheMap<V, S>, V | null];
  }

  public async action(
    key: PriKey<S>,
    action: string,
    body: any = {}
  ): Promise<[CacheMap<V, S>, V]> {
    logger.default('action', { key, action, body });
    return await super.action(key, action, body) as [CacheMap<V, S>, V];
  }

  public async allAction(
    action: string,
    body: any = {}
  ): Promise<[CacheMap<V, S>, V[]]> {
    logger.default('action', { action, body });
    return await super.allAction(action, body) as [CacheMap<V, S>, V[]];
  }

  public async create(
    v: TypesProperties<V, S, never, never, never, never, never>,
  ): Promise<[CacheMap<V, S>, V]> {
    logger.default('create', { v });
    return await super.create(v) as [CacheMap<V, S>, V];
  }

  public async get(key: PriKey<S>,
  ): Promise<[CacheMap<V, S>, V | null]> {
    logger.default('get', { key });
    return await super.get(key) as [CacheMap<V, S>, V | null];
  }

  public async retrieve(
    key: PriKey<S>,
  ): Promise<[CacheMap<V, S> | null, V | null]> {
    logger.default('retrieve', { key });
    return await super.retrieve(key) as [CacheMap<V, S> | null, V | null];
  }

  public async remove(
    key: PriKey<S>
  ): Promise<CacheMap<V, S>> {
    logger.default('remove', { key });
    return await super.remove(key) as CacheMap<V, S>;
  }

  public async update(
    key: PriKey<S>,
    v: TypesProperties<V, S>
  ): Promise<[CacheMap<V, S>, V]> {
    logger.default('update', { key, v });
    return await super.update(key, v) as [CacheMap<V, S>, V];
  }

  public async find(
    finder: string,
    finderParams: Record<string, string | number | boolean | Date | Array<string | number | boolean | Date>>,
  ): Promise<[CacheMap<V, S>, V[]]> {
    logger.default('find', { finder, finderParams });
    return await super.find(finder, finderParams) as [CacheMap<V, S>, V[]];
  }

}
