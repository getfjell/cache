import { CacheItemMetadata, CacheMapMetadataProvider } from '../../src/eviction/EvictionStrategy';

/**
 * Mock metadata provider for testing eviction strategies
 */
export class MockMetadataProvider implements CacheMapMetadataProvider {
  private metadata = new Map<string, CacheItemMetadata>();
  private currentSize = { itemCount: 0, sizeBytes: 0 };
  private sizeLimits = { maxItems: null, maxSizeBytes: null };

  constructor(
    maxItems: number | null = null,
    maxSizeBytes: number | null = null
  ) {
    this.sizeLimits = { maxItems, maxSizeBytes };
  }

  getMetadata(key: string): CacheItemMetadata | null {
    return this.metadata.get(key) || null;
  }

  setMetadata(key: string, metadata: CacheItemMetadata): void {
    const existing = this.metadata.get(key);
    this.metadata.set(key, metadata);

    // Update size tracking
    if (!existing) {
      this.currentSize.itemCount++;
      this.currentSize.sizeBytes += metadata.estimatedSize;
    } else {
      this.currentSize.sizeBytes += metadata.estimatedSize - existing.estimatedSize;
    }
  }

  deleteMetadata(key: string): void {
    const existing = this.metadata.get(key);
    if (existing) {
      this.metadata.delete(key);
      this.currentSize.itemCount--;
      this.currentSize.sizeBytes -= existing.estimatedSize;
    }
  }

  getAllMetadata(): Map<string, CacheItemMetadata> {
    return new Map(this.metadata);
  }

  clearMetadata(): void {
    this.metadata.clear();
    this.currentSize = { itemCount: 0, sizeBytes: 0 };
  }

  getCurrentSize(): { itemCount: number; sizeBytes: number } {
    return { ...this.currentSize };
  }

  getSizeLimits(): { maxItems: number | null; maxSizeBytes: number | null } {
    return { ...this.sizeLimits };
  }

  // Helper methods for testing
  setSizeLimits(maxItems: number | null, maxSizeBytes: number | null): void {
    this.sizeLimits = { maxItems, maxSizeBytes };
  }

  setCurrentSize(itemCount: number, sizeBytes: number): void {
    this.currentSize = { itemCount, sizeBytes };
  }
}
