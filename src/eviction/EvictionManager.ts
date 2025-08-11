import {
  CacheMapMetadataProvider,
  EvictionContext,
  EvictionStrategy
} from './EvictionStrategy';
import { estimateValueSize } from '../utils/CacheSize';
import LibLogger from '../logger';

const logger = LibLogger.get('EvictionManager');

/**
 * Manages eviction logic independently of CacheMap implementations.
 * This class coordinates between eviction strategies and cache metadata.
 */
export class EvictionManager {
  private evictionStrategy: EvictionStrategy | null;

  constructor(evictionStrategy?: EvictionStrategy) {
    this.evictionStrategy = evictionStrategy || null;
  }

  /**
   * Set or update the eviction strategy
   * @param strategy - The eviction strategy to use
   */
  public setEvictionStrategy(strategy: EvictionStrategy | null): void {
    this.evictionStrategy = strategy;
    logger.debug('Eviction strategy updated', {
      strategy: strategy?.getStrategyName() || 'none'
    });
  }

  /**
   * Get the current eviction strategy name
   * @returns Strategy name or null if no eviction
   */
  public getEvictionStrategyName(): string | null {
    return this.evictionStrategy?.getStrategyName() || null;
  }

  /**
   * Handle item access - update metadata for eviction strategy
   * @param key - Item key
   * @param metadataProvider - Cache metadata provider
   */
  public async onItemAccessed(key: string, metadataProvider: CacheMapMetadataProvider): Promise<void> {
    if (!this.evictionStrategy) {
      return;
    }

    try {
      await this.evictionStrategy.onItemAccessed(key, metadataProvider);
    } catch (error) {
      logger.error('Error in eviction strategy onItemAccessed', { key, error });
    }
  }

  /**
   * Handle item addition - update metadata and perform eviction if needed
   * @param key - Item key
   * @param value - Item value (for size estimation)
   * @param metadataProvider - Cache metadata provider
   * @returns Array of keys that were evicted
   */
  public async onItemAdded<T>(
    key: string,
    value: T,
    metadataProvider: CacheMapMetadataProvider
  ): Promise<string[]> {
    const evictedKeys: string[] = [];

    if (!this.evictionStrategy) {
      return evictedKeys;
    }

    try {
      const estimatedSize = estimateValueSize(value);
      const context = await this.createEvictionContext(metadataProvider, estimatedSize);

      // Perform eviction before adding the new item if needed
      const keysToEvict = await this.evictionStrategy.selectForEviction(metadataProvider, context);

      for (const evictKey of keysToEvict) {
        // Let the strategy know about the removal
        await this.evictionStrategy.onItemRemoved(evictKey, metadataProvider);
        evictedKeys.push(evictKey);
      }

      // Now add metadata for the new item
      await this.evictionStrategy.onItemAdded(key, estimatedSize, metadataProvider);

      if (evictedKeys.length > 0) {
        logger.debug('Items evicted during addition', {
          newKey: key,
          evictedKeys,
          strategy: this.evictionStrategy.getStrategyName()
        });
      }
    } catch (error) {
      logger.error('Error in eviction strategy onItemAdded', { key, error });
    }

    return evictedKeys;
  }

  /**
   * Handle item removal - clean up metadata
   * @param key - Item key
   * @param metadataProvider - Cache metadata provider
   */
  public onItemRemoved(key: string, metadataProvider: CacheMapMetadataProvider): void {
    if (!this.evictionStrategy) {
      return;
    }

    try {
      this.evictionStrategy.onItemRemoved(key, metadataProvider);
    } catch (error) {
      logger.error('Error in eviction strategy onItemRemoved', { key, error });
    }
  }

  /**
   * Perform manual eviction check
   * @param metadataProvider - Cache metadata provider
   * @returns Array of keys that were evicted
   */
  public async performEviction(metadataProvider: CacheMapMetadataProvider): Promise<string[]> {
    const evictedKeys: string[] = [];

    if (!this.evictionStrategy) {
      return evictedKeys;
    }

    try {
      const context = await this.createEvictionContext(metadataProvider);
      const keysToEvict = await this.evictionStrategy.selectForEviction(metadataProvider, context);

      for (const evictKey of keysToEvict) {
        await this.evictionStrategy.onItemRemoved(evictKey, metadataProvider);
        evictedKeys.push(evictKey);
      }

      if (evictedKeys.length > 0) {
        logger.debug('Manual eviction performed', {
          evictedKeys,
          strategy: this.evictionStrategy.getStrategyName()
        });
      }
    } catch (error) {
      logger.error('Error in manual eviction', { error });
    }

    return evictedKeys;
  }

  /**
   * Check if eviction is supported (i.e., strategy is set)
   * @returns True if eviction is supported
   */
  public isEvictionSupported(): boolean {
    return this.evictionStrategy !== null;
  }

  /**
   * Create eviction context from current cache state
   * @param metadataProvider - Cache metadata provider
   * @param newItemSize - Size of item being added (optional)
   * @returns Eviction context
   */
  private async createEvictionContext(
    metadataProvider: CacheMapMetadataProvider,
    newItemSize?: number
  ): Promise<EvictionContext> {
    const currentSize = await metadataProvider.getCurrentSize();
    const limits = await metadataProvider.getSizeLimits();

    return {
      currentSize,
      limits,
      newItemSize
    };
  }
}
