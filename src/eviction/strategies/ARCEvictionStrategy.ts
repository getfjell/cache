import { CacheItemMetadata, CacheMapMetadataProvider, EvictionContext, EvictionStrategy } from '../EvictionStrategy';
import { ARCConfig, DEFAULT_ARC_CONFIG } from '../EvictionStrategyConfig';
import { createValidatedConfig } from '../EvictionStrategyValidation';

/**
 * ARC (Adaptive Replacement Cache) eviction strategy with enhanced frequency tracking
 * Balances between recency (LRU) and frequency (LFU) dynamically with sophisticated frequency analysis
 */
export class ARCEvictionStrategy extends EvictionStrategy {
  getStrategyName(): string {
    return 'ARC';
  }
  private recentGhosts = new Set<string>(); // T1 ghost entries
  private frequentGhosts = new Set<string>(); // T2 ghost entries
  private targetRecentSize = 0; // Target size for T1 (recent entries)
  private readonly config: ARCConfig;
  private readonly maxGhostSize: number;
  private lastDecayTime: number;

  constructor(maxCacheSize: number = 1000, config: Partial<ARCConfig> = {}) {
    super();
    const baseConfig = { ...DEFAULT_ARC_CONFIG, maxCacheSize };
    this.config = createValidatedConfig(baseConfig, config);
    this.maxGhostSize = this.config.maxCacheSize!;
    this.lastDecayTime = Date.now();
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

    // Apply periodic decay if enabled
    this.applyPeriodicDecay(allMetadata);

    // Split items into recent (T1) and frequent (T2) based on enhanced frequency analysis
    const recentItems = new Map<string, CacheItemMetadata>();
    const frequentItems = new Map<string, CacheItemMetadata>();

    for (const [key, metadata] of allMetadata) {
      if (this.isFrequentItem(metadata)) {
        frequentItems.set(key, metadata);
      } else {
        recentItems.set(key, metadata);
      }
    }

    const keysToEvict: string[] = [];
    const totalItems = recentItems.size + frequentItems.size;
    const maxIterations = Math.min(evictionCount, totalItems);

    for (let i = 0; i < maxIterations; i++) {
      let keyToEvict: string | null = null;
      let sourceList: Map<string, CacheItemMetadata> | null = null;

      // Decide which list to evict from based on target sizes and adaptive algorithm
      if (recentItems.size > this.targetRecentSize && recentItems.size > 0) {
        // Evict from recent list (T1)
        keyToEvict = this.config.useFrequencyWeightedSelection
          ? this.selectFrequencyWeightedFromItems(recentItems, 'recent')
          : this.selectLRUFromItems(recentItems);
        sourceList = recentItems;
      } else if (frequentItems.size > 0) {
        // Evict from frequent list (T2)
        keyToEvict = this.config.useFrequencyWeightedSelection
          ? this.selectFrequencyWeightedFromItems(frequentItems, 'frequent')
          : this.selectLRUFromItems(frequentItems);
        sourceList = frequentItems;
      } else if (recentItems.size > 0) {
        // Fallback: evict from recent if it's the only list with items
        keyToEvict = this.config.useFrequencyWeightedSelection
          ? this.selectFrequencyWeightedFromItems(recentItems, 'recent')
          : this.selectLRUFromItems(recentItems);
        sourceList = recentItems;
      }

      if (keyToEvict && sourceList) {
        keysToEvict.push(keyToEvict);
        sourceList.delete(keyToEvict);
      } else {
        // No valid key found or no more items available
        break;
      }

      // Safety check: if we've evicted all items, stop
      if (recentItems.size === 0 && frequentItems.size === 0) {
        break;
      }
    }

    return keysToEvict;
  }

  private selectLRUFromItems(items: Map<string, CacheItemMetadata>): string | null {
    if (items.size === 0) {
      return null;
    }

    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    const now = Date.now();

    for (const [key, metadata] of items) {
      // Validate metadata to prevent corruption
      if (!metadata || typeof metadata.lastAccessedAt !== 'number' || metadata.lastAccessedAt > now) {
        continue;
      }

      if (metadata.lastAccessedAt < oldestTime) {
        oldestTime = metadata.lastAccessedAt;
        oldestKey = key;
      }
    }

    // If no valid key found through LRU logic, fall back to first available key
    if (oldestKey !== null) {
      return oldestKey;
    }

    // Fallback to first available key if items exist
    if (items.size > 0) {
      const firstKey = items.keys().next().value;
      return firstKey ?? null;
    }

    return null;
  }

  async onItemAccessed(key: string, metadataProvider: CacheMapMetadataProvider): Promise<void> {
    const metadata = await metadataProvider.getMetadata(key);
    if (!metadata) return;

    const now = Date.now();

    // Create a copy of metadata to avoid direct mutation of shared state
    const updatedMetadata: CacheItemMetadata = {
      ...metadata,
      lastAccessedAt: now,
      accessCount: metadata.accessCount + 1
    };

    // Update frequency tracking
    updatedMetadata.rawFrequency = updatedMetadata.accessCount;

    // Update frequency score with decay if enabled
    if (this.config.useEnhancedFrequency && (this.config.frequencyDecayFactor ?? 0) > 0) {
      updatedMetadata.frequencyScore = this.calculateFrequencyScore(updatedMetadata, now);
      updatedMetadata.lastFrequencyUpdate = now;
    }

    // Adjust target size based on ghost list hits with adaptive learning
    const learningRate = this.config.adaptiveLearningRate ?? 1.0;
    let targetAdjusted = false;

    if (learningRate > 0) {
      if (this.recentGhosts.has(key)) {
        // Hit in recent ghost list - increase target for recent items
        const adjustment = Math.max(1, Math.ceil(learningRate));
        this.targetRecentSize = Math.min(this.targetRecentSize + adjustment, this.maxGhostSize);
        this.recentGhosts.delete(key);
        targetAdjusted = true;
      } else if (this.frequentGhosts.has(key)) {
        // Hit in frequent ghost list - decrease target for recent items
        const adjustment = Math.max(1, Math.ceil(learningRate));
        this.targetRecentSize = Math.max(this.targetRecentSize - adjustment, 0);
        this.frequentGhosts.delete(key);
        targetAdjusted = true;
      }
    } else {
      // Even with zero learning rate, remove from ghost lists to prevent memory leaks
      if (this.recentGhosts.has(key)) {
        this.recentGhosts.delete(key);
      } else if (this.frequentGhosts.has(key)) {
        this.frequentGhosts.delete(key);
      }
    }

    // Clean up ghost lists if they were modified
    if (targetAdjusted) {
      this.cleanupGhostLists();
    }

    await metadataProvider.setMetadata(key, updatedMetadata);
  }

  async onItemAdded(key: string, estimatedSize: number, metadataProvider: CacheMapMetadataProvider): Promise<void> {
    const now = Date.now();
    const metadata: CacheItemMetadata = {
      key,
      addedAt: now,
      lastAccessedAt: now,
      accessCount: 1,
      estimatedSize,
      rawFrequency: 1
    };

    // Initialize frequency score for decay tracking
    if (this.config.useEnhancedFrequency && (this.config.frequencyDecayFactor ?? 0) > 0) {
      metadata.frequencyScore = 1;
      metadata.lastFrequencyUpdate = now;
    }

    await metadataProvider.setMetadata(key, metadata);
  }

  async onItemRemoved(key: string, metadataProvider: CacheMapMetadataProvider): Promise<void> {
    const metadata = await metadataProvider.getMetadata(key);

    // Determine which ghost list to add to based on item characteristics
    if (metadata && this.isFrequentItem(metadata)) {
      this.addToFrequentGhosts(key);
    } else {
      this.addToRecentGhosts(key);
    }

    // Clean up metadata first to avoid accessing stale data
    await metadataProvider.deleteMetadata(key);

    // Ensure both ghost lists stay within bounds after modifications
    this.cleanupGhostLists();
  }

  /**
   * Add key to recent ghost list with proper size management
   */
  private addToRecentGhosts(key: string): void {
    // Remove from frequent ghosts if present (item moved lists)
    this.frequentGhosts.delete(key);

    // Add to recent ghosts
    this.recentGhosts.add(key);

    // Maintain size limit by removing oldest entries
    this.enforceGhostListSizeLimit(this.recentGhosts, this.maxGhostSize);
  }

  /**
   * Add key to frequent ghost list with proper size management
   */
  private addToFrequentGhosts(key: string): void {
    // Remove from recent ghosts if present (item moved lists)
    this.recentGhosts.delete(key);

    // Add to frequent ghosts
    this.frequentGhosts.add(key);

    // Maintain size limit by removing oldest entries
    this.enforceGhostListSizeLimit(this.frequentGhosts, this.maxGhostSize);
  }

  /**
   * Cleanup ghost lists to prevent memory leaks
   */
  private cleanupGhostLists(): void {
    this.enforceGhostListSizeLimit(this.recentGhosts, this.maxGhostSize);
    this.enforceGhostListSizeLimit(this.frequentGhosts, this.maxGhostSize);
  }

  /**
   * Enforce size limit on a ghost list by removing oldest entries
   */
  private enforceGhostListSizeLimit(ghostList: Set<string>, maxSize: number): void {
    if (maxSize <= 0) {
      ghostList.clear();
      return;
    }

    // Remove excess entries from the beginning (oldest)
    const iterator = ghostList.values();
    while (ghostList.size > maxSize) {
      const next = iterator.next();
      if (next.done) {
        break; // Safety check - no more items
      }
      ghostList.delete(next.value);
    }
  }

  /**
   * Determine if an item should be classified as frequent vs recent
   */
  private isFrequentItem(metadata: CacheItemMetadata): boolean {
    if (!this.config.useEnhancedFrequency) {
      // Traditional ARC behavior
      return metadata.accessCount > 1;
    }

    // Enhanced frequency-based classification
    const frequency = this.getEffectiveFrequency(metadata);
    return frequency >= (this.config.frequencyThreshold ?? 2);
  }

  /**
   * Get effective frequency for an item, applying decay if enabled
   */
  private getEffectiveFrequency(metadata: CacheItemMetadata): number {
    if (!this.config.useEnhancedFrequency || (this.config.frequencyDecayFactor ?? 0) === 0) {
      return metadata.rawFrequency || metadata.accessCount;
    }

    const now = Date.now();

    // If we have a frequency score with decay tracking
    if (typeof metadata.frequencyScore === 'number' && typeof metadata.lastFrequencyUpdate === 'number') {
      const timeSinceUpdate = now - metadata.lastFrequencyUpdate;
      const decayInterval = this.config.frequencyDecayInterval ?? 600000;

      // Only apply decay if significant time has passed
      if (timeSinceUpdate > decayInterval / 10) { // Apply decay after 10% of interval
        const decayAmount = Math.min(0.9, (timeSinceUpdate / decayInterval) * (this.config.frequencyDecayFactor ?? 0.05));
        return Math.max(1, metadata.frequencyScore * (1 - decayAmount));
      }

      return metadata.frequencyScore;
    }

    // Fallback to raw frequency
    return metadata.rawFrequency || metadata.accessCount;
  }

  /**
   * Calculate frequency score with decay applied
   */
  private calculateFrequencyScore(metadata: CacheItemMetadata, currentTime: number): number {
    const rawFreq = metadata.rawFrequency || metadata.accessCount;

    // If no previous frequency tracking, start with raw frequency
    if (typeof metadata.lastFrequencyUpdate !== 'number') {
      return rawFreq;
    }

    const timeSinceUpdate = currentTime - metadata.lastFrequencyUpdate;
    const decayInterval = this.config.frequencyDecayInterval ?? 600000;
    const decayFactor = this.config.frequencyDecayFactor ?? 0.05;

    // Calculate decay amount, but cap it to prevent over-decay
    const decayAmount = Math.min(0.9, (timeSinceUpdate / decayInterval) * decayFactor);
    const previousScore = metadata.frequencyScore || rawFreq;

    // Apply decay to previous score and add new frequency contribution
    const decayedScore = Math.max(1, previousScore * (1 - decayAmount));
    return Math.max(1, decayedScore + 1);
  }

  /**
   * Select eviction candidate using frequency-weighted approach
   */
  private selectFrequencyWeightedFromItems(items: Map<string, CacheItemMetadata>, context: 'recent' | 'frequent' | 'fallback'): string | null {
    if (items.size === 0) {
      return null;
    }

    let bestKey: string | null = null;
    let bestScore = Infinity;
    const now = Date.now();

    for (const [key, metadata] of items) {
      // Validate metadata to prevent corruption
      if (!metadata || typeof metadata.lastAccessedAt !== 'number' || metadata.lastAccessedAt > now) {
        continue;
      }

      // Calculate weighted score based on context
      const frequency = this.getEffectiveFrequency(metadata);
      const timeFactor = Math.max(0, now - metadata.lastAccessedAt);

      let score: number;
      if (context === 'recent') {
        // In recent list, prioritize by recency more heavily
        score = timeFactor + (1000 / Math.max(1, frequency));
      } else if (context === 'frequent') {
        // In frequent list, balance frequency and recency
        score = (timeFactor / 1000) + (10 / Math.max(1, frequency));
      } else {
        // Fallback - use balanced approach
        score = (timeFactor / 1000) / Math.max(1, frequency);
      }

      if (score < bestScore) {
        bestScore = score;
        bestKey = key;
      }
    }

    // If no valid key found through scoring, fall back to first available key
    if (bestKey !== null) {
      return bestKey;
    }

    // Fallback to first available key if items exist
    if (items.size > 0) {
      const firstKey = items.keys().next().value;
      return firstKey ?? null;
    }

    return null;
  }

  /**
   * Apply periodic decay to frequency scores
   */
  private applyPeriodicDecay(items: Map<string, CacheItemMetadata>): void {
    if (!this.config.useEnhancedFrequency || (this.config.frequencyDecayFactor ?? 0) === 0) return;

    const now = Date.now();
    const timeSinceDecay = now - this.lastDecayTime;
    const decayInterval = this.config.frequencyDecayInterval ?? 600000;

    if (timeSinceDecay >= decayInterval && items.size > 0) {
      const decayFactor = this.config.frequencyDecayFactor ?? 0.05;

      // Apply decay to all items that have frequency scores
      for (const metadata of items.values()) {
        if (typeof metadata.frequencyScore === 'number') {
          // Calculate time-based decay to handle cases where multiple intervals passed
          const intervalsPassed = timeSinceDecay / decayInterval;
          const totalDecay = Math.min(0.9, decayFactor * intervalsPassed); // Cap decay to prevent over-decay
          const newScore = metadata.frequencyScore * (1 - totalDecay);
          metadata.frequencyScore = Math.max(1, newScore);
          metadata.lastFrequencyUpdate = now;
        }
      }

      this.lastDecayTime = now;
    }
  }

  /**
   * Get configuration for this strategy
   */
  getConfig(): ARCConfig {
    return { ...this.config };
  }

  /**
   * Reset internal state (useful for testing)
   */
  reset(): void {
    this.recentGhosts.clear();
    this.frequentGhosts.clear();
    this.targetRecentSize = 0;
    this.lastDecayTime = Date.now();
  }

  /**
   * Get current adaptive state for monitoring/debugging
   */
  getAdaptiveState(): { targetRecentSize: number; recentGhostSize: number; frequentGhostSize: number } {
    return {
      targetRecentSize: this.targetRecentSize,
      recentGhostSize: this.recentGhosts.size,
      frequentGhostSize: this.frequentGhosts.size
    };
  }
}
