import { CacheItemMetadata, CacheMapMetadataProvider, EvictionContext, EvictionStrategy } from '../EvictionStrategy';

/**
 * MRU (Most Recently Used) eviction strategy
 * Removes the most recently accessed item
 */
export class MRUEvictionStrategy extends EvictionStrategy {
  getStrategyName(): string {
    return 'MRU';
  }
  async selectForEviction(
    metadataProvider: CacheMapMetadataProvider,
    context: EvictionContext
  ): Promise<string[]> {
    const allMetadata = await metadataProvider.getAllMetadata();
    if (allMetadata.size === 0) return [];

    if (!this.isEvictionNeeded(context)) {
      return [];
    }

    const evictionCount = this.calculateEvictionCount(context);
    if (evictionCount <= 0) return [];

    // Sort items by access time (newest first)
    const sortedEntries = Array.from(allMetadata.entries()).sort((a, b) => {
      return b[1].lastAccessedAt - a[1].lastAccessedAt; // Newer first
    });

    return sortedEntries.slice(0, evictionCount).map(([key]) => key);
  }

  async onItemAccessed(key: string, metadataProvider: CacheMapMetadataProvider): Promise<void> {
    const metadata = await metadataProvider.getMetadata(key);
    if (!metadata) return;

    metadata.lastAccessedAt = Date.now();
    metadata.accessCount++;

    await metadataProvider.setMetadata(key, metadata);
  }

  async onItemAdded(key: string, estimatedSize: number, metadataProvider: CacheMapMetadataProvider): Promise<void> {
    const now = Date.now();
    const metadata: CacheItemMetadata = {
      key,
      addedAt: now,
      lastAccessedAt: now,
      accessCount: 1,
      estimatedSize
    };

    await metadataProvider.setMetadata(key, metadata);
  }

  async onItemRemoved(key: string, metadataProvider: CacheMapMetadataProvider): Promise<void> {
    await metadataProvider.deleteMetadata(key);
  }
}
