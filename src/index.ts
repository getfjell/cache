// Core cache functionality
export { createCache, isCache } from './Cache';
export type { Cache } from './Cache';
export { CacheMap } from './CacheMap';

// Cache implementations
export { MemoryCacheMap } from './memory/MemoryCacheMap';
export { EnhancedMemoryCacheMap } from './memory/EnhancedMemoryCacheMap';
export { LocalStorageCacheMap } from './browser/LocalStorageCacheMap';
export { SessionStorageCacheMap } from './browser/SessionStorageCacheMap';
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
export { createInstanceFactory } from './InstanceFactory';
export type { InstanceFactory } from './InstanceFactory';
export { Instance, createInstance, isInstance } from './Instance';

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

// Operations
export { createOperations } from './Operations';
export type { Operations } from './Operations';
