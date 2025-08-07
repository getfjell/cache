import { describe, expect, it } from 'vitest';
import {
  ARCConfig,
  DEFAULT_ARC_CONFIG,
  DEFAULT_LFU_CONFIG,
  DEFAULT_TWO_QUEUE_CONFIG,
  EvictionStrategyConfigs,
  LFUConfig,
  TwoQueueConfig
} from '../../src/eviction/EvictionStrategyConfig';

describe('EvictionStrategyConfig', () => {
  describe('Default Configurations', () => {
    it('should have correct default LFU configuration', () => {
      expect(DEFAULT_LFU_CONFIG).toEqual({
        type: 'lfu',
        decayFactor: 0.1,
        decayInterval: 60000,
        sketchWidth: 1024,
        sketchDepth: 4,
        useProbabilisticCounting: true,
        minFrequencyThreshold: 1
      });
    });

    it('should have correct default ARC configuration', () => {
      expect(DEFAULT_ARC_CONFIG).toEqual({
        type: 'arc',
        maxCacheSize: 1000,
        frequencyThreshold: 2,
        useEnhancedFrequency: true,
        frequencyDecayFactor: 0.05,
        frequencyDecayInterval: 600000,
        useFrequencyWeightedSelection: true,
        adaptiveLearningRate: 1.0
      });
    });

    it('should have correct default 2Q configuration', () => {
      expect(DEFAULT_TWO_QUEUE_CONFIG).toEqual({
        type: '2q',
        maxCacheSize: 1000,
        useFrequencyPromotion: true,
        promotionThreshold: 2,
        hotQueueDecayFactor: 0.05,
        hotQueueDecayInterval: 300000,
        useFrequencyWeightedLRU: true
      });
    });
  });

  describe('LFU Configuration Validation', () => {
    it('should accept valid LFU configurations', () => {
      const validConfigs: LFUConfig[] = [
        {
          type: 'lfu',
          useProbabilisticCounting: true,
          decayFactor: 0.1,
          sketchWidth: 512,
          sketchDepth: 3
        },
        {
          type: 'lfu',
          useProbabilisticCounting: false,
          decayFactor: 0,
          minFrequencyThreshold: 2
        },
        {
          type: 'lfu',
          decayInterval: 120000,
          sketchWidth: 2048,
          sketchDepth: 6
        }
      ];

      validConfigs.forEach(config => {
        expect(config.type).toBe('lfu');
        expect(typeof config).toBe('object');
      });
    });

    it('should handle edge case LFU values', () => {
      const edgeCaseConfig: LFUConfig = {
        type: 'lfu',
        decayFactor: 0.999, // Near maximum decay
        decayInterval: 1, // Very fast decay
        sketchWidth: 1, // Minimal sketch
        sketchDepth: 1,
        minFrequencyThreshold: 0.1 // Very low threshold
      };

      expect(edgeCaseConfig.type).toBe('lfu');
      expect(edgeCaseConfig.decayFactor).toBe(0.999);
      expect(edgeCaseConfig.sketchWidth).toBe(1);
    });
  });

  describe('ARC Configuration Validation', () => {
    it('should accept valid ARC configurations', () => {
      const validConfigs: ARCConfig[] = [
        {
          type: 'arc',
          maxCacheSize: 2000,
          frequencyThreshold: 3,
          useEnhancedFrequency: true,
          frequencyDecayFactor: 0.1
        },
        {
          type: 'arc',
          maxCacheSize: 500,
          useEnhancedFrequency: false,
          useFrequencyWeightedSelection: false
        },
        {
          type: 'arc',
          adaptiveLearningRate: 2.0,
          frequencyDecayInterval: 1200000
        }
      ];

      validConfigs.forEach(config => {
        expect(config.type).toBe('arc');
        expect(typeof config).toBe('object');
      });
    });

    it('should handle edge case ARC values', () => {
      const edgeCaseConfig: ARCConfig = {
        type: 'arc',
        maxCacheSize: 1,
        frequencyThreshold: 1000,
        frequencyDecayFactor: 0.999,
        adaptiveLearningRate: 100
      };

      expect(edgeCaseConfig.type).toBe('arc');
      expect(edgeCaseConfig.frequencyThreshold).toBe(1000);
      expect(edgeCaseConfig.adaptiveLearningRate).toBe(100);
    });
  });

  describe('TwoQueue Configuration Validation', () => {
    it('should accept valid 2Q configurations', () => {
      const validConfigs: TwoQueueConfig[] = [
        {
          type: '2q',
          maxCacheSize: 1500,
          useFrequencyPromotion: true,
          promotionThreshold: 4,
          hotQueueDecayFactor: 0.1
        },
        {
          type: '2q',
          maxCacheSize: 800,
          useFrequencyPromotion: false,
          useFrequencyWeightedLRU: false
        },
        {
          type: '2q',
          hotQueueDecayInterval: 900000,
          promotionThreshold: 1
        }
      ];

      validConfigs.forEach(config => {
        expect(config.type).toBe('2q');
        expect(typeof config).toBe('object');
      });
    });

    it('should handle edge case 2Q values', () => {
      const edgeCaseConfig: TwoQueueConfig = {
        type: '2q',
        maxCacheSize: 1,
        promotionThreshold: 1000,
        hotQueueDecayFactor: 0.999,
        hotQueueDecayInterval: 1
      };

      expect(edgeCaseConfig.type).toBe('2q');
      expect(edgeCaseConfig.promotionThreshold).toBe(1000);
      expect(edgeCaseConfig.hotQueueDecayInterval).toBe(1);
    });
  });

  describe('Union Type Validation', () => {
    it('should accept all valid strategy config types', () => {
      const configs: EvictionStrategyConfigs[] = [
        { type: 'lfu', useProbabilisticCounting: true },
        { type: 'lru' },
        { type: 'fifo' },
        { type: 'mru' },
        { type: 'random' },
        { type: 'arc', frequencyThreshold: 3 },
        { type: '2q', promotionThreshold: 2 }
      ];

      configs.forEach(config => {
        expect(['lfu', 'lru', 'fifo', 'mru', 'random', 'arc', '2q']).toContain(config.type);
      });
    });

    it('should distinguish between strategy types', () => {
      const lfuConfig: EvictionStrategyConfigs = { type: 'lfu', decayFactor: 0.1 };
      const arcConfig: EvictionStrategyConfigs = { type: 'arc', frequencyThreshold: 3 };
      const twoQConfig: EvictionStrategyConfigs = { type: '2q', promotionThreshold: 4 };

      expect(lfuConfig.type).toBe('lfu');
      expect(arcConfig.type).toBe('arc');
      expect(twoQConfig.type).toBe('2q');

      // Type narrowing should work
      if (lfuConfig.type === 'lfu') {
        expect(lfuConfig.decayFactor).toBe(0.1);
      }
      if (arcConfig.type === 'arc') {
        expect(arcConfig.frequencyThreshold).toBe(3);
      }
      if (twoQConfig.type === '2q') {
        expect(twoQConfig.promotionThreshold).toBe(4);
      }
    });
  });

  describe('Configuration Merging and Defaults', () => {
    it('should merge partial configurations with defaults correctly', () => {
      // Simulate how the factory merges configs
      const partialLfuConfig = { type: 'lfu' as const, decayFactor: 0.2 };
      const mergedLfuConfig = { ...DEFAULT_LFU_CONFIG, ...partialLfuConfig };

      expect(mergedLfuConfig.type).toBe('lfu');
      expect(mergedLfuConfig.decayFactor).toBe(0.2); // Override
      expect(mergedLfuConfig.sketchWidth).toBe(1024); // Default

      const partialArcConfig = { type: 'arc' as const, maxCacheSize: 2000 };
      const mergedArcConfig = { ...DEFAULT_ARC_CONFIG, ...partialArcConfig };

      expect(mergedArcConfig.type).toBe('arc');
      expect(mergedArcConfig.maxCacheSize).toBe(2000); // Override
      expect(mergedArcConfig.frequencyThreshold).toBe(2); // Default
    });

    it('should handle empty partial configurations', () => {
      const emptyConfig = {};
      const mergedLfuConfig = { ...DEFAULT_LFU_CONFIG, ...emptyConfig };
      const mergedArcConfig = { ...DEFAULT_ARC_CONFIG, ...emptyConfig };

      expect(mergedLfuConfig).toEqual(DEFAULT_LFU_CONFIG);
      expect(mergedArcConfig).toEqual(DEFAULT_ARC_CONFIG);
    });
  });

  describe('Configuration Consistency', () => {
    it('should have consistent default decay intervals across strategies', () => {
      // LFU should have shortest interval (most frequent decay)
      expect(DEFAULT_LFU_CONFIG.decayInterval).toBeLessThan(DEFAULT_TWO_QUEUE_CONFIG.hotQueueDecayInterval!);
      expect(DEFAULT_TWO_QUEUE_CONFIG.hotQueueDecayInterval).toBeLessThan(DEFAULT_ARC_CONFIG.frequencyDecayInterval!);
    });

    it('should have reasonable default decay factors', () => {
      // All decay factors should be between 0 and 1
      expect(DEFAULT_LFU_CONFIG.decayFactor).toBeGreaterThan(0);
      expect(DEFAULT_LFU_CONFIG.decayFactor).toBeLessThan(1);

      expect(DEFAULT_ARC_CONFIG.frequencyDecayFactor).toBeGreaterThan(0);
      expect(DEFAULT_ARC_CONFIG.frequencyDecayFactor).toBeLessThan(1);

      expect(DEFAULT_TWO_QUEUE_CONFIG.hotQueueDecayFactor).toBeGreaterThan(0);
      expect(DEFAULT_TWO_QUEUE_CONFIG.hotQueueDecayFactor).toBeLessThan(1);
    });

    it('should have sensible default thresholds', () => {
      // Frequency thresholds should be reasonable for typical use
      expect(DEFAULT_ARC_CONFIG.frequencyThreshold).toBeGreaterThan(0);
      expect(DEFAULT_ARC_CONFIG.frequencyThreshold).toBeLessThan(10);

      expect(DEFAULT_TWO_QUEUE_CONFIG.promotionThreshold).toBeGreaterThan(0);
      expect(DEFAULT_TWO_QUEUE_CONFIG.promotionThreshold).toBeLessThan(10);

      expect(DEFAULT_LFU_CONFIG.minFrequencyThreshold).toBeGreaterThan(0);
      expect(DEFAULT_LFU_CONFIG.minFrequencyThreshold).toBeLessThan(10);
    });

    it('should have reasonable sketch dimensions for LFU', () => {
      expect(DEFAULT_LFU_CONFIG.sketchWidth).toBeGreaterThan(0);
      expect(DEFAULT_LFU_CONFIG.sketchDepth).toBeGreaterThan(0);

      // Sketch should be large enough to be useful but not excessive
      expect(DEFAULT_LFU_CONFIG.sketchWidth).toBeGreaterThanOrEqual(256);
      expect(DEFAULT_LFU_CONFIG.sketchWidth).toBeLessThanOrEqual(4096);
      expect(DEFAULT_LFU_CONFIG.sketchDepth).toBeGreaterThanOrEqual(2);
      expect(DEFAULT_LFU_CONFIG.sketchDepth).toBeLessThanOrEqual(8);
    });
  });
});
