/**
 * Metadata for tracking cache item usage patterns
 */
export interface CacheItemMetadata {
  /** When the item was first added to cache */
  addedAt: number;
  /** When the item was last accessed */
  lastAccessedAt: number;
  /** Number of times the item has been accessed */
  accessCount: number;
  /** Estimated size of the item in bytes */
  estimatedSize: number;
  /** Item key for identification */
  key: string;
  /** Frequency score with decay applied (for LFU with sketching) */
  frequencyScore?: number;
  /** Last time frequency was updated (for decay calculations) */
  lastFrequencyUpdate?: number;
  /** Raw frequency count before decay */
  rawFrequency?: number;
}

/**
 * Abstract base class for cache eviction strategies.
 * Defines the core contract that all eviction policies must implement.
 */
export abstract class EvictionStrategy {
  /**
   * Select which item should be evicted based on the strategy
   * @param items - Map of items with their metadata
   * @returns Key of the item to evict, or null if no eviction needed
   */
  abstract selectForEviction(items: Map<string, CacheItemMetadata>): string | null;

  /**
   * Update metadata when an item is accessed
   * @param key - Item key
   * @param metadata - Current metadata
   */
  abstract onItemAccessed(key: string, metadata: CacheItemMetadata): void;

  /**
   * Update metadata when an item is added
   * @param key - Item key
   * @param metadata - Initial metadata
   */
  abstract onItemAdded(key: string, metadata: CacheItemMetadata): void;

  /**
   * Clean up when an item is removed
   * @param key - Item key (optional for some strategies)
   */
  abstract onItemRemoved(key?: string): void;
}
