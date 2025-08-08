import { Item } from "@fjell/core";
import { ClientApi } from "@fjell/client-api";
import { InstanceFactory as BaseInstanceFactory, Registry, RegistryHub } from "@fjell/registry";
import { Instance } from "./Instance";
import { Coordinate } from "@fjell/registry";
import { createOperations } from "./Operations";
import { createCacheMap, createOptions, Options, validateOptions } from "./Options";
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
  api: ClientApi<V, S, L1, L2, L3, L4, L5>,
  options?: Partial<Options<V, S, L1, L2, L3, L4, L5>>
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
    api: ClientApi<V, S, L1, L2, L3, L4, L5>,
    options?: Partial<Options<V, S, L1, L2, L3, L4, L5>>
  ): BaseInstanceFactory<S, L1, L2, L3, L4, L5> => {

  // Create and validate a template of options - this validates the provided options
  const templateOptions = createOptions(options);
  validateOptions(templateOptions);

  return (coordinate: Coordinate<S, L1, L2, L3, L4, L5>, context: { registry: Registry, registryHub?: RegistryHub }) => {
    // Create fresh options for each instance to ensure immutability
    const instanceOptions = createOptions(options);

    logger.debug("Creating cache instance", {
      coordinate,
      registry: context.registry,
      api,
      cacheType: instanceOptions.cacheType,
      options: instanceOptions
    });

    // Create the appropriate cache map based on options
    const cacheMap = createCacheMap<V, S, L1, L2, L3, L4, L5>(coordinate.kta, instanceOptions);
    const pkType = coordinate.kta[0] as S;
    // Create event emitter for this instance (use dynamic import later if needed)
    // For now, skip event emitter in InstanceFactory since it's an older interface
    const mockEventEmitter = {
      subscribe: () => ({ id: 'mock', unsubscribe: () => false, isActive: () => false, getOptions: () => ({}) }),
      unsubscribe: () => false,
      emit: () => { },
      getSubscriptionCount: () => 0,
      getSubscriptions: () => [],
      destroy: () => { }
    } as any;
    const mockTTLManager = {
      getDefaultTTL: () => 1000,
      isTTLEnabled: () => true,
      validateItem: () => true,
      getTTL: () => 1000,
      setTTL: () => { }
    } as any;
    const mockEvictionManager = {
      isEvictionSupported: () => false,
      getEvictionStrategyName: () => null
    } as any;
    const operations = createOperations(api, coordinate, cacheMap, pkType, instanceOptions, mockEventEmitter, mockTTLManager, mockEvictionManager);

    return {
      coordinate,
      registry: context.registry,
      api,
      cacheMap,
      operations,
      options: instanceOptions
    } as Instance<V, S, L1, L2, L3, L4, L5>;
  };
};
