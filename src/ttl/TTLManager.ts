import { CacheItemMetadata, CacheMapMetadataProvider } from '../eviction/EvictionStrategy';
import LibLogger from '../logger';

const logger = LibLogger.get('TTLManager');

/**
 * Configuration for TTL behavior
 */
export interface TTLConfig {
  /** Default TTL in milliseconds for all items */
  defaultTTL?: number;
  /** Whether to automatically clean up expired items */
  autoCleanup?: boolean;
  /** Interval for automatic cleanup in milliseconds */
  cleanupInterval?: number;
  /** Whether to validate TTL on access */
  validateOnAccess?: boolean;
}

/**
 * TTL-aware item wrapper that extends cache metadata
 */
export interface TTLItemMetadata extends CacheItemMetadata {
  /** Expiration timestamp (addedAt + TTL) */
  expiresAt?: number;
  /** TTL value used for this specific item */
  ttl?: number;
}

/**
 * Manages TTL (Time To Live) logic independently of CacheMap implementations.
 * This allows any CacheMap to support TTL without implementing TTL-specific logic.
 */
export class TTLManager {
  private config: TTLConfig;
  private cleanupTimer?: NodeJS.Timeout | null;

  constructor(config: TTLConfig = {}) {
    this.config = {
      autoCleanup: true,
      cleanupInterval: 60000, // 1 minute default
      validateOnAccess: true,
      ...config
    };

    logger.debug('TTL_DEBUG: TTLManager created', {
      config: this.config,
      isTTLEnabled: this.isTTLEnabled(),
      defaultTTL: this.config.defaultTTL
    });

    if (this.config.autoCleanup && this.config.cleanupInterval) {
      this.startAutoCleanup();
    }
  }

  /**
   * Check if TTL is enabled
   */
  public isTTLEnabled(): boolean {
    return typeof this.config.defaultTTL === 'number' && this.config.defaultTTL > 0;
  }

  /**
   * Get the default TTL value
   */
  public getDefaultTTL(): number | undefined {
    return this.config.defaultTTL;
  }

  /**
   * Update TTL configuration
   */
  public updateConfig(config: Partial<TTLConfig>): void {
    const oldConfig = this.config;
    this.config = { ...this.config, ...config };

    // Restart auto cleanup if configuration changed
    if (oldConfig.autoCleanup !== this.config.autoCleanup ||
      oldConfig.cleanupInterval !== this.config.cleanupInterval) {
      this.stopAutoCleanup();
      if (this.config.autoCleanup && this.config.cleanupInterval) {
        this.startAutoCleanup();
      }
    }

    logger.debug('TTL configuration updated', { config: this.config });
  }

  /**
   * Set TTL metadata for an item when it's added
   */
  public async onItemAdded(
    key: string,
    metadataProvider: CacheMapMetadataProvider,
    itemTTL?: number
  ): Promise<void> {
    // TTL_DEBUG: Add comprehensive logging for debugging
    logger.debug('TTL_DEBUG: onItemAdded called', {
      key,
      itemTTL,
      isTTLEnabled: this.isTTLEnabled(),
      defaultTTL: this.config.defaultTTL,
      metadataProviderType: metadataProvider?.constructor?.name
    });

    if (!this.isTTLEnabled() && !itemTTL) {
      logger.debug('TTL_DEBUG: No TTL configured for item - returning early', { key });
      return; // No TTL configured
    }

    logger.debug('TTL_DEBUG: Getting metadata for key', { key });
    const metadata = await metadataProvider.getMetadata(key);
    logger.debug('TTL_DEBUG: Retrieved metadata', {
      key,
      hasMetadata: !!metadata,
      metadataKeys: metadata ? Object.keys(metadata) : null,
      metadata: metadata
    });

    if (!metadata) {
      logger.warning('TTL_DEBUG: No metadata found for item when setting TTL', {
        key,
        metadataProviderType: metadataProvider?.constructor?.name,
        metadataProviderMethods: metadataProvider ? Object.getOwnPropertyNames(Object.getPrototypeOf(metadataProvider)) : null
      });
      return;
    }

    const ttl = itemTTL || this.config.defaultTTL;
    logger.debug('TTL_DEBUG: Calculated TTL value', {
      key,
      itemTTL,
      defaultTTL: this.config.defaultTTL,
      finalTTL: ttl,
      willSetTTL: !!(ttl && ttl > 0)
    });

    if (ttl && ttl > 0) {
      const ttlMetadata: TTLItemMetadata = {
        ...metadata,
        expiresAt: metadata.addedAt + ttl,
        ttl
      };

      logger.debug('TTL_DEBUG: Setting TTL metadata', {
        key,
        ttl,
        addedAt: metadata.addedAt,
        expiresAt: ttlMetadata.expiresAt,
        ttlMetadata
      });

      await metadataProvider.setMetadata(key, ttlMetadata);

      logger.trace('TTL_DEBUG: TTL set for item', { key, ttl, expiresAt: ttlMetadata.expiresAt });
    } else {
      logger.debug('TTL_DEBUG: No TTL set - invalid TTL value', { key, ttl });
    }
  }

  /**
   * Check if an item has expired
   */
  public async isExpired(key: string, metadataProvider: CacheMapMetadataProvider): Promise<boolean> {
    const metadata = await metadataProvider.getMetadata(key) as TTLItemMetadata;
    if (!metadata || !metadata.expiresAt) {
      return false; // No TTL set
    }

    const now = Date.now();
    const expired = now >= metadata.expiresAt;

    if (expired) {
      logger.trace('Item expired', { key, expiresAt: metadata.expiresAt, now });
    }

    return expired;
  }

  /**
   * Check if an item is valid (not expired) before returning it
   * Returns true if item is valid, false if expired
   */
  public async validateItem(key: string, metadataProvider: CacheMapMetadataProvider): Promise<boolean> {
    if (!this.config.validateOnAccess) {
      return true; // Skip validation if disabled
    }

    return !(await this.isExpired(key, metadataProvider));
  }

  /**
   * Get TTL information for an item
   */
  public async getItemTTLInfo(key: string, metadataProvider: CacheMapMetadataProvider): Promise<{
    hasTTL: boolean;
    ttl?: number;
    expiresAt?: number;
    remainingTTL?: number;
    isExpired: boolean;
  }> {
    const metadata = await metadataProvider.getMetadata(key) as TTLItemMetadata;

    if (!metadata || !metadata.expiresAt) {
      return { hasTTL: false, isExpired: false };
    }

    const now = Date.now();
    const isExpired = now >= metadata.expiresAt;
    const remainingTTL = isExpired ? 0 : metadata.expiresAt - now;

    return {
      hasTTL: true,
      ttl: metadata.ttl,
      expiresAt: metadata.expiresAt,
      remainingTTL,
      isExpired
    };
  }

  /**
   * Find all expired items
   */
  public async findExpiredItems(metadataProvider: CacheMapMetadataProvider): Promise<string[]> {
    const expiredKeys: string[] = [];
    const allMetadata = await metadataProvider.getAllMetadata();
    const now = Date.now();

    for (const [key, metadata] of allMetadata) {
      const ttlMetadata = metadata as TTLItemMetadata;
      if (ttlMetadata.expiresAt && now >= ttlMetadata.expiresAt) {
        expiredKeys.push(key);
      }
    }

    if (expiredKeys.length > 0) {
      logger.debug('Found expired items', { count: expiredKeys.length, keys: expiredKeys });
    }

    return expiredKeys;
  }

  /**
   * Manually clean up expired items
   * Returns the keys of items that were expired
   */
  public async cleanupExpiredItems(metadataProvider: CacheMapMetadataProvider): Promise<string[]> {
    return await this.findExpiredItems(metadataProvider);
  }

  /**
   * Get remaining TTL for an item in milliseconds
   */
  public async getRemainingTTL(key: string, metadataProvider: CacheMapMetadataProvider): Promise<number | null> {
    const info = await this.getItemTTLInfo(key, metadataProvider);
    return info.hasTTL ? (info.remainingTTL || 0) : null;
  }

  /**
   * Extend TTL for an item
   */
  public async extendTTL(
    key: string,
    metadataProvider: CacheMapMetadataProvider,
    additionalTTL: number
  ): Promise<boolean> {
    const metadata = await metadataProvider.getMetadata(key) as TTLItemMetadata;
    if (!metadata || !metadata.expiresAt) {
      return false; // No TTL set
    }

    metadata.expiresAt += additionalTTL;
    await metadataProvider.setMetadata(key, metadata);

    logger.trace('TTL extended for item', { key, additionalTTL, newExpiresAt: metadata.expiresAt });
    return true;
  }

  /**
   * Reset TTL for an item (refresh expiration)
   */
  public async refreshTTL(
    key: string,
    metadataProvider: CacheMapMetadataProvider,
    newTTL?: number
  ): Promise<boolean> {
    const metadata = await metadataProvider.getMetadata(key) as TTLItemMetadata;
    if (!metadata) {
      return false;
    }

    const ttl = newTTL || metadata.ttl || this.config.defaultTTL;
    if (!ttl) {
      return false; // No TTL to set
    }

    const now = Date.now();
    const ttlMetadata: TTLItemMetadata = {
      ...metadata,
      expiresAt: now + ttl,
      ttl
    };
    await metadataProvider.setMetadata(key, ttlMetadata);

    logger.trace('TTL refreshed for item', { key, ttl, expiresAt: ttlMetadata.expiresAt });
    return true;
  }

  /**
   * Start automatic cleanup of expired items
   */
  private startAutoCleanup(): void {
    if (this.cleanupTimer) {
      this.stopAutoCleanup();
    }

    if (this.config.cleanupInterval) {
      this.cleanupTimer = setInterval(() => {
        // Note: This will be implemented when we integrate with Cache class
        logger.trace('Auto cleanup timer triggered');
      }, this.config.cleanupInterval);

      logger.debug('Auto cleanup started', { interval: this.config.cleanupInterval });
    }
  }

  /**
   * Stop automatic cleanup
   */
  private stopAutoCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      logger.debug('Auto cleanup stopped');
    }
  }

  /**
   * Clear all TTL metadata and reset the manager
   */
  public clear(): void {
    // Stop auto cleanup
    this.stopAutoCleanup();
    
    // Clear any internal state if needed
    // Note: TTL metadata is stored in the cache map, so clearing the cache map will clear TTL data
    
    logger.debug('TTL manager cleared');
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    this.stopAutoCleanup();
    logger.debug('TTL manager destroyed');
  }
}
