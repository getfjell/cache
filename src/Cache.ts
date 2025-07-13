import {
  AllItemTypeArrays,
  ComKey,
  isItemKeyEqual,
  isValidItemKey,
  Item,
  ItemQuery,
  LocKeyArray,
  PriKey,
  validatePK
} from "@fjell/core";
import { CacheMap } from "./CacheMap";
import LibLogger from "./logger";

import { ClientApi } from "@fjell/client-api";
import { NotFoundError } from "@fjell/http-api";

const logger = LibLogger.get('Cache');

// Normalize a key value to string for consistent comparison
const normalizeKeyValue = (value: string | number): string => {
  return String(value);
};

// Normalized key comparison function that handles string/number differences
const isItemKeyEqualNormalized = <
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
>(a: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>, b: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): boolean => {
  // For now, just normalize the keys to strings and use the original comparison
  const normalizedA = normalizeKey(a);
  const normalizedB = normalizeKey(b);
  return isItemKeyEqual(normalizedA as ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>, normalizedB as ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>);
};

// Helper function to normalize a key
const normalizeKey = (key: any): any => {
  if (typeof key === 'object' && key !== null) {
    const normalizedKey = JSON.parse(JSON.stringify(key));

    // Normalize pk values
    if ('pk' in normalizedKey && normalizedKey.pk !== null) {
      normalizedKey.pk = normalizeKeyValue(normalizedKey.pk);
    }

    // Normalize lk values
    if ('lk' in normalizedKey && normalizedKey.lk !== null) {
      normalizedKey.lk = normalizeKeyValue(normalizedKey.lk);
    }

    // Normalize loc array lk values
    if ('loc' in normalizedKey && Array.isArray(normalizedKey.loc)) {
      normalizedKey.loc = normalizedKey.loc.map((locItem: any) => {
        if (locItem && 'lk' in locItem && locItem.lk !== null) {
          return { ...locItem, lk: normalizeKeyValue(locItem.lk) };
        }
        return locItem;
      });
    }

    return normalizedKey;
  }
  return key;
};

export interface Cache<
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
> {

  all: (
    query?: ItemQuery,
    locations?: LocKeyArray<L1, L2, L3, L4, L5> | []
  ) =>
    Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V[]]>,

  one: (
    query?: ItemQuery,
    locations?: LocKeyArray<L1, L2, L3, L4, L5> | []
  ) => Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V | null]>

  action: (
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
    action: string,
    body?: any,
  ) => Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V]>

  allAction: (
    action: string,
    body?: any,
    locations?: LocKeyArray<L1, L2, L3, L4, L5> | []
  ) => Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V[]]>

  allFacet: (
    facet: string,
    params?: Record<string, string | number | boolean | Date | Array<string | number | boolean | Date>>,
    locations?: LocKeyArray<L1, L2, L3, L4, L5> | []
  ) => Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, any]>;

  create: (
    item: Partial<Item<S, L1, L2, L3, L4, L5>>,
    locations?: LocKeyArray<L1, L2, L3, L4, L5> | []
  ) => Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V]>;

  get: (
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
  ) => Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V | null]>;

  retrieve: (
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
  ) => Promise<[CacheMap<V, S, L1, L2, L3, L4, L5> | null, V | null]>;

  remove: (
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
  ) => Promise<CacheMap<V, S, L1, L2, L3, L4, L5>>;

  update: (
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
    item: Partial<Item<S, L1, L2, L3, L4, L5>>,
  ) => Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V]>;

  facet: (
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
    facet: string,
    params?: Record<string, string | number | boolean | Date | Array<string | number | boolean | Date>>,
  ) => Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, any]>;

  find: (
    finder: string,
    params?: Record<string, string | number | boolean | Date | Array<string | number | boolean | Date>>,
    locations?: LocKeyArray<L1, L2, L3, L4, L5> | []
  ) => Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V[]]>;

  findOne: (
    finder: string,
    params?: Record<string, string | number | boolean | Date | Array<string | number | boolean | Date>>,
    locations?: LocKeyArray<L1, L2, L3, L4, L5> | []
  ) => Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V]>;

  set: (
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
    item: Item<S, L1, L2, L3, L4, L5>
  ) => Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V]>;

  reset: () => Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>]>;

  pkTypes: AllItemTypeArrays<S, L1, L2, L3, L4, L5>;

  cacheMap: CacheMap<V, S, L1, L2, L3, L4, L5>;
}

export const createCache = async <
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
>(
  api: ClientApi<V, S, L1, L2, L3, L4, L5>,
  pkType: S,
  parentCache?: Cache<Item<L1, L2, L3, L4, L5>, L1, L2, L3, L4, L5>
): Promise<Cache<V, S, L1, L2, L3, L4, L5>> => {

  let pkTypes: AllItemTypeArrays<S, L1, L2, L3, L4, L5> = [pkType];
  if (parentCache) {
    pkTypes = pkTypes.concat(parentCache.pkTypes as any) as unknown as AllItemTypeArrays<S, L1, L2, L3, L4, L5>;
  }

  let cacheMap: CacheMap<V, S, L1, L2, L3, L4, L5> =
    new CacheMap<V, S, L1, L2, L3, L4, L5>(pkTypes as AllItemTypeArrays<S, L1, L2, L3, L4, L5>);

  const all = async (
    query: ItemQuery = {},
    locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = []
  ):
    Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V[]]> => {
    logger.default('all', { query, locations });
    let ret: V[] = [];
    try {
      ret = await api.all(query, locations);
      ret.forEach((v) => {
        cacheMap.set(v.key, v);
      });
    } catch (e: unknown) {
      if (e instanceof NotFoundError) {
      } else {
        throw e;
      }

    }
    return [cacheMap, validatePK(ret, pkType) as V[]];
  }

  const one = async (
    query: ItemQuery = {},
    locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = []
  ):
    Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V | null]> => {
    logger.default('one', { query, locations });

    let retItem: V | null = null;
    try {
      retItem = await api.one(query, locations);
      if (retItem) {
        cacheMap.set(retItem.key, retItem);
      }
    } catch (e: unknown) {
      if (e instanceof NotFoundError) {
      } else {
        throw e;
      }

    }
    return [
      cacheMap,
      retItem ?
        validatePK(retItem, pkType) as V :
        null
    ];
  }

  const action = async (
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
    action: string,
    body: any = {},
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V]> => {
    logger.default('action', { key, action, body });

    // TODO: This is validating the key, but it doesn't have knowledge of the pkType
    // This should be looking at the parentCaches and calculating an array of pkTypes
    if (!isValidItemKey(key)) {
      logger.error('Key for Action is not a valid ItemKey: %j', key);
      throw new Error('Key for Action is not a valid ItemKey');
    }

    const updated = await api.action(key, action, body);
    cacheMap.set(updated.key, updated);
    return [cacheMap, validatePK(updated, pkType) as V];
  }

  const allAction = async (
    action: string,
    body: any = {},
    locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = []
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V[]]> => {
    logger.default('allAction', { action, body, locations });
    let ret: V[] = [];
    try {
      ret = await api.allAction(action, body, locations);
      ret.forEach((v) => {
        cacheMap.set(v.key, v);
      });
    } catch (e: unknown) {
      // istanbul ignore next
      if (e instanceof NotFoundError) {
      } else {
        throw e;
      }

    }
    return [cacheMap, validatePK(ret, pkType) as V[]];
  }

  const allFacet = async (
    facet: string,
    params: Record<string, string | number | boolean | Date | Array<string | number | boolean | Date>> = {},
    locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = []
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, any]> => {
    logger.default('allFacet', { facet, params, locations });
    const ret = await api.allFacet(facet, params, locations);
    return [cacheMap, ret];
  }

  const create = async (
    v: Partial<Item<S, L1, L2, L3, L4, L5>>,
    locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = []
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V]> => {
    logger.default('create', { v, locations });
    const created = await api.create(v, locations);
    cacheMap.set(created.key, created);
    return [cacheMap, validatePK(created, pkType) as V];
  }

  const get = async (
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V | null]> => {
    logger.default('get', { key });
    // TODO: This is validating the key, but it doesn't have knowledge of the pkType
    // This should be looking at the parentCaches and calculating an array of pkTypes
    if (!isValidItemKey(key)) {
      logger.error('Key for Get is not a valid ItemKey: %j', key);
      throw new Error('Key for Get is not a valid ItemKey');
    }
    let ret: V | null;
    try {
      ret = await api.get(key);
      if (ret) {
        cacheMap.set(ret.key, ret);
      }
    } catch (e: any) {
      logger.error("Error getting item for key", { key, message: e.message, stack: e.stack });
      throw e;
    }
    return [
      cacheMap,
      ret ?
        validatePK(ret, pkType) as V :
        null
    ];
  }

  const retrieve = async (
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5> | null, V | null]> => {
    logger.default('retrieve', { key });
    if (!isValidItemKey(key)) {
      logger.error('Key for Retrieve is not a valid ItemKey: %j', key);
      throw new Error('Key for Retrieve is not a valid ItemKey');
    }
    const containsItemKey = cacheMap.includesKey(key);

    let retrieved: V | null;
    if (containsItemKey) {
      logger.default('Looking for Object in Cache', key);
      retrieved = cacheMap.get(key);
    } else {
      logger.default('Object Not Found in Cache, Retrieving from Server API', { key });
      [, retrieved] = await get(key);
    }
    const retValue: [CacheMap<V, S, L1, L2, L3, L4, L5> | null, V | null] = [
      containsItemKey ? null : cacheMap,
      retrieved ?
        validatePK(retrieved, pkType) as V :
        null
    ];
    // logger.debug('Returning from retrieve', { retValue });
    return retValue;
  }

  const remove = async (
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
  ): Promise<CacheMap<V, S, L1, L2, L3, L4, L5>> => {
    logger.default('remove', { key });
    // TODO: This is validating the key, but it doesn't have knowledge of the pkType
    // This should be looking at the parentCaches and calculating an array of pkTypes
    if (!isValidItemKey(key)) {
      logger.error('Key for Remove is not a valid ItemKey: %j', key);
      throw new Error('Key for Remove is not a valid ItemKey');
    }
    try {
      await api.remove(key);
      cacheMap.delete(key);
    } catch (e) {
      logger.error("Error deleting item", { error: e });
      throw e;
    }
    return cacheMap;
  }

  const update = async (
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
    v: Partial<Item<S, L1, L2, L3, L4, L5>>,
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V]> => {
    logger.default('update', { key, v });

    // TODO: This is validating the key, but it doesn't have knowledge of the pkType
    // This should be looking at the parentCaches and calculating an array of pkTypes
    if (!isValidItemKey(key)) {
      logger.error('Key for Update is not a valid ItemKey: %j', key);
      throw new Error('Key for Update is not a valid ItemKey');
    }

    try {
      const updated = await api.update(key, v);
      cacheMap.set(updated.key, updated);
      return [cacheMap, validatePK(updated, pkType) as V];
    } catch (e) {
      logger.error("Error updating chat", { error: e });
      throw e;
    }
  }

  // Facets are a pass-thru for caches
  const facet = async (
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
    facet: string,
    params: Record<string, string | number | boolean | Date | Array<string | number | boolean | Date>> = {},
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, any]> => {
    logger.default('facet', { key, facet });
    const ret = await api.facet(key, facet, params);
    return [cacheMap, ret];
  }

  const find = async (
    finder: string,
    params: Record<string, string | number | boolean | Date | Array<string | number | boolean | Date>> = {},
    locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = []
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V[]]> => {
    logger.default('find', { finder, params, locations });
    const ret: V[] = await api.find(finder, params, locations);
    ret.forEach((v) => {
      cacheMap.set(v.key, v);
    });
    return [cacheMap, validatePK(ret, pkType) as V[]];
  }

  const findOne = async (
    finder: string,
    finderParams: Record<string, string | number | boolean | Date | Array<string | number | boolean | Date>> = {},
    locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = []
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V]> => {
    logger.default('findOne', { finder, finderParams, locations });
    const ret = await api.findOne(finder, finderParams, locations);
    cacheMap.set(ret.key, ret);
    return [cacheMap, validatePK(ret, pkType) as V];
  }

  const reset = async (): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>]> => {
    cacheMap = new CacheMap<V, S, L1, L2, L3, L4, L5>(pkTypes);
    return [cacheMap];
  }

  const set = async (
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
    v: Item<S, L1, L2, L3, L4, L5>
  ): Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V]> => {
    logger.default('set', { key, v });

    // TODO: This is validating the key, but it doesn't have knowledge of the pkType
    // This should be looking at the parentCaches and calculating an array of pkTypes
    if (!isValidItemKey(key)) {
      logger.error('Key for Update is not a valid ItemKey: %j', key);
      throw new Error('Key for Update is not a valid ItemKey');
    }

    // TODO: This could be merged with the isValidItemKey check, later.
    validatePK(v, pkType);

    if (!isItemKeyEqualNormalized(key, v.key)) {
      logger.error('Key does not match item key: %j != %j', key, v.key);
      throw new Error('Key does not match item key');
    }

    cacheMap.set(key, v as V);
    return [cacheMap, validatePK(v, pkType) as V];
  }

  return {
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
    pkTypes,
    cacheMap
  }
}
