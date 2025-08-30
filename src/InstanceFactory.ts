import { Item } from "@fjell/core";
import { ClientApi } from "@fjell/client-api";
import { InstanceFactory as BaseInstanceFactory, Registry, RegistryHub } from "@fjell/registry";
import { Instance } from "./Instance";
import { Coordinate } from "@fjell/registry";
import { createOperations } from "./Operations";
import { createCacheMap, createOptions, Options, validateOptions } from "./Options";
import { TTLManager } from "./ttl/TTLManager";
import { EvictionManager } from "./eviction/EvictionManager";
import { CacheEventEmitter } from "./events/CacheEventEmitter";
import LibLogger from "./logger";
import { CacheStatsManager } from "./CacheStats";

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

    // Create proper managers instead of mocks
    const eventEmitter = new CacheEventEmitter<V, S, L1, L2, L3, L4, L5>();
    const ttlManager = new TTLManager({
      defaultTTL: instanceOptions.ttl,
      autoCleanup: true,
      validateOnAccess: true
    });
    const evictionManager = new EvictionManager();
    const statsManager = new CacheStatsManager();
    const operations = createOperations(
      api, coordinate, cacheMap, pkType, instanceOptions, eventEmitter, ttlManager, evictionManager, statsManager, context.registry);

    return {
      coordinate,
      registry: context.registry,
      api,
      cacheMap,
      operations,
      options: instanceOptions,
      eventEmitter,
      ttlManager,
      evictionManager,
      statsManager,
      getCacheInfo: () => {
        const evictionStrategyName = evictionManager.getEvictionStrategyName();
        const cacheInfo = {
          implementationType: cacheMap.implementationType,
          defaultTTL: ttlManager.getDefaultTTL(),
          supportsTTL: (cacheMap as any).supportsTTL?.() || !!ttlManager.getDefaultTTL(),
          supportsEviction: evictionManager.isEvictionSupported()
        };
        if (evictionStrategyName) {
          (cacheInfo as any).evictionPolicy = evictionStrategyName;
        }
        return cacheInfo;
      },
      getStats: () => statsManager.getStats(),
      subscribe: (listener, options) => eventEmitter.subscribe(listener, options),
      unsubscribe: (subscription) => eventEmitter.unsubscribe(subscription.id),
      destroy: () => {
        if (typeof ttlManager.destroy === 'function') {
          ttlManager.destroy();
        }
        eventEmitter.destroy();
      }
    } as Instance<V, S, L1, L2, L3, L4, L5>;
  };
};
