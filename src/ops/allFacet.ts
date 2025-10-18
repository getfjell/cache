import {
  createAllFacetWrapper,
  Item,
  LocKeyArray
} from "@fjell/core";
import { CacheContext } from "../CacheContext";
import LibLogger from "../logger";

const logger = LibLogger.get('allFacet');

export const allFacet = async <
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
>(
  facet: string,
  params: Record<string, string | number | boolean | Date | Array<string | number | boolean | Date>> = {},
  locations: LocKeyArray<L1, L2, L3, L4, L5> | [] = [],
  context: CacheContext<V, S, L1, L2, L3, L4, L5>
): Promise<any> => {
  const { api, coordinate } = context;
  logger.default('allFacet', { facet, params, locations });

  const wrappedAllFacet = createAllFacetWrapper(
    coordinate,
    async (f, p, locs) => {
      return await api.allFacet(f, p ?? {}, locs ?? []);
    }
  );

  return await wrappedAllFacet(facet, params, locations);
};
