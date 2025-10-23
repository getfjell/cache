import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEvictionStrategy, createEvictionStrategyLegacy } from '../../src/eviction/EvictionStrategyFactory';
import { EvictionPolicy } from '../../src/Options';
import { EvictionStrategyConfigs } from '../../src/eviction/EvictionStrategyConfig';

// Import strategy classes for type checking
import { LRUEvictionStrategy } from '../../src/eviction/strategies/LRUEvictionStrategy';
import { LFUEvictionStrategy } from '../../src/eviction/strategies/LFUEvictionStrategy';
import { FIFOEvictionStrategy } from '../../src/eviction/strategies/FIFOEvictionStrategy';
import { MRUEvictionStrategy } from '../../src/eviction/strategies/MRUEvictionStrategy';
import { RandomEvictionStrategy } from '../../src/eviction/strategies/RandomEvictionStrategy';
import { ARCEvictionStrategy } from '../../src/eviction/strategies/ARCEvictionStrategy';
import { TwoQueueEvictionStrategy } from '../../src/eviction/strategies/TwoQueueEvictionStrategy';

describe('EvictionStrategyFactory', () => {
  // Mock console.warn to test fallback behavior
  let consoleWarnSpy: any;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    vi.doUnmock('../../src/eviction/strategies/LFUEvictionStrategy');
    vi.doUnmock('../../src/eviction/strategies/ARCEvictionStrategy');
    vi.doUnmock('../../src/eviction/strategies/TwoQueueEvictionStrategy');
    vi.resetModules();
  });

  describe('createEvictionStrategy', () => {
    describe('Basic strategy creation', () => {
      it('should create LRU strategy', () => {
        const strategy = createEvictionStrategy('lru');
        expect(strategy).toBeInstanceOf(LRUEvictionStrategy);
        expect(strategy.getStrategyName()).toBe('lru');
      });

      it('should create LFU strategy with default config', () => {
        const strategy = createEvictionStrategy('lfu');
        expect(strategy).toBeInstanceOf(LFUEvictionStrategy);
        expect(strategy.getStrategyName()).toBe('lfu');
      });

      it('should create FIFO strategy', () => {
        const strategy = createEvictionStrategy('fifo');
        expect(strategy).toBeInstanceOf(FIFOEvictionStrategy);
        expect(strategy.getStrategyName()).toBe('fifo');
      });

      it('should create MRU strategy', () => {
        const strategy = createEvictionStrategy('mru');
        expect(strategy).toBeInstanceOf(MRUEvictionStrategy);
        expect(strategy.getStrategyName()).toBe('MRU');
      });

      it('should create Random strategy', () => {
        const strategy = createEvictionStrategy('random');
        expect(strategy).toBeInstanceOf(RandomEvictionStrategy);
        expect(strategy.getStrategyName()).toBe('random');
      });

      it('should create ARC strategy with default config', () => {
        const strategy = createEvictionStrategy('arc');
        expect(strategy).toBeInstanceOf(ARCEvictionStrategy);
        expect(strategy.getStrategyName()).toBe('ARC');
      });

      it('should create 2Q strategy with default config', () => {
        const strategy = createEvictionStrategy('2q');
        expect(strategy).toBeInstanceOf(TwoQueueEvictionStrategy);
        expect(strategy.getStrategyName()).toBe('2Q');
      });
    });

    describe('Strategy creation with maxCacheSize', () => {
      it('should create ARC strategy with provided maxCacheSize', () => {
        const strategy = createEvictionStrategy('arc', 500);
        expect(strategy).toBeInstanceOf(ARCEvictionStrategy);
        expect(strategy.getStrategyName()).toBe('ARC');
      });

      it('should create 2Q strategy with provided maxCacheSize', () => {
        const strategy = createEvictionStrategy('2q', 750);
        expect(strategy).toBeInstanceOf(TwoQueueEvictionStrategy);
        expect(strategy.getStrategyName()).toBe('2Q');
      });

      it('should handle invalid maxCacheSize by using default', () => {
        const strategy = createEvictionStrategy('arc', -1);
        expect(strategy).toBeInstanceOf(ARCEvictionStrategy);
        expect(strategy.getStrategyName()).toBe('ARC');
      });

      it('should handle zero maxCacheSize by using default', () => {
        const strategy = createEvictionStrategy('arc', 0);
        expect(strategy).toBeInstanceOf(ARCEvictionStrategy);
        expect(strategy.getStrategyName()).toBe('ARC');
      });

      it('should handle non-number maxCacheSize by using default', () => {
        const strategy = createEvictionStrategy('arc', 'invalid' as any);
        expect(strategy).toBeInstanceOf(ARCEvictionStrategy);
        expect(strategy.getStrategyName()).toBe('ARC');
      });
    });

    describe('Strategy creation with custom configurations', () => {
      it('should create LFU strategy with custom config', () => {
        const config: EvictionStrategyConfigs = {
          type: 'lfu',
          decayFactor: 0.2,
          decayInterval: 30000,
          sketchWidth: 512
        };

        const strategy = createEvictionStrategy('lfu', 1000, config);
        expect(strategy).toBeInstanceOf(LFUEvictionStrategy);
        expect(strategy.getStrategyName()).toBe('lfu');
      });

      it('should create ARC strategy with custom config', () => {
        const config: EvictionStrategyConfigs = {
          type: 'arc',
          maxCacheSize: 800,
          frequencyThreshold: 3,
          useEnhancedFrequency: false
        };

        const strategy = createEvictionStrategy('arc', 1000, config);
        expect(strategy).toBeInstanceOf(ARCEvictionStrategy);
        expect(strategy.getStrategyName()).toBe('ARC');
      });

      it('should create 2Q strategy with custom config', () => {
        const config: EvictionStrategyConfigs = {
          type: '2q',
          maxCacheSize: 600,
          useFrequencyPromotion: false,
          promotionThreshold: 1
        };

        const strategy = createEvictionStrategy('2q', 1000, config);
        expect(strategy).toBeInstanceOf(TwoQueueEvictionStrategy);
        expect(strategy.getStrategyName()).toBe('2Q');
      });

      it('should use maxCacheSize parameter over config maxCacheSize for ARC', () => {
        const config: EvictionStrategyConfigs = {
          type: 'arc',
          maxCacheSize: 100
        };

        const strategy = createEvictionStrategy('arc', 500, config);
        expect(strategy).toBeInstanceOf(ARCEvictionStrategy);
        expect(strategy.getStrategyName()).toBe('ARC');
      });

      it('should handle mismatched config type for LFU', () => {
        const config: EvictionStrategyConfigs = {
          type: 'arc',
          maxCacheSize: 100
        } as any; // Force type mismatch

        const strategy = createEvictionStrategy('lfu', 1000, config);
        expect(strategy).toBeInstanceOf(LFUEvictionStrategy);
        expect(strategy.getStrategyName()).toBe('lfu');
      });
    });

    describe('Error handling and fallback behavior', () => {
      it('should throw error for unsupported eviction policy', () => {
        expect(() => {
          createEvictionStrategy('unsupported' as EvictionPolicy);
        }).toThrow('Unsupported eviction policy: unsupported');
      });

      it('should fallback to LRU when LFU strategy creation fails', async () => {
        // Mock the LFUEvictionStrategy module to throw an error
        vi.doMock('../../src/eviction/strategies/LFUEvictionStrategy', () => ({
          LFUEvictionStrategy: vi.fn().mockImplementation(function() {
            throw new Error('LFU creation failed');
          })
        }));

        // Re-import the factory to get the mocked version
        vi.resetModules();
        const { createEvictionStrategy } = await import('../../src/eviction/EvictionStrategyFactory');
        const { LRUEvictionStrategy } = await import('../../src/eviction/strategies/LRUEvictionStrategy');

        const strategy = createEvictionStrategy('lfu', 1000);

        // Should fall back to LRU strategy
        expect(strategy).toBeInstanceOf(LRUEvictionStrategy);
        expect(strategy.getStrategyName()).toBe('lru');
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Failed to create lfu strategy'),
          'LFU creation failed'
        );

        // Restore mocks
        vi.doUnmock('../../src/eviction/strategies/LFUEvictionStrategy');
        vi.resetModules();
      });

      it('should fallback to LRU when ARC strategy creation fails', async () => {
        // Mock the ARCEvictionStrategy module to throw an error
        vi.doMock('../../src/eviction/strategies/ARCEvictionStrategy', () => ({
          ARCEvictionStrategy: vi.fn().mockImplementation(function() {
            throw new Error('ARC creation failed');
          })
        }));

        // Re-import the factory to get the mocked version
        vi.resetModules();
        const { createEvictionStrategy } = await import('../../src/eviction/EvictionStrategyFactory');
        const { LRUEvictionStrategy } = await import('../../src/eviction/strategies/LRUEvictionStrategy');

        const strategy = createEvictionStrategy('arc', 1000);

        // Should fall back to LRU strategy
        expect(strategy).toBeInstanceOf(LRUEvictionStrategy);
        expect(strategy.getStrategyName()).toBe('lru');
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Failed to create arc strategy'),
          'ARC creation failed'
        );

        // Restore mocks
        vi.doUnmock('../../src/eviction/strategies/ARCEvictionStrategy');
        vi.resetModules();
      });

      it('should fallback to LRU when 2Q strategy creation fails', async () => {
        // Mock the TwoQueueEvictionStrategy module to throw an error
        vi.doMock('../../src/eviction/strategies/TwoQueueEvictionStrategy', () => ({
          TwoQueueEvictionStrategy: vi.fn().mockImplementation(function() {
            throw new Error('2Q creation failed');
          })
        }));

        // Re-import the factory to get the mocked version
        vi.resetModules();
        const { createEvictionStrategy } = await import('../../src/eviction/EvictionStrategyFactory');
        const { LRUEvictionStrategy } = await import('../../src/eviction/strategies/LRUEvictionStrategy');

        const strategy = createEvictionStrategy('2q', 1000);

        // Should fall back to LRU strategy
        expect(strategy).toBeInstanceOf(LRUEvictionStrategy);
        expect(strategy.getStrategyName()).toBe('lru');
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Failed to create 2q strategy'),
          '2Q creation failed'
        );

        // Restore mocks
        vi.doUnmock('../../src/eviction/strategies/TwoQueueEvictionStrategy');
        vi.resetModules();
      });

      it('should handle non-Error objects thrown during strategy creation', async () => {
        // Mock the LFUEvictionStrategy module to throw a string
        vi.doMock('../../src/eviction/strategies/LFUEvictionStrategy', () => ({
          LFUEvictionStrategy: vi.fn().mockImplementation(function() {
            throw 'String error';
          })
        }));

        // Re-import the factory to get the mocked version
        vi.resetModules();
        const { createEvictionStrategy } = await import('../../src/eviction/EvictionStrategyFactory');
        const { LRUEvictionStrategy } = await import('../../src/eviction/strategies/LRUEvictionStrategy');

        const strategy = createEvictionStrategy('lfu', 1000);

        // Should fall back to LRU strategy
        expect(strategy).toBeInstanceOf(LRUEvictionStrategy);
        expect(strategy.getStrategyName()).toBe('lru');
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Failed to create lfu strategy'),
          'String error'
        );

        // Restore mocks
        vi.doUnmock('../../src/eviction/strategies/LFUEvictionStrategy');
        vi.resetModules();
      });
    });

    describe('Edge cases', () => {
      it('should handle undefined maxCacheSize', () => {
        const strategy = createEvictionStrategy('arc');
        expect(strategy).toBeInstanceOf(ARCEvictionStrategy);
        expect(strategy.getStrategyName()).toBe('ARC');
      });

      it('should handle null maxCacheSize', () => {
        const strategy = createEvictionStrategy('arc', null as any);
        expect(strategy).toBeInstanceOf(ARCEvictionStrategy);
        expect(strategy.getStrategyName()).toBe('ARC');
      });

      it('should handle undefined config', () => {
        const strategy = createEvictionStrategy('lfu', 1000);
        expect(strategy).toBeInstanceOf(LFUEvictionStrategy);
        expect(strategy.getStrategyName()).toBe('lfu');
      });

      it('should handle ARC config with invalid maxCacheSize', () => {
        const config: EvictionStrategyConfigs = {
          type: 'arc',
          maxCacheSize: -5
        };

        const strategy = createEvictionStrategy('arc', 1000, config);
        expect(strategy).toBeInstanceOf(ARCEvictionStrategy);
        expect(strategy.getStrategyName()).toBe('ARC');
      });

      it('should handle 2Q config with invalid maxCacheSize', () => {
        const config: EvictionStrategyConfigs = {
          type: '2q',
          maxCacheSize: 0
        };

        const strategy = createEvictionStrategy('2q', 1000, config);
        expect(strategy).toBeInstanceOf(TwoQueueEvictionStrategy);
        expect(strategy.getStrategyName()).toBe('2Q');
      });
    });
  });

  describe('createEvictionStrategyLegacy', () => {
    it('should be backwards compatible with createEvictionStrategy', () => {
      const policy: EvictionPolicy = 'lru';
      const maxCacheSize = 500;

      const newStrategy = createEvictionStrategy(policy, maxCacheSize);
      const legacyStrategy = createEvictionStrategyLegacy(policy, maxCacheSize);

      expect(legacyStrategy.getStrategyName()).toBe(newStrategy.getStrategyName());
      expect(legacyStrategy).toBeInstanceOf(LRUEvictionStrategy);
    });

    it('should work with all eviction policies', () => {
      const policies: EvictionPolicy[] = ['lru', 'lfu', 'fifo', 'mru', 'random', 'arc', '2q'];

      policies.forEach(policy => {
        const strategy = createEvictionStrategyLegacy(policy, 1000);
        expect(strategy.getStrategyName()).toBeTruthy();
      });
    });

    it('should handle no maxCacheSize', () => {
      const strategy = createEvictionStrategyLegacy('lru');
      expect(strategy).toBeInstanceOf(LRUEvictionStrategy);
      expect(strategy.getStrategyName()).toBe('lru');
    });
  });

  describe('Default configuration values', () => {
    it('should use correct default ARC config when no config provided', () => {
      const strategy = createEvictionStrategy('arc', 1500);
      expect(strategy).toBeInstanceOf(ARCEvictionStrategy);
      expect(strategy.getStrategyName()).toBe('ARC');
    });

    it('should use correct default 2Q config when no config provided', () => {
      const strategy = createEvictionStrategy('2q', 1200);
      expect(strategy).toBeInstanceOf(TwoQueueEvictionStrategy);
      expect(strategy.getStrategyName()).toBe('2Q');
    });

    it('should use correct default LFU config when no config provided', () => {
      const strategy = createEvictionStrategy('lfu', 800);
      expect(strategy).toBeInstanceOf(LFUEvictionStrategy);
      expect(strategy.getStrategyName()).toBe('lfu');
    });
  });
});
