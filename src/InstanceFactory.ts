import { Item } from "@fjell/core";
import { Cache } from "./Cache";
import { InstanceFactory as BaseInstanceFactory, Registry, RegistryHub } from "@fjell/registry";
import { createInstance, Instance } from "./Instance";
import { Coordinate } from "@fjell/registry";
import LibLogger from "@/logger";

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
  cache: Cache<V, S, L1, L2, L3, L4, L5>
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
    cache: Cache<V, S, L1, L2, L3, L4, L5>
  ): BaseInstanceFactory<S, L1, L2, L3, L4, L5> => {
  return (coordinate: Coordinate<S, L1, L2, L3, L4, L5>, context: { registry: Registry, registryHub?: RegistryHub }) => {
    logger.debug("Creating cache instance", { coordinate, registry: context.registry, cache });

    return createInstance(context.registry, coordinate, cache) as Instance<V, S, L1, L2, L3, L4, L5>;
  };
};
