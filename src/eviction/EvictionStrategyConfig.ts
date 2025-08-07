/**
 * Base configuration interface for eviction strategies
 */
export interface EvictionStrategyConfig {
  /** Strategy type identifier */
  readonly type: string;
}

/**
 * Configuration for LFU eviction strategy with frequency sketching
 */
export interface LFUConfig extends EvictionStrategyConfig {
  readonly type: 'lfu';
  /** Decay factor for aging frequency counts (0.0 to 1.0, default: 0.1) */
  decayFactor?: number;
  /** Frequency decay interval in milliseconds (default: 60000) */
  decayInterval?: number;
  /** Width of the Count-Min Sketch (default: 1024) */
  sketchWidth?: number;
  /** Depth of the Count-Min Sketch (default: 4) */
  sketchDepth?: number;
  /** Whether to use probabilistic counting (default: true) */
  useProbabilisticCounting?: boolean;
  /** Minimum frequency threshold before decay (default: 1) */
  minFrequencyThreshold?: number;
}

/**
 * Configuration for LRU eviction strategy
 */
export interface LRUConfig extends EvictionStrategyConfig {
  readonly type: 'lru';
}

/**
 * Configuration for FIFO eviction strategy
 */
export interface FIFOConfig extends EvictionStrategyConfig {
  readonly type: 'fifo';
}

/**
 * Configuration for MRU eviction strategy
 */
export interface MRUConfig extends EvictionStrategyConfig {
  readonly type: 'mru';
}

/**
 * Configuration for Random eviction strategy
 */
export interface RandomConfig extends EvictionStrategyConfig {
  readonly type: 'random';
}

/**
 * Configuration for ARC eviction strategy
 */
export interface ARCConfig extends EvictionStrategyConfig {
  readonly type: 'arc';
  /** Maximum cache size for ARC calculations */
  maxCacheSize?: number;
  /** Frequency threshold for classifying items as "frequent" vs "recent" (default: 2) */
  frequencyThreshold?: number;
  /** Use enhanced frequency tracking with decay (default: true) */
  useEnhancedFrequency?: boolean;
  /** Decay factor for aging frequency scores (default: 0.05) */
  frequencyDecayFactor?: number;
  /** Decay interval for frequency scores (default: 600000 - 10 minutes) */
  frequencyDecayInterval?: number;
  /** Use frequency-weighted selection within T1/T2 lists (default: true) */
  useFrequencyWeightedSelection?: boolean;
  /** Adaptive learning rate for target size adjustments (default: 1.0) */
  adaptiveLearningRate?: number;
}

/**
 * Configuration for 2Q eviction strategy
 */
export interface TwoQueueConfig extends EvictionStrategyConfig {
  readonly type: '2q';
  /** Maximum cache size for 2Q calculations */
  maxCacheSize?: number;
  /** Use frequency-based promotion from recent to hot queue (default: true) */
  useFrequencyPromotion?: boolean;
  /** Minimum access frequency required for promotion to hot queue (default: 2) */
  promotionThreshold?: number;
  /** Decay factor for aging frequency scores in hot queue (default: 0.05) */
  hotQueueDecayFactor?: number;
  /** Decay interval for hot queue frequency scores (default: 300000 - 5 minutes) */
  hotQueueDecayInterval?: number;
  /** Use frequency-weighted LRU in hot queue instead of pure LRU (default: true) */
  useFrequencyWeightedLRU?: boolean;
}

/**
 * Union type for all eviction strategy configurations
 */
export type EvictionStrategyConfigs =
  | LFUConfig
  | LRUConfig
  | FIFOConfig
  | MRUConfig
  | RandomConfig
  | ARCConfig
  | TwoQueueConfig;

/**
 * Default configuration values
 */
export const DEFAULT_LFU_CONFIG: LFUConfig = {
  type: 'lfu',
  decayFactor: 0.1,
  decayInterval: 60000, // 1 minute
  sketchWidth: 1024,
  sketchDepth: 4,
  useProbabilisticCounting: true,
  minFrequencyThreshold: 1
};

export const DEFAULT_ARC_CONFIG: ARCConfig = {
  type: 'arc',
  maxCacheSize: 1000,
  frequencyThreshold: 2,
  useEnhancedFrequency: true,
  frequencyDecayFactor: 0.05,
  frequencyDecayInterval: 600000, // 10 minutes
  useFrequencyWeightedSelection: true,
  adaptiveLearningRate: 1.0
};

export const DEFAULT_TWO_QUEUE_CONFIG: TwoQueueConfig = {
  type: '2q',
  maxCacheSize: 1000,
  useFrequencyPromotion: true,
  promotionThreshold: 2,
  hotQueueDecayFactor: 0.05,
  hotQueueDecayInterval: 300000, // 5 minutes
  useFrequencyWeightedLRU: true
};
