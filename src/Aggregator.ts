/* eslint-disable no-undefined */
import {
  ComKey,
  Item,
  ItemQuery,
  LocKeyArray,
  PriKey,
  TypesProperties
} from "@fjell/core";
import { Cache } from "./Cache";
import { CacheMap } from "./CacheMap";
import LibLogger from "./logger";

const logger = LibLogger.get('ItemAggregator');

export interface Aggregator<
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
> extends Cache<V, S, L1, L2, L3, L4, L5> {
  populate: (item: V) => Promise<V>;
  populateAggregate: (key: string, item: V) => Promise<void>;
  populateEvent: (key: string, item: V) => Promise<void>;
}

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

export const createAggregator = <
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
>(
    cache: Cache<V, S, L1, L2, L3, L4, L5>,
    { aggregates = {}, events = {} }:
      {
        aggregates?: AggregateConfig,
        events?: AggregateConfig
      }
  ): Aggregator<V, S, L1, L2, L3, L4, L5> => {

  const populate = async (item: V): Promise<V> => {
    logger.default('populate', { item });
    for (const key in aggregates) {
      await populateAggregate(key, item);
    }
    for (const key in events) {
      await populateEvent(key, item);
    }
    logger.default('populate done', { item });
    return item;
  }

  const populateAggregate = async (key: string, item: V) => {
    logger.default('populate aggregate key', { key });
    const cacheConfig = toCacheConfig(aggregates[key]);
    if (item.refs === undefined) {
      if (cacheConfig.optional === false) {
        logger.error('Item does not have refs an is not optional ' + JSON.stringify(item));
        throw new Error('Item does not have refs an is not optional ' + JSON.stringify(item));
      }
    } else if (item.refs[key] === undefined) {
      if (cacheConfig.optional === false) {
        logger.error('Item does not have mandatory ref with key, not optional ' +
            key + ' ' + JSON.stringify(item));
        throw new Error('Item does not have mandatory ref with key, not optional ' +
            key + ' ' + JSON.stringify(item));
      }
    } else {

      const ref = item.refs[key];

      logger.default('AGG Retrieving Item in Populate', { key: ref });
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
  const populateEvent = async (key: string, item: V) => {
    logger.default('populate event key', { key });
    const cacheConfig = toCacheConfig(events[key]);

    if (item.events === undefined) {
      throw new Error('Item does not have events ' + JSON.stringify(item));
    } else if (item.events[key] === undefined) {
      if (cacheConfig.optional === false) {
        logger.error('Item does not have mandatory event with key ' + key + ' ' + JSON.stringify(item));
        throw new Error('Item does not have mandatory event with key ' + key + ' ' + JSON.stringify(item));
      }
    } else {
      const event = item.events[key];

      if (event.by === undefined) {
        logger.error(
          'populateEvent with an Event that does not have by', { event, ik: item.key, eventKey: key });
        throw new Error('populateEvent with an Event that does not have by: ' + JSON.stringify({ key, event }));
      }

      logger.default('EVENT Retrieving Item in Populate', { key: event.by });
      const [, newItem] = await cacheConfig.cache.retrieve(event.by);
      if (newItem) {
        event.agg = newItem as Item;
      }
    }
  }

  const all = async (
    query: ItemQuery = {},
    locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = []
  ):
    Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V[]]> => {
    logger.default('all', { query, locations });
    const [cacheMap, items] = await cache.all(query, locations);
    const populatedItems = await Promise.all(items.map(async (item) => populate(item)));
    return [cacheMap, populatedItems];
  }

  const one = async (
    query: ItemQuery = {},
    locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = []
  ):
    Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V | null]> => {
    logger.default('one', { query, locations });
    const [cacheMap, item] = await cache.one(query, locations);
    let populatedItem = null;
    if (item) {
      populatedItem = await populate(item);
    }
    return [cacheMap, populatedItem];
  }

  const action = async (
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
    action: string,
    body: any = {},
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V]> => {
    logger.default('action', { key, action, body });
    const [cacheMap, item] = await cache.action(key, action, body);
    const populatedItem = await populate(item);
    return [cacheMap, populatedItem];
  }

  const allAction = async (
    action: string,
    body: any = {},
    locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = []
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V[]]> => {
    logger.default('action', { action, body, locations });
    const [cacheMap, items] = await cache.allAction(action, body, locations);
    const populatedItems = await Promise.all(items.map(async (item) => populate(item)));
    return [cacheMap, populatedItems];
  }

  const create = async (
    v: TypesProperties<V, S, L1, L2, L3, L4, L5>,
    locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = []
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V]> => {
    logger.default('create', { v, locations });
    const [cacheMap, item] = await cache.create(v, locations);
    const populatedItem = await populate(item);
    return [cacheMap, populatedItem];
  }

  const get = async (
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V | null]> => {
    logger.default('get', { key });
    const [cacheMap, item] = await cache.get(key);
    let populatedItem = null;
    if (item) {
      populatedItem = await populate(item);
    }
    return [cacheMap, populatedItem];
  }

  const retrieve = async (
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5> | null, V | null]> => {
    logger.default('retrieve', { key });
    const [cacheMap, item] = await cache.retrieve(key);
    let populatedItem = null;
    if (item) {
      populatedItem = await populate(item);
    }
    return [cacheMap, populatedItem];
  }

  const remove = async (
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
  ): Promise<CacheMap<V, S, L1, L2, L3, L4, L5>> => {
    logger.default('remove', { key });
    const cacheMap = await cache.remove(key);
    return cacheMap;
  }

  const update = async (
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
    v: TypesProperties<V, S, L1, L2, L3, L4, L5>,
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V]> => {
    logger.default('update', { key, v });
    const [cacheMap, item] = await cache.update(key, v);
    const populatedItem = await populate(item);
    return [cacheMap, populatedItem];
  }

  const find = async (
    finder: string,
    finderParams: Record<string, string | number | boolean | Date | Array<string | number | boolean | Date>>,
    locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = []
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V[]]> => {
    logger.default('find', { finder, finderParams, locations });
    const [cacheMap, items] = await cache.find(finder, finderParams, locations);
    const populatedItems = await Promise.all(items.map(async (item) => populate(item)));
    return [cacheMap, populatedItems];
  }

  const reset = async (): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>]> => {
    const cacheMap = await cache.reset();
    return cacheMap;
  }

  return {
    all,
    one,
    action,
    allAction,
    create,
    get,
    retrieve,
    remove,
    update,
    find,
    reset,
    pkTypes: cache.pkTypes,
    cacheMap: cache.cacheMap,
    populate,
    populateAggregate,
    populateEvent
  }
}
