/**
 * Validation functions for eviction strategy configurations
 */
import {
  ARCConfig,
  EvictionStrategyConfigs,
  LFUConfig,
  TwoQueueConfig
} from './EvictionStrategyConfig';

/**
 * Validates that a number is within a specified range
 */
function validateNumberRange(
  value: number,
  min: number,
  max: number,
  fieldName: string
): void {
  if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) {
    throw new Error(`${fieldName} must be a finite number`);
  }
  if (value < min || value > max) {
    throw new Error(`${fieldName} must be between ${min} and ${max}, got ${value}`);
  }
}

/**
 * Validates that a number is a positive integer
 */
function validatePositiveInteger(value: number, fieldName: string): void {
  if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) {
    throw new Error(`${fieldName} must be a finite number`);
  }
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer, got ${value}`);
  }
}

/**
 * Sanitizes LFU configuration parameters, correcting invalid values
 */
export function sanitizeLFUConfig(config: Partial<LFUConfig>): Partial<LFUConfig> {
  const sanitized = { ...config };

  // Sanitize decayFactor to be between 0 and 1
  if (typeof sanitized.decayFactor === 'number') {
    if (sanitized.decayFactor < 0) {
      console.warn(`decayFactor must be between 0 and 1, got ${sanitized.decayFactor}. Correcting to 0.`);
      sanitized.decayFactor = 0;
    } else if (sanitized.decayFactor > 1) {
      console.warn(`decayFactor must be between 0 and 1, got ${sanitized.decayFactor}. Correcting to 1.`);
      sanitized.decayFactor = 1;
    }
  }

  // Sanitize decayInterval to be positive
  if (typeof sanitized.decayInterval === 'number' && sanitized.decayInterval <= 0) {
    console.warn(`decayInterval must be positive, got ${sanitized.decayInterval}. Correcting to 300000.`);
    sanitized.decayInterval = 300000; // 5 minutes default
  }

  // Sanitize sketchWidth to be positive and reasonable
  if (typeof sanitized.sketchWidth === 'number') {
    if (sanitized.sketchWidth <= 0) {
      console.warn(`sketchWidth must be positive, got ${sanitized.sketchWidth}. Correcting to 1024.`);
      sanitized.sketchWidth = 1024;
    } else if (sanitized.sketchWidth < 16) {
      console.warn(`sketchWidth should be at least 16 for optimal performance, got ${sanitized.sketchWidth}. Correcting to 16.`);
      sanitized.sketchWidth = 16;
    } else if (sanitized.sketchWidth > 65536) {
      console.warn(`sketchWidth should not exceed 65536 for optimal performance, got ${sanitized.sketchWidth}. Correcting to 65536.`);
      sanitized.sketchWidth = 65536;
    }
  }

  // Sanitize sketchDepth to be positive and reasonable
  if (typeof sanitized.sketchDepth === 'number') {
    if (sanitized.sketchDepth <= 0) {
      console.warn(`sketchDepth must be positive, got ${sanitized.sketchDepth}. Correcting to 4.`);
      sanitized.sketchDepth = 4;
    } else if (sanitized.sketchDepth < 1) {
      console.warn(`sketchDepth should be at least 1 for optimal accuracy, got ${sanitized.sketchDepth}. Correcting to 1.`);
      sanitized.sketchDepth = 1;
    } else if (sanitized.sketchDepth > 16) {
      console.warn(`sketchDepth should not exceed 16 for optimal accuracy, got ${sanitized.sketchDepth}. Correcting to 16.`);
      sanitized.sketchDepth = 16;
    }
  }

  // Sanitize minFrequencyThreshold to be positive
  if (typeof sanitized.minFrequencyThreshold === 'number' && sanitized.minFrequencyThreshold <= 0) {
    console.warn(`minFrequencyThreshold must be positive, got ${sanitized.minFrequencyThreshold}. Correcting to 1.`);
    sanitized.minFrequencyThreshold = 1;
  }

  return sanitized;
}

/**
 * Validates LFU configuration parameters (after sanitization)
 */
export function validateLFUConfig(config: Partial<LFUConfig>): void {
  if (typeof config.decayFactor === 'number') {
    validateNumberRange(config.decayFactor, 0.0, 1.0, 'decayFactor');
  }

  if (typeof config.decayInterval === 'number') {
    validatePositiveInteger(config.decayInterval, 'decayInterval');
  }

  if (typeof config.sketchWidth === 'number') {
    validatePositiveInteger(config.sketchWidth, 'sketchWidth');
    if (config.sketchWidth < 16 || config.sketchWidth > 65536) {
      throw new Error(`sketchWidth must be between 16 and 65536, got ${config.sketchWidth}`);
    }
  }

  if (typeof config.sketchDepth === 'number') {
    validatePositiveInteger(config.sketchDepth, 'sketchDepth');
    if (config.sketchDepth < 1 || config.sketchDepth > 16) {
      throw new Error(`sketchDepth must be between 1 and 16, got ${config.sketchDepth}`);
    }
  }

  if (typeof config.minFrequencyThreshold === 'number') {
    validatePositiveInteger(config.minFrequencyThreshold, 'minFrequencyThreshold');
  }
}

/**
 * Sanitizes ARC configuration parameters, correcting invalid values
 */
export function sanitizeARCConfig(config: Partial<ARCConfig>): Partial<ARCConfig> {
  const sanitized = { ...config };

  // Sanitize maxCacheSize to be positive
  if (typeof sanitized.maxCacheSize === 'number' && sanitized.maxCacheSize <= 0) {
    console.warn(`maxCacheSize must be positive, got ${sanitized.maxCacheSize}. Correcting to 1000.`);
    sanitized.maxCacheSize = 1000;
  }

  // Sanitize frequencyThreshold to be positive
  if (typeof sanitized.frequencyThreshold === 'number' && sanitized.frequencyThreshold <= 0) {
    console.warn(`frequencyThreshold must be positive, got ${sanitized.frequencyThreshold}. Correcting to 2.`);
    sanitized.frequencyThreshold = 2;
  }

  // Sanitize frequencyDecayFactor to be between 0 and 1
  if (typeof sanitized.frequencyDecayFactor === 'number') {
    if (sanitized.frequencyDecayFactor < 0) {
      console.warn(`frequencyDecayFactor must be between 0 and 1, got ${sanitized.frequencyDecayFactor}. Correcting to 0.`);
      sanitized.frequencyDecayFactor = 0;
    } else if (sanitized.frequencyDecayFactor > 1) {
      console.warn(`frequencyDecayFactor must be between 0 and 1, got ${sanitized.frequencyDecayFactor}. Correcting to 1.`);
      sanitized.frequencyDecayFactor = 1;
    }
  }

  // Sanitize frequencyDecayInterval to be positive
  if (typeof sanitized.frequencyDecayInterval === 'number' && sanitized.frequencyDecayInterval <= 0) {
    console.warn(`frequencyDecayInterval must be positive, got ${sanitized.frequencyDecayInterval}. Correcting to 60000.`);
    sanitized.frequencyDecayInterval = 60000; // 1 minute default
  }

  // Sanitize adaptiveLearningRate to be between 0 and 10
  if (typeof sanitized.adaptiveLearningRate === 'number') {
    if (sanitized.adaptiveLearningRate < 0) {
      console.warn(`adaptiveLearningRate must be between 0 and 10, got ${sanitized.adaptiveLearningRate}. Correcting to 0.`);
      sanitized.adaptiveLearningRate = 0;
    } else if (sanitized.adaptiveLearningRate > 10) {
      console.warn(`adaptiveLearningRate must be between 0 and 10, got ${sanitized.adaptiveLearningRate}. Correcting to 10.`);
      sanitized.adaptiveLearningRate = 10;
    }
  }

  return sanitized;
}

/**
 * Validates ARC configuration parameters (after sanitization)
 */
export function validateARCConfig(config: Partial<ARCConfig>): void {
  if (typeof config.maxCacheSize === 'number') {
    validatePositiveInteger(config.maxCacheSize, 'maxCacheSize');
  }

  if (typeof config.frequencyThreshold === 'number') {
    validatePositiveInteger(config.frequencyThreshold, 'frequencyThreshold');
  }

  if (typeof config.frequencyDecayFactor === 'number') {
    validateNumberRange(config.frequencyDecayFactor, 0.0, 1.0, 'frequencyDecayFactor');
  }

  if (typeof config.frequencyDecayInterval === 'number') {
    validatePositiveInteger(config.frequencyDecayInterval, 'frequencyDecayInterval');
  }

  if (typeof config.adaptiveLearningRate === 'number') {
    validateNumberRange(config.adaptiveLearningRate, 0.0, 10.0, 'adaptiveLearningRate');
  }
}

/**
 * Sanitizes TwoQueue configuration parameters, correcting invalid values
 */
export function sanitizeTwoQueueConfig(config: Partial<TwoQueueConfig>): Partial<TwoQueueConfig> {
  const sanitized = { ...config };

  // Sanitize maxCacheSize to be positive
  if (typeof sanitized.maxCacheSize === 'number' && sanitized.maxCacheSize <= 0) {
    console.warn(`maxCacheSize must be positive, got ${sanitized.maxCacheSize}. Correcting to 1000.`);
    sanitized.maxCacheSize = 1000;
  }

  // Sanitize promotionThreshold to be positive
  if (typeof sanitized.promotionThreshold === 'number' && sanitized.promotionThreshold <= 0) {
    console.warn(`promotionThreshold must be positive, got ${sanitized.promotionThreshold}. Correcting to 2.`);
    sanitized.promotionThreshold = 2;
  }

  // Sanitize hotQueueDecayFactor to be between 0 and 1
  if (typeof sanitized.hotQueueDecayFactor === 'number') {
    if (sanitized.hotQueueDecayFactor < 0) {
      console.warn(`hotQueueDecayFactor must be between 0 and 1, got ${sanitized.hotQueueDecayFactor}. Correcting to 0.`);
      sanitized.hotQueueDecayFactor = 0;
    } else if (sanitized.hotQueueDecayFactor > 1) {
      console.warn(`hotQueueDecayFactor must be between 0 and 1, got ${sanitized.hotQueueDecayFactor}. Correcting to 1.`);
      sanitized.hotQueueDecayFactor = 1;
    }
  }

  // Sanitize hotQueueDecayInterval to be positive
  if (typeof sanitized.hotQueueDecayInterval === 'number' && sanitized.hotQueueDecayInterval <= 0) {
    console.warn(`hotQueueDecayInterval must be positive, got ${sanitized.hotQueueDecayInterval}. Correcting to 300000.`);
    sanitized.hotQueueDecayInterval = 300000; // 5 minutes default
  }

  return sanitized;
}

/**
 * Validates TwoQueue configuration parameters (after sanitization)
 */
export function validateTwoQueueConfig(config: Partial<TwoQueueConfig>): void {
  if (typeof config.maxCacheSize === 'number') {
    validatePositiveInteger(config.maxCacheSize, 'maxCacheSize');
  }

  if (typeof config.promotionThreshold === 'number') {
    validatePositiveInteger(config.promotionThreshold, 'promotionThreshold');
  }

  if (typeof config.hotQueueDecayFactor === 'number') {
    validateNumberRange(config.hotQueueDecayFactor, 0.0, 1.0, 'hotQueueDecayFactor');
  }

  if (typeof config.hotQueueDecayInterval === 'number') {
    validatePositiveInteger(config.hotQueueDecayInterval, 'hotQueueDecayInterval');
  }
}

/**
 * Validates any eviction strategy configuration
 */
export function validateEvictionStrategyConfig(config: Partial<EvictionStrategyConfigs>): void {
  if (!config || typeof config !== 'object') {
    throw new Error('Configuration must be a non-null object');
  }

  if (!config.type) {
    throw new Error('Configuration must specify a type');
  }

  const validTypes = ['lfu', 'lru', 'fifo', 'mru', 'random', 'arc', '2q'];
  if (!validTypes.includes(config.type)) {
    throw new Error(`Invalid eviction strategy type: ${config.type}. Must be one of: ${validTypes.join(', ')}`);
  }

  switch (config.type) {
    case 'lfu':
      validateLFUConfig(config as Partial<LFUConfig>);
      break;
    case 'arc':
      validateARCConfig(config as Partial<ARCConfig>);
      break;
    case '2q':
      validateTwoQueueConfig(config as Partial<TwoQueueConfig>);
      break;
    case 'lru':
    case 'fifo':
    case 'mru':
    case 'random':
      // These strategies have no additional configuration to validate
      break;
    default:
      // This should never happen due to the type check above, but included for completeness
      throw new Error(`Unsupported eviction strategy type: ${(config as any).type}`);
  }
}

/**
 * Sanitizes configuration based on type
 */
function sanitizeConfigByType(config: Partial<EvictionStrategyConfigs>): Partial<EvictionStrategyConfigs> {
  if (!config.type) {
    return config;
  }

  switch (config.type) {
    case 'lfu':
      return sanitizeLFUConfig(config as Partial<LFUConfig>);
    case 'arc':
      return sanitizeARCConfig(config as Partial<ARCConfig>);
    case '2q':
      return sanitizeTwoQueueConfig(config as Partial<TwoQueueConfig>);
    case 'lru':
    case 'fifo':
    case 'mru':
    case 'random':
      // These strategies have no additional configuration to sanitize
      return config;
    default:
      return config;
  }
}

/**
 * Creates a validated configuration with defaults applied and invalid values sanitized
 */
export function createValidatedConfig<T extends EvictionStrategyConfigs>(
  baseConfig: T,
  userConfig: Partial<T>
): T {
  // Merge with defaults first
  const mergedConfig = { ...baseConfig, ...userConfig };

  // Sanitize the merged configuration
  const sanitizedConfig = sanitizeConfigByType(mergedConfig);

  // Validate the final sanitized configuration
  validateEvictionStrategyConfig(sanitizedConfig);

  return sanitizedConfig as T;
}
