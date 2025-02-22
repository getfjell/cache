/* eslint-disable no-undefined */
import {
  ComKey,
  Item,
  ItemQuery,
  LocKeyArray,
  PriKey,
  TypesProperties
} from "@fjell/core";
import { CacheMap } from "./CacheMap";

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

  create: (
    v: TypesProperties<V, S, L1, L2, L3, L4, L5>,
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
    v: TypesProperties<V, S, L1, L2, L3, L4, L5>,
  ) => Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V]>;

  find: (
    finder: string,
    finderParams: Record<string, string | number | boolean | Date | Array<string | number | boolean | Date>>,
    locations?: LocKeyArray<L1, L2, L3, L4, L5> | []
  ) => Promise<[CacheMap<V, S, L1, L2, L3, L4, L5>, V[]]>;

}
