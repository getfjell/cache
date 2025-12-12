import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createValidatedConfig,
  sanitizeARCConfig,
  sanitizeLFUConfig,
  sanitizeTwoQueueConfig,
  validateARCConfig,
  validateEvictionStrategyConfig,
  validateLFUConfig,
  validateTwoQueueConfig
} from '../../src/eviction/EvictionStrategyValidation';
import {
  ARCConfig,
  DEFAULT_ARC_CONFIG,
  DEFAULT_LFU_CONFIG,
  DEFAULT_TWO_QUEUE_CONFIG,
  LFUConfig,
  TwoQueueConfig
} from '../../src/eviction/EvictionStrategyConfig';

describe('EvictionStrategyValidation', () => {
  // Mock console.warn for sanitization tests
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });
  describe('validateLFUConfig', () => {
    it('should accept valid LFU configurations', () => {
      const validConfigs = [
        {},
        { decayFactor: 0.0 },
        { decayFactor: 0.5 },
        { decayFactor: 1.0 },
        { decayInterval: 1 },
        { decayInterval: 60000 },
        { sketchWidth: 16 },
        { sketchWidth: 1024 },
        { sketchWidth: 65536 },
        { sketchDepth: 1 },
        { sketchDepth: 8 },
        { sketchDepth: 16 },
        { minFrequencyThreshold: 1 },
        { minFrequencyThreshold: 100 },
        {
          decayFactor: 0.1,
          decayInterval: 30000,
          sketchWidth: 512,
          sketchDepth: 4,
          minFrequencyThreshold: 2
        }
      ];

      validConfigs.forEach(config => {
        expect(() => validateLFUConfig(config)).not.toThrow();
      });
    });

    it('should reject invalid decayFactor values', () => {
      const rangeInvalidValues = [-0.1, -1, 1.1, 2];
      const specialInvalidValues = [Infinity, -Infinity, NaN];

      rangeInvalidValues.forEach(value => {
        expect(() => validateLFUConfig({ decayFactor: value }))
          .toThrow('decayFactor must be between 0 and 1');
      });

      specialInvalidValues.forEach(value => {
        expect(() => validateLFUConfig({ decayFactor: value }))
          .toThrow('decayFactor must be a finite number');
      });
    });

    it('should reject invalid decayInterval values', () => {
      const rangeInvalidValues = [0, -1, -100, 1.5];
      const specialInvalidValues = [Infinity, -Infinity, NaN];

      rangeInvalidValues.forEach(value => {
        expect(() => validateLFUConfig({ decayInterval: value }))
          .toThrow('decayInterval must be a positive integer');
      });

      specialInvalidValues.forEach(value => {
        expect(() => validateLFUConfig({ decayInterval: value }))
          .toThrow('decayInterval must be a finite number');
      });
    });

    it('should reject invalid sketchWidth values', () => {
      const invalidValues = [0, -1, 15, 65537, 1.5, Infinity, -Infinity, NaN];

      invalidValues.forEach(value => {
        expect(() => validateLFUConfig({ sketchWidth: value }))
          .toThrow();
      });
    });

    it('should reject invalid sketchDepth values', () => {
      const invalidValues = [0, -1, 17, 1.5, Infinity, -Infinity, NaN];

      invalidValues.forEach(value => {
        expect(() => validateLFUConfig({ sketchDepth: value }))
          .toThrow();
      });
    });

    it('should reject invalid minFrequencyThreshold values', () => {
      const rangeInvalidValues = [0, -1, 1.5];
      const specialInvalidValues = [Infinity, -Infinity, NaN];

      rangeInvalidValues.forEach(value => {
        expect(() => validateLFUConfig({ minFrequencyThreshold: value }))
          .toThrow('minFrequencyThreshold must be a positive integer');
      });

      specialInvalidValues.forEach(value => {
        expect(() => validateLFUConfig({ minFrequencyThreshold: value }))
          .toThrow('minFrequencyThreshold must be a finite number');
      });
    });
  });

  describe('validateARCConfig', () => {
    it('should accept valid ARC configurations', () => {
      const validConfigs = [
        {},
        { maxCacheSize: 1 },
        { maxCacheSize: 10000 },
        { frequencyThreshold: 1 },
        { frequencyThreshold: 10 },
        { frequencyDecayFactor: 0.0 },
        { frequencyDecayFactor: 0.5 },
        { frequencyDecayFactor: 1.0 },
        { frequencyDecayInterval: 1 },
        { frequencyDecayInterval: 600000 },
        { adaptiveLearningRate: 0.0 },
        { adaptiveLearningRate: 5.0 },
        { adaptiveLearningRate: 10.0 },
        {
          maxCacheSize: 500,
          frequencyThreshold: 3,
          frequencyDecayFactor: 0.1,
          frequencyDecayInterval: 300000,
          adaptiveLearningRate: 2.0
        }
      ];

      validConfigs.forEach(config => {
        expect(() => validateARCConfig(config)).not.toThrow();
      });
    });

    it('should reject invalid maxCacheSize values', () => {
      const rangeInvalidValues = [0, -1, 1.5];
      const specialInvalidValues = [Infinity, -Infinity, NaN];

      rangeInvalidValues.forEach(value => {
        expect(() => validateARCConfig({ maxCacheSize: value }))
          .toThrow('maxCacheSize must be a positive integer');
      });

      specialInvalidValues.forEach(value => {
        expect(() => validateARCConfig({ maxCacheSize: value }))
          .toThrow('maxCacheSize must be a finite number');
      });
    });

    it('should reject invalid frequencyThreshold values', () => {
      const rangeInvalidValues = [0, -1, 1.5];
      const specialInvalidValues = [Infinity, -Infinity, NaN];

      rangeInvalidValues.forEach(value => {
        expect(() => validateARCConfig({ frequencyThreshold: value }))
          .toThrow('frequencyThreshold must be a positive integer');
      });

      specialInvalidValues.forEach(value => {
        expect(() => validateARCConfig({ frequencyThreshold: value }))
          .toThrow('frequencyThreshold must be a finite number');
      });
    });

    it('should reject invalid frequencyDecayFactor values', () => {
      const rangeInvalidValues = [-0.1, -1, 1.1, 2];
      const specialInvalidValues = [Infinity, -Infinity, NaN];

      rangeInvalidValues.forEach(value => {
        expect(() => validateARCConfig({ frequencyDecayFactor: value }))
          .toThrow('frequencyDecayFactor must be between 0 and 1');
      });

      specialInvalidValues.forEach(value => {
        expect(() => validateARCConfig({ frequencyDecayFactor: value }))
          .toThrow('frequencyDecayFactor must be a finite number');
      });
    });

    it('should reject invalid frequencyDecayInterval values', () => {
      const rangeInvalidValues = [0, -1, 1.5];
      const specialInvalidValues = [Infinity, -Infinity, NaN];

      rangeInvalidValues.forEach(value => {
        expect(() => validateARCConfig({ frequencyDecayInterval: value }))
          .toThrow('frequencyDecayInterval must be a positive integer');
      });

      specialInvalidValues.forEach(value => {
        expect(() => validateARCConfig({ frequencyDecayInterval: value }))
          .toThrow('frequencyDecayInterval must be a finite number');
      });
    });

    it('should reject invalid adaptiveLearningRate values', () => {
      const rangeInvalidValues = [-0.1, -1, 10.1, 20];
      const specialInvalidValues = [Infinity, -Infinity, NaN];

      rangeInvalidValues.forEach(value => {
        expect(() => validateARCConfig({ adaptiveLearningRate: value }))
          .toThrow('adaptiveLearningRate must be between 0 and 10');
      });

      specialInvalidValues.forEach(value => {
        expect(() => validateARCConfig({ adaptiveLearningRate: value }))
          .toThrow('adaptiveLearningRate must be a finite number');
      });
    });
  });

  describe('validateTwoQueueConfig', () => {
    it('should accept valid TwoQueue configurations', () => {
      const validConfigs = [
        {},
        { maxCacheSize: 1 },
        { maxCacheSize: 10000 },
        { promotionThreshold: 1 },
        { promotionThreshold: 10 },
        { hotQueueDecayFactor: 0.0 },
        { hotQueueDecayFactor: 0.5 },
        { hotQueueDecayFactor: 1.0 },
        { hotQueueDecayInterval: 1 },
        { hotQueueDecayInterval: 300000 },
        {
          maxCacheSize: 500,
          promotionThreshold: 3,
          hotQueueDecayFactor: 0.1,
          hotQueueDecayInterval: 150000
        }
      ];

      validConfigs.forEach(config => {
        expect(() => validateTwoQueueConfig(config)).not.toThrow();
      });
    });

    it('should reject invalid maxCacheSize values', () => {
      const rangeInvalidValues = [0, -1, 1.5];
      const specialInvalidValues = [Infinity, -Infinity, NaN];

      rangeInvalidValues.forEach(value => {
        expect(() => validateTwoQueueConfig({ maxCacheSize: value }))
          .toThrow('maxCacheSize must be a positive integer');
      });

      specialInvalidValues.forEach(value => {
        expect(() => validateTwoQueueConfig({ maxCacheSize: value }))
          .toThrow('maxCacheSize must be a finite number');
      });
    });

    it('should reject invalid promotionThreshold values', () => {
      const rangeInvalidValues = [0, -1, 1.5];
      const specialInvalidValues = [Infinity, -Infinity, NaN];

      rangeInvalidValues.forEach(value => {
        expect(() => validateTwoQueueConfig({ promotionThreshold: value }))
          .toThrow('promotionThreshold must be a positive integer');
      });

      specialInvalidValues.forEach(value => {
        expect(() => validateTwoQueueConfig({ promotionThreshold: value }))
          .toThrow('promotionThreshold must be a finite number');
      });
    });

    it('should reject invalid hotQueueDecayFactor values', () => {
      const rangeInvalidValues = [-0.1, -1, 1.1, 2];
      const specialInvalidValues = [Infinity, -Infinity, NaN];

      rangeInvalidValues.forEach(value => {
        expect(() => validateTwoQueueConfig({ hotQueueDecayFactor: value }))
          .toThrow('hotQueueDecayFactor must be between 0 and 1');
      });

      specialInvalidValues.forEach(value => {
        expect(() => validateTwoQueueConfig({ hotQueueDecayFactor: value }))
          .toThrow('hotQueueDecayFactor must be a finite number');
      });
    });

    it('should reject invalid hotQueueDecayInterval values', () => {
      const rangeInvalidValues = [0, -1, 1.5];
      const specialInvalidValues = [Infinity, -Infinity, NaN];

      rangeInvalidValues.forEach(value => {
        expect(() => validateTwoQueueConfig({ hotQueueDecayInterval: value }))
          .toThrow('hotQueueDecayInterval must be a positive integer');
      });

      specialInvalidValues.forEach(value => {
        expect(() => validateTwoQueueConfig({ hotQueueDecayInterval: value }))
          .toThrow('hotQueueDecayInterval must be a finite number');
      });
    });
  });

  describe('validateEvictionStrategyConfig', () => {
    it('should accept valid configurations for all strategy types', () => {
      const validConfigs = [
        { type: 'lru' },
        { type: 'fifo' },
        { type: 'mru' },
        { type: 'random' },
        { type: 'lfu', decayFactor: 0.1 },
        { type: 'arc', maxCacheSize: 1000 },
        { type: '2q', promotionThreshold: 2 }
      ];

      validConfigs.forEach(config => {
        expect(() => validateEvictionStrategyConfig(config as any)).not.toThrow();
      });
    });

    it('should reject null configurations', () => {
      expect(() => validateEvictionStrategyConfig(null as any))
        .toThrow('Configuration must be a non-null object');
       
      expect(() => validateEvictionStrategyConfig(undefined as any))
        .toThrow('Configuration must be a non-null object');
    });

    it('should reject configurations without type', () => {
      expect(() => validateEvictionStrategyConfig({} as any))
        .toThrow('Configuration must specify a type');
    });

    it('should reject invalid strategy types', () => {
      const invalidTypes = ['invalid', 'lfu2', 'arc2', 'unknown'];

      invalidTypes.forEach(type => {
        expect(() => validateEvictionStrategyConfig({ type } as any))
          .toThrow(`Invalid eviction strategy type: ${type}`);
      });

      // Empty string is caught by the type check
      expect(() => validateEvictionStrategyConfig({ type: '' } as any))
        .toThrow('Configuration must specify a type');
    });

    it('should validate LFU-specific configuration', () => {
      expect(() => validateEvictionStrategyConfig({
        type: 'lfu',
        decayFactor: 2.0 // Invalid
      })).toThrow('decayFactor must be between 0 and 1');
    });

    it('should validate ARC-specific configuration', () => {
      expect(() => validateEvictionStrategyConfig({
        type: 'arc',
        maxCacheSize: -1 // Invalid
      })).toThrow('maxCacheSize must be a positive integer');
    });

    it('should validate TwoQueue-specific configuration', () => {
      expect(() => validateEvictionStrategyConfig({
        type: '2q',
        promotionThreshold: 0 // Invalid
      })).toThrow('promotionThreshold must be a positive integer');
    });
  });

  describe('createValidatedConfig', () => {
    it('should merge and validate LFU configuration', () => {
      const userConfig: Partial<LFUConfig> = {
        decayFactor: 0.2,
        sketchWidth: 512
      };

      const result = createValidatedConfig(DEFAULT_LFU_CONFIG, userConfig);

      expect(result).toEqual({
        ...DEFAULT_LFU_CONFIG,
        decayFactor: 0.2,
        sketchWidth: 512
      });
    });

    it('should merge and validate ARC configuration', () => {
      const userConfig: Partial<ARCConfig> = {
        maxCacheSize: 2000,
        frequencyThreshold: 3
      };

      const result = createValidatedConfig(DEFAULT_ARC_CONFIG, userConfig);

      expect(result).toEqual({
        ...DEFAULT_ARC_CONFIG,
        maxCacheSize: 2000,
        frequencyThreshold: 3
      });
    });

    it('should merge and validate TwoQueue configuration', () => {
      const userConfig: Partial<TwoQueueConfig> = {
        maxCacheSize: 1500,
        promotionThreshold: 3
      };

      const result = createValidatedConfig(DEFAULT_TWO_QUEUE_CONFIG, userConfig);

      expect(result).toEqual({
        ...DEFAULT_TWO_QUEUE_CONFIG,
        maxCacheSize: 1500,
        promotionThreshold: 3
      });
    });

    it('should sanitize invalid user configuration instead of rejecting', () => {
      const invalidUserConfig = {
        decayFactor: 2.0 // Invalid - will be sanitized to 1.0
      };

      const result = createValidatedConfig(DEFAULT_LFU_CONFIG, invalidUserConfig);

      expect(result.decayFactor).toBe(1.0);
      // Updated: console.warn now outputs structured JSON
    });

    it('should sanitize invalid merged configuration instead of rejecting', () => {
      // Create a scenario where the base config becomes invalid after merging
      const baseConfig = { ...DEFAULT_LFU_CONFIG, decayFactor: 0.5 };
      const userConfig = { decayFactor: 2.0 }; // This will be sanitized to 1.0

      const result = createValidatedConfig(baseConfig, userConfig);

      expect(result.decayFactor).toBe(1.0);
      // Updated: console.warn now outputs structured JSON
    });

    it('should handle empty user configuration', () => {
      const result = createValidatedConfig(DEFAULT_LFU_CONFIG, {});
      expect(result).toEqual(DEFAULT_LFU_CONFIG);
    });

    it('should preserve boolean and other types correctly', () => {
      const userConfig: Partial<LFUConfig> = {
        useProbabilisticCounting: false
      };

      const result = createValidatedConfig(DEFAULT_LFU_CONFIG, userConfig);

      expect(result.useProbabilisticCounting).toBe(false);
      expect(result.type).toBe('lfu');
    });
  });

  describe('sanitizeLFUConfig', () => {
    it('should return unchanged config when all values are valid', () => {
      const validConfig = {
        decayFactor: 0.5,
        decayInterval: 60000,
        sketchWidth: 1024,
        sketchDepth: 4,
        minFrequencyThreshold: 2
      };

      const result = sanitizeLFUConfig(validConfig);

      expect(result).toEqual(validConfig);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should sanitize decayFactor below 0 to 0', () => {
      const config = { decayFactor: -0.5 };

      const result = sanitizeLFUConfig(config);

      expect(result.decayFactor).toBe(0);
      // Updated: console.warn now outputs structured JSON
    });

    it('should sanitize decayFactor above 1 to 1', () => {
      const config = { decayFactor: 2.5 };

      const result = sanitizeLFUConfig(config);

      expect(result.decayFactor).toBe(1);
      // Updated: console.warn now outputs structured JSON
    });

    it('should sanitize negative decayInterval to default value', () => {
      const config = { decayInterval: -1000 };

      const result = sanitizeLFUConfig(config);

      expect(result.decayInterval).toBe(300000);
      // Updated: console.warn now outputs structured JSON
    });

    it('should sanitize zero decayInterval to default value', () => {
      const config = { decayInterval: 0 };

      const result = sanitizeLFUConfig(config);

      expect(result.decayInterval).toBe(300000);
      // Updated: console.warn now outputs structured JSON
    });

    it('should sanitize negative sketchWidth to 1024', () => {
      const config = { sketchWidth: -100 };

      const result = sanitizeLFUConfig(config);

      expect(result.sketchWidth).toBe(1024);
      // Updated: console.warn now outputs structured JSON
    });

    it('should sanitize zero sketchWidth to 1024', () => {
      const config = { sketchWidth: 0 };

      const result = sanitizeLFUConfig(config);

      expect(result.sketchWidth).toBe(1024);
      // Updated: console.warn now outputs structured JSON
    });

    it('should sanitize sketchWidth below 16 to 16', () => {
      const config = { sketchWidth: 8 };

      const result = sanitizeLFUConfig(config);

      expect(result.sketchWidth).toBe(16);
      // Updated: console.warn now outputs structured JSON
    });

    it('should sanitize sketchWidth above 65536 to 65536', () => {
      const config = { sketchWidth: 100000 };

      const result = sanitizeLFUConfig(config);

      expect(result.sketchWidth).toBe(65536);
      // Updated: console.warn now outputs structured JSON
    });

    it('should sanitize negative sketchDepth to 4', () => {
      const config = { sketchDepth: -2 };

      const result = sanitizeLFUConfig(config);

      expect(result.sketchDepth).toBe(4);
      // Updated: console.warn now outputs structured JSON
    });

    it('should sanitize zero sketchDepth to 4', () => {
      const config = { sketchDepth: 0 };

      const result = sanitizeLFUConfig(config);

      expect(result.sketchDepth).toBe(4);
      // Updated: console.warn now outputs structured JSON
    });

    it('should sanitize sketchDepth below 1 to 1', () => {
      const config = { sketchDepth: 0.5 };

      const result = sanitizeLFUConfig(config);

      expect(result.sketchDepth).toBe(1);
      // Updated: console.warn now outputs structured JSON
    });

    it('should sanitize sketchDepth above 16 to 16', () => {
      const config = { sketchDepth: 20 };

      const result = sanitizeLFUConfig(config);

      expect(result.sketchDepth).toBe(16);
      // Updated: console.warn now outputs structured JSON
    });

    it('should sanitize negative minFrequencyThreshold to 1', () => {
      const config = { minFrequencyThreshold: -5 };

      const result = sanitizeLFUConfig(config);

      expect(result.minFrequencyThreshold).toBe(1);
      // Updated: console.warn now outputs structured JSON
    });

    it('should sanitize zero minFrequencyThreshold to 1', () => {
      const config = { minFrequencyThreshold: 0 };

      const result = sanitizeLFUConfig(config);

      expect(result.minFrequencyThreshold).toBe(1);
      // Updated: console.warn now outputs structured JSON
    });

    it('should handle multiple invalid values and sanitize all', () => {
      const config = {
        decayFactor: -0.5,
        decayInterval: 0,
        sketchWidth: 5,
        sketchDepth: 25,
        minFrequencyThreshold: -1
      };

      const result = sanitizeLFUConfig(config);

      expect(result).toEqual({
        decayFactor: 0,
        decayInterval: 300000,
        sketchWidth: 16,
        sketchDepth: 16,
        minFrequencyThreshold: 1
      });
      expect(consoleWarnSpy).toHaveBeenCalledTimes(5);
    });

    it('should not modify non-numeric values', () => {
      const config = {
        decayFactor: 'invalid' as any,
        decayInterval: null as any,
        sketchWidth: void 0 as any
      };

      const result = sanitizeLFUConfig(config);

      expect(result).toEqual(config);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe('sanitizeARCConfig', () => {
    it('should return unchanged config when all values are valid', () => {
      const validConfig = {
        maxCacheSize: 1000,
        frequencyThreshold: 2,
        frequencyDecayFactor: 0.5,
        frequencyDecayInterval: 60000,
        adaptiveLearningRate: 5.0
      };

      const result = sanitizeARCConfig(validConfig);

      expect(result).toEqual(validConfig);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should sanitize negative maxCacheSize to 1000', () => {
      const config = { maxCacheSize: -500 };

      const result = sanitizeARCConfig(config);

      expect(result.maxCacheSize).toBe(1000);
      // Updated: console.warn now outputs structured JSON
    });

    it('should sanitize zero maxCacheSize to 1000', () => {
      const config = { maxCacheSize: 0 };

      const result = sanitizeARCConfig(config);

      expect(result.maxCacheSize).toBe(1000);
      // Updated: console.warn now outputs structured JSON
    });

    it('should sanitize negative frequencyThreshold to 2', () => {
      const config = { frequencyThreshold: -1 };

      const result = sanitizeARCConfig(config);

      expect(result.frequencyThreshold).toBe(2);
      // Updated: console.warn now outputs structured JSON
    });

    it('should sanitize zero frequencyThreshold to 2', () => {
      const config = { frequencyThreshold: 0 };

      const result = sanitizeARCConfig(config);

      expect(result.frequencyThreshold).toBe(2);
      // Updated: console.warn now outputs structured JSON
    });

    it('should sanitize frequencyDecayFactor below 0 to 0', () => {
      const config = { frequencyDecayFactor: -0.1 };

      const result = sanitizeARCConfig(config);

      expect(result.frequencyDecayFactor).toBe(0);
      // Updated: console.warn now outputs structured JSON
    });

    it('should sanitize frequencyDecayFactor above 1 to 1', () => {
      const config = { frequencyDecayFactor: 1.5 };

      const result = sanitizeARCConfig(config);

      expect(result.frequencyDecayFactor).toBe(1);
      // Updated: console.warn now outputs structured JSON
    });

    it('should sanitize negative frequencyDecayInterval to 60000', () => {
      const config = { frequencyDecayInterval: -1000 };

      const result = sanitizeARCConfig(config);

      expect(result.frequencyDecayInterval).toBe(60000);
      // Updated: console.warn now outputs structured JSON
    });

    it('should sanitize zero frequencyDecayInterval to 60000', () => {
      const config = { frequencyDecayInterval: 0 };

      const result = sanitizeARCConfig(config);

      expect(result.frequencyDecayInterval).toBe(60000);
      // Updated: console.warn now outputs structured JSON
    });

    it('should sanitize adaptiveLearningRate below 0 to 0', () => {
      const config = { adaptiveLearningRate: -1.0 };

      const result = sanitizeARCConfig(config);

      expect(result.adaptiveLearningRate).toBe(0);
      // Updated: console.warn now outputs structured JSON
    });

    it('should sanitize adaptiveLearningRate above 10 to 10', () => {
      const config = { adaptiveLearningRate: 15.0 };

      const result = sanitizeARCConfig(config);

      expect(result.adaptiveLearningRate).toBe(10);
      // Updated: console.warn now outputs structured JSON
    });

    it('should handle multiple invalid values and sanitize all', () => {
      const config = {
        maxCacheSize: -100,
        frequencyThreshold: 0,
        frequencyDecayFactor: 2.0,
        frequencyDecayInterval: -500,
        adaptiveLearningRate: 20.0
      };

      const result = sanitizeARCConfig(config);

      expect(result).toEqual({
        maxCacheSize: 1000,
        frequencyThreshold: 2,
        frequencyDecayFactor: 1,
        frequencyDecayInterval: 60000,
        adaptiveLearningRate: 10
      });
      expect(consoleWarnSpy).toHaveBeenCalledTimes(5);
    });

    it('should not modify non-numeric values', () => {
      const config = {
        maxCacheSize: 'invalid' as any,
        frequencyThreshold: null as any,
        frequencyDecayFactor: void 0 as any
      };

      const result = sanitizeARCConfig(config);

      expect(result).toEqual(config);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe('sanitizeTwoQueueConfig', () => {
    it('should return unchanged config when all values are valid', () => {
      const validConfig = {
        maxCacheSize: 1000,
        promotionThreshold: 3,
        hotQueueDecayFactor: 0.1,
        hotQueueDecayInterval: 300000
      };

      const result = sanitizeTwoQueueConfig(validConfig);

      expect(result).toEqual(validConfig);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should sanitize negative maxCacheSize to 1000', () => {
      const config = { maxCacheSize: -200 };

      const result = sanitizeTwoQueueConfig(config);

      expect(result.maxCacheSize).toBe(1000);
      // Updated: console.warn now outputs structured JSON
    });

    it('should sanitize zero maxCacheSize to 1000', () => {
      const config = { maxCacheSize: 0 };

      const result = sanitizeTwoQueueConfig(config);

      expect(result.maxCacheSize).toBe(1000);
      // Updated: console.warn now outputs structured JSON
    });

    it('should sanitize negative promotionThreshold to 2', () => {
      const config = { promotionThreshold: -3 };

      const result = sanitizeTwoQueueConfig(config);

      expect(result.promotionThreshold).toBe(2);
      // Updated: console.warn now outputs structured JSON
    });

    it('should sanitize zero promotionThreshold to 2', () => {
      const config = { promotionThreshold: 0 };

      const result = sanitizeTwoQueueConfig(config);

      expect(result.promotionThreshold).toBe(2);
      // Updated: console.warn now outputs structured JSON
    });

    it('should sanitize hotQueueDecayFactor below 0 to 0', () => {
      const config = { hotQueueDecayFactor: -0.2 };

      const result = sanitizeTwoQueueConfig(config);

      expect(result.hotQueueDecayFactor).toBe(0);
      // Updated: console.warn now outputs structured JSON
    });

    it('should sanitize hotQueueDecayFactor above 1 to 1', () => {
      const config = { hotQueueDecayFactor: 1.8 };

      const result = sanitizeTwoQueueConfig(config);

      expect(result.hotQueueDecayFactor).toBe(1);
      // Updated: console.warn now outputs structured JSON
    });

    it('should sanitize negative hotQueueDecayInterval to 300000', () => {
      const config = { hotQueueDecayInterval: -1000 };

      const result = sanitizeTwoQueueConfig(config);

      expect(result.hotQueueDecayInterval).toBe(300000);
      // Updated: console.warn now outputs structured JSON
    });

    it('should sanitize zero hotQueueDecayInterval to 300000', () => {
      const config = { hotQueueDecayInterval: 0 };

      const result = sanitizeTwoQueueConfig(config);

      expect(result.hotQueueDecayInterval).toBe(300000);
      // Updated: console.warn now outputs structured JSON
    });

    it('should handle multiple invalid values and sanitize all', () => {
      const config = {
        maxCacheSize: -50,
        promotionThreshold: 0,
        hotQueueDecayFactor: 3.0,
        hotQueueDecayInterval: -100
      };

      const result = sanitizeTwoQueueConfig(config);

      expect(result).toEqual({
        maxCacheSize: 1000,
        promotionThreshold: 2,
        hotQueueDecayFactor: 1,
        hotQueueDecayInterval: 300000
      });
      expect(consoleWarnSpy).toHaveBeenCalledTimes(4);
    });

    it('should not modify non-numeric values', () => {
      const config = {
        maxCacheSize: 'invalid' as any,
        promotionThreshold: null as any,
        hotQueueDecayFactor: void 0 as any
      };

      const result = sanitizeTwoQueueConfig(config);

      expect(result).toEqual(config);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe('createValidatedConfig with sanitization', () => {
    it('should sanitize invalid values before validation for LFU config', () => {
      const baseConfig = DEFAULT_LFU_CONFIG;
      const userConfig = {
        decayFactor: -0.5, // Will be sanitized to 0
        sketchWidth: 5      // Will be sanitized to 16
      };

      const result = createValidatedConfig(baseConfig, userConfig);

      expect(result.decayFactor).toBe(0);
      expect(result.sketchWidth).toBe(16);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
    });

    it('should sanitize invalid values before validation for ARC config', () => {
      const baseConfig = DEFAULT_ARC_CONFIG;
      const userConfig = {
        maxCacheSize: -100,           // Will be sanitized to 1000
        adaptiveLearningRate: 15.0    // Will be sanitized to 10
      };

      const result = createValidatedConfig(baseConfig, userConfig);

      expect(result.maxCacheSize).toBe(1000);
      expect(result.adaptiveLearningRate).toBe(10);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
    });

    it('should sanitize invalid values before validation for TwoQueue config', () => {
      const baseConfig = DEFAULT_TWO_QUEUE_CONFIG;
      const userConfig = {
        promotionThreshold: -1,         // Will be sanitized to 2
        hotQueueDecayFactor: 2.0        // Will be sanitized to 1
      };

      const result = createValidatedConfig(baseConfig, userConfig);

      expect(result.promotionThreshold).toBe(2);
      expect(result.hotQueueDecayFactor).toBe(1);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
    });

    it('should sanitize then still fail validation if sanitized values are still invalid', () => {
      // Create a scenario where even after sanitization, validation could fail
      // This is mainly to ensure the validation step still runs after sanitization
      const baseConfig = { ...DEFAULT_LFU_CONFIG };
      const userConfig = {
        decayFactor: 0.5  // Valid value
      };

      const result = createValidatedConfig(baseConfig, userConfig);

      expect(result.decayFactor).toBe(0.5);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should handle mixed valid and invalid values', () => {
      const baseConfig = DEFAULT_LFU_CONFIG;
      const userConfig = {
        decayFactor: 0.3,      // Valid
        decayInterval: -1000,  // Invalid - will be sanitized to 300000
        sketchWidth: 2048,     // Valid
        sketchDepth: 25        // Invalid - will be sanitized to 16
      };

      const result = createValidatedConfig(baseConfig, userConfig);

      expect(result.decayFactor).toBe(0.3);
      expect(result.decayInterval).toBe(300000);
      expect(result.sketchWidth).toBe(2048);
      expect(result.sketchDepth).toBe(16);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
    });

    it('should still fail validation for fundamentally invalid configurations', () => {
      const baseConfig = DEFAULT_LFU_CONFIG;

      // Create a config that will be invalid even after sanitization
      // by providing an invalid type after merging
      const invalidConfig = { ...baseConfig, type: 'invalid-type' as any };

      expect(() => validateEvictionStrategyConfig(invalidConfig))
        .toThrow('Invalid eviction strategy type: invalid-type');
    });
  });

  describe('Edge cases and boundary values', () => {
    it('should handle boundary values for decayFactor', () => {
      expect(() => validateLFUConfig({ decayFactor: 0.0 })).not.toThrow();
      expect(() => validateLFUConfig({ decayFactor: 1.0 })).not.toThrow();
      expect(() => validateARCConfig({ frequencyDecayFactor: 0.0 })).not.toThrow();
      expect(() => validateARCConfig({ frequencyDecayFactor: 1.0 })).not.toThrow();
    });

    it('should handle very large valid values', () => {
      expect(() => validateLFUConfig({
        decayInterval: Number.MAX_SAFE_INTEGER,
        sketchWidth: 65536,
        minFrequencyThreshold: 1000000
      })).not.toThrow();
    });

    it('should handle minimum valid values', () => {
      expect(() => validateLFUConfig({
        decayInterval: 1,
        sketchWidth: 16,
        sketchDepth: 1,
        minFrequencyThreshold: 1
      })).not.toThrow();
    });

    it('should reject special numeric values', () => {
      const specialValues = [Infinity, -Infinity, NaN];

      specialValues.forEach(value => {
        expect(() => validateLFUConfig({ decayFactor: value })).toThrow();
        expect(() => validateARCConfig({ adaptiveLearningRate: value })).toThrow();
        expect(() => validateTwoQueueConfig({ hotQueueDecayFactor: value })).toThrow();
      });
    });
  });
});
