// Core cache functionality
export { createCache, isCache } from './Cache';
export type { Cache } from './Cache';
export { CacheMap } from './CacheMap';

// Cache implementations
export { MemoryCacheMap } from './memory/MemoryCacheMap';
export { EnhancedMemoryCacheMap } from './memory/EnhancedMemoryCacheMap';
export { LocalStorageCacheMap } from './browser/LocalStorageCacheMap';
export { SessionStorageCacheMap } from './browser/SessionStorageCacheMap';

// IndexedDB implementations - choose based on your needs:
// - IndexDBCacheMap: Synchronous API with background IndexedDB persistence (good for sync compatibility)
// - AsyncIndexDBCacheMap: Pure async API with direct IndexedDB operations (good for modern async apps)
export { IndexDBCacheMap } from './browser/IndexDBCacheMap';
export { AsyncIndexDBCacheMap } from './browser/AsyncIndexDBCacheMap';

// Configuration and options
export {
  createOptions,
  createCacheMap,
  validateOptions
} from './Options';
export type {
  Options,
  CacheType,
  EvictionPolicy,
  CacheSizeConfig,
  IndexedDBConfig,
  WebStorageConfig,
  MemoryConfig,
  CacheMapFactory
} from './Options';

// Instance factory and instance
// Note: Instance is a type alias for Cache - both represent the same cache interface
export { createInstanceFactory } from './InstanceFactory';
export type { InstanceFactory } from './InstanceFactory';
export { createInstance, isInstance } from './Instance';
export type { Instance } from './Instance';

// Utilities
export {
  normalizeKeyValue,
  createNormalizedHashFunction,
  isLocKeyArrayEqual,
  normalizeLocKeyItem
} from './normalization';
export {
  parseSizeString,
  formatBytes,
  estimateValueSize,
  validateSizeConfig
} from './utils/CacheSize';
export {
  createEvictionStrategy
} from './eviction';
export type {
  CacheItemMetadata,
  EvictionStrategy
} from './eviction';
export {
  validateEvictionStrategyConfig,
  validateLFUConfig,
  validateARCConfig,
  validateTwoQueueConfig,
  createValidatedConfig
} from './eviction/EvictionStrategyValidation';

// Operations
export { createOperations } from './Operations';
export type { Operations } from './Operations';

// Aggregator functionality
export { createAggregator, toCacheConfig } from './Aggregator';
export type { Aggregator, CacheConfig, AggregateConfig } from './Aggregator';
