import { CacheItemMetadata, EvictionStrategy } from '../EvictionStrategy';

/**
 * Random eviction strategy
 * Removes a random item from the cache
 */
export class RandomEvictionStrategy extends EvictionStrategy {
  selectForEviction(items: Map<string, CacheItemMetadata>): string | null {
    if (items.size === 0) return null;

    const keys = Array.from(items.keys());
    const randomIndex = Math.floor(Math.random() * keys.length);
    return keys[randomIndex];
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
    // No cleanup needed for Random
  }
}
