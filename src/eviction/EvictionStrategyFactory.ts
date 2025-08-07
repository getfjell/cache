import { EvictionPolicy } from '../Options';
import { EvictionStrategy } from './EvictionStrategy';
import {
  DEFAULT_ARC_CONFIG,
  DEFAULT_TWO_QUEUE_CONFIG,
  EvictionStrategyConfigs
} from './EvictionStrategyConfig';

// Import all strategy classes
import { LRUEvictionStrategy } from './strategies/LRUEvictionStrategy';
import { LFUEvictionStrategy } from './strategies/LFUEvictionStrategy';
import { FIFOEvictionStrategy } from './strategies/FIFOEvictionStrategy';
import { MRUEvictionStrategy } from './strategies/MRUEvictionStrategy';
import { RandomEvictionStrategy } from './strategies/RandomEvictionStrategy';
import { ARCEvictionStrategy } from './strategies/ARCEvictionStrategy';
import { TwoQueueEvictionStrategy } from './strategies/TwoQueueEvictionStrategy';

/**
 * Factory function to create eviction strategy instances with configuration
 */
export function createEvictionStrategy(
  policy: EvictionPolicy,
  maxCacheSize?: number,
  config?: EvictionStrategyConfigs
): EvictionStrategy {
  // Handle edge case of invalid maxCacheSize by using a reasonable default
  const safeMaxCacheSize = (typeof maxCacheSize === 'number' && maxCacheSize > 0) ? maxCacheSize : 1000;

  switch (policy) {
    case 'lru':
      return new LRUEvictionStrategy();
    case 'lfu': {
      try {
        const lfuConfig = config?.type === 'lfu' ? config : { type: 'lfu' as const };
        return new LFUEvictionStrategy(lfuConfig);
      } catch (error) {
        // If LFU strategy creation fails due to invalid config, fall back to LRU
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`Failed to create lfu strategy with provided configuration, falling back to LRU:`, errorMessage);
        return new LRUEvictionStrategy();
      }
    }
    case 'fifo':
      return new FIFOEvictionStrategy();
    case 'mru':
      return new MRUEvictionStrategy();
    case 'random':
      return new RandomEvictionStrategy();
    case 'arc': {
      try {
        const arcConfig = config?.type === 'arc' ? config : { ...DEFAULT_ARC_CONFIG, maxCacheSize: safeMaxCacheSize };
        const finalMaxSize = (arcConfig.maxCacheSize && arcConfig.maxCacheSize > 0) ? arcConfig.maxCacheSize : safeMaxCacheSize;
        return new ARCEvictionStrategy(finalMaxSize, { ...arcConfig, maxCacheSize: finalMaxSize });
      } catch (error) {
        // If ARC strategy creation fails due to invalid config, fall back to LRU
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`Failed to create arc strategy with provided configuration, falling back to LRU:`, errorMessage);
        return new LRUEvictionStrategy();
      }
    }
    case '2q': {
      try {
        const twoQConfig = config?.type === '2q' ? config : { ...DEFAULT_TWO_QUEUE_CONFIG, maxCacheSize: safeMaxCacheSize };
        const finalMaxSize = (twoQConfig.maxCacheSize && twoQConfig.maxCacheSize > 0) ? twoQConfig.maxCacheSize : safeMaxCacheSize;
        return new TwoQueueEvictionStrategy(finalMaxSize, { ...twoQConfig, maxCacheSize: finalMaxSize });
      } catch (error) {
        // If 2Q strategy creation fails due to invalid config, fall back to LRU
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`Failed to create 2q strategy with provided configuration, falling back to LRU:`, errorMessage);
        return new LRUEvictionStrategy();
      }
    }
    default:
      throw new Error(`Unsupported eviction policy: ${policy}`);
  }
}

/**
 * Factory function for backwards compatibility
 * @deprecated Use createEvictionStrategy with config parameter instead
 */
export function createEvictionStrategyLegacy(policy: EvictionPolicy, maxCacheSize?: number): EvictionStrategy {
  return createEvictionStrategy(policy, maxCacheSize);
}
