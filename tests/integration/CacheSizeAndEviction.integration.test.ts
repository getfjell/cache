// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { EnhancedMemoryCacheMap } from '../../src/memory/EnhancedMemoryCacheMap';
import { createOptions, validateOptions } from '../../src/Options';
import { formatBytes, parseSizeString } from '../../src/utils/CacheSize';
import { createEvictionStrategy } from '../../src/eviction';
import { Item, PriKey, UUID } from '@fjell/core';

// Test item interfaces
interface User extends Item<'user'> {
  id: string;
  name: string;
  email: string;
  profile?: {
    bio?: string;
    preferences?: Record<string, any>;
    history?: any[];
  };
}

interface Product extends Item<'product'> {
  id: string;
  name: string;
  description: string;
  price: number;
  metadata?: {
    reviews?: any[];
    specifications?: Record<string, any>;
  };
}

describe('Cache Size and Eviction Integration Tests', () => {
  describe('End-to-end cache configuration and operation', () => {
    it('should create and configure enhanced memory cache through options system', () => {
      const options = createOptions({
        cacheType: 'memory',
        memoryConfig: {
          size: {
            maxSizeBytes: '5MB',
            maxItems: 1000,
            evictionPolicy: 'lru'
          }
        }
      });

      expect(() => validateOptions(options)).not.toThrow();
      expect(options.memoryConfig?.size?.maxSizeBytes).toBe('5MB');
      expect(options.memoryConfig?.size?.maxItems).toBe(1000);
      expect(options.memoryConfig?.size?.evictionPolicy).toBe('lru');
    });

    it('should integrate size parsing with cache creation', () => {
      const sizeString = '10MB';
      const parsedSize = parseSizeString(sizeString);

      const cache = new EnhancedMemoryCacheMap<User, 'user'>(
        ['user'],
        {
          maxSizeBytes: sizeString,
          evictionPolicy: 'lfu'
        }
      );

      const stats = cache.getStats();
      expect(stats.maxSizeBytes).toBe(parsedSize);
      expect(stats.maxSizeBytes).toBe(10000000);
    });

    it('should integrate eviction strategy creation with cache operations', () => {
      const strategy = createEvictionStrategy('arc', 500);
      expect(strategy).toBeDefined();

      const cache = new EnhancedMemoryCacheMap<Product, 'product'>(
        ['product'],
        {
          maxItems: 5,
          evictionPolicy: 'arc'
        }
      );

      // Add items to test strategy integration
      for (let i = 0; i < 7; i++) {
        const product: Product = {
          key: `prod${i}`,
          id: `prod${i}`,
          name: `Product ${i}`,
          description: `Description for product ${i}`,
          price: 100 + i * 10
        };
        cache.set(`prod${i}`, product);
      }

      const stats = cache.getStats();
      expect(stats.currentItemCount).toBe(5); // Should maintain limit
    });
  });

  describe('Complex cache scenarios with real-world data', () => {
    it('should handle user cache with mixed access patterns', () => {
      const cache = new EnhancedMemoryCacheMap<User, 'user'>(
        ['user'],
        {
          maxItems: 10,
          maxSizeBytes: '50KB',
          evictionPolicy: 'lru'
        }
      );

      // Create users with varying data sizes
      const users: User[] = [
        {
          key: 'user1',
          id: 'user1',
          name: 'John Doe',
          email: 'john@example.com'
        },
        {
          key: 'user2',
          id: 'user2',
          name: 'Jane Smith',
          email: 'jane@example.com',
          profile: {
            bio: 'Software engineer with 5 years of experience',
            preferences: { theme: 'dark', notifications: true },
            history: [1, 2, 3, 4, 5]
          }
        },
        {
          key: 'user3',
          id: 'user3',
          name: 'Bob Johnson',
          email: 'bob@example.com',
          profile: {
            bio: 'Product manager passionate about user experience and innovative solutions',
            preferences: {
              theme: 'light',
              notifications: false,
              language: 'en',
              timezone: 'UTC',
              features: { beta: true, analytics: true }
            },
            history: Array(100).fill(0).map((_, i) => ({ action: `action${i}`, timestamp: Date.now() + i }))
          }
        }
      ];

      // Add users and create access patterns
      users.forEach(user => {
        cache.set(user.key as string, user);
      });

      // Access user1 multiple times (should be kept)
      cache.get('user1');
      cache.get('user1');
      cache.get('user1');

      // Access user2 once
      cache.get('user2');

      // Don't access user3 after initial set

      // Add more users to trigger eviction
      for (let i = 4; i <= 15; i++) {
        const user: User = {
          key: `user${i}`,
          id: `user${i}`,
          name: `User ${i}`,
          email: `user${i}@example.com`
        };
        cache.set(`user${i}`, user);
      }

      const stats = cache.getStats();
      expect(stats.currentItemCount).toBeLessThanOrEqual(10);
      expect(stats.currentSizeBytes).toBeLessThanOrEqual(50000);

      // Check that cache maintains its limits
      const finalStats = cache.getStats();
      expect(finalStats.currentItemCount).toBeLessThanOrEqual(10);
      expect(finalStats.currentSizeBytes).toBeLessThanOrEqual(50000);

      // Verify cache is functioning
      expect(finalStats.currentItemCount).toBeGreaterThan(0);
    });

    it('should handle product catalog with size-based eviction', () => {
      const cache = new EnhancedMemoryCacheMap<Product, 'product'>(
        ['product'],
        {
          maxSizeBytes: '10KB',
          evictionPolicy: 'fifo'
        }
      );

      // Create products with rich metadata
      const createProduct = (id: number, complexity: 'simple' | 'complex'): Product => {
        const base: Product = {
          key: `product${id}`,
          id: `product${id}`,
          name: `Product ${id}`,
          description: `High-quality product ${id} with excellent features`,
          price: 50 + id * 10
        };

        if (complexity === 'complex') {
          base.metadata = {
            reviews: Array(20).fill(0).map((_, i) => ({
              id: i,
              rating: 4 + Math.random(),
              comment: `Great product! Review ${i} with detailed feedback`,
              reviewer: `reviewer${i}@example.com`,
              timestamp: Date.now() - i * 86400000
            })),
            specifications: {
              weight: `${1 + Math.random() * 5}kg`,
              dimensions: { width: 10, height: 20, depth: 15 },
              materials: ['plastic', 'metal', 'rubber'],
              features: Array(10).fill(0).map((_, i) => `feature${i}`),
              compatibility: Array(5).fill(0).map((_, i) => `system${i}`),
              warranty: '2 years',
              certifications: ['CE', 'FCC', 'RoHS']
            }
          };
        }

        return base;
      };

      // Add mix of simple and complex products
      for (let i = 1; i <= 5; i++) {
        cache.set(`product${i}`, createProduct(i, 'simple'));
      }

      for (let i = 6; i <= 10; i++) {
        cache.set(`product${i}`, createProduct(i, 'complex'));
      }

      const stats = cache.getStats();
      expect(stats.currentSizeBytes).toBeLessThanOrEqual(10000);
      expect(stats.utilizationPercent.bytes).toBeLessThanOrEqual(100);

      // FIFO should have evicted earlier products
      expect(cache.get('product1')).toBeNull();
    });

    it('should handle mixed data types with LFU eviction', () => {
      interface MixedData {
        key?: string;
        id: string;
        type: 'text' | 'number' | 'object' | 'array';
        data: any;
        metadata?: {
          created: Date;
          accessCount: number;
          size: number;
        };
      }

      const cache = new EnhancedMemoryCacheMap<MixedData, 'mixed'>(
        ['mixed'],
        {
          maxItems: 8,
          evictionPolicy: 'lfu'
        }
      );

      const mixedItems: MixedData[] = [
        {
          key: 'text1',
          id: 'text1',
          type: 'text',
          data: 'Short text'
        },
        {
          key: 'text2',
          id: 'text2',
          type: 'text',
          data: 'Very long text with lots of content that should make this item larger in terms of estimated size calculation'
        },
        {
          key: 'number1',
          id: 'number1',
          type: 'number',
          data: 42
        },
        {
          key: 'number2',
          id: 'number2',
          type: 'number',
          data: Math.PI
        },
        {
          key: 'object1',
          id: 'object1',
          type: 'object',
          data: { name: 'Simple object', value: 123 }
        },
        {
          key: 'object2',
          id: 'object2',
          type: 'object',
          data: {
            complex: {
              nested: {
                structure: {
                  with: ['arrays', 'and', 'objects'],
                  values: { a: 1, b: 2, c: 3 }
                }
              }
            }
          }
        },
        {
          key: 'array1',
          id: 'array1',
          type: 'array',
          data: [1, 2, 3, 4, 5]
        },
        {
          key: 'array2',
          id: 'array2',
          type: 'array',
          data: Array(100).fill(0).map((_, i) => ({ id: i, value: Math.random() }))
        }
      ];

      // Add all items
      mixedItems.forEach(item => {
        cache.set(item.key!, item);
      });

      // Create access patterns for LFU testing
      // High frequency items
      cache.get('text1'); cache.get('text1'); cache.get('text1'); cache.get('text1');
      cache.get('number1'); cache.get('number1'); cache.get('number1');
      cache.get('object1'); cache.get('object1');

      // Medium frequency items
      cache.get('text2');
      cache.get('number2');

      // Low frequency items (just from set)
      // array1, array2, object2

      // Add more items to force eviction
      for (let i = 9; i <= 12; i++) {
        const item: MixedData = {
          key: `new${i}`,
          id: `new${i}`,
          type: 'text',
          data: `New item ${i}`
        };
        cache.set(`new${i}`, item);
      }

      const stats = cache.getStats();
      expect(stats.currentItemCount).toBe(8);

      // High frequency items should still exist
      expect(cache.get('text1')).toBeTruthy();
      expect(cache.get('number1')).toBeTruthy();
      expect(cache.get('object1')).toBeTruthy();

      // Low frequency items should be evicted
      expect(cache.get('array2')).toBeNull();
    });
  });

  describe('Performance and stress testing integration', () => {
    it('should maintain performance with large datasets and eviction', () => {
      const cache = new EnhancedMemoryCacheMap<User, 'user'>(
        ['user'],
        {
          maxItems: 1000,
          maxSizeBytes: '1MB',
          evictionPolicy: 'random'
        }
      );

      // Verify implementationType
      expect(cache.implementationType).toBe('memory/enhanced');

      // Verify cache info provides eviction information
      const cacheInfo = cache.getCacheInfo();
      expect(cacheInfo.implementationType).toBe('memory/enhanced');
      expect(cacheInfo.evictionPolicy).toBe('random'); // Should match configured policy
      expect(cacheInfo.supportsTTL).toBe(true);
      expect(cacheInfo.supportsEviction).toBe(true);

      const startTime = Date.now();

      // Add many users rapidly
      for (let i = 0; i < 2000; i++) {
        const user: User = {
          key: `user${i}`,
          id: `user${i}`,
          name: `User ${i}`,
          email: `user${i}@example.com`,
          profile: {
            bio: `User ${i} biography with some text`,
            preferences: { theme: i % 2 === 0 ? 'dark' : 'light' },
            history: Array(10).fill(0).map((_, j) => ({ action: j, time: Date.now() }))
          }
        };
        cache.set(`user${i}`, user);
      }

      const addTime = Date.now() - startTime;

      // Perform random access operations
      const accessStartTime = Date.now();
      for (let i = 0; i < 500; i++) {
        const randomKey = `user${Math.floor(Math.random() * 2000)}`;
        cache.get(randomKey);
      }
      const accessTime = Date.now() - accessStartTime;

      const stats = cache.getStats();
      expect(stats.currentItemCount).toBeLessThanOrEqual(1000); // May be less due to size limits
      expect(stats.currentSizeBytes).toBeLessThanOrEqual(1000000);
      expect(addTime).toBeLessThan(5000); // Should be reasonably fast (increased for CI)
      expect(accessTime).toBeLessThan(1000); // Should be fast (increased for CI)
    });

    it('should handle rapid size changes and eviction efficiently', () => {
      const cache = new EnhancedMemoryCacheMap<Product, 'product'>(
        ['product'],
        {
          maxSizeBytes: '500KB',
          evictionPolicy: 'lru'
        }
      );

      // Alternate between small and large items
      for (let i = 0; i < 100; i++) {
        const isLarge = i % 2 === 0;
        const product: Product = {
          key: `product${i}`,
          id: `product${i}`,
          name: `Product ${i}`,
          description: isLarge
            ? `Very detailed description for product ${i} with extensive information about features, specifications, usage instructions`
            : `Simple product ${i}`,
          price: 100 + i,
          metadata: isLarge ? {
            reviews: Array(50).fill(0).map((_, j) => ({
              rating: 4 + Math.random(),
              comment: `Detailed review ${j} with comprehensive feedback`,
              reviewer: `reviewer${j}@domain.com`
            })),
            specifications: Object.fromEntries(
              Array(20).fill(0).map((_, j) => [`spec${j}`, `value${j}`])
            )
          } : {}
        };
        cache.set(`product${i}`, product);
      }

      const stats = cache.getStats();
      expect(stats.currentSizeBytes).toBeLessThanOrEqual(500000);
      expect(stats.utilizationPercent.bytes).toBeLessThanOrEqual(100);
    });
  });

  describe('Error handling and edge case integration', () => {
    it('should handle invalid configurations gracefully', () => {
      expect(() => {
        return createOptions({
          cacheType: 'memory',
          memoryConfig: {
            size: {
              maxSizeBytes: 'invalid',
              evictionPolicy: 'lru'
            }
          }
        });
      }).not.toThrow(); // Creation should not throw

      const options = createOptions({
        cacheType: 'memory',
        memoryConfig: {
          size: {
            maxSizeBytes: 'invalid',
            evictionPolicy: 'lru'
          }
        }
      });

      expect(() => validateOptions(options)).toThrow(); // Validation should throw
    });

    it('should handle cache operations with mixed valid and invalid keys', () => {
      const cache = new EnhancedMemoryCacheMap<User, 'user'>(
        ['user'],
        {
          maxItems: 5,
          evictionPolicy: 'lru'
        }
      );

      const validUser: User = {
        key: 'valid',
        id: 'valid',
        name: 'Valid User',
        email: 'valid@example.com'
      };

      // Valid operations
      cache.set('valid', validUser);
      expect(cache.get('valid')).toEqual(validUser);

      // Operations with non-existent keys should not crash
      expect(cache.get('nonexistent')).toBeNull();
      expect(cache.includesKey('nonexistent')).toBe(false);
      cache.delete('nonexistent'); // Should not crash

      // Cache should still function normally
      expect(cache.get('valid')).toEqual(validUser);
      expect(cache.getStats().currentItemCount).toBe(1);
    });

    it('should handle concurrent-like operations correctly', () => {
      const cache = new EnhancedMemoryCacheMap<Product, 'product'>(
        ['product'],
        {
          maxItems: 3,
          evictionPolicy: 'lfu'
        }
      );

      const product1: Product = {
        key: 'prod1',
        id: 'prod1',
        name: 'Product 1',
        description: 'First product',
        price: 100
      };

      // Rapid set/get/update operations
      cache.set('prod1', product1);
      cache.get('prod1');

      const updatedProduct1 = { ...product1, price: 150 };
      cache.set('prod1', updatedProduct1);

      expect(cache.get('prod1')?.price).toBe(150);
      expect(cache.getStats().currentItemCount).toBe(1);

      // Add items to fill cache
      for (let i = 2; i <= 4; i++) {
        const product: Product = {
          key: `prod${i}`,
          id: `prod${i}`,
          name: `Product ${i}`,
          description: `Product ${i} description`,
          price: 100 * i
        };
        cache.set(`prod${i}`, product);
      }

      const stats = cache.getStats();
      expect(stats.currentItemCount).toBe(3);
    });
  });

  describe('Monitoring and observability integration', () => {
    it('should provide comprehensive monitoring data', () => {
      const cache = new EnhancedMemoryCacheMap<User, 'user'>(
        ['user'],
        {
          maxItems: 10,
          maxSizeBytes: '1KB',
          evictionPolicy: 'arc'
        }
      );

      // Add some users
      for (let i = 1; i <= 5; i++) {
        const user: User = {
          key: `user${i}`,
          id: `user${i}`,
          name: `User ${i}`,
          email: `user${i}@example.com`
        };
        cache.set(`user${i}`, user);
      }

      const stats = cache.getStats();

      // Verify all stats are present and reasonable
      expect(stats.currentItemCount).toBe(5);
      expect(stats.maxItems).toBe(10);
      expect(stats.currentSizeBytes).toBeGreaterThan(0);
      expect(stats.maxSizeBytes).toBe(1000);

      expect(stats.utilizationPercent.items).toBe(50); // 5/10 * 100
      expect(stats.utilizationPercent.bytes).toBeGreaterThan(0);
      expect(stats.utilizationPercent.bytes).toBeLessThanOrEqual(100);

      // Test formatted output
      const formattedSize = formatBytes(stats.currentSizeBytes);
      const formattedMaxSize = formatBytes(stats.maxSizeBytes);

      expect(formattedSize).toMatch(/^\d+(\.\d+)?\s[KMGT]?B$/);
      expect(formattedMaxSize).toBe('1 KB');
    });

    it('should track statistics accurately during eviction cycles', () => {
      const cache = new EnhancedMemoryCacheMap<Product, 'product'>(
        ['product'],
        {
          maxItems: 3,
          evictionPolicy: 'lru'
        }
      );

      const initialStats = cache.getStats();
      expect(initialStats.currentItemCount).toBe(0);
      expect(initialStats.currentSizeBytes).toBe(0);

      // Add items and track stats
      const statHistory: Array<ReturnType<typeof cache.getStats>> = [];

      for (let i = 1; i <= 6; i++) {
        const key: PriKey<'product'> = { kt: 'product', pk: `prod${i}` as UUID };
        const product: Product = {
          key,
          id: `prod${i}`,
          name: `Product ${i}`,
          description: `Description ${i}`,
          price: 100 * i,
          events: {} as any // Mock events object
        };
        cache.set(key, product);
        statHistory.push(cache.getStats());
      }

      // Verify stats progression
      expect(statHistory[0].currentItemCount).toBe(1);
      expect(statHistory[1].currentItemCount).toBe(2);
      expect(statHistory[2].currentItemCount).toBe(3);
      expect(statHistory[3].currentItemCount).toBe(3); // Should start evicting
      expect(statHistory[4].currentItemCount).toBe(3);
      expect(statHistory[5].currentItemCount).toBe(3);

      // All stats should show consistent max values
      statHistory.forEach(stats => {
        expect(stats.maxItems).toBe(3);
        expect(stats.utilizationPercent.items).toBeLessThanOrEqual(100);
      });
    });
  });

  describe('Enhanced Eviction Strategy Integration', () => {
    it('should integrate LFU with probabilistic counting', () => {
      const lfuConfig = {
        type: 'lfu' as const,
        useProbabilisticCounting: true,
        sketchWidth: 64,
        sketchDepth: 3,
        decayFactor: 0 // Disable decay to avoid timing-dependent behavior
      };
      const strategy = createEvictionStrategy('lfu', 100, lfuConfig);
      expect(strategy).toBeDefined();
      expect((strategy as any).getConfig().useProbabilisticCounting).toBe(true);
    });

    it('should integrate ARC with enhanced frequency tracking', () => {
      const arcConfig = {
        type: 'arc' as const,
        frequencyThreshold: 3,
        useEnhancedFrequency: true,
        frequencyDecayFactor: 0, // Disable decay to avoid timing-dependent behavior
        adaptiveLearningRate: 1.5
      };
      const strategy = createEvictionStrategy('arc', 100, arcConfig);
      expect(strategy).toBeDefined();
      expect((strategy as any).getConfig().frequencyThreshold).toBe(3);
      expect((strategy as any).getConfig().adaptiveLearningRate).toBe(1.5);
    });

    it('should integrate 2Q with frequency promotion', () => {
      const twoQConfig = {
        type: '2q' as const,
        useFrequencyPromotion: true,
        promotionThreshold: 4,
        hotQueueDecayFactor: 0.1,
        useFrequencyWeightedLRU: true
      };
      const strategy = createEvictionStrategy('2q', 100, twoQConfig);
      expect(strategy).toBeDefined();
      expect((strategy as any).getConfig().promotionThreshold).toBe(4);
      expect((strategy as any).getConfig().useFrequencyWeightedLRU).toBe(true);
    });

    it('should handle enhanced strategies in cache operations', () => {
      // Test that enhanced strategies can be used in actual cache operations
      const enhancedLfuStrategy = createEvictionStrategy('lfu', 3, {
        type: 'lfu',
        useProbabilisticCounting: true,
        decayFactor: 0 // Disable decay to avoid timing-dependent behavior
      });

      // Simulate cache operations with enhanced strategy
      const items = new Map();

      // Add items
      const item1 = { key: 'item1', addedAt: Date.now(), lastAccessedAt: Date.now(), accessCount: 1, estimatedSize: 100 };
      const item2 = { key: 'item2', addedAt: Date.now(), lastAccessedAt: Date.now(), accessCount: 1, estimatedSize: 100 };

      enhancedLfuStrategy.onItemAdded('item1', item1);
      enhancedLfuStrategy.onItemAdded('item2', item2);

      // Access items to build frequency
      enhancedLfuStrategy.onItemAccessed('item1', item1);
      enhancedLfuStrategy.onItemAccessed('item1', item1);

      items.set('item1', item1);
      items.set('item2', item2);

      // Strategy should be able to make eviction decisions
      const evictKey = enhancedLfuStrategy.selectForEviction(items);
      expect(evictKey).toBeDefined();
      expect(['item1', 'item2']).toContain(evictKey);
    });

    it('should maintain configuration consistency across operations', () => {
      const configs = [
        { type: 'lfu' as const, decayFactor: 0, useProbabilisticCounting: false }, // Disable decay for deterministic tests
        { type: 'arc' as const, frequencyThreshold: 5, useEnhancedFrequency: false },
        { type: '2q' as const, promotionThreshold: 3, useFrequencyPromotion: false }
      ];

      configs.forEach(config => {
        const strategy = createEvictionStrategy(config.type, 100, config);
        const returnedConfig = (strategy as any).getConfig();

        expect(returnedConfig.type).toBe(config.type);

        // Verify specific config values are preserved
        if (config.type === 'lfu') {
          expect(returnedConfig.decayFactor).toBe(config.decayFactor);
          expect(returnedConfig.useProbabilisticCounting).toBe(config.useProbabilisticCounting);
        } else if (config.type === 'arc') {
          expect(returnedConfig.frequencyThreshold).toBe(config.frequencyThreshold);
          expect(returnedConfig.useEnhancedFrequency).toBe(config.useEnhancedFrequency);
        } else if (config.type === '2q') {
          expect(returnedConfig.promotionThreshold).toBe(config.promotionThreshold);
          expect(returnedConfig.useFrequencyPromotion).toBe(config.useFrequencyPromotion);
        }
      });
    });
  });
});
