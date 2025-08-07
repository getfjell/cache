import { CacheItemMetadata, EvictionStrategy } from '../EvictionStrategy';

/**
 * LRU (Least Recently Used) eviction strategy
 * Removes the item that was accessed longest ago
 */
export class LRUEvictionStrategy extends EvictionStrategy {
  selectForEviction(items: Map<string, CacheItemMetadata>): string | null {
    if (items.size === 0) return null;

    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, metadata] of items) {
      if (metadata.lastAccessedAt < oldestTime) {
        oldestTime = metadata.lastAccessedAt;
        oldestKey = key;
      }
    }

    return oldestKey;
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
    // No cleanup needed for LRU
  }
}
