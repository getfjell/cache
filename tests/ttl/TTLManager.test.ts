import { beforeEach, describe, expect, it } from 'vitest';
import { TTLConfig, TTLManager } from '../../src/ttl/TTLManager';
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

    it('should update configuration', () => {
      ttlManager = new TTLManager();
      expect(ttlManager.isTTLEnabled()).toBe(false);

      ttlManager.updateConfig({ defaultTTL: 3000 });
      expect(ttlManager.isTTLEnabled()).toBe(true);
      expect(ttlManager.getDefaultTTL()).toBe(3000);
    });
  });

  describe('TTL operations', () => {
    beforeEach(() => {
      ttlManager = new TTLManager({ defaultTTL: 1000, validateOnAccess: true });
    });

    it('should set TTL metadata when item is added', () => {
      const now = Date.now();
      const metadata: CacheItemMetadata = {
        key: 'test-key',
        addedAt: now,
        lastAccessedAt: now,
        accessCount: 1,
        estimatedSize: 100
      };
      metadataProvider.setMetadata('test-key', metadata);

      ttlManager.onItemAdded('test-key', metadataProvider);

      const updatedMetadata = metadataProvider.getMetadata('test-key');
      expect(updatedMetadata).not.toBeNull();
      expect(updatedMetadata!.expiresAt).toBe(now + 1000);
      expect(updatedMetadata!.ttl).toBe(1000);
    });

    it('should respect custom TTL for specific items', () => {
      const now = Date.now();
      const metadata: CacheItemMetadata = {
        key: 'test-key',
        addedAt: now,
        lastAccessedAt: now,
        accessCount: 1,
        estimatedSize: 100
      };
      metadataProvider.setMetadata('test-key', metadata);

      ttlManager.onItemAdded('test-key', metadataProvider, 2000);

      const updatedMetadata = metadataProvider.getMetadata('test-key');
      expect(updatedMetadata!.expiresAt).toBe(now + 2000);
      expect(updatedMetadata!.ttl).toBe(2000);
    });

    it('should detect expired items', () => {
      const pastTime = Date.now() - 5000;
      const metadata: CacheItemMetadata = {
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
      const metadata: CacheItemMetadata = {
        key: 'test-key',
        addedAt: now,
        lastAccessedAt: now,
        accessCount: 1,
        estimatedSize: 100,
        expiresAt: now + 5000,
        ttl: 5000
      };
      metadataProvider.setMetadata('test-key', metadata);

      expect(ttlManager.isExpired('test-key', metadataProvider)).toBe(false);
      expect(ttlManager.validateItem('test-key', metadataProvider)).toBe(true);
    });

    it('should find all expired items', () => {
      const now = Date.now();

      // Add expired item
      const expiredMetadata: CacheItemMetadata = {
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
      const validMetadata: CacheItemMetadata = {
        key: 'valid-key',
        addedAt: now,
        lastAccessedAt: now,
        accessCount: 1,
        estimatedSize: 100,
        expiresAt: now + 5000,
        ttl: 5000
      };
      metadataProvider.setMetadata('valid-key', validMetadata);

      const expiredKeys = ttlManager.findExpiredItems(metadataProvider);
      expect(expiredKeys).toEqual(['expired-key']);
    });

    it('should get TTL information for items', () => {
      const now = Date.now();
      const metadata: CacheItemMetadata = {
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
      const metadata: CacheItemMetadata = {
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

      const updatedMetadata = metadataProvider.getMetadata('test-key');
      expect(updatedMetadata!.expiresAt).toBe(now + 3000);
    });

    it('should refresh TTL for items', () => {
      const now = Date.now();
      const metadata: CacheItemMetadata = {
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

      const updatedMetadata = metadataProvider.getMetadata('test-key');
      expect(updatedMetadata!.expiresAt).toBeGreaterThan(now);
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

      const metadata: CacheItemMetadata = {
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
  });
});
