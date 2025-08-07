import { CacheItemMetadata, EvictionStrategy } from '../EvictionStrategy';

/**
 * MRU (Most Recently Used) eviction strategy
 * Removes the most recently accessed item
 */
export class MRUEvictionStrategy extends EvictionStrategy {
  selectForEviction(items: Map<string, CacheItemMetadata>): string | null {
    if (items.size === 0) return null;

    let newestKey: string | null = null;
    let newestTime = -1;

    for (const [key, metadata] of items) {
      if (metadata.lastAccessedAt > newestTime) {
        newestTime = metadata.lastAccessedAt;
        newestKey = key;
      }
    }

    return newestKey;
  }

  onItemAccessed(_key: string, metadata: CacheItemMetadata): void {
    metadata.lastAccessedAt = Date.now();
    metadata.accessCount++;
  }

  onItemAdded(_key: string, metadata: CacheItemMetadata): void {
    const now = Date.now();
    metadata.addedAt = now;
    metadata.lastAccessedAt = now;
    metadata.accessCount = 1;
  }

  onItemRemoved(): void {
    // No cleanup needed for MRU
  }
}
