import {
  AllItemTypeArrays,
  ComKey,
  Dictionary,
  isComKey,
  isQueryMatch,
  Item,
  ItemQuery,
  LocKeyArray,
  PriKey
} from "@fjell/core";
import LibLogger from "./logger";

const logger = LibLogger.get("CacheMap");

// Normalize a key value to string for consistent comparison and hashing
const normalizeKeyValue = (value: string | number): string => {
  return String(value);
};

// Normalized hash function for Dictionary that converts pk/lk values to strings
const createNormalizedHashFunction = <T>() => {
  return (key: T): string => {
    if (typeof key === 'object' && key !== null) {
      // Create a normalized version of the key with string values
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

      return JSON.stringify(normalizedKey);
    }
    return JSON.stringify(key);
  };
};

// Helper function to normalize and compare location key arrays
const isLocKeyArrayEqual = (a: any[], b: any[]): boolean => {
  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i++) {
    const normalizedA = normalizeLocKeyItem(a[i]);
    const normalizedB = normalizeLocKeyItem(b[i]);

    if (JSON.stringify(normalizedA) !== JSON.stringify(normalizedB)) {
      return false;
    }
  }

  return true;
};

// Helper function to normalize a location key item
const normalizeLocKeyItem = (item: any): any => {
  if (typeof item === 'object' && item !== null) {
    const normalized = { ...item };

    if ('lk' in normalized && normalized.lk !== null) {
      normalized.lk = normalizeKeyValue(normalized.lk);
    }

    return normalized;
  }

  return item;
};

// const isObj = (x: any) => typeof x === "object" && x !== null;

// const intersection = (a: object, b: object): object => {
//   const result: { [key: string]: any } = {}

//   if (([a, b]).every(isObj)) {
//     Object.keys(a).forEach((key) => {
//       // @ts-ignore
//       const value = a[key]
//       // @ts-ignore
//       const other = b[key]

//       if (isObj(value)) {
//         result[key] = intersection(value, other)
//       } else if (value === other) {
//         result[key] = value
//       }
//     })
//   }

//   return result
// }

// const removeEmptyObjects = (obj: object): object => {
//   const result: { [key: string]: any } = {}

//   Object.keys(obj).forEach((key) => {
//     // @ts-ignore
//     const value = obj[key];

//     if (isObj(value)) {
//       const nested = removeEmptyObjects(value);

//       if (Object.keys(nested).length > 0) {
//         result[key] = nested
//       }
//     } else if (value !== null) {
//       result[key] = value
//     }
//   });

//   return result;
// }

export class CacheMap<
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
> extends Dictionary<ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>, V> {

  private types: AllItemTypeArrays<S, L1, L2, L3, L4, L5>;
  private normalizedHashFunction: (key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>) => string;

  public constructor(
    types: AllItemTypeArrays<S, L1, L2, L3, L4, L5>,
    map?: { [key: string]: V },
  ) {
    const hashFunc = createNormalizedHashFunction<ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>>();
    super(map, hashFunc);
    this.types = types;
    this.normalizedHashFunction = hashFunc;
  }

  public get(
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
  ): V | null {
    logger.trace('get', { key });
    const hashedKey = this.normalizedHashFunction(key);
    const entry = this.map[hashedKey];
    // Check if entry exists AND the normalized keys match
    return entry && this.normalizedHashFunction(entry.originalKey) === this.normalizedHashFunction(key) ? entry.value : null;
  }

  public includesKey(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): boolean {
    const hashedKey = this.normalizedHashFunction(key);
    const entry = this.map[hashedKey];
    return entry ? this.normalizedHashFunction(entry.originalKey) === this.normalizedHashFunction(key) : false;
  }

  public delete(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): void {
    logger.trace('delete', { key });
    const hashedKey = this.normalizedHashFunction(key);
    delete this.map[hashedKey];
  }

  public allIn(
    locations: LocKeyArray<L1, L2, L3, L4, L5> | []
  ): V[] {
    if (locations.length === 0) {
      logger.debug('Returning all items, LocKeys is empty');
      return this.values();
    } else {
      const locKeys: LocKeyArray<L1, L2, L3, L4, L5> | [] = locations;
      logger.debug('allIn', { locKeys, keys: this.keys().length });
      return this.keys()
        .filter((key) => key && isComKey(key))
        .filter((key) => {
          const ComKey = key as ComKey<S, L1, L2, L3, L4, L5>;
          logger.debug('Comparing Location Keys', {
            locKeys,
            ComKey,
          });
          return isLocKeyArrayEqual(locKeys, ComKey.loc);
        })
        .map((key) => this.get(key) as V);
    }
  }

  // TODO: Can we do case insensitive matching?
  public contains(query: ItemQuery, locations: LocKeyArray<L1, L2, L3, L4, L5> | []): boolean {
    logger.debug('contains', { query, locations });
    const items = this.allIn(locations);

    return items.some((item) => isQueryMatch(item, query));
  }

  public queryIn(
    query: ItemQuery,
    locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = []
  ): V[] {
    logger.debug('queryIn', { query, locations });
    const items = this.allIn(locations);

    return items.filter((item) => isQueryMatch(item, query));
  }

  public clone(): CacheMap<V, S, L1, L2, L3, L4, L5> {
    const clone = new CacheMap<V, S, L1, L2, L3, L4, L5>(this.types);
    // Share the same underlying map reference (not a copy)
    clone.map = this.map;
    // Ensure the clone uses the same normalized hash function
    clone.normalizedHashFunction = this.normalizedHashFunction;
    return clone;
  }

};
