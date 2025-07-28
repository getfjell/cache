import { Item } from "@fjell/core";
import { ClientApi } from "@fjell/client-api";
import { InstanceFactory as BaseInstanceFactory, Registry, RegistryHub } from "@fjell/registry";
import { Instance } from "./Instance";
import { Coordinate } from "@fjell/registry";
import { CacheMap } from "./CacheMap";
import { createOperations } from "./Operations";
import LibLogger from "./logger";

const logger = LibLogger.get("InstanceFactory");

export type InstanceFactory<
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
> = (
  api: ClientApi<V, S, L1, L2, L3, L4, L5>
) => BaseInstanceFactory<S, L1, L2, L3, L4, L5>;

/**
 * Factory function for creating cache instances
 */
export const createInstanceFactory = <
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
>(
    api: ClientApi<V, S, L1, L2, L3, L4, L5>
  ): BaseInstanceFactory<S, L1, L2, L3, L4, L5> => {
  return (coordinate: Coordinate<S, L1, L2, L3, L4, L5>, context: { registry: Registry, registryHub?: RegistryHub }) => {
    logger.debug("Creating cache instance", { coordinate, registry: context.registry, api });

    // Since InstanceFactory must be synchronous but our createInstance is async,
    // we need to create a special cache instance synchronously and defer the async initialization
    const cacheMap = new CacheMap<V, S, L1, L2, L3, L4, L5>(coordinate.kta);
    const pkType = coordinate.kta[0] as S;
    const operations = createOperations(api, coordinate, cacheMap, pkType);

    return {
      coordinate,
      registry: context.registry,
      api,
      cacheMap,
      operations
    } as Instance<V, S, L1, L2, L3, L4, L5>;
  };
};
