import { describe, expect, it } from 'vitest';
import {
  createValidatedConfig,
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
        expect(() => validateEvictionStrategyConfig(config)).not.toThrow();
      });
    });

    it('should reject null configurations', () => {
      expect(() => validateEvictionStrategyConfig(null as any))
        .toThrow('Configuration must be a non-null object');
      // eslint-disable-next-line no-undefined
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

    it('should reject invalid user configuration', () => {
      const invalidUserConfig = {
        decayFactor: 2.0 // Invalid
      };

      expect(() => createValidatedConfig(DEFAULT_LFU_CONFIG, invalidUserConfig))
        .toThrow('decayFactor must be between 0 and 1');
    });

    it('should reject invalid merged configuration', () => {
      // Create a scenario where the base config becomes invalid after merging
      const baseConfig = { ...DEFAULT_LFU_CONFIG, decayFactor: 0.5 };
      const userConfig = { decayFactor: 2.0 }; // This will make the final config invalid

      expect(() => createValidatedConfig(baseConfig, userConfig))
        .toThrow('decayFactor must be between 0 and 1');
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
