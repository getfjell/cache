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
  /** Additional strategy-specific metadata */
  strategyData?: { [key: string]: any };
}

/**
 * Interface for CacheMap implementations to support metadata storage
 * This allows eviction strategies to store and retrieve metadata independently of the storage mechanism
 */
export interface CacheMapMetadataProvider {
  /**
   * Get metadata for a specific item
   * @param key - Item key
   * @returns Metadata if exists, null otherwise
   */
  getMetadata(key: string): CacheItemMetadata | null;

  /**
   * Set metadata for a specific item
   * @param key - Item key
   * @param metadata - Metadata to store
   */
  setMetadata(key: string, metadata: CacheItemMetadata): void;

  /**
   * Delete metadata for a specific item
   * @param key - Item key
   */
  deleteMetadata(key: string): void;

  /**
   * Get all metadata entries
   * @returns Map of all metadata entries
   */
  getAllMetadata(): Map<string, CacheItemMetadata>;

  /**
   * Clear all metadata
   */
  clearMetadata(): void;

  /**
   * Get current cache size information
   * @returns Object with current size metrics
   */
  getCurrentSize(): {
    itemCount: number;
    sizeBytes: number;
  };

  /**
   * Get cache size limits
   * @returns Object with size limits (null means unlimited)
   */
  getSizeLimits(): {
    maxItems: number | null;
    maxSizeBytes: number | null;
  };
}

/**
 * Context provided to eviction strategies for decision making
 */
export interface EvictionContext {
  /** Current cache size information */
  currentSize: {
    itemCount: number;
    sizeBytes: number;
  };
  /** Cache size limits */
  limits: {
    maxItems: number | null;
    maxSizeBytes: number | null;
  };
  /** Size of the item being added (for proactive eviction) */
  newItemSize?: number;
}

/**
 * Abstract base class for cache eviction strategies.
 * Defines the core contract that all eviction policies must implement.
 *
 * Eviction strategies are now completely independent of CacheMap implementations
 * and interact through the CacheMapMetadataProvider interface.
 */
export abstract class EvictionStrategy {
  /**
   * Select which items should be evicted based on the strategy and context
   * @param metadataProvider - Provider for accessing cache metadata
   * @param context - Current cache state and limits
   * @returns Array of keys to evict (empty array if no eviction needed)
   */
  abstract selectForEviction(
    metadataProvider: CacheMapMetadataProvider,
    context: EvictionContext
  ): string[];

  /**
   * Update metadata when an item is accessed
   * @param key - Item key
   * @param metadataProvider - Provider for accessing cache metadata
   */
  abstract onItemAccessed(key: string, metadataProvider: CacheMapMetadataProvider): void;

  /**
   * Update metadata when an item is added
   * @param key - Item key
   * @param estimatedSize - Estimated size of the item in bytes
   * @param metadataProvider - Provider for accessing cache metadata
   */
  abstract onItemAdded(key: string, estimatedSize: number, metadataProvider: CacheMapMetadataProvider): void;

  /**
   * Clean up when an item is removed
   * @param key - Item key
   * @param metadataProvider - Provider for accessing cache metadata
   */
  abstract onItemRemoved(key: string, metadataProvider: CacheMapMetadataProvider): void;

  /**
   * Get the name/identifier of this eviction strategy
   * @returns String identifier for the strategy
   */
  abstract getStrategyName(): string;

  /**
   * Determine if eviction is needed based on current context
   * @param context - Current cache state and limits
   * @returns True if eviction should occur
   */
  protected isEvictionNeeded(context: EvictionContext): boolean {
    const { currentSize, limits, newItemSize = 0 } = context;

    // Check item count limit
    if (limits.maxItems !== null && currentSize.itemCount >= limits.maxItems) {
      return true;
    }

    // Check size limit (including potential new item)
    if (limits.maxSizeBytes !== null &&
        (currentSize.sizeBytes + newItemSize) > limits.maxSizeBytes) {
      return true;
    }

    return false;
  }

  /**
   * Calculate how many items need to be evicted
   * @param context - Current cache state and limits
   * @returns Number of items that should be evicted
   */
  protected calculateEvictionCount(context: EvictionContext): number {
    const { currentSize, limits, newItemSize = 0 } = context;
    let evictionCount = 0;

    // Calculate based on item count limit
    if (limits.maxItems !== null && currentSize.itemCount >= limits.maxItems) {
      evictionCount = Math.max(evictionCount, currentSize.itemCount - limits.maxItems + 1);
    }

    // Calculate based on size limit (this is more complex and approximate)
    if (limits.maxSizeBytes !== null &&
        (currentSize.sizeBytes + newItemSize) > limits.maxSizeBytes) {
      // Conservative estimate: evict at least 1 item, possibly more
      const excessBytes = (currentSize.sizeBytes + newItemSize) - limits.maxSizeBytes;
      const avgItemSize = currentSize.itemCount > 0 ? currentSize.sizeBytes / currentSize.itemCount : 1024;
      const estimatedEvictionCount = Math.ceil(excessBytes / avgItemSize);
      evictionCount = Math.max(evictionCount, estimatedEvictionCount);
    }

    return evictionCount;
  }
}
