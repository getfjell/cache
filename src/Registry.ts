import LibLogger from '@/logger';
import {
  Registry as BaseRegistry,
  createRegistry as createBaseRegistry,
  RegistryFactory,
  RegistryHub
} from '@fjell/registry';

const logger = LibLogger.get("Registry");

/**
 * Extended Registry interface for cache-specific functionality
 */
export interface Registry extends BaseRegistry {
  type: 'cache';
}

/**
 * Factory function for creating cache registries
 */
export const createRegistryFactory = (): RegistryFactory => {
  return (type: string, registryHub?: RegistryHub): BaseRegistry => {
    if (type !== 'cache') {
      throw new Error(`Cache registry factory can only create 'cache' type registries, got: ${type}`);
    }

    logger.debug("Creating cache registry", { type, registryHub });

    const baseRegistry = createBaseRegistry(type, registryHub);

    // Cast to Registry for type safety
    return baseRegistry as Registry;
  };
};

/**
 * Creates a new cache registry instance
 */
export const createRegistry = (registryHub?: RegistryHub): Registry => {
  const baseRegistry = createBaseRegistry('cache', registryHub);

  return {
    ...baseRegistry,
  } as Registry;
};
