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

  public constructor(
    types: AllItemTypeArrays<S, L1, L2, L3, L4, L5>,
    map?: { [key: string]: V },
  ) {
    super(map);
    this.types = types;
  }

  public get(
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
  ): V | null {
    return super.get(key) as V | null;
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
          return JSON.stringify(locKeys) === JSON.stringify(ComKey.loc);
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
    const clone = new CacheMap<V, S, L1, L2, L3, L4, L5>(this.types, this.map);
    return clone;
  }

};