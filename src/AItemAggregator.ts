/* eslint-disable no-undefined, max-params */

import {
  ComKey,
  Item,
  ItemQuery,
  LocKeyArray,
  PriKey,
  TypesProperties
} from "@fjell/core";
import { AItemCache } from "./AItemCache";
import { Cache } from "./Cache";
import { CacheMap } from "./CacheMap";
import LibLogger from "./logger";

export interface CacheConfig { cache: any, optional: boolean }

export interface AggregateConfig { [key: string]: (CacheConfig) }

export const toCacheConfig = <
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
>(config: CacheConfig | Cache<V, S, L1, L2, L3, L4, L5>): CacheConfig => {
  let cacheConfig: CacheConfig;
  if ((config as CacheConfig).optional === undefined) {
    cacheConfig = { cache: config as any, optional: false };
  } else {
    cacheConfig = config as CacheConfig;
  }
  return cacheConfig;
}

export class AItemAggregator<
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
> implements Cache<V, S, L1, L2, L3, L4, L5> {

  private cache: AItemCache<V, S, L1, L2, L3, L4, L5>;
  private logger;
  private aggregates: AggregateConfig = {};
  private events: AggregateConfig = {};

  public constructor(
    cache: AItemCache<V, S, L1, L2, L3, L4, L5>,
    { aggregates = {}, events = {} }:
      {
        aggregates?: AggregateConfig,
        events?: AggregateConfig
      },
  ) {
    this.cache = cache;
    this.aggregates = aggregates;
    this.events = events;
    // istanbul ignore next
    this.logger = LibLogger.get("AItemAggregator", ...aggregates ? Object.keys(aggregates) : []);
  }

  private async populate(item: V): Promise<V> {
    this.logger.default('populate', { item });
    for (const key in this.aggregates) {
      await this.populateAggregate(key, item);
    }
    for (const key in this.events) {
      await this.populateEvent(key, item);
    }
    this.logger.default('populate done', { item });
    return item;
  }

  private async populateAggregate(key: string, item: V) {
    this.logger.default('populate aggregate key', { key });
    const cacheConfig = toCacheConfig(this.aggregates[key]);
    if (item.refs === undefined) {
      if (cacheConfig.optional === false) {
        this.logger.error('Item does not have refs an is not optional ' + JSON.stringify(item));
        throw new Error('Item does not have refs an is not optional ' + JSON.stringify(item));
      }
    } else if (item.refs[key] === undefined) {
      if (cacheConfig.optional === false) {
        this.logger.error('Item does not have mandatory ref with key, not optional ' +
            key + ' ' + JSON.stringify(item));
        throw new Error('Item does not have mandatory ref with key, not optional ' +
            key + ' ' + JSON.stringify(item));
      }
    } else {

      const ref = item.refs[key];

      this.logger.default('AGG Retrieving Item in Populate', { key: ref });
      const [, newItem] = await cacheConfig.cache.retrieve(ref);
      if (newItem) {
        if (item.aggs === undefined) {
          item.aggs = {};
        }
        item.aggs[key] = {
          key: ref,
          item: newItem as Item,
        };
      }
    }
  }

  // TODO: I'm not a big fan that this just "automatically" assumes that the "by" key in event is a ref.
  private async populateEvent(key: string, item: V) {
    this.logger.default('populate event key', { key });
    const cacheConfig = toCacheConfig(this.events[key]);

    if (item.events === undefined) {
      throw new Error('Item does not have events ' + JSON.stringify(item));
    } else if (item.events[key] === undefined) {
      if (cacheConfig.optional === false) {
        this.logger.error('Item does not have mandatory event with key ' + key + ' ' + JSON.stringify(item));
        throw new Error('Item does not have mandatory event with key ' + key + ' ' + JSON.stringify(item));
      }
    } else {
      const event = item.events[key];

      if (event.by === undefined) {
        this.logger.error(
          'populateEvent with an Event that does not have by', { event, ik: item.key, eventKey: key });
        throw new Error('populateEvent with an Event that does not have by: ' + JSON.stringify({ key, event }));
      }

      this.logger.default('EVENT Retrieving Item in Populate', { key: event.by });
      const [, newItem] = await cacheConfig.cache.retrieve(event.by);
      if (newItem) {
        event.agg = newItem as Item;
      }
    }
  }

  public async all(
    query: ItemQuery = {},
    locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = []
  ):
    Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V[]]> {
    this.logger.default('all', { query, locations });
    const [cacheMap, items] = await this.cache.all(query, locations);
    const populatedItems = await Promise.all(items.map(async (item) => this.populate(item)));
    return [cacheMap, populatedItems];
  }

  public async one(
    query: ItemQuery = {},
    locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = []
  ):
    Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V | null]> {
    this.logger.default('one', { query, locations });
    const [cacheMap, item] = await this.cache.one(query, locations);
    let populatedItem = null;
    if (item) {
      populatedItem = await this.populate(item);
    }
    return [cacheMap, populatedItem];
  }

  public async action(
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
    action: string,
    body: any = {},
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V]> {
    this.logger.default('action', { key, action, body });
    const [cacheMap, item] = await this.cache.action(key, action, body);
    const populatedItem = await this.populate(item);
    return [cacheMap, populatedItem];
  }

  public async allAction(
    action: string,
    body: any = {},
    locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = []
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V[]]> {
    this.logger.default('action', { action, body, locations });
    const [cacheMap, items] = await this.cache.allAction(action, body, locations);
    const populatedItems = await Promise.all(items.map(async (item) => this.populate(item)));
    return [cacheMap, populatedItems];
  }

  public async create(
    v: TypesProperties<V, S, L1, L2, L3, L4, L5>,
    locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = []
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V]> {
    this.logger.default('create', { v, locations });
    const [cacheMap, item] = await this.cache.create(v, locations);
    const populatedItem = await this.populate(item);
    return [cacheMap, populatedItem];
  }

  public async get(
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V | null]> {
    this.logger.default('get', { key });
    const [cacheMap, item] = await this.cache.get(key);
    let populatedItem = null;
    if (item) {
      populatedItem = await this.populate(item);
    }
    return [cacheMap, populatedItem];
  }

  public async retrieve(
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5> | null, V | null]> {
    this.logger.default('retrieve', { key });
    const [cacheMap, item] = await this.cache.retrieve(key);
    let populatedItem = null;
    if (item) {
      populatedItem = await this.populate(item);
    }
    return [cacheMap, populatedItem];
  }

  public async remove(
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
  ): Promise<CacheMap<V, S, L1, L2, L3, L4, L5>> {
    this.logger.default('remove', { key });
    const cacheMap = await this.cache.remove(key);
    return cacheMap;
  }

  public async update(
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
    v: TypesProperties<V, S, L1, L2, L3, L4, L5>,
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V]> {
    this.logger.default('update', { key, v });
    const [cacheMap, item] = await this.cache.update(key, v);
    const populatedItem = await this.populate(item);
    return [cacheMap, populatedItem];
  }

  public async find(
    finder: string,
    finderParams: Record<string, string | number | boolean | Date | Array<string | number | boolean | Date>>,
    locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = []
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V[]]> {
    this.logger.default('find', { finder, finderParams, locations });
    const [cacheMap, items] = await this.cache.find(finder, finderParams, locations);
    const populatedItems = await Promise.all(items.map(async (item) => this.populate(item)));
    return [cacheMap, populatedItems];
  }
}
