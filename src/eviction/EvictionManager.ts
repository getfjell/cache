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
      logger.debug('EVICTION: Item accessed, updating metadata', {
        key,
        strategy: this.evictionStrategy.getStrategyName()
      });
      await this.evictionStrategy.onItemAccessed(key, metadataProvider);
    } catch (error) {
      logger.error('EVICTION: Error in eviction strategy onItemAccessed', {
        key,
        error,
        strategy: this.evictionStrategy?.getStrategyName()
      });
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
    const startTime = Date.now();
    const evictedKeys: string[] = [];

    if (!this.evictionStrategy) {
      logger.debug('EVICTION: No eviction strategy configured', { key });
      return evictedKeys;
    }

    try {
      const estimatedSize = estimateValueSize(value);
      logger.debug('EVICTION: Item addition started', {
        key,
        estimatedSize,
        strategy: this.evictionStrategy.getStrategyName()
      });
      
      const contextStartTime = Date.now();
      const context = await this.createEvictionContext(metadataProvider, estimatedSize);
      const contextDuration = Date.now() - contextStartTime;
      
      logger.debug('EVICTION: Current cache state', {
        key,
        currentItemCount: context.currentSize.itemCount,
        currentSizeBytes: context.currentSize.sizeBytes,
        maxItems: context.limits.maxItems,
        maxSizeBytes: context.limits.maxSizeBytes,
        newItemSize: estimatedSize,
        contextDuration
      });

      // Perform eviction before adding the new item if needed
      const selectionStartTime = Date.now();
      const keysToEvict = await this.evictionStrategy.selectForEviction(metadataProvider, context);
      const selectionDuration = Date.now() - selectionStartTime;
      
      if (keysToEvict.length > 0) {
        logger.debug('EVICTION: Items selected for eviction', {
          key,
          evictCount: keysToEvict.length,
          keysToEvict,
          selectionDuration,
          strategy: this.evictionStrategy.getStrategyName()
        });
      }

      const removalStartTime = Date.now();
      for (const evictKey of keysToEvict) {
        // Let the strategy know about the removal
        await this.evictionStrategy.onItemRemoved(evictKey, metadataProvider);
        evictedKeys.push(evictKey);
        logger.debug('EVICTION: Marked item for eviction', {
          evictedKey: evictKey,
          newKey: key
        });
      }
      const removalDuration = Date.now() - removalStartTime;

      // Now add metadata for the new item
      const addMetadataStart = Date.now();
      await this.evictionStrategy.onItemAdded(key, estimatedSize, metadataProvider);
      const addMetadataDuration = Date.now() - addMetadataStart;

      const totalDuration = Date.now() - startTime;
      
      if (evictedKeys.length > 0) {
        logger.debug('EVICTION: Eviction completed', {
          newKey: key,
          evictedCount: evictedKeys.length,
          evictedKeys,
          strategy: this.evictionStrategy.getStrategyName(),
          selectionDuration,
          removalDuration,
          addMetadataDuration,
          totalDuration
        });
      } else {
        logger.debug('EVICTION: No eviction needed', {
          newKey: key,
          estimatedSize,
          totalDuration
        });
      }
    } catch (error) {
      logger.error('EVICTION: Error in eviction strategy onItemAdded', {
        key,
        error,
        strategy: this.evictionStrategy?.getStrategyName()
      });
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
    const startTime = Date.now();
    const evictedKeys: string[] = [];

    if (!this.evictionStrategy) {
      logger.debug('EVICTION: No eviction strategy configured for manual eviction');
      return evictedKeys;
    }

    try {
      logger.debug('EVICTION: Manual eviction started', {
        strategy: this.evictionStrategy.getStrategyName()
      });
      
      const context = await this.createEvictionContext(metadataProvider);
      logger.debug('EVICTION: Manual eviction - current cache state', {
        currentItemCount: context.currentSize.itemCount,
        currentSizeBytes: context.currentSize.sizeBytes,
        maxItems: context.limits.maxItems,
        maxSizeBytes: context.limits.maxSizeBytes
      });
      
      const keysToEvict = await this.evictionStrategy.selectForEviction(metadataProvider, context);

      for (const evictKey of keysToEvict) {
        await this.evictionStrategy.onItemRemoved(evictKey, metadataProvider);
        evictedKeys.push(evictKey);
      }

      const duration = Date.now() - startTime;
      
      if (evictedKeys.length > 0) {
        logger.debug('EVICTION: Manual eviction completed', {
          evictedCount: evictedKeys.length,
          evictedKeys,
          strategy: this.evictionStrategy.getStrategyName(),
          duration
        });
      } else {
        logger.debug('EVICTION: Manual eviction - no items to evict', {
          strategy: this.evictionStrategy.getStrategyName(),
          duration
        });
      }
    } catch (error) {
      logger.error('EVICTION: Error in manual eviction', {
        error,
        strategy: this.evictionStrategy?.getStrategyName()
      });
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
   * Clear all eviction metadata and reset the manager
   */
  public clear(): void {
    if (this.evictionStrategy) {
      // Call reset on the strategy if it has one
      if (typeof (this.evictionStrategy as any).reset === 'function') {
        (this.evictionStrategy as any).reset();
      }
    }
    logger.debug('Eviction manager cleared');
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
