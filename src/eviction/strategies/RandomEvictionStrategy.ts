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
    return 'random';
  }
}
