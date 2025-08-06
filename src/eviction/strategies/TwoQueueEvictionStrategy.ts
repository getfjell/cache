import { CacheItemMetadata, EvictionStrategy } from '../EvictionStrategy';
import { DEFAULT_TWO_QUEUE_CONFIG, TwoQueueConfig } from '../EvictionStrategyConfig';

/**
 * 2Q (Two Queues) eviction strategy with enhanced frequency tracking
 * Maintains separate queues for recent and frequently accessed items
 * Uses frequency analysis for promotion decisions and weighted LRU in hot queue
 */
export class TwoQueueEvictionStrategy extends EvictionStrategy {
  private recentQueue: string[] = []; // A1 queue for recent items
  private hotQueue: string[] = []; // Am queue for hot items
  private ghostQueue = new Set<string>(); // A1out ghost queue
  private readonly config: TwoQueueConfig;
  private readonly maxRecentSize: number;
  private readonly maxGhostSize: number;
  private lastDecayTime: number;

  constructor(maxCacheSize: number = 1000, config: Partial<TwoQueueConfig> = {}) {
    super();
    this.config = { ...DEFAULT_TWO_QUEUE_CONFIG, maxCacheSize, ...config };
    // Allocate 25% to recent queue, 75% to hot queue
    this.maxRecentSize = Math.max(1, Math.floor(this.config.maxCacheSize! * 0.25));
    this.maxGhostSize = this.config.maxCacheSize!;
    this.lastDecayTime = Date.now();
  }

  selectForEviction(items: Map<string, CacheItemMetadata>): string | null {
    if (items.size === 0) return null;

    // Apply periodic decay if enabled
    this.applyPeriodicDecay(items);

    // First try to evict from recent queue (A1) - always prioritize recent queue
    for (const key of this.recentQueue) {
      if (items.has(key)) {
        return key;
      }
    }

    // Then try hot queue (Am) - use frequency-weighted LRU if enabled
    if (this.config.useFrequencyWeightedLRU) {
      return this.selectFromHotQueueFrequencyWeighted(items);
    } else {
      return this.selectFromHotQueueLRU(items);
    }
  }

  /**
   * Select eviction candidate from hot queue using traditional LRU
   */
  private selectFromHotQueueLRU(items: Map<string, CacheItemMetadata>): string | null {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const key of this.hotQueue) {
      const metadata = items.get(key);
      if (metadata && metadata.lastAccessedAt < oldestTime) {
        oldestTime = metadata.lastAccessedAt;
        oldestKey = key;
      }
    }

    return oldestKey || (items.size > 0 ? (items.keys().next().value ?? null) : null);
  }

  /**
   * Select eviction candidate from hot queue using frequency-weighted LRU
   */
  private selectFromHotQueueFrequencyWeighted(items: Map<string, CacheItemMetadata>): string | null {
    let bestKey: string | null = null;
    let lowestScore = Infinity;

    for (const key of this.hotQueue) {
      const metadata = items.get(key);
      if (!metadata) continue;

      // Calculate frequency-weighted score (lower = more likely to evict)
      const frequency = this.getEffectiveFrequency(metadata);
      const timeFactor = Date.now() - metadata.lastAccessedAt;

      // Score combines frequency (lower is worse) and recency (higher is worse)
      // Normalize time factor to similar scale as frequency
      const normalizedTimeFactor = timeFactor / (1000 * 60); // Convert to minutes
      const score = normalizedTimeFactor / Math.max(1, frequency);

      if (score < lowestScore) {
        lowestScore = score;
        bestKey = key;
      }
    }

    return bestKey || (items.size > 0 ? (items.keys().next().value ?? null) : null);
  }

  onItemAccessed(key: string, metadata: CacheItemMetadata): void {
    const now = Date.now();
    metadata.lastAccessedAt = now;
    metadata.accessCount++;

    // Update frequency tracking similar to LFU strategy
    metadata.rawFrequency = metadata.accessCount;

    // Update frequency score with decay if enabled
    if ((this.config.hotQueueDecayFactor ?? 0) > 0) {
      metadata.frequencyScore = this.calculateFrequencyScore(metadata, now);
      metadata.lastFrequencyUpdate = now;
    }

    // Handle promotion from recent to hot queue
    const recentIndex = this.recentQueue.indexOf(key);
    if (recentIndex !== -1) {
      // Item is in recent queue - check if it should be promoted
      if (this.shouldPromoteToHotQueue(metadata)) {
        this.recentQueue.splice(recentIndex, 1);
        this.hotQueue.unshift(key); // Add to front of hot queue
      }
    } else {
      // Update position in hot queue (move to front)
      const hotIndex = this.hotQueue.indexOf(key);
      if (hotIndex !== -1) {
        this.hotQueue.splice(hotIndex, 1);
        this.hotQueue.unshift(key);
      }
    }
  }

  onItemAdded(key: string, metadata: CacheItemMetadata): void {
    const now = Date.now();
    metadata.addedAt = now;
    metadata.lastAccessedAt = now;
    metadata.accessCount = 1;
    metadata.rawFrequency = 1;

    // Initialize frequency score for decay tracking
    if ((this.config.hotQueueDecayFactor ?? 0) > 0) {
      metadata.frequencyScore = 1;
      metadata.lastFrequencyUpdate = now;
    }

    // Check if this was in ghost queue (promote to hot)
    if (this.ghostQueue.has(key)) {
      this.ghostQueue.delete(key);
      this.hotQueue.unshift(key);
    } else {
      // Add to recent queue
      this.recentQueue.unshift(key);

      // Limit recent queue size
      if (this.recentQueue.length > this.maxRecentSize) {
        const evicted = this.recentQueue.pop();
        if (evicted) {
          this.ghostQueue.add(evicted);
        }
      }
    }

    // Limit ghost queue size
    if (this.ghostQueue.size > this.maxGhostSize) {
      const firstKey = this.ghostQueue.values().next().value;
      if (firstKey) {
        this.ghostQueue.delete(firstKey);
      }
    }
  }

  onItemRemoved(key: string): void {
    // Remove from appropriate queue
    const recentIndex = this.recentQueue.indexOf(key);
    if (recentIndex !== -1) {
      this.recentQueue.splice(recentIndex, 1);
    }

    const hotIndex = this.hotQueue.indexOf(key);
    if (hotIndex !== -1) {
      this.hotQueue.splice(hotIndex, 1);
    }
  }

  /**
   * Determine if an item should be promoted from recent to hot queue
   */
  private shouldPromoteToHotQueue(metadata: CacheItemMetadata): boolean {
    if (!this.config.useFrequencyPromotion) {
      // Traditional 2Q behavior - promote on second access
      return metadata.accessCount >= 2;
    }

    // Frequency-based promotion
    const threshold = this.config.promotionThreshold ?? 2;
    const frequency = this.getEffectiveFrequency(metadata);
    return frequency >= threshold;
  }

  /**
   * Get effective frequency for an item, applying decay if enabled
   */
  private getEffectiveFrequency(metadata: CacheItemMetadata): number {
    // If decay is disabled, use raw frequency
    if ((this.config.hotQueueDecayFactor ?? 0) === 0) {
      return metadata.rawFrequency || metadata.accessCount;
    }

    const now = Date.now();

    // If we have a frequency score with decay tracking
    if (typeof metadata.frequencyScore === 'number' && typeof metadata.lastFrequencyUpdate === 'number') {
      const timeSinceUpdate = now - metadata.lastFrequencyUpdate;
      const decayAmount = (timeSinceUpdate / (this.config.hotQueueDecayInterval ?? 300000)) * (this.config.hotQueueDecayFactor ?? 0.05);
      return Math.max(1, metadata.frequencyScore * (1 - decayAmount));
    }

    // Fallback to raw frequency
    return metadata.rawFrequency || metadata.accessCount;
  }

  /**
   * Calculate frequency score with decay applied
   */
  private calculateFrequencyScore(metadata: CacheItemMetadata, currentTime: number): number {
    const rawFreq = metadata.rawFrequency || metadata.accessCount;

    if (typeof metadata.lastFrequencyUpdate !== 'number') {
      return rawFreq;
    }

    const timeSinceUpdate = currentTime - metadata.lastFrequencyUpdate;
    const decayAmount = (timeSinceUpdate / (this.config.hotQueueDecayInterval ?? 300000)) * (this.config.hotQueueDecayFactor ?? 0.05);
    const previousScore = metadata.frequencyScore || rawFreq;

    // Apply decay to previous score and add new frequency contribution
    const decayedScore = previousScore * (1 - decayAmount);
    return Math.max(1, decayedScore + 1);
  }

  /**
   * Apply periodic decay to hot queue items
   */
  private applyPeriodicDecay(items: Map<string, CacheItemMetadata>): void {
    if ((this.config.hotQueueDecayFactor ?? 0) === 0) return;

    const now = Date.now();
    const timeSinceDecay = now - this.lastDecayTime;

    if (timeSinceDecay >= (this.config.hotQueueDecayInterval ?? 300000)) {
      // Apply decay to all items in hot queue
      for (const key of this.hotQueue) {
        const metadata = items.get(key);
        if (metadata && typeof metadata.frequencyScore === 'number') {
          const decayAmount = (this.config.hotQueueDecayFactor ?? 0.05);
          metadata.frequencyScore = Math.max(1, metadata.frequencyScore * (1 - decayAmount));
        }
      }
      this.lastDecayTime = now;
    }
  }

  /**
   * Get configuration for this strategy
   */
  getConfig(): TwoQueueConfig {
    return { ...this.config };
  }

  /**
   * Reset internal state (useful for testing)
   */
  reset(): void {
    this.recentQueue = [];
    this.hotQueue = [];
    this.ghostQueue.clear();
    this.lastDecayTime = Date.now();
  }
}
