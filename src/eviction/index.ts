// Core eviction strategy interfaces and base class
export { EvictionStrategy, CacheItemMetadata } from './EvictionStrategy';
export { createEvictionStrategy } from './EvictionStrategyFactory';

// Individual eviction strategy implementations
export { LRUEvictionStrategy } from './strategies/LRUEvictionStrategy';
export { LFUEvictionStrategy } from './strategies/LFUEvictionStrategy';
export { FIFOEvictionStrategy } from './strategies/FIFOEvictionStrategy';
export { MRUEvictionStrategy } from './strategies/MRUEvictionStrategy';
export { RandomEvictionStrategy } from './strategies/RandomEvictionStrategy';
export { ARCEvictionStrategy } from './strategies/ARCEvictionStrategy';
export { TwoQueueEvictionStrategy } from './strategies/TwoQueueEvictionStrategy';
