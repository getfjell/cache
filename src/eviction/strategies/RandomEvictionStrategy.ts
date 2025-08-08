import {
  CacheItemMetadata,
  CacheMapMetadataProvider,
  EvictionContext,
  EvictionStrategy
} from '../EvictionStrategy';

/**
 * Random eviction strategy
 * Removes a random item from the cache
 */
export class RandomEvictionStrategy extends EvictionStrategy {
  selectForEviction(
    metadataProvider: CacheMapMetadataProvider,
    context: EvictionContext
  ): string[] {
    if (!this.isEvictionNeeded(context)) {
      return [];
    }

    const allMetadata = metadataProvider.getAllMetadata();
    if (allMetadata.size === 0) {
      return [];
    }

    const evictionCount = this.calculateEvictionCount(context);
    const keys = Array.from(allMetadata.keys());
    const keysToEvict: string[] = [];

    // Randomly select items to evict
    const availableKeys = [...keys];
    for (let i = 0; i < Math.min(evictionCount, availableKeys.length); i++) {
      const randomIndex = Math.floor(Math.random() * availableKeys.length);
      keysToEvict.push(availableKeys.splice(randomIndex, 1)[0]);
    }

    return keysToEvict;
  }

  onItemAccessed(key: string, metadataProvider: CacheMapMetadataProvider): void {
    const metadata = metadataProvider.getMetadata(key);
    if (metadata) {
      metadata.lastAccessedAt = Date.now();
      metadata.accessCount++;
      metadataProvider.setMetadata(key, metadata);
    }
  }

  onItemAdded(key: string, estimatedSize: number, metadataProvider: CacheMapMetadataProvider): void {
    const now = Date.now();
    const metadata: CacheItemMetadata = {
      key,
      addedAt: now,
      lastAccessedAt: now,
      accessCount: 1,
      estimatedSize
    };
    metadataProvider.setMetadata(key, metadata);
  }

  onItemRemoved(key: string, metadataProvider: CacheMapMetadataProvider): void {
    metadataProvider.deleteMetadata(key);
  }

  getStrategyName(): string {
    return 'random';
  }
}
