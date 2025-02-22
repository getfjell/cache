/* eslint-disable no-undefined */
import { ClientApi } from "@fjell/client-api";
import { ComKey, Item, ItemQuery, LocKeyArray, PriKey, TypesProperties } from "@fjell/core";
import { AItemCache } from "./AItemCache";
import { CacheMap } from "./CacheMap";
import LibLogger from "./logger";

const logger = LibLogger.get('CItemCache');

export class CItemCache<
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
> extends AItemCache<V, S, L1, L2, L3, L4, L5> {

  public constructor(
    cacheName: string,
    api: ClientApi<V, S, L1, L2, L3, L4, L5>,
    pkType: S,
    parentCache: AItemCache<Item<L1, L2, L3, L4, L5, never>, L1, L2, L3, L4, L5>
  ) {
    super(cacheName, api, pkType, parentCache);
  }

  // TODO: There's something annoying about these parameters.   Location isn't option in a CItem, but query is.
  public async all(
    // istanbul ignore next
    query: ItemQuery = {},
    locations?: LocKeyArray<L1, L2, L3, L4, L5>
  ):
    Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V[]]> {
    logger.default('all', { query, locations });
    return await super.all(query, locations) as [CacheMap<V, S, L1, L2, L3, L4, L5>, V[]];
  }

  // TODO: There's something annoying about these parameters.   Location isn't option in a CItem, but query is.
  public async one(
    // istanbul ignore next
    query: ItemQuery = {},
    locations?: LocKeyArray<L1, L2, L3, L4, L5>
  ):
    Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V | null]> {
    logger.default('one', { query, locations });
    return await super.one(query, locations) as [CacheMap<V, S, L1, L2, L3, L4, L5>, V | null];
  }

  public async action(
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
    action: string,
    body: any = {}
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V]> {
    logger.default('action', { key, action, body });
    return await super.action(key, action, body) as [CacheMap<V, S, L1, L2, L3, L4, L5>, V];
  }

  // TODO: There's something annoying about these parameters.   Location isn't option in a CItem, but query is.
  public async allAction(
    action: string,
    // istanbul ignore next
    body: any = {},
    locations?: LocKeyArray<L1, L2, L3, L4, L5>
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V[]]> {
    logger.default('action', { action, body, locations });
    return await super.allAction(action, body, locations) as [CacheMap<V, S, L1, L2, L3, L4, L5>, V[]];
  }

  public async create(
    v: TypesProperties<V, S, L1, L2, L3, L4, L5>,
    locations?: LocKeyArray<L1, L2, L3, L4, L5>
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V]> {
    logger.default('create', { v });
    return await super.create(v, locations) as [CacheMap<V, S, L1, L2, L3, L4, L5>, V];
  }

  public async get(
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V | null]> {
    logger.default('get', { key });
    return await super.get(key) as [CacheMap<V, S, L1, L2, L3, L4, L5>, V | null];
  }

  public async retrieve(
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5> | null, V | null]> {
    logger.default('retrieve', { key });
    return await super.retrieve(key) as [CacheMap<V, S, L1, L2, L3, L4, L5> | null, V | null];
  }

  public async remove(
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>
  ): Promise<CacheMap<V, S, L1, L2, L3, L4, L5>> {
    logger.default('remove', { key });
    return await super.remove(key) as CacheMap<V, S, L1, L2, L3, L4, L5>;
  }

  public async update(
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
    v: TypesProperties<V, S, L1, L2, L3, L4, L5>
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V]> {
    logger.default('update', { key, v });
    return await super.update(key, v) as [CacheMap<V, S, L1, L2, L3, L4, L5>, V];
  }

  public async find(
    finder: string,
    finderParams: Record<string, string | number | boolean | Date | Array<string | number | boolean | Date>>,
    locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = []
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V[]]> {
    logger.default('find', { finder, finderParams, locations });
    return await super.find(finder, finderParams, locations) as [CacheMap<V, S, L1, L2, L3, L4, L5>, V[]];
  }

}
