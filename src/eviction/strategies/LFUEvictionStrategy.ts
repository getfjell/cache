import { CacheItemMetadata, CacheMapMetadataProvider, EvictionContext, EvictionStrategy } from '../EvictionStrategy';
import { DEFAULT_LFU_CONFIG, LFUConfig } from '../EvictionStrategyConfig';
import { createValidatedConfig } from '../EvictionStrategyValidation';

/**
 * High-quality hash function for Count-Min Sketch based on FNV-1a
 * Provides excellent avalanche effect and distribution properties
 */
function fnv1aHash(key: string, seed: number): number {
  // FNV-1a constants for 32-bit hash
  const FNV_OFFSET_BASIS = 2166136261;
  const FNV_PRIME = 16777619;

  // Start with seed-modified offset basis for different hash functions
  let hash = (FNV_OFFSET_BASIS ^ seed) >>> 0;

  for (let i = 0; i < key.length; i++) {
    // XOR with byte value
    hash ^= key.charCodeAt(i);
    // Multiply by FNV prime
    hash = (hash * FNV_PRIME) >>> 0;
  }

  // Additional mixing for better avalanche
  hash ^= hash >>> 16;
  hash = (hash * 0x85ebca6b) >>> 0;
  hash ^= hash >>> 13;
  hash = (hash * 0xc2b2ae35) >>> 0;
  hash ^= hash >>> 16;

  return hash >>> 0;
}

/**
 * Count-Min Sketch for probabilistic frequency counting
 */
class CountMinSketch {
  private readonly sketches: number[][];
  private readonly width: number;
  private readonly depth: number;
  private readonly seeds: number[];

  constructor(width: number = 1024, depth: number = 4) {
    this.width = width;
    this.depth = depth;
    this.sketches = Array(depth).fill(null).map(() => new Array(width).fill(0));
    this.seeds = Array(depth).fill(null).map(() => Math.floor(Math.random() * 1000000));
  }

  /**
   * Check if a number is a power of 2 for optimized bit masking
   */
  private isPowerOfTwo(n: number): boolean {
    return n > 0 && (n & (n - 1)) === 0;
  }

  /**
   * Increment the frequency count for a key
   */
  increment(key: string): void {
    for (let i = 0; i < this.depth; i++) {
      // Use bit masking for better distribution when width is power of 2
      // For non-power of 2, fall back to modulo but with improved hash
      const hash = fnv1aHash(key, this.seeds[i]);
      const index = this.isPowerOfTwo(this.width)
        ? hash & (this.width - 1)
        : hash % this.width;
      this.sketches[i][index]++;
    }
  }

  /**
   * Estimate the frequency count for a key
   */
  estimate(key: string): number {
    let minCount = Infinity;
    for (let i = 0; i < this.depth; i++) {
      // Use same improved indexing as in increment method
      const hash = fnv1aHash(key, this.seeds[i]);
      const index = this.isPowerOfTwo(this.width)
        ? hash & (this.width - 1)
        : hash % this.width;
      minCount = Math.min(minCount, this.sketches[i][index]);
    }
    return minCount === Infinity ? 0 : minCount;
  }

  /**
   * Apply decay to all frequencies
   */
  decay(factor: number): void {
    for (let i = 0; i < this.depth; i++) {
      for (let j = 0; j < this.width; j++) {
        this.sketches[i][j] = Math.floor(this.sketches[i][j] * (1 - factor));
      }
    }
  }

  /**
   * Reset all frequencies to zero
   */
  reset(): void {
    for (let i = 0; i < this.depth; i++) {
      for (let j = 0; j < this.width; j++) {
        this.sketches[i][j] = 0;
      }
    }
  }
}

/**
 * LFU (Least Frequently Used) eviction strategy with frequency sketching and decay
 * Uses probabilistic counting and time-based frequency decay for more accurate frequency estimation
 * When configured with default settings, behaves like traditional LFU for backwards compatibility
 */
export class LFUEvictionStrategy extends EvictionStrategy {
  getStrategyName(): string {
    return 'lfu';
  }
  private readonly config: LFUConfig;
  private readonly sketch: CountMinSketch | null;
  private lastDecayTime: number;

  constructor(config: Partial<LFUConfig> = {}) {
    super();
    // Default to backwards-compatible behavior if no config provided
    const defaultBackwardsCompatible = {
      useProbabilisticCounting: false,
      decayFactor: 0,
      decayInterval: Number.MAX_SAFE_INTEGER
    };
    const baseConfig = { ...DEFAULT_LFU_CONFIG, ...defaultBackwardsCompatible };
    this.config = createValidatedConfig(baseConfig, config);
    this.sketch = this.config.useProbabilisticCounting
      ? new CountMinSketch(this.config.sketchWidth, this.config.sketchDepth)
      : null;
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

    // Apply periodic decay if needed
    this.applyPeriodicDecay();

    // Sort items by frequency (lowest first), then by age (oldest first)
    const sortedEntries = Array.from(allMetadata.entries()).sort((a, b) => {
      const freqA = this.getEffectiveFrequency(a[0], a[1]);
      const freqB = this.getEffectiveFrequency(b[0], b[1]);

      if (freqA !== freqB) {
        return freqA - freqB; // Lower frequency first
      }

      return a[1].lastAccessedAt - b[1].lastAccessedAt; // Older first
    });

    return sortedEntries.slice(0, evictionCount).map(([key]) => key);
  }

  onItemAccessed(key: string, metadataProvider: CacheMapMetadataProvider): void {
    const metadata = metadataProvider.getMetadata(key);
    if (!metadata) return;

    const now = Date.now();
    metadata.lastAccessedAt = now;
    metadata.accessCount++;

    // Update frequency tracking
    if (this.sketch) {
      this.sketch.increment(key);
      metadata.rawFrequency = this.sketch.estimate(key);
    } else {
      metadata.rawFrequency = metadata.accessCount; // Use access count in simple mode
    }

    // Always calculate frequency score for consistency
    metadata.frequencyScore = this.calculateFrequencyScore(metadata, now);
    metadata.lastFrequencyUpdate = now;

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

    // Always initialize frequencyScore and lastFrequencyUpdate for consistency
    metadata.frequencyScore = 1;
    metadata.lastFrequencyUpdate = now;

    // Initialize in sketch
    if (this.sketch) {
      this.sketch.increment(key);
    }

    metadataProvider.setMetadata(key, metadata);
  }

  onItemRemoved(key: string, metadataProvider: CacheMapMetadataProvider): void {
    // Note: For Count-Min Sketch, we don't remove entries as it's a probabilistic structure
    // The decay mechanism will naturally reduce the impact of removed items over time
    metadataProvider.deleteMetadata(key);
  }

  /**
   * Get the effective frequency for an item, applying real-time decay if needed
   */
  private getEffectiveFrequency(_key: string, metadata: CacheItemMetadata): number {
    // If decay is disabled, use simple frequency counting
    if ((this.config.decayFactor ?? 0) === 0) {
      return metadata.rawFrequency || metadata.accessCount;
    }

    const now = Date.now();

    // If we have a recent frequency score, use it with minimal decay
    if (typeof metadata.frequencyScore === 'number' && typeof metadata.lastFrequencyUpdate === 'number') {
      const timeSinceUpdate = now - metadata.lastFrequencyUpdate;
      const decayAmount = (timeSinceUpdate / (this.config.decayInterval ?? 60000)) * (this.config.decayFactor ?? 0.1);
      return Math.max(this.config.minFrequencyThreshold ?? 1, metadata.frequencyScore * (1 - decayAmount));
    }

    // Fallback to raw frequency or access count
    return metadata.rawFrequency || metadata.accessCount;
  }

  /**
   * Calculate frequency score with decay applied
   */
  private calculateFrequencyScore(metadata: CacheItemMetadata, currentTime: number): number {
    const rawFreq = metadata.rawFrequency || metadata.accessCount;

    // If decay is disabled, just return raw frequency
    if ((this.config.decayFactor ?? 0) === 0) {
      return rawFreq;
    }

    if (typeof metadata.lastFrequencyUpdate !== 'number') {
      return rawFreq;
    }

    const timeSinceUpdate = currentTime - metadata.lastFrequencyUpdate;
    const decayAmount = (timeSinceUpdate / (this.config.decayInterval ?? 60000)) * (this.config.decayFactor ?? 0.1);
    const previousScore = metadata.frequencyScore || rawFreq;

    // Apply decay to previous score and add new frequency contribution
    const decayedScore = previousScore * (1 - decayAmount);
    return Math.max(this.config.minFrequencyThreshold ?? 1, decayedScore + 1);
  }

  /**
   * Apply periodic decay to the frequency sketch and metadata
   */
  private applyPeriodicDecay(): void {
    if ((this.config.decayFactor ?? 0) === 0) return;

    const now = Date.now();
    const timeSinceDecay = now - this.lastDecayTime;

    if (timeSinceDecay >= (this.config.decayInterval ?? 60000)) {
      if (this.sketch) {
        this.sketch.decay(this.config.decayFactor ?? 0.1);
      }
      this.lastDecayTime = now;
    }
  }

  /**
   * Get configuration for this strategy
   */
  getConfig(): LFUConfig {
    return { ...this.config };
  }

  /**
   * Reset frequency tracking (useful for testing or cache clearing)
   */
  reset(): void {
    if (this.sketch) {
      this.sketch.reset();
    }
    this.lastDecayTime = Date.now();
  }
}
