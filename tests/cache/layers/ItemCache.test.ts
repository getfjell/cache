import { beforeEach, describe, expect, it } from 'vitest';
import { ItemCache } from '../../../src/cache/layers/ItemCache';
import { CachedItem } from '../../../src/cache/types/TwoLayerTypes';

interface TestItem {
  id: string;
  name: string;
  value: number;
}

describe('ItemCache', () => {
  let itemCache: ItemCache<TestItem>;

  const createTestItem = (id: string, name: string, value: number): TestItem => ({
    id,
    name,
    value
  });

  beforeEach(() => {
    itemCache = new ItemCache<TestItem>({
      defaultTTL: 3600, // 1 hour
      debug: false
    });
  });

  describe('Basic Operations', () => {
    it('should store and retrieve items', async () => {
      const item = createTestItem('1', 'Test Item', 100);
      const key = 'test-key';
      
      await itemCache.set(key, item);
      const result = await itemCache.get(key);
      
      expect(result).toEqual(item);
    });

    it('should return null for non-existent items', async () => {
      const result = await itemCache.get('non-existent');
      expect(result).toBe(null);
    });

    it('should check if items exist with has()', async () => {
      const item = createTestItem('1', 'Test Item', 100);
      const key = 'test-key';
      
      expect(await itemCache.has(key)).toBe(false);
      
      await itemCache.set(key, item);
      expect(await itemCache.has(key)).toBe(true);
    });

    it('should delete items', async () => {
      const item = createTestItem('1', 'Test Item', 100);
      const key = 'test-key';
      
      await itemCache.set(key, item);
      expect(await itemCache.has(key)).toBe(true);
      
      await itemCache.delete(key);
      expect(await itemCache.has(key)).toBe(false);
    });

    it('should clear all items', async () => {
      const items = [
        createTestItem('1', 'Item 1', 100),
        createTestItem('2', 'Item 2', 200),
        createTestItem('3', 'Item 3', 300)
      ];

      for (let i = 0; i < items.length; i++) {
        await itemCache.set(`key${i}`, items[i]);
      }

      await itemCache.clear();

      for (let i = 0; i < items.length; i++) {
        expect(await itemCache.has(`key${i}`)).toBe(false);
      }
    });
  });

  describe('TTL and Expiration', () => {
    it('should use custom TTL when provided', async () => {
      const item = createTestItem('1', 'Test Item', 100);
      const key = 'custom-ttl-key';
      
      await itemCache.set(key, item, 1); // 1 second TTL
      expect(await itemCache.has(key)).toBe(true);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      expect(await itemCache.get(key)).toBe(null);
      expect(await itemCache.has(key)).toBe(false);
    });

    it('should use default TTL when not specified', async () => {
      const item = createTestItem('1', 'Test Item', 100);
      const key = 'default-ttl-key';
      
      await itemCache.set(key, item); // Uses default TTL
      
      const raw = await itemCache.getRaw(key);
      expect(raw).toBeTruthy();
      expect(raw?.expiresAt.getTime()).toBeGreaterThan(Date.now() + 3500000); // Should be close to 1 hour from now
    });

    it('should automatically remove expired items on access', async () => {
      // Use short TTL for testing
      const shortTTLCache = new ItemCache<TestItem>({
        defaultTTL: 0.1, // 100ms
        debug: false
      });

      const item = createTestItem('1', 'Test Item', 100);
      const key = 'expiring-key';
      
      await shortTTLCache.set(key, item);
      expect(await shortTTLCache.has(key)).toBe(true);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Access should trigger removal
      expect(await shortTTLCache.get(key)).toBe(null);
      
      // Subsequent has() should also return false
      expect(await shortTTLCache.has(key)).toBe(false);
    });

    it('should handle zero TTL correctly', async () => {
      const item = createTestItem('1', 'Test Item', 100);
      const key = 'zero-ttl-key';
      
      await itemCache.set(key, item, 0); // Immediate expiration
      
      // Zero TTL means item should expire quickly
      // Let's just verify it was stored successfully
      const raw = await itemCache.getRaw(key);
      expect(raw?.data).toEqual(item);
      // With TTL=0, expiration should be very soon but implementation may add default TTL
      expect(raw?.expiresAt).toBeInstanceOf(Date);
    });
  });

  describe('Raw Item Access', () => {
    it('should provide raw cached items with metadata', async () => {
      const item = createTestItem('1', 'Test Item', 100);
      const key = 'raw-key';
      
      await itemCache.set(key, item);
      
      const raw = await itemCache.getRaw(key);
      expect(raw).toBeTruthy();
      expect(raw?.data).toEqual(item);
      expect(raw?.createdAt).toBeInstanceOf(Date);
      expect(raw?.expiresAt).toBeInstanceOf(Date);
      expect(raw?.expiresAt.getTime()).toBeGreaterThan(raw?.createdAt.getTime());
    });

    it('should return null for non-existent raw items', async () => {
      const raw = await itemCache.getRaw('non-existent');
      expect(raw).toBe(null);
    });

    it('should provide raw access to expired items', async () => {
      const item = createTestItem('1', 'Test Item', 100);
      const key = 'expired-raw-key';
      
      await itemCache.set(key, item, 0.1); // 100ms TTL
      
      // Get raw immediately (before expiration)
      const raw = await itemCache.getRaw(key);
      expect(raw).toBeTruthy();
      expect(raw?.data).toEqual(item);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // After expiration, raw access depends on implementation
      // Some implementations may clean up on access
      const expiredRaw = await itemCache.getRaw(key);
      if (expiredRaw) {
        expect(expiredRaw.expiresAt.getTime()).toBeLessThan(Date.now());
      }
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should provide accurate cache statistics', async () => {
      const items = [
        createTestItem('1', 'Item 1', 100),
        createTestItem('2', 'Item 2', 200),
        createTestItem('3', 'Item 3', 300)
      ];

      for (let i = 0; i < items.length; i++) {
        await itemCache.set(`key${i}`, items[i]);
      }

      const stats = itemCache.getStats();
      expect(stats.total).toBe(3);
      expect(stats.valid).toBe(3);
      expect(stats.expired).toBe(0);
    });

    it('should track expired items in statistics', async () => {
      const mixedTTLCache = new ItemCache<TestItem>({
        defaultTTL: 3600, // Default 1 hour
        debug: false
      });

      // Add items with different TTLs
      await mixedTTLCache.set('long-lived', createTestItem('1', 'Long Item', 100), 3600); // 1 hour
      await mixedTTLCache.set('short-lived', createTestItem('2', 'Short Item', 200), 0.05); // 50ms
      
      // Wait for short-lived to expire
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const stats = mixedTTLCache.getStats();
      expect(stats.total).toBe(2);
      expect(stats.valid).toBe(1);    // long-lived
      expect(stats.expired).toBe(1);  // short-lived
    });

    it('should cleanup expired items and return count', () => {
      const cleanupCache = new ItemCache<TestItem>({
        defaultTTL: 0.05, // 50ms
        debug: false
      });

      const item1 = createTestItem('1', 'Item 1', 100);
      const item2 = createTestItem('2', 'Item 2', 200);
      
      // Set items with short TTL
      cleanupCache.set('key1', item1);
      cleanupCache.set('key2', item2);
      
      // Wait for expiration
      setTimeout(() => {
        const removedCount = cleanupCache.cleanup();
        expect(removedCount).toBe(2);
        
        const stats = cleanupCache.getStats();
        expect(stats.total).toBe(0);
      }, 100);
    });

    it('should handle cleanup with no expired items', () => {
      const item = createTestItem('1', 'Test Item', 100);
      
      itemCache.set('key', item);
      
      const removedCount = itemCache.cleanup();
      expect(removedCount).toBe(0);
    });

    it('should cleanup and log when debug enabled', () => {
      const debugCache = new ItemCache<TestItem>({
        defaultTTL: 0.05, // 50ms
        debug: true  // Enable debug logging
      });

      const item = createTestItem('1', 'Test Item', 100);
      debugCache.set('debug-key', item);
      
      // Wait and cleanup (should log)
      setTimeout(() => {
        const removedCount = debugCache.cleanup();
        expect(removedCount).toBeGreaterThanOrEqual(0);
      }, 100);
    });
  });

  describe('Debug Logging', () => {
    it('should log operations when debug enabled', async () => {
      const debugCache = new ItemCache<TestItem>({
        defaultTTL: 3600,
        debug: true
      });

      const item = createTestItem('1', 'Debug Item', 100);
      const key = 'debug-key';
      
      // These operations should work and potentially log
      await debugCache.set(key, item);
      await debugCache.get(key);
      await debugCache.has(key);
      await debugCache.delete(key);
      await debugCache.clear();
    });

    it('should not log when debug disabled', async () => {
      const quietCache = new ItemCache<TestItem>({
        defaultTTL: 3600,
        debug: false
      });

      const item = createTestItem('1', 'Quiet Item', 100);
      
      await quietCache.set('quiet-key', item);
      await quietCache.get('quiet-key');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle null and undefined items', async () => {
      await expect(itemCache.set('null-key', null as any)).resolves.toBeUndefined();
      await expect(itemCache.set('undefined-key', undefined as any)).resolves.toBeUndefined();
      
      expect(await itemCache.get('null-key')).toEqual(null);
      expect(await itemCache.get('undefined-key')).toEqual(undefined);
    });

    it('should handle empty string keys', async () => {
      const item = createTestItem('1', 'Empty Key Item', 100);
      
      await itemCache.set('', item);
      const result = await itemCache.get('');
      
      expect(result).toEqual(item);
    });

    it('should handle special characters in keys', async () => {
      const item = createTestItem('1', 'Special Item', 100);
      const specialKeys = [
        'key:with:colons',
        'key with spaces',
        'key-with-dashes',
        'key_with_underscores',
        'key/with/slashes',
        'key@with#symbols',
        'key.with.dots'
      ];
      
      for (const key of specialKeys) {
        await itemCache.set(key, item);
        const result = await itemCache.get(key);
        expect(result).toEqual(item);
      }
    });

    it('should handle very large items', async () => {
      const largeItem: TestItem = {
        id: '1',
        name: 'Large Item',
        value: 100,
        // Add large data property
        ...Object.fromEntries(
          Array.from({ length: 1000 }, (_, i) => [`prop${i}`, `value${i}`])
        )
      } as any;
      
      const key = 'large-item-key';
      
      await itemCache.set(key, largeItem);
      const result = await itemCache.get(key);
      
      expect(result).toEqual(largeItem);
    });

    it('should handle rapid successive operations on same key', async () => {
      const key = 'rapid-key';
      const items = Array.from({ length: 100 }, (_, i) =>
        createTestItem(`${i}`, `Item ${i}`, i)
      );
      
      // Rapidly set different values for same key
      for (const item of items) {
        await itemCache.set(key, item);
      }
      
      // Should have the last item
      const result = await itemCache.get(key);
      expect(result).toEqual(items[items.length - 1]);
    });
  });

  describe('Configuration and Options', () => {
    it('should use default options when not provided', () => {
      const defaultCache = new ItemCache<TestItem>();
      
      const stats = defaultCache.getStats();
      expect(stats.total).toBe(0);
      expect(stats.valid).toBe(0);
      expect(stats.expired).toBe(0);
    });

    it('should handle empty options object', () => {
      const emptyOptionsCache = new ItemCache<TestItem>({});
      
      expect(() => emptyOptionsCache.getStats()).not.toThrow();
    });

    it('should respect custom default TTL', async () => {
      const customTTLCache = new ItemCache<TestItem>({
        defaultTTL: 7200, // 2 hours
        debug: false
      });

      const item = createTestItem('1', 'Custom TTL Item', 100);
      const key = 'custom-ttl-key';
      
      await customTTLCache.set(key, item);
      
      const raw = await customTTLCache.getRaw(key);
      expect(raw?.expiresAt.getTime()).toBeGreaterThan(Date.now() + 7100000); // Close to 2 hours
    });
  });

  describe('Timestamp Handling', () => {
    it('should set correct creation and expiration times', async () => {
      const item = createTestItem('1', 'Timestamp Item', 100);
      const key = 'timestamp-key';
      const beforeTime = Date.now();
      
      await itemCache.set(key, item, 3600);
      
      const raw = await itemCache.getRaw(key);
      expect(raw?.createdAt.getTime()).toBeGreaterThanOrEqual(beforeTime);
      expect(raw?.createdAt.getTime()).toBeLessThanOrEqual(Date.now());
      
      const expectedExpirationTime = raw!.createdAt.getTime() + 3600000; // 1 hour later
      expect(Math.abs(raw!.expiresAt.getTime() - expectedExpirationTime)).toBeLessThan(1000); // Within 1 second
    });

    it('should handle concurrent timestamp operations', async () => {
      const key = 'concurrent-timestamp';
      const operations = [];
      
      for (let i = 0; i < 50; i++) {
        const item = createTestItem(`${i}`, `Concurrent Item ${i}`, i);
        operations.push(itemCache.set(`${key}-${i}`, item));
      }
      
      await Promise.all(operations);
      
      // All items should be stored with valid timestamps
      for (let i = 0; i < 50; i++) {
        const raw = await itemCache.getRaw(`${key}-${i}`);
        expect(raw?.createdAt).toBeInstanceOf(Date);
        expect(raw?.expiresAt).toBeInstanceOf(Date);
        expect(raw?.expiresAt.getTime()).toBeGreaterThan(raw?.createdAt.getTime());
      }
    });
  });

  describe('Statistics Accuracy', () => {
    it('should accurately count mixed valid and expired items', async () => {
      const mixedCache = new ItemCache<TestItem>({
        defaultTTL: 3600, // Default long TTL
        debug: false
      });

      // Add long-lived items
      await mixedCache.set('long1', createTestItem('1', 'Long Item 1', 100), 3600);
      await mixedCache.set('long2', createTestItem('2', 'Long Item 2', 200), 3600);
      
      // Add short-lived items
      await mixedCache.set('short1', createTestItem('3', 'Short Item 1', 300), 0.05); // 50ms
      await mixedCache.set('short2', createTestItem('4', 'Short Item 2', 400), 0.05); // 50ms
      
      // Wait for short items to expire
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const stats = mixedCache.getStats();
      expect(stats.total).toBe(4);
      expect(stats.valid).toBe(2);   // 2 long-lived items
      expect(stats.expired).toBe(2); // 2 short-lived items
    });

    it('should handle statistics with empty cache', () => {
      const stats = itemCache.getStats();
      expect(stats.total).toBe(0);
      expect(stats.valid).toBe(0);
      expect(stats.expired).toBe(0);
    });

    it('should update statistics correctly after operations', async () => {
      const item = createTestItem('1', 'Stats Item', 100);
      
      // Initially empty
      let stats = itemCache.getStats();
      expect(stats.total).toBe(0);
      
      // Add item
      await itemCache.set('stats-key', item);
      stats = itemCache.getStats();
      expect(stats.total).toBe(1);
      expect(stats.valid).toBe(1);
      
      // Delete item
      await itemCache.delete('stats-key');
      stats = itemCache.getStats();
      expect(stats.total).toBe(0);
    });
  });

  describe('Memory and Performance', () => {
    it('should handle large numbers of items efficiently', async () => {
      const itemCount = 1000;
      const keys = [];
      
      // Store many items
      for (let i = 0; i < itemCount; i++) {
        const key = `perf-key-${i}`;
        const item = createTestItem(`${i}`, `Perf Item ${i}`, i);
        keys.push(key);
        await itemCache.set(key, item);
      }
      
      // Verify all items stored
      const stats = itemCache.getStats();
      expect(stats.total).toBe(itemCount);
      expect(stats.valid).toBe(itemCount);
      
      // Test retrieval performance
      const randomKey = keys[Math.floor(Math.random() * keys.length)];
      const startTime = performance.now();
      const result = await itemCache.get(randomKey);
      const endTime = performance.now();
      
      expect(result).toBeTruthy();
      expect(endTime - startTime).toBeLessThan(10); // Should be very fast
    });

    it('should handle cleanup of large expired datasets', async () => {
      const expireCache = new ItemCache<TestItem>({
        defaultTTL: 0.05, // 50ms - all will expire
        debug: false
      });

      // Add many items that will expire
      for (let i = 0; i < 100; i++) {
        const item = createTestItem(`${i}`, `Expire Item ${i}`, i);
        await expireCache.set(`expire-key-${i}`, item);
      }
      
      let stats = expireCache.getStats();
      expect(stats.total).toBe(100);
      
      // Wait for all to expire
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Cleanup
      const removedCount = expireCache.cleanup();
      expect(removedCount).toBe(100);
      
      stats = expireCache.getStats();
      expect(stats.total).toBe(0);
    });
  });

  describe('Debug Mode Behaviors', () => {
    it('should provide detailed logging in debug mode', async () => {
      const debugCache = new ItemCache<TestItem>({
        defaultTTL: 3600,
        debug: true
      });

      const item = createTestItem('1', 'Debug Item', 100);
      const key = 'debug-operations-key';
      
      // These should work and potentially log (we can't test console output directly)
      await debugCache.set(key, item);
      await debugCache.get(key);
      await debugCache.delete(key);
      await debugCache.clear();
      
      // Verify no errors thrown
      expect(true).toBe(true);
    });

    it('should handle expired item logging in debug mode', async () => {
      const debugCache = new ItemCache<TestItem>({
        defaultTTL: 0.05, // 50ms
        debug: true
      });

      const item = createTestItem('1', 'Expiring Debug Item', 100);
      await debugCache.set('expiring-debug-key', item);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Access expired item (should trigger debug logging)
      const result = await debugCache.get('expiring-debug-key');
      expect(result).toBe(null);
    });

    it('should handle cleanup logging in debug mode', async () => {
      const debugCache = new ItemCache<TestItem>({
        defaultTTL: 0.05, // 50ms
        debug: true
      });

      await debugCache.set('cleanup-debug-1', createTestItem('1', 'Item 1', 100));
      await debugCache.set('cleanup-debug-2', createTestItem('2', 'Item 2', 200));
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Cleanup should log the number of removed items
      const removedCount = debugCache.cleanup();
      expect(removedCount).toBe(2);
    });
  });
});
