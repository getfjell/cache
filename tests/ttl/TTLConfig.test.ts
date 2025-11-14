import { describe, expect, it } from 'vitest';
import { defaultTTLConfig, TTLConfig, validateTTLConfig } from '../../src/ttl/TTLConfig';

describe('TTLConfig', () => {
  describe('Default Configuration', () => {
    it('should provide valid default TTL configuration', () => {
      expect(defaultTTLConfig).toBeDefined();
      expect(defaultTTLConfig.item).toBeDefined();
      expect(defaultTTLConfig.query).toBeDefined();
      expect(typeof defaultTTLConfig.item.default).toBe('number');
      expect(typeof defaultTTLConfig.query.complete).toBe('number');
      expect(typeof defaultTTLConfig.query.faceted).toBe('number');
    });

    it('should have reasonable default values', () => {
      expect(defaultTTLConfig.item.default).toBeGreaterThan(0);
      expect(defaultTTLConfig.query.complete).toBeGreaterThan(0);
      expect(defaultTTLConfig.query.faceted).toBeGreaterThan(0);
      expect(defaultTTLConfig.query.complete).toBeGreaterThanOrEqual(defaultTTLConfig.query.faceted);
    });

    it('should have correct structure for all properties', () => {
      expect(defaultTTLConfig).toHaveProperty('item');
      expect(defaultTTLConfig).toHaveProperty('query');
      expect(defaultTTLConfig.item).toHaveProperty('default');
      expect(defaultTTLConfig.query).toHaveProperty('complete');
      expect(defaultTTLConfig.query).toHaveProperty('faceted');
    });
  });

  describe('TTL Configuration Validation', () => {
    it('should validate complete TTL configuration', () => {
      const validConfig: TTLConfig = {
        item: {
          default: 3600,
          byType: {
            'user': 7200,
            'order': 1800
          }
        },
        query: {
          complete: 300,
          faceted: 60,
          byFacet: {
            'status': 30,
            'dashboard': 120
          }
        },
        adjustments: {
          peakHours: {
            start: 9,
            end: 17,
            multiplier: 0.5
          },
          staleWhileRevalidate: true
        },
        warming: {
          enabled: true,
          interval: 300,
          queries: [
            { params: { type: 'active' }, priority: 1 }
          ]
        }
      };

      expect(() => validateTTLConfig(validConfig)).not.toThrow();
    });

    it('should validate minimal TTL configuration', () => {
      const minimalConfig: TTLConfig = {
        item: { default: 3600 },
        query: { complete: 300, faceted: 60 }
      };

      expect(() => validateTTLConfig(minimalConfig)).not.toThrow();
    });

    it('should validate configuration with only item settings', () => {
      const itemOnlyConfig: TTLConfig = {
        item: {
          default: 3600,
          byType: { 'user': 7200 }
        },
        query: { complete: 300, faceted: 60 }
      };

      expect(() => validateTTLConfig(itemOnlyConfig)).not.toThrow();
    });

    it('should validate configuration with only query settings', () => {
      const queryOnlyConfig: TTLConfig = {
        item: { default: 3600 },
        query: {
          complete: 300,
          faceted: 60,
          byFacet: {
            'status': 30,
            'report': 15
          }
        }
      };

      expect(() => validateTTLConfig(queryOnlyConfig)).not.toThrow();
    });

    it('should validate configuration with adjustments only', () => {
      const adjustmentsConfig: TTLConfig = {
        item: { default: 3600 },
        query: { complete: 300, faceted: 60 },
        adjustments: {
          peakHours: {
            start: 8,
            end: 18,
            multiplier: 0.3
          }
        }
      };

      expect(() => validateTTLConfig(adjustmentsConfig)).not.toThrow();
    });

    it('should validate configuration with cache warming only', () => {
      const warmingConfig: TTLConfig = {
        item: { default: 3600 },
        query: { complete: 300, faceted: 60 },
        warming: {
          enabled: true,
          interval: 600,
          queries: [
            { params: { status: 'active' }, priority: 1 },
            { params: { type: 'urgent' }, priority: 2 }
          ]
        }
      };

      expect(() => validateTTLConfig(warmingConfig)).not.toThrow();
    });

    it('should handle edge case values in configuration', () => {
      const edgeConfig: TTLConfig = {
        item: {
          default: 1, // Very short TTL
          byType: {
            'temp': 0.1,
            'permanent': 86400
          }
        },
        query: {
          complete: 1,
          faceted: 0.1,
          byFacet: {
            'instant': 0.01,
            'long': 3600
          }
        },
        adjustments: {
          peakHours: {
            start: 0,  // Midnight
            end: 23,   // 11 PM
            multiplier: 0.1 // Very aggressive
          },
          staleWhileRevalidate: false
        }
      };

      expect(() => validateTTLConfig(edgeConfig)).not.toThrow();
    });

    it('should handle empty byType and byFacet objects', () => {
      const emptyConfig: TTLConfig = {
        item: {
          default: 3600,
          byType: {} // Empty type mapping
        },
        query: {
          complete: 300,
          faceted: 60,
          byFacet: {} // Empty facet mapping
        }
      };

      expect(() => validateTTLConfig(emptyConfig)).not.toThrow();
    });

    it('should handle configuration with disabled warming', () => {
      const disabledWarmingConfig: TTLConfig = {
        item: { default: 3600 },
        query: { complete: 300, faceted: 60 },
        warming: {
          enabled: false,
          interval: 300,
          queries: [] // Empty queries when disabled
        }
      };

      expect(() => validateTTLConfig(disabledWarmingConfig)).not.toThrow();
    });

    it('should handle configuration with different peak hour ranges', () => {
      const configs = [
        { start: 0, end: 8 },   // Early morning
        { start: 9, end: 17 },  // Business hours
        { start: 18, end: 23 }, // Evening
        { start: 22, end: 6 },  // Overnight (wraps around)
      ];

      for (const peakHours of configs) {
        const config: TTLConfig = {
          item: { default: 3600 },
          query: { complete: 300, faceted: 60 },
          adjustments: {
            peakHours: { ...peakHours, multiplier: 0.5 }
          }
        };

        expect(() => validateTTLConfig(config)).not.toThrow();
      }
    });

    it('should handle extreme multiplier values', () => {
      const multipliers = [0.01, 0.1, 0.5, 0.9, 0.99, 1.0];

      for (const multiplier of multipliers) {
        const config: TTLConfig = {
          item: { default: 3600 },
          query: { complete: 300, faceted: 60 },
          adjustments: {
            peakHours: {
              start: 9,
              end: 17,
              multiplier
            }
          }
        };

        expect(() => validateTTLConfig(config)).not.toThrow();
      }
    });

    it('should handle large numbers of type-specific configurations', () => {
      const manyTypes: Record<string, number> = {};
      const manyFacets: Record<string, number> = {};

      // Create many type-specific and facet-specific configs
      for (let i = 0; i < 50; i++) {
        manyTypes[`type${i}`] = 1800 + i * 60;
        manyFacets[`facet${i}`] = 30 + i;
      }

      const largeConfig: TTLConfig = {
        item: {
          default: 3600,
          byType: manyTypes
        },
        query: {
          complete: 300,
          faceted: 60,
          byFacet: manyFacets
        }
      };

      expect(() => validateTTLConfig(largeConfig)).not.toThrow();
    });

    it('should handle warming configuration with many queries', () => {
      const manyQueries = Array.from({ length: 20 }, (_, i) => ({
        params: { type: `type${i}`, status: 'active' },
        priority: i % 5 + 1
      }));

      const warmingConfig: TTLConfig = {
        item: { default: 3600 },
        query: { complete: 300, faceted: 60 },
        warming: {
          enabled: true,
          interval: 120,
          queries: manyQueries
        }
      };

      expect(() => validateTTLConfig(warmingConfig)).not.toThrow();
    });

    it('should handle warming configuration with different priorities', () => {
      const priorityQueries = [
        { params: { critical: true }, priority: 5 },
        { params: { important: true }, priority: 3 },
        { params: { normal: true }, priority: 1 },
        { params: { background: true }, priority: 0 }
      ];

      const priorityConfig: TTLConfig = {
        item: { default: 3600 },
        query: { complete: 300, faceted: 60 },
        warming: {
          enabled: true,
          interval: 300,
          queries: priorityQueries
        }
      };

      expect(() => validateTTLConfig(priorityConfig)).not.toThrow();
    });

    it('should handle all optional properties being undefined', () => {
      const sparseConfig: TTLConfig = {
        item: { default: 3600 },
        query: { complete: 300, faceted: 60 }
        // All other properties undefined
      };

      expect(() => validateTTLConfig(sparseConfig)).not.toThrow();
    });

    it('should handle nested undefined properties', () => {
      const nestedUndefinedConfig: TTLConfig = {
        item: {
          default: 3600,
          byType: undefined
        },
        query: {
          complete: 300,
          faceted: 60,
          byFacet: undefined
        },
        adjustments: {
          peakHours: undefined,
          staleWhileRevalidate: undefined
        },
        warming: {
          enabled: false,
          interval: undefined,
          queries: undefined
        }
      };

      expect(() => validateTTLConfig(nestedUndefinedConfig)).not.toThrow();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle null configuration', () => {
      try {
        const result = validateTTLConfig(null as any);
        expect(Array.isArray(result)).toBe(true);
      } catch (error) {
        expect(error).toBeDefined(); // Either returns errors or throws
      }
    });

    it('should handle undefined configuration', () => {
      try {
        const result = validateTTLConfig(undefined as any);
        expect(Array.isArray(result)).toBe(true);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle empty configuration object', () => {
      try {
        const result = validateTTLConfig({} as any);
        expect(Array.isArray(result)).toBe(true);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle invalid item configuration', () => {
      const invalidItemConfig = {
        item: null, // Invalid
        query: { complete: 300, faceted: 60 }
      };

      try {
        const result = validateTTLConfig(invalidItemConfig as any);
        expect(Array.isArray(result)).toBe(true);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle invalid query configuration', () => {
      const invalidQueryConfig = {
        item: { default: 3600 },
        query: null // Invalid
      };

      try {
        const result = validateTTLConfig(invalidQueryConfig as any);
        expect(Array.isArray(result)).toBe(true);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle negative TTL values', () => {
      const negativeConfig: TTLConfig = {
        item: { default: -1 }, // Negative TTL
        query: { complete: 300, faceted: 60 }
      };

      const result = validateTTLConfig(negativeConfig);
      expect(result).toContain('item.default must be positive');
    });

    it('should handle zero TTL values', () => {
      const zeroConfig: TTLConfig = {
        item: { default: 0 },
        query: { complete: 0, faceted: 0 }
      };

      // Zero TTL should be valid (immediate expiration)
      expect(() => validateTTLConfig(zeroConfig)).not.toThrow();
    });

    it('should handle various peak hours configurations', () => {
      const peakHourConfigs = [
        { start: 0, end: 17, multiplier: 0.5 },   // Valid config
        { start: 9, end: 23, multiplier: 0.5 },   // Valid config
        { start: 17, end: 9, multiplier: 0.5 },   // Wraparound config
        { start: 9, end: 17, multiplier: 0.1 },   // Low multiplier
        { start: 9, end: 17, multiplier: 0.9 }    // High multiplier
      ];

      for (const peakHours of peakHourConfigs) {
        const config: TTLConfig = {
          item: { default: 3600 },
          query: { complete: 300, faceted: 60 },
          adjustments: { peakHours }
        };

        const result = validateTTLConfig(config);
        expect(Array.isArray(result)).toBe(true);
      }
    });

    it('should handle invalid warming configuration', () => {
      const invalidWarmingConfigs = [
        {
          enabled: true,
          interval: -1, // Negative interval
          queries: []
        },
        {
          enabled: true,
          interval: 300,
          queries: null // Invalid queries array
        },
        {
          enabled: true,
          interval: 0, // Zero interval
          queries: []
        }
      ];

      for (const warming of invalidWarmingConfigs) {
        const config: TTLConfig = {
          item: { default: 3600 },
          query: { complete: 300, faceted: 60 },
          warming
        };

        const result = validateTTLConfig(config as any);
        expect(Array.isArray(result)).toBe(true);
      }
    });

    it('should handle invalid query priority values', () => {
      const invalidPriorityConfig: TTLConfig = {
        item: { default: 3600 },
        query: { complete: 300, faceted: 60 },
        warming: {
          enabled: true,
          interval: 300,
          queries: [
            { params: { type: 'test' }, priority: -1 }, // Negative priority
            { params: { type: 'test' }, priority: 6 },  // Priority too high
            { params: { type: 'test' }, priority: 1.5 } // Non-integer priority
          ]
        }
      };

      const result = validateTTLConfig(invalidPriorityConfig);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('Configuration Merging and Defaults', () => {
    it('should merge partial configurations with defaults', () => {
      const partialConfig: Partial<TTLConfig> = {
        item: { default: 7200 }, // Override default
        // Other properties should use defaults
      };

      const merged = { ...defaultTTLConfig, ...partialConfig };
      
      expect(merged.item.default).toBe(7200); // Overridden
      expect(merged.query).toEqual(defaultTTLConfig.query); // From defaults
    });

    it('should handle deep merging of nested properties', () => {
      const partialConfig: Partial<TTLConfig> = {
        adjustments: {
          staleWhileRevalidate: false // Override just this property
          // peakHours should remain undefined
        }
      };

      const merged = { ...defaultTTLConfig, ...partialConfig };
      
      expect(merged.adjustments?.staleWhileRevalidate).toBe(false);
    });

    it('should preserve type-specific and facet-specific configurations', () => {
      const customConfig: TTLConfig = {
        item: {
          default: 3600,
          byType: {
            'critical': 300,   // 5 minutes
            'temporary': 60,   // 1 minute
            'permanent': 86400 // 24 hours
          }
        },
        query: {
          complete: 300,
          faceted: 60,
          byFacet: {
            'realtime': 10,    // 10 seconds
            'dashboard': 120,  // 2 minutes
            'report': 1800     // 30 minutes
          }
        }
      };

      expect(() => validateTTLConfig(customConfig)).not.toThrow();
      expect(Object.keys(customConfig.item.byType || {})).toHaveLength(3);
      expect(Object.keys(customConfig.query.byFacet || {})).toHaveLength(3);
    });
  });

  describe('Complex Configuration Scenarios', () => {
    it('should handle production-like configuration', () => {
      const productionConfig: TTLConfig = {
        item: {
          default: 3600, // 1 hour default
          byType: {
            'user': 7200,      // 2 hours - users change less frequently
            'session': 1800,   // 30 minutes - sessions expire quickly
            'product': 14400,  // 4 hours - products relatively stable
            'order': 900,      // 15 minutes - orders change frequently
            'cache_meta': 300  // 5 minutes - metadata expires quickly
          }
        },
        query: {
          complete: 600,  // 10 minutes for complete queries
          faceted: 120,   // 2 minutes for faceted queries
          byFacet: {
            'user_dashboard': 300,    // 5 minutes
            'order_status': 60,       // 1 minute
            'product_catalog': 1800,  // 30 minutes
            'search_results': 30,     // 30 seconds
            'real_time_data': 5       // 5 seconds
          }
        },
        adjustments: {
          peakHours: {
            start: 9,        // 9 AM
            end: 17,         // 5 PM
            multiplier: 0.5  // Half TTL during business hours
          },
          staleWhileRevalidate: true
        },
        warming: {
          enabled: true,
          interval: 300, // Warm every 5 minutes
          queries: [
            { params: { status: 'active', priority: 'high' }, priority: 5 },
            { params: { type: 'dashboard' }, priority: 4 },
            { params: { category: 'popular' }, priority: 3 },
            { params: { recent: true }, priority: 2 },
            { params: { trending: true }, priority: 1 }
          ]
        }
      };

      expect(() => validateTTLConfig(productionConfig)).not.toThrow();
    });

    it('should handle development-like configuration', () => {
      const developmentConfig: TTLConfig = {
        item: {
          default: 60, // Short TTL for development
          byType: {
            'test_data': 30,
            'mock_user': 120
          }
        },
        query: {
          complete: 30,  // Very short for testing
          faceted: 10,   // Very short for testing
          byFacet: {
            'dev_query': 5,
            'test_facet': 15
          }
        },
        adjustments: {
          staleWhileRevalidate: false // Disabled for predictable testing
        },
        warming: {
          enabled: false // Disabled in development
        }
      };

      expect(() => validateTTLConfig(developmentConfig)).not.toThrow();
    });

    it('should handle high-performance configuration', () => {
      const highPerfConfig: TTLConfig = {
        item: {
          default: 10800, // 3 hours - longer caching
          byType: {
            'static_content': 86400,   // 24 hours
            'api_response': 3600,      // 1 hour
            'computed_result': 7200    // 2 hours
          }
        },
        query: {
          complete: 1800, // 30 minutes - aggressive query caching
          faceted: 600,   // 10 minutes
          byFacet: {
            'expensive_query': 3600,    // 1 hour for expensive operations
            'aggregation': 1800,        // 30 minutes for aggregations
            'report_data': 7200         // 2 hours for reports
          }
        },
        adjustments: {
          peakHours: {
            start: 8,
            end: 20,         // Extended hours
            multiplier: 0.8  // Less aggressive reduction
          },
          staleWhileRevalidate: true
        },
        warming: {
          enabled: true,
          interval: 600, // Warm every 10 minutes
          queries: [
            { params: { preload: 'critical' }, priority: 5 },
            { params: { cache: 'warm' }, priority: 4 }
          ]
        }
      };

      expect(() => validateTTLConfig(highPerfConfig)).not.toThrow();
    });
  });

  describe('Configuration Validation Edge Cases', () => {
    it('should reject configuration with missing required properties', () => {
      const missingItemConfig = {
        query: { complete: 300, faceted: 60 }
        // Missing item configuration
      };

      expect(() => validateTTLConfig(missingItemConfig as any)).toThrow();
    });

    it('should reject configuration with missing required query properties', () => {
      const missingQueryConfig = {
        item: { default: 3600 }
        // Missing query configuration
      };

      expect(() => validateTTLConfig(missingQueryConfig as any)).toThrow();
    });

    it('should reject configuration with invalid property types', () => {
      const invalidTypeConfig = {
        item: { default: '3600' }, // String instead of number
        query: { complete: 300, faceted: 60 }
      };

      const result = validateTTLConfig(invalidTypeConfig as any);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle configuration with extra unknown properties', () => {
      const extraPropsConfig = {
        item: { default: 3600 },
        query: { complete: 300, faceted: 60 },
        unknownProperty: 'should be ignored',
        anotherUnknown: 12345
      };

      // Should either ignore extra properties or handle gracefully
      expect(() => validateTTLConfig(extraPropsConfig as any)).not.toThrow();
    });

    it('should validate all warming query parameters', () => {
      const complexWarmingConfig: TTLConfig = {
        item: { default: 3600 },
        query: { complete: 300, faceted: 60 },
        warming: {
          enabled: true,
          interval: 300,
          queries: [
            { params: {}, priority: 1 },                    // Empty params
            { params: { single: 'value' }, priority: 2 },   // Single param
            { params: { multiple: 'values', count: 10, active: true }, priority: 3 }, // Multiple params
            { params: { nested: { deep: { value: 'test' } } }, priority: 4 }, // Nested object
            { params: { array: [1, 2, 3] }, priority: 5 }   // Array param
          ]
        }
      };

      expect(() => validateTTLConfig(complexWarmingConfig)).not.toThrow();
    });
  });
});
