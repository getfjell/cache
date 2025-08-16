
import {
  ComKey,
  Item,
  ItemQuery,
  LocKeyArray,
  PriKey
} from "@fjell/core";
import { Cache } from "./Cache";
import { CacheMap } from "./CacheMap";
import { CacheEventEmitter } from "./events/CacheEventEmitter";
import { CacheEventListener, CacheSubscription, CacheSubscriptionOptions } from "./events/CacheEventTypes";
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
  // Cache operations exposed directly for aggregator
  all: (
    query?: ItemQuery,
    locations?: LocKeyArray<L1, L2, L3, L4, L5> | []
  ) => Promise<V[]>;

  one: (
    query?: ItemQuery,
    locations?: LocKeyArray<L1, L2, L3, L4, L5> | []
  ) => Promise<V | null>;

  action: (
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
    action: string,
    body?: any
  ) => Promise<V>;

  allAction: (
    action: string,
    body?: any,
    locations?: LocKeyArray<L1, L2, L3, L4, L5> | []
  ) => Promise<V[]>;

  allFacet: (
    facet: string,
    params?: Record<string, string | number | boolean | Date | Array<string | number | boolean | Date>>,
    locations?: LocKeyArray<L1, L2, L3, L4, L5> | []
  ) => Promise<any>;

  create: (
    item: Partial<Item<S, L1, L2, L3, L4, L5>>,
    locations?: LocKeyArray<L1, L2, L3, L4, L5> | []
  ) => Promise<V>;

  get: (
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>
  ) => Promise<V | null>;

  retrieve: (
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>
  ) => Promise<V | null>;

  remove: (
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>
  ) => Promise<void>;

  update: (
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
    item: Partial<Item<S, L1, L2, L3, L4, L5>>
  ) => Promise<V>;

  facet: (
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
    facet: string,
    params?: Record<string, string | number | boolean | Date | Array<string | number | boolean | Date>>
  ) => Promise<any>;

  find: (
    finder: string,
    params?: Record<string, string | number | boolean | Date | Array<string | number | boolean | Date>>,
    locations?: LocKeyArray<L1, L2, L3, L4, L5> | []
  ) => Promise<V[]>;

  findOne: (
    finder: string,
    params?: Record<string, string | number | boolean | Date | Array<string | number | boolean | Date>>,
    locations?: LocKeyArray<L1, L2, L3, L4, L5> | []
  ) => Promise<V>;

  set: (
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
    item: Item<S, L1, L2, L3, L4, L5>
  ) => Promise<V>;

  reset: () => Promise<void>;

  populate: (item: V) => Promise<V>;
  populateAggregate: (key: string, item: V) => Promise<void>;
  populateEvent: (key: string, item: V) => Promise<void>;

  /** Event emitter for cache events */
  eventEmitter: CacheEventEmitter<V, S, L1, L2, L3, L4, L5>;

  /**
   * Subscribe to cache events
   */
  subscribe(
    listener: CacheEventListener<V, S, L1, L2, L3, L4, L5>,
    options?: CacheSubscriptionOptions<S, L1, L2, L3, L4, L5>
  ): CacheSubscription;

  /**
   * Unsubscribe from cache events
   */
  unsubscribe(subscription: CacheSubscription): boolean;
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

export const createAggregator = async <
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
): Promise<Aggregator<V, S, L1, L2, L3, L4, L5>> => {

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
        logger.error('Item does not have refs an is not optional ', { item });
        throw new Error('Item does not have refs an is not optional ' + JSON.stringify(item));
      } else {
        if (item.events && Object.prototype.hasOwnProperty.call(item.events, key)) {
          delete item.events[key];
        }
      }
    } else if (item.refs[key] === undefined) {
      if (cacheConfig.optional === false) {
        logger.error('Item does not have mandatory ref with key, not optional ', { key, item });
        throw new Error('Item does not have mandatory ref with key, not optional ' +
          key + ' ' + JSON.stringify(item));
      } else {
        if (item.events && Object.prototype.hasOwnProperty.call(item.events, key)) {
          delete item.events[key];
        }
      }
    } else {

      const ref = item.refs[key];

      logger.default('AGG Retrieving Item in Populate', { key: ref });
      const newItem = await cacheConfig.cache.operations.retrieve(ref);
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
        logger.error('Item does not have mandatory event with key', { key, item });
        throw new Error('Item does not have mandatory event with key ' + key + ' ' + JSON.stringify(item));
      }
    } else {
      const event = item.events[key];

      if (event.by === undefined) {
        logger.error(
          'populateEvent with an Event that does not have by', { event, ik: item.key, eventKey: key });
        throw new Error('populateEvent with an Event that does not have by: ' + JSON.stringify({ key }));
      }

      logger.default('EVENT Retrieving Item in Populate', { key: event.by });
      const newItem = await cacheConfig.cache.operations.retrieve(event.by);
      if (newItem) {
        event.agg = newItem as Item;
      }
    }
  }

  const all = async (
    query: ItemQuery = {},
    locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = []
  ):
    Promise<V[]> => {
    logger.default('all', { query, locations });
    const items = await cache.operations.all(query, locations);
    const populatedItems = await Promise.all(items.map(async (item) => populate(item)));
    return populatedItems;
  }

  const one = async (
    query: ItemQuery = {},
    locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = []
  ):
    Promise<V | null> => {
    logger.default('one', { query, locations });
    const item = await cache.operations.one(query, locations);
    let populatedItem = null;
    if (item) {
      populatedItem = await populate(item);
    }
    return populatedItem;
  }

  const action = async (
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
    action: string,
    body: any = {},
  ): Promise<V> => {
    logger.default('action', { key, action, body });
    const item = await cache.operations.action(key, action, body);
    const populatedItem = await populate(item);
    return populatedItem;
  }

  const allAction = async (
    action: string,
    body: any = {},
    locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = []
  ): Promise<V[]> => {
    logger.default('action', { action, body, locations });
    const items = await cache.operations.allAction(action, body, locations);
    const populatedItems = await Promise.all(items.map(async (item: V) => populate(item)));
    return populatedItems;
  }

  const allFacet = async (
    facet: string,
    params: Record<string, string | number | boolean | Date | Array<string | number | boolean | Date>> = {},
    locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = []
  ): Promise<any> => {
    logger.default('allFacet', { facet, params, locations });
    const response = await cache.operations.allFacet(facet, params, locations);
    return response;
  }

  const create = async (
    v: Partial<Item<S, L1, L2, L3, L4, L5>>,
    locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = []
  ): Promise<V> => {
    logger.default('create', { v, locations });
    const item = await cache.operations.create(v, locations);
    const populatedItem = await populate(item);
    return populatedItem;
  }

  const get = async (
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
  ): Promise<V | null> => {
    logger.default('get', { key });
    const item = await cache.operations.get(key);
    let populatedItem = null;
    if (item) {
      populatedItem = await populate(item);
    }
    return populatedItem;
  }

  const retrieve = async (
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
  ): Promise<V | null> => {
    logger.default('retrieve', { key });
    const item = await cache.operations.retrieve(key);
    let populatedItem = null;
    if (item) {
      populatedItem = await populate(item);
    }
    return populatedItem;
  }

  const remove = async (
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
  ): Promise<void> => {
    logger.default('remove', { key });
    await cache.operations.remove(key);
  }

  const update = async (
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
    v: Partial<Item<S, L1, L2, L3, L4, L5>>,
  ): Promise<V> => {
    logger.default('update', { key, v });
    const item = await cache.operations.update(key, v);
    const populatedItem = await populate(item);
    return populatedItem;
  }

  // Facets are a pass-thru for aggregators
  const facet = async (
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
    facet: string,
  ): Promise<any> => {
    logger.default('facet', { key, facet });
    const response = await cache.operations.facet(key, facet);
    return response;
  }

  const find = async (
    finder: string,
    finderParams: Record<string, string | number | boolean | Date | Array<string | number | boolean | Date>> = {},
    locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = []
  ): Promise<V[]> => {
    logger.default('find', { finder, finderParams, locations });
    const items = await cache.operations.find(finder, finderParams, locations);
    const populatedItems = await Promise.all(items.map(async (item: V) => populate(item)));
    return populatedItems;
  }

  const findOne = async (
    finder: string,
    finderParams: Record<string, string | number | boolean | Date | Array<string | number | boolean | Date>> = {},
    locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = []
  ): Promise<V> => {
    logger.default('find', { finder, finderParams, locations });
    const item = await cache.operations.findOne(finder, finderParams, locations);
    const populatedItem = await populate(item);
    return populatedItem;
  }

  const set = async (
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
    v: Item<S, L1, L2, L3, L4, L5>
  ): Promise<V> => {
    logger.default('set', { key, v });

    // TODO: There should be some input validation here to ensure a valid item.
    const item = await cache.operations.set(key, v);
    const populatedItem = await populate(item);
    return populatedItem;
  }

  const reset = async (): Promise<void> => {
    await cache.operations.reset();
  }

  return {
    // Cache properties
    coordinate: (cache as any).coordinate,
    registry: (cache as any).registry,
    api: cache.api,
    cacheMap: cache.cacheMap,
    operations: cache.operations,
    evictionManager: cache.evictionManager,
    ttlManager: cache.ttlManager,
    statsManager: cache.statsManager,
    getStats: cache.getStats.bind(cache),
    getCacheInfo: cache.getCacheInfo.bind(cache),
    // Cache operations exposed directly
    all,
    one,
    action,
    allAction,
    allFacet,
    create,
    get,
    retrieve,
    remove,
    update,
    facet,
    find,
    findOne,
    reset,
    set,
    // Aggregator-specific operations
    populate,
    populateAggregate,
    populateEvent,
    // Event system
    eventEmitter: cache.eventEmitter,
    subscribe: (listener, options) => cache.subscribe(listener, options),
    unsubscribe: (subscription) => cache.unsubscribe(subscription),
    destroy: () => cache.destroy()
  } as Aggregator<V, S, L1, L2, L3, L4, L5>
}
