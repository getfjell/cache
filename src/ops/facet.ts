import {
  ComKey,
  Item,
  PriKey
} from "@fjell/core";
import { CacheContext } from "../CacheContext";
import LibLogger from "../logger";

const logger = LibLogger.get('facet');

export const facet = async <
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
>(
  key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
  facet: string,
  params: Record<string, string | number | boolean | Date | Array<string | number | boolean | Date>> = {},
  context: CacheContext<V, S, L1, L2, L3, L4, L5>
): Promise<any> => {
  const { api } = context;
  logger.default('facet', { key, facet });
  const ret = await api.facet(key, facet, params);
  return ret;
};
