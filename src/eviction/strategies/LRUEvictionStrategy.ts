import {
  CacheItemMetadata,
  CacheMapMetadataProvider,
  EvictionContext,
  EvictionStrategy
} from '../EvictionStrategy';

/**
 * LRU (Least Recently Used) eviction strategy
 * Removes the item that was accessed longest ago
 */
export class LRUEvictionStrategy extends EvictionStrategy {
  async selectForEviction(
    metadataProvider: CacheMapMetadataProvider,
    context: EvictionContext
  ): Promise<string[]> {
    if (!this.isEvictionNeeded(context)) {
      return [];
    }

    const allMetadata = await metadataProvider.getAllMetadata();
    if (allMetadata.size === 0) {
      return [];
    }

    const evictionCount = this.calculateEvictionCount(context);
    const keysToEvict: string[] = [];

    // Sort by lastAccessedAt ascending (oldest first)
    const sortedEntries = Array.from(allMetadata.entries())
      .sort(([, a], [, b]) => a.lastAccessedAt - b.lastAccessedAt);

    // Take the oldest items up to evictionCount
    for (let i = 0; i < Math.min(evictionCount, sortedEntries.length); i++) {
      keysToEvict.push(sortedEntries[i][0]);
    }

    return keysToEvict;
  }

  async onItemAccessed(key: string, metadataProvider: CacheMapMetadataProvider): Promise<void> {
    const metadata = await metadataProvider.getMetadata(key);
    if (metadata) {
      metadata.lastAccessedAt = Date.now();
      metadata.accessCount++;
      await metadataProvider.setMetadata(key, metadata);
    }
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

  getStrategyName(): string {
    return 'lru';
  }
}
