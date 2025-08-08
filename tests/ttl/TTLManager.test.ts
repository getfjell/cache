import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TTLConfig, TTLItemMetadata, TTLManager } from '../../src/ttl/TTLManager';
import { CacheItemMetadata, CacheMapMetadataProvider } from '../../src/eviction/EvictionStrategy';

// Mock metadata provider for testing
class MockMetadataProvider implements CacheMapMetadataProvider {
  private metadata: Map<string, CacheItemMetadata> = new Map();
  private currentSize = { itemCount: 0, sizeBytes: 0 };
  private sizeLimits = { maxItems: null as number | null, maxSizeBytes: null as number | null };

  getMetadata(key: string): CacheItemMetadata | null {
    return this.metadata.get(key) || null;
  }

  setMetadata(key: string, metadata: CacheItemMetadata): void {
    this.metadata.set(key, metadata);
  }

  deleteMetadata(key: string): void {
    this.metadata.delete(key);
  }

  getAllMetadata(): Map<string, CacheItemMetadata> {
    return new Map(this.metadata);
  }

  clearMetadata(): void {
    this.metadata.clear();
  }

  getCurrentSize() {
    return this.currentSize;
  }

  getSizeLimits() {
    return this.sizeLimits;
  }

  // Test helpers
  setCurrentSize(itemCount: number, sizeBytes: number): void {
    this.currentSize = { itemCount, sizeBytes };
  }

  setSizeLimits(maxItems: number | null, maxSizeBytes: number | null): void {
    this.sizeLimits = { maxItems, maxSizeBytes };
  }
}

describe('TTLManager', () => {
  let ttlManager: TTLManager;
  let metadataProvider: MockMetadataProvider;

  beforeEach(() => {
    metadataProvider = new MockMetadataProvider();
  });

  afterEach(() => {
    if (ttlManager) {
      ttlManager.destroy();
    }
  });

  describe('constructor and configuration', () => {
    it('should create TTL manager with default config', () => {
      ttlManager = new TTLManager();
      expect(ttlManager.isTTLEnabled()).toBe(false);
      expect(ttlManager.getDefaultTTL()).toBeUndefined();
    });

    it('should create TTL manager with custom config', () => {
      const config: TTLConfig = {
        defaultTTL: 5000,
        autoCleanup: true,
        validateOnAccess: true
      };
      ttlManager = new TTLManager(config);
      expect(ttlManager.isTTLEnabled()).toBe(true);
      expect(ttlManager.getDefaultTTL()).toBe(5000);
    });

    it('should create TTL manager with zero TTL (disabled)', () => {
      ttlManager = new TTLManager({ defaultTTL: 0 });
      expect(ttlManager.isTTLEnabled()).toBe(false);
      expect(ttlManager.getDefaultTTL()).toBe(0);
    });

    it('should create TTL manager with negative TTL (disabled)', () => {
      ttlManager = new TTLManager({ defaultTTL: -1000 });
      expect(ttlManager.isTTLEnabled()).toBe(false);
      expect(ttlManager.getDefaultTTL()).toBe(-1000);
    });

    it('should create TTL manager with autoCleanup disabled', () => {
      ttlManager = new TTLManager({
        defaultTTL: 5000,
        autoCleanup: false,
        cleanupInterval: 30000
      });
      expect(ttlManager.isTTLEnabled()).toBe(true);
      expect(ttlManager.getDefaultTTL()).toBe(5000);
    });

    it('should create TTL manager with validateOnAccess disabled', () => {
      ttlManager = new TTLManager({
        defaultTTL: 5000,
        validateOnAccess: false
      });
      expect(ttlManager.isTTLEnabled()).toBe(true);
    });

    it('should update configuration', () => {
      ttlManager = new TTLManager();
      expect(ttlManager.isTTLEnabled()).toBe(false);

      ttlManager.updateConfig({ defaultTTL: 3000 });
      expect(ttlManager.isTTLEnabled()).toBe(true);
      expect(ttlManager.getDefaultTTL()).toBe(3000);
    });

    it('should update configuration and restart auto cleanup when cleanup settings change', () => {
      ttlManager = new TTLManager({
        defaultTTL: 1000,
        autoCleanup: true,
        cleanupInterval: 60000
      });

      // Change cleanup interval
      ttlManager.updateConfig({ cleanupInterval: 30000 });
      expect(ttlManager.getDefaultTTL()).toBe(1000);

      // Disable auto cleanup
      ttlManager.updateConfig({ autoCleanup: false });
      expect(ttlManager.getDefaultTTL()).toBe(1000);

      // Re-enable auto cleanup
      ttlManager.updateConfig({
        autoCleanup: true,
        cleanupInterval: 45000
      });
      expect(ttlManager.getDefaultTTL()).toBe(1000);
    });

    it('should handle partial configuration updates', () => {
      ttlManager = new TTLManager({
        defaultTTL: 1000,
        autoCleanup: true,
        validateOnAccess: true,
        cleanupInterval: 60000
      });

      ttlManager.updateConfig({ defaultTTL: 2000 });
      expect(ttlManager.getDefaultTTL()).toBe(2000);
      expect(ttlManager.isTTLEnabled()).toBe(true);

      ttlManager.updateConfig({ validateOnAccess: false });
      expect(ttlManager.getDefaultTTL()).toBe(2000);
    });
  });

  describe('TTL operations', () => {
    beforeEach(() => {
      ttlManager = new TTLManager({ defaultTTL: 1000, validateOnAccess: true });
    });

    it('should set TTL metadata when item is added', () => {
      const now = Date.now();
      const metadata: TTLItemMetadata = {
        key: 'test-key',
        addedAt: now,
        lastAccessedAt: now,
        accessCount: 1,
        estimatedSize: 100
      };
      metadataProvider.setMetadata('test-key', metadata);

      ttlManager.onItemAdded('test-key', metadataProvider);

      const updatedMetadata = metadataProvider.getMetadata('test-key') as TTLItemMetadata;
      expect(updatedMetadata).not.toBeNull();
      expect(updatedMetadata!.expiresAt).toBe(now + 1000);
      expect(updatedMetadata!.ttl).toBe(1000);
    });

    it('should respect custom TTL for specific items', () => {
      const now = Date.now();
      const metadata: TTLItemMetadata = {
        key: 'test-key',
        addedAt: now,
        lastAccessedAt: now,
        accessCount: 1,
        estimatedSize: 100
      };
      metadataProvider.setMetadata('test-key', metadata);

      ttlManager.onItemAdded('test-key', metadataProvider, 2000);

      const updatedMetadata = metadataProvider.getMetadata('test-key') as TTLItemMetadata;
      expect(updatedMetadata!.expiresAt).toBe(now + 2000);
      expect(updatedMetadata!.ttl).toBe(2000);
    });

    it('should detect expired items', () => {
      const pastTime = Date.now() - 5000;
      const metadata: TTLItemMetadata = {
        key: 'test-key',
        addedAt: pastTime,
        lastAccessedAt: pastTime,
        accessCount: 1,
        estimatedSize: 100,
        expiresAt: pastTime + 1000,
        ttl: 1000
      };
      metadataProvider.setMetadata('test-key', metadata);

      expect(ttlManager.isExpired('test-key', metadataProvider)).toBe(true);
      expect(ttlManager.validateItem('test-key', metadataProvider)).toBe(false);
    });

    it('should not detect valid items as expired', () => {
      const now = Date.now();
      const metadata: TTLItemMetadata = {
        key: 'test-key',
        addedAt: now,
        lastAccessedAt: now,
        accessCount: 1,
        estimatedSize: 100,
        expiresAt: now + 5000,
        ttl: 5000
      } as TTLItemMetadata;
      metadataProvider.setMetadata('test-key', metadata);

      expect(ttlManager.isExpired('test-key', metadataProvider)).toBe(false);
      expect(ttlManager.validateItem('test-key', metadataProvider)).toBe(true);
    });

    it('should find all expired items', () => {
      const now = Date.now();

      // Add expired item
      const expiredMetadata: TTLItemMetadata = {
        key: 'expired-key',
        addedAt: now - 5000,
        lastAccessedAt: now - 5000,
        accessCount: 1,
        estimatedSize: 100,
        expiresAt: now - 1000,
        ttl: 1000
      };
      metadataProvider.setMetadata('expired-key', expiredMetadata);

      // Add valid item
      const validMetadata: TTLItemMetadata = {
        key: 'valid-key',
        addedAt: now,
        lastAccessedAt: now,
        accessCount: 1,
        estimatedSize: 100,
        expiresAt: now + 5000,
        ttl: 5000
      } as TTLItemMetadata;
      metadataProvider.setMetadata('valid-key', validMetadata);

      const expiredKeys = ttlManager.findExpiredItems(metadataProvider);
      expect(expiredKeys).toEqual(['expired-key']);
    });

    it('should get TTL information for items', () => {
      const now = Date.now();
      const metadata: TTLItemMetadata = {
        key: 'test-key',
        addedAt: now,
        lastAccessedAt: now,
        accessCount: 1,
        estimatedSize: 100,
        expiresAt: now + 3000,
        ttl: 3000
      };
      metadataProvider.setMetadata('test-key', metadata);

      const ttlInfo = ttlManager.getItemTTLInfo('test-key', metadataProvider);
      expect(ttlInfo.hasTTL).toBe(true);
      expect(ttlInfo.ttl).toBe(3000);
      expect(ttlInfo.expiresAt).toBe(now + 3000);
      expect(ttlInfo.isExpired).toBe(false);
      expect(ttlInfo.remainingTTL).toBeGreaterThan(2000);
    });

    it('should extend TTL for items', () => {
      const now = Date.now();
      const metadata: TTLItemMetadata = {
        key: 'test-key',
        addedAt: now,
        lastAccessedAt: now,
        accessCount: 1,
        estimatedSize: 100,
        expiresAt: now + 1000,
        ttl: 1000
      };
      metadataProvider.setMetadata('test-key', metadata);

      const extended = ttlManager.extendTTL('test-key', metadataProvider, 2000);
      expect(extended).toBe(true);

      const updatedMetadata = metadataProvider.getMetadata('test-key') as TTLItemMetadata;
      expect(updatedMetadata!.expiresAt).toBe(now + 3000);
    });

    it('should refresh TTL for items', () => {
      const now = Date.now();
      const metadata: TTLItemMetadata = {
        key: 'test-key',
        addedAt: now - 2000,
        lastAccessedAt: now - 2000,
        accessCount: 1,
        estimatedSize: 100,
        expiresAt: now - 1000, // Already expired
        ttl: 1000
      };
      metadataProvider.setMetadata('test-key', metadata);

      const refreshed = ttlManager.refreshTTL('test-key', metadataProvider);
      expect(refreshed).toBe(true);

      const updatedMetadata = metadataProvider.getMetadata('test-key') as TTLItemMetadata;
      expect(updatedMetadata!.expiresAt).toBeGreaterThan(now);
    });

    it('should get remaining TTL for valid items', () => {
      const now = Date.now();
      const metadata: TTLItemMetadata = {
        key: 'test-key',
        addedAt: now,
        lastAccessedAt: now,
        accessCount: 1,
        estimatedSize: 100,
        expiresAt: now + 5000,
        ttl: 5000
      } as TTLItemMetadata;
      metadataProvider.setMetadata('test-key', metadata);

      const remainingTTL = ttlManager.getRemainingTTL('test-key', metadataProvider);
      expect(remainingTTL).toBeGreaterThan(4000);
      expect(remainingTTL).toBeLessThanOrEqual(5000);
    });

    it('should handle cleanupExpiredItems method', () => {
      const now = Date.now();

      // Add expired item
      const expiredMetadata: TTLItemMetadata = {
        key: 'expired-key',
        addedAt: now - 5000,
        lastAccessedAt: now - 5000,
        accessCount: 1,
        estimatedSize: 100,
        expiresAt: now - 1000,
        ttl: 1000
      };
      metadataProvider.setMetadata('expired-key', expiredMetadata);

      const expiredKeys = ttlManager.cleanupExpiredItems(metadataProvider);
      expect(expiredKeys).toEqual(['expired-key']);
    });
  });

  describe('error handling and boundary conditions', () => {
    beforeEach(() => {
      ttlManager = new TTLManager({ defaultTTL: 1000, validateOnAccess: true });
    });

    it('should handle onItemAdded with no TTL configured', () => {
      ttlManager = new TTLManager(); // No default TTL
      const now = Date.now();
      const metadata: TTLItemMetadata = {
        key: 'test-key',
        addedAt: now,
        lastAccessedAt: now,
        accessCount: 1,
        estimatedSize: 100
      };
      metadataProvider.setMetadata('test-key', metadata);

      // Should not throw and should not modify metadata
      ttlManager.onItemAdded('test-key', metadataProvider);

      const updatedMetadata = metadataProvider.getMetadata('test-key') as TTLItemMetadata;
      expect((updatedMetadata as TTLItemMetadata)!.expiresAt).toBeUndefined();
      expect((updatedMetadata as TTLItemMetadata)!.ttl).toBeUndefined();
    });

    it('should handle onItemAdded with missing metadata', () => {
      // Call onItemAdded without setting metadata first
      ttlManager.onItemAdded('nonexistent-key', metadataProvider);

      // Should not throw and no metadata should be created
      const metadata = metadataProvider.getMetadata('nonexistent-key');
      expect(metadata).toBeNull();
    });

    it('should handle onItemAdded with zero TTL', () => {
      // Create TTL manager without default TTL to test zero TTL handling
      const zeroTTLManager = new TTLManager({ validateOnAccess: true });

      const now = Date.now();
      const metadata: TTLItemMetadata = {
        key: 'test-key',
        addedAt: now,
        lastAccessedAt: now,
        accessCount: 1,
        estimatedSize: 100
      };
      metadataProvider.setMetadata('test-key', metadata);

      zeroTTLManager.onItemAdded('test-key', metadataProvider, 0);

      const updatedMetadata = metadataProvider.getMetadata('test-key') as TTLItemMetadata;
      expect((updatedMetadata as TTLItemMetadata)!.expiresAt).toBeUndefined();
      expect((updatedMetadata as TTLItemMetadata)!.ttl).toBeUndefined();

      zeroTTLManager.destroy();
    });

    it('should handle onItemAdded with negative TTL', () => {
      // Create TTL manager without default TTL to test negative TTL handling
      const negativeTTLManager = new TTLManager({ validateOnAccess: true });

      const now = Date.now();
      const metadata: TTLItemMetadata = {
        key: 'test-key',
        addedAt: now,
        lastAccessedAt: now,
        accessCount: 1,
        estimatedSize: 100
      };
      metadataProvider.setMetadata('test-key', metadata);

      negativeTTLManager.onItemAdded('test-key', metadataProvider, -1000);

      const updatedMetadata = metadataProvider.getMetadata('test-key') as TTLItemMetadata;
      expect((updatedMetadata as TTLItemMetadata)!.expiresAt).toBeUndefined();
      expect((updatedMetadata as TTLItemMetadata)!.ttl).toBeUndefined();

      negativeTTLManager.destroy();
    });

    it('should handle isExpired with missing metadata', () => {
      const expired = ttlManager.isExpired('nonexistent-key', metadataProvider);
      expect(expired).toBe(false);
    });

    it('should handle isExpired with metadata but no TTL', () => {
      const now = Date.now();
      const metadata: TTLItemMetadata = {
        key: 'test-key',
        addedAt: now,
        lastAccessedAt: now,
        accessCount: 1,
        estimatedSize: 100
      };
      metadataProvider.setMetadata('test-key', metadata);

      const expired = ttlManager.isExpired('test-key', metadataProvider);
      expect(expired).toBe(false);
    });

    it('should handle getItemTTLInfo with missing metadata', () => {
      const ttlInfo = ttlManager.getItemTTLInfo('nonexistent-key', metadataProvider);
      expect(ttlInfo.hasTTL).toBe(false);
      expect(ttlInfo.isExpired).toBe(false);
      expect(ttlInfo.ttl).toBeUndefined();
      expect(ttlInfo.expiresAt).toBeUndefined();
      expect(ttlInfo.remainingTTL).toBeUndefined();
    });

    it('should handle getItemTTLInfo with metadata but no TTL', () => {
      const now = Date.now();
      const metadata: TTLItemMetadata = {
        key: 'test-key',
        addedAt: now,
        lastAccessedAt: now,
        accessCount: 1,
        estimatedSize: 100
      };
      metadataProvider.setMetadata('test-key', metadata);

      const ttlInfo = ttlManager.getItemTTLInfo('test-key', metadataProvider);
      expect(ttlInfo.hasTTL).toBe(false);
      expect(ttlInfo.isExpired).toBe(false);
    });

    it('should handle getItemTTLInfo with expired item', () => {
      const now = Date.now();
      const metadata: TTLItemMetadata = {
        key: 'test-key',
        addedAt: now - 5000,
        lastAccessedAt: now - 5000,
        accessCount: 1,
        estimatedSize: 100,
        expiresAt: now - 1000,
        ttl: 1000
      };
      metadataProvider.setMetadata('test-key', metadata);

      const ttlInfo = ttlManager.getItemTTLInfo('test-key', metadataProvider);
      expect(ttlInfo.hasTTL).toBe(true);
      expect(ttlInfo.isExpired).toBe(true);
      expect(ttlInfo.remainingTTL).toBe(0);
    });

    it('should handle extendTTL with missing metadata', () => {
      const extended = ttlManager.extendTTL('nonexistent-key', metadataProvider, 1000);
      expect(extended).toBe(false);
    });

    it('should handle extendTTL with metadata but no TTL', () => {
      const now = Date.now();
      const metadata: TTLItemMetadata = {
        key: 'test-key',
        addedAt: now,
        lastAccessedAt: now,
        accessCount: 1,
        estimatedSize: 100
      };
      metadataProvider.setMetadata('test-key', metadata);

      const extended = ttlManager.extendTTL('test-key', metadataProvider, 1000);
      expect(extended).toBe(false);
    });

    it('should handle refreshTTL with missing metadata', () => {
      const refreshed = ttlManager.refreshTTL('nonexistent-key', metadataProvider);
      expect(refreshed).toBe(false);
    });

    it('should handle refreshTTL with metadata but no TTL available', () => {
      const now = Date.now();
      const metadata: TTLItemMetadata = {
        key: 'test-key',
        addedAt: now,
        lastAccessedAt: now,
        accessCount: 1,
        estimatedSize: 100
      };
      metadataProvider.setMetadata('test-key', metadata);

      // No TTL in metadata and no default TTL
      ttlManager = new TTLManager(); // No default TTL
      const refreshed = ttlManager.refreshTTL('test-key', metadataProvider);
      expect(refreshed).toBe(false);
    });

    it('should handle refreshTTL with custom TTL', () => {
      const now = Date.now();
      const metadata: TTLItemMetadata = {
        key: 'test-key',
        addedAt: now,
        lastAccessedAt: now,
        accessCount: 1,
        estimatedSize: 100
      };
      metadataProvider.setMetadata('test-key', metadata);

      const refreshed = ttlManager.refreshTTL('test-key', metadataProvider, 3000);
      expect(refreshed).toBe(true);

      const updatedMetadata = metadataProvider.getMetadata('test-key') as TTLItemMetadata;
      expect(updatedMetadata!.expiresAt).toBeGreaterThan(now);
      expect(updatedMetadata!.ttl).toBe(3000);
    });

    it('should handle findExpiredItems with empty metadata', () => {
      const expiredKeys = ttlManager.findExpiredItems(metadataProvider);
      expect(expiredKeys).toEqual([]);
    });

    it('should handle findExpiredItems with mixed items', () => {
      const now = Date.now();

      // Add item without TTL
      const noTTLMetadata: CacheItemMetadata = {
        key: 'no-ttl-key',
        addedAt: now,
        lastAccessedAt: now,
        accessCount: 1,
        estimatedSize: 100
      };
      metadataProvider.setMetadata('no-ttl-key', noTTLMetadata);

      // Add expired item
      const expiredMetadata: TTLItemMetadata = {
        key: 'expired-key',
        addedAt: now - 5000,
        lastAccessedAt: now - 5000,
        accessCount: 1,
        estimatedSize: 100,
        expiresAt: now - 1000,
        ttl: 1000
      };
      metadataProvider.setMetadata('expired-key', expiredMetadata);

      // Add valid item
      const validMetadata: TTLItemMetadata = {
        key: 'valid-key',
        addedAt: now,
        lastAccessedAt: now,
        accessCount: 1,
        estimatedSize: 100,
        expiresAt: now + 5000,
        ttl: 5000
      } as TTLItemMetadata;
      metadataProvider.setMetadata('valid-key', validMetadata);

      const expiredKeys = ttlManager.findExpiredItems(metadataProvider);
      expect(expiredKeys).toEqual(['expired-key']);
    });
  });

  describe('validateOnAccess configuration', () => {
    it('should validate items when validateOnAccess is true', () => {
      ttlManager = new TTLManager({
        defaultTTL: 1000,
        validateOnAccess: true
      });

      const now = Date.now();
      const expiredMetadata: TTLItemMetadata = {
        key: 'expired-key',
        addedAt: now - 5000,
        lastAccessedAt: now - 5000,
        accessCount: 1,
        estimatedSize: 100,
        expiresAt: now - 1000,
        ttl: 1000
      };
      metadataProvider.setMetadata('expired-key', expiredMetadata);

      expect(ttlManager.validateItem('expired-key', metadataProvider)).toBe(false);
    });

    it('should skip validation when validateOnAccess is false', () => {
      ttlManager = new TTLManager({
        defaultTTL: 1000,
        validateOnAccess: false
      });

      const now = Date.now();
      const expiredMetadata: TTLItemMetadata = {
        key: 'expired-key',
        addedAt: now - 5000,
        lastAccessedAt: now - 5000,
        accessCount: 1,
        estimatedSize: 100,
        expiresAt: now - 1000,
        ttl: 1000
      };
      metadataProvider.setMetadata('expired-key', expiredMetadata);

      // Should return true even for expired items when validation is disabled
      expect(ttlManager.validateItem('expired-key', metadataProvider)).toBe(true);
    });

    it('should validate non-expired items when validateOnAccess is true', () => {
      ttlManager = new TTLManager({
        defaultTTL: 1000,
        validateOnAccess: true
      });

      const now = Date.now();
      const validMetadata: TTLItemMetadata = {
        key: 'valid-key',
        addedAt: now,
        lastAccessedAt: now,
        accessCount: 1,
        estimatedSize: 100,
        expiresAt: now + 5000,
        ttl: 5000
      } as TTLItemMetadata;
      metadataProvider.setMetadata('valid-key', validMetadata);

      expect(ttlManager.validateItem('valid-key', metadataProvider)).toBe(true);
    });

    it('should handle validateItem with items that have no TTL', () => {
      ttlManager = new TTLManager({
        defaultTTL: 1000,
        validateOnAccess: true
      });

      const now = Date.now();
      const noTTLMetadata: CacheItemMetadata = {
        key: 'no-ttl-key',
        addedAt: now,
        lastAccessedAt: now,
        accessCount: 1,
        estimatedSize: 100
      };
      metadataProvider.setMetadata('no-ttl-key', noTTLMetadata);

      // Items without TTL should always be valid
      expect(ttlManager.validateItem('no-ttl-key', metadataProvider)).toBe(true);
    });
  });

  describe('timing edge cases and precision', () => {
    beforeEach(() => {
      ttlManager = new TTLManager({ defaultTTL: 1000, validateOnAccess: true });
    });

    it('should handle items expiring exactly at current time', () => {
      const now = Date.now();
      const metadata: TTLItemMetadata = {
        key: 'edge-key',
        addedAt: now - 1000,
        lastAccessedAt: now - 1000,
        accessCount: 1,
        estimatedSize: 100,
        expiresAt: now, // Expires exactly now
        ttl: 1000
      };
      metadataProvider.setMetadata('edge-key', metadata);

      // Should be considered expired when expiresAt === now
      expect(ttlManager.isExpired('edge-key', metadataProvider)).toBe(true);
      expect(ttlManager.validateItem('edge-key', metadataProvider)).toBe(false);

      const ttlInfo = ttlManager.getItemTTLInfo('edge-key', metadataProvider);
      expect(ttlInfo.isExpired).toBe(true);
      expect(ttlInfo.remainingTTL).toBe(0);
    });

    it('should handle very small TTL values', () => {
      const now = Date.now();
      const metadata: TTLItemMetadata = {
        key: 'test-key',
        addedAt: now,
        lastAccessedAt: now,
        accessCount: 1,
        estimatedSize: 100
      };
      metadataProvider.setMetadata('test-key', metadata);

      ttlManager.onItemAdded('test-key', metadataProvider, 1); // 1ms TTL

      const updatedMetadata = metadataProvider.getMetadata('test-key') as TTLItemMetadata;
      expect(updatedMetadata!.expiresAt).toBe(now + 1);
      expect(updatedMetadata!.ttl).toBe(1);
    });

    it('should handle very large TTL values', () => {
      const now = Date.now();
      const largeTTL = Number.MAX_SAFE_INTEGER;
      const metadata: TTLItemMetadata = {
        key: 'test-key',
        addedAt: now,
        lastAccessedAt: now,
        accessCount: 1,
        estimatedSize: 100
      };
      metadataProvider.setMetadata('test-key', metadata);

      ttlManager.onItemAdded('test-key', metadataProvider, largeTTL);

      const updatedMetadata = metadataProvider.getMetadata('test-key') as TTLItemMetadata;
      expect(updatedMetadata!.expiresAt).toBe(now + largeTTL);
      expect(updatedMetadata!.ttl).toBe(largeTTL);
    });

    it('should handle concurrent access to TTL information', () => {
      const now = Date.now();
      const metadata: TTLItemMetadata = {
        key: 'concurrent-key',
        addedAt: now,
        lastAccessedAt: now,
        accessCount: 1,
        estimatedSize: 100,
        expiresAt: now + 5000,
        ttl: 5000
      } as TTLItemMetadata;
      metadataProvider.setMetadata('concurrent-key', metadata);

      // Multiple concurrent calls should all work correctly
      const info1 = ttlManager.getItemTTLInfo('concurrent-key', metadataProvider);
      const info2 = ttlManager.getItemTTLInfo('concurrent-key', metadataProvider);
      const expired1 = ttlManager.isExpired('concurrent-key', metadataProvider);
      const expired2 = ttlManager.isExpired('concurrent-key', metadataProvider);

      expect(info1.hasTTL).toBe(info2.hasTTL);
      expect(info1.isExpired).toBe(info2.isExpired);
      expect(expired1).toBe(expired2);
      expect(expired1).toBe(false);
    });
  });

  describe('auto cleanup timer functionality', () => {
    it('should start auto cleanup timer when configured', () => {
      ttlManager = new TTLManager({
        defaultTTL: 1000,
        autoCleanup: true,
        cleanupInterval: 100
      });

      // Timer should be started (we can't easily test the actual timer execution)
      expect(ttlManager.getDefaultTTL()).toBe(1000);
    });

    it('should not start auto cleanup timer when disabled', () => {
      ttlManager = new TTLManager({
        defaultTTL: 1000,
        autoCleanup: false,
        cleanupInterval: 100
      });

      expect(ttlManager.getDefaultTTL()).toBe(1000);
    });

    it('should not start auto cleanup timer when no interval provided', () => {
      ttlManager = new TTLManager({
        defaultTTL: 1000,
        autoCleanup: true
        // No cleanupInterval
      });

      expect(ttlManager.getDefaultTTL()).toBe(1000);
    });

    it('should restart timer when configuration changes', () => {
      ttlManager = new TTLManager({
        defaultTTL: 1000,
        autoCleanup: true,
        cleanupInterval: 100
      });

      // Change timer configuration
      ttlManager.updateConfig({
        autoCleanup: true,
        cleanupInterval: 200
      });

      expect(ttlManager.getDefaultTTL()).toBe(1000);
    });

    it('should stop timer when auto cleanup is disabled via updateConfig', () => {
      ttlManager = new TTLManager({
        defaultTTL: 1000,
        autoCleanup: true,
        cleanupInterval: 100
      });

      // Disable auto cleanup
      ttlManager.updateConfig({ autoCleanup: false });

      expect(ttlManager.getDefaultTTL()).toBe(1000);
    });

    it('should handle multiple destroy calls safely', () => {
      ttlManager = new TTLManager({
        defaultTTL: 1000,
        autoCleanup: true,
        cleanupInterval: 100
      });

      // Multiple destroy calls should not throw
      ttlManager.destroy();
      ttlManager.destroy();
      ttlManager.destroy();
    });
  });

  describe('cleanup and lifecycle', () => {
    it('should cleanup resources on destroy', () => {
      ttlManager = new TTLManager({ defaultTTL: 1000, autoCleanup: true });

      // This should not throw
      ttlManager.destroy();
    });

    it('should handle items without TTL gracefully', () => {
      ttlManager = new TTLManager();

      const metadata: TTLItemMetadata = {
        key: 'test-key',
        addedAt: Date.now(),
        lastAccessedAt: Date.now(),
        accessCount: 1,
        estimatedSize: 100
      };
      metadataProvider.setMetadata('test-key', metadata);

      expect(ttlManager.isExpired('test-key', metadataProvider)).toBe(false);
      expect(ttlManager.validateItem('test-key', metadataProvider)).toBe(true);
      expect(ttlManager.getRemainingTTL('test-key', metadataProvider)).toBeNull();
    });

    it('should handle destroy with no auto cleanup configured', () => {
      ttlManager = new TTLManager({
        defaultTTL: 1000,
        autoCleanup: false
      });

      // Should not throw
      ttlManager.destroy();
    });
  });
});
