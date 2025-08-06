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
  switch (policy) {
    case 'lru':
      return new LRUEvictionStrategy();
    case 'lfu': {
      const lfuConfig = config?.type === 'lfu' ? config : {};
      return new LFUEvictionStrategy(lfuConfig);
    }
    case 'fifo':
      return new FIFOEvictionStrategy();
    case 'mru':
      return new MRUEvictionStrategy();
    case 'random':
      return new RandomEvictionStrategy();
    case 'arc': {
      const arcConfig = config?.type === 'arc' ? config : { ...DEFAULT_ARC_CONFIG, maxCacheSize };
      return new ARCEvictionStrategy(arcConfig.maxCacheSize, arcConfig);
    }
    case '2q': {
      const twoQConfig = config?.type === '2q' ? config : { ...DEFAULT_TWO_QUEUE_CONFIG, maxCacheSize };
      return new TwoQueueEvictionStrategy(twoQConfig.maxCacheSize, twoQConfig);
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
