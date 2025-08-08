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

  selectForEviction(
    metadataProvider: CacheMapMetadataProvider,
    context: EvictionContext
  ): string[] {
    const allMetadata = metadataProvider.getAllMetadata();
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

    for (let i = 0; i < evictionCount && (recentItems.size > 0 || frequentItems.size > 0); i++) {
      let keyToEvict: string | null = null;

      // Decide which list to evict from based on target sizes and adaptive algorithm
      if (recentItems.size > this.targetRecentSize && recentItems.size > 0) {
        // Evict from recent list (T1)
        keyToEvict = this.config.useFrequencyWeightedSelection
          ? this.selectFrequencyWeightedFromItems(recentItems, 'recent')
          : this.selectLRUFromItems(recentItems);
        if (keyToEvict) recentItems.delete(keyToEvict);
      } else if (frequentItems.size > 0) {
        // Evict from frequent list (T2)
        keyToEvict = this.config.useFrequencyWeightedSelection
          ? this.selectFrequencyWeightedFromItems(frequentItems, 'frequent')
          : this.selectLRUFromItems(frequentItems);
        if (keyToEvict) frequentItems.delete(keyToEvict);
      }

      if (keyToEvict) {
        keysToEvict.push(keyToEvict);
      } else {
        break; // No more items to evict
      }
    }

    return keysToEvict;
  }

  private selectLRUFromItems(items: Map<string, CacheItemMetadata>): string | null {
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

  onItemAccessed(key: string, metadataProvider: CacheMapMetadataProvider): void {
    const metadata = metadataProvider.getMetadata(key);
    if (!metadata) return;

    const now = Date.now();
    metadata.lastAccessedAt = now;
    metadata.accessCount++;

    // Update frequency tracking
    metadata.rawFrequency = metadata.accessCount;

    // Update frequency score with decay if enabled
    if (this.config.useEnhancedFrequency && (this.config.frequencyDecayFactor ?? 0) > 0) {
      metadata.frequencyScore = this.calculateFrequencyScore(metadata, now);
      metadata.lastFrequencyUpdate = now;
    }

    // Adjust target size based on ghost list hits with adaptive learning
    const learningRate = this.config.adaptiveLearningRate ?? 1.0;

    if (this.recentGhosts.has(key)) {
      // Hit in recent ghost list - increase target for recent items
      const adjustment = Math.ceil(learningRate);
      this.targetRecentSize = Math.min(this.targetRecentSize + adjustment, this.maxGhostSize);
      this.recentGhosts.delete(key);
    } else if (this.frequentGhosts.has(key)) {
      // Hit in frequent ghost list - decrease target for recent items
      const adjustment = Math.ceil(learningRate);
      this.targetRecentSize = Math.max(this.targetRecentSize - adjustment, 0);
      this.frequentGhosts.delete(key);
    }

    metadataProvider.setMetadata(key, metadata);
  }

  onItemAdded(key: string, estimatedSize: number, metadataProvider: CacheMapMetadataProvider): void {
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

    metadataProvider.setMetadata(key, metadata);
  }

  onItemRemoved(key: string, metadataProvider: CacheMapMetadataProvider): void {
    // Determine which ghost list to add to based on item characteristics
    // For now, add to recent ghost list by default
    this.addToRecentGhosts(key);

    // Ensure both ghost lists stay within bounds
    this.cleanupGhostLists();

    // Clean up metadata
    metadataProvider.deleteMetadata(key);
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
    while (this.recentGhosts.size > this.maxGhostSize) {
      const firstKey = this.recentGhosts.values().next().value;
      if (firstKey) {
        this.recentGhosts.delete(firstKey);
      }
    }
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
    while (this.frequentGhosts.size > this.maxGhostSize) {
      const firstKey = this.frequentGhosts.values().next().value;
      if (firstKey) {
        this.frequentGhosts.delete(firstKey);
      }
    }
  }

  /**
   * Cleanup ghost lists to prevent memory leaks
   */
  private cleanupGhostLists(): void {
    // Clean up recent ghosts
    while (this.recentGhosts.size > this.maxGhostSize) {
      const firstKey = this.recentGhosts.values().next().value;
      if (firstKey) {
        this.recentGhosts.delete(firstKey);
      } else {
        break; // Safety check
      }
    }

    // Clean up frequent ghosts
    while (this.frequentGhosts.size > this.maxGhostSize) {
      const firstKey = this.frequentGhosts.values().next().value;
      if (firstKey) {
        this.frequentGhosts.delete(firstKey);
      } else {
        break; // Safety check
      }
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
      const decayAmount = (timeSinceUpdate / (this.config.frequencyDecayInterval ?? 600000)) * (this.config.frequencyDecayFactor ?? 0.05);
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
    const decayAmount = (timeSinceUpdate / (this.config.frequencyDecayInterval ?? 600000)) * (this.config.frequencyDecayFactor ?? 0.05);
    const previousScore = metadata.frequencyScore || rawFreq;

    // Apply decay to previous score and add new frequency contribution
    const decayedScore = previousScore * (1 - decayAmount);
    return Math.max(1, decayedScore + 1);
  }

  /**
   * Select eviction candidate using frequency-weighted approach
   */
  private selectFrequencyWeightedFromItems(items: Map<string, CacheItemMetadata>, context: 'recent' | 'frequent' | 'fallback'): string | null {
    let bestKey: string | null = null;
    let bestScore = Infinity;

    for (const [key, metadata] of items) {
      // Calculate weighted score based on context
      const frequency = this.getEffectiveFrequency(metadata);
      const timeFactor = Date.now() - metadata.lastAccessedAt;

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

    return bestKey || (items.size > 0 ? (items.keys().next().value ?? null) : null);
  }

  /**
   * Apply periodic decay to frequency scores
   */
  private applyPeriodicDecay(items: Map<string, CacheItemMetadata>): void {
    if (!this.config.useEnhancedFrequency || (this.config.frequencyDecayFactor ?? 0) === 0) return;

    const now = Date.now();
    const timeSinceDecay = now - this.lastDecayTime;

    if (timeSinceDecay >= (this.config.frequencyDecayInterval ?? 600000)) {
      // Only update lastDecayTime if we actually have items to decay
      if (items.size > 0) {
        // Apply decay to all items
        for (const metadata of items.values()) {
          if (typeof metadata.frequencyScore === 'number') {
            const decayAmount = (this.config.frequencyDecayFactor ?? 0.05);
            metadata.frequencyScore = Math.max(1, metadata.frequencyScore * (1 - decayAmount));
          }
        }
        this.lastDecayTime = now;
      }
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
