/**
 * Two-Layer Cache Architecture Types
 * Separates item storage from query result storage to prevent cache poisoning
 */

// ===== ITEM CACHE LAYER =====

export interface ItemCacheLayer<T> {
  get(key: string): Promise<T | null>;
  set(key: string, item: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
  clear(): Promise<void>;
}

export interface CachedItem<T> {
  data: T;
  createdAt: Date;
  expiresAt: Date;
}

// ===== QUERY CACHE LAYER =====

export interface QueryCacheLayer {
  getResult(queryKey: string): Promise<QueryResult | null>;
  setResult(queryKey: string, result: QueryResult): Promise<void>;
  invalidatePattern(pattern: string): Promise<void>;
  clear(): Promise<void>;
}

export interface QueryResult {
  itemKeys: string[];
  metadata: QueryMetadata;
}

export interface QueryMetadata {
  queryType: string;
  isComplete: boolean;
  createdAt: Date;
  expiresAt: Date;
  filter?: string;
  params?: any;
  
  // Enhanced TTL information
  ttl?: number;
  baseTTL?: number;
  adjustments?: {
    peakHours?: {
      applied: boolean;
      multiplier: number;
    };
  };
}

// ===== CONFIGURATION =====

export interface TwoLayerCacheOptions {
  // Item layer settings
  itemTTL?: number;           // Default TTL for items in seconds (default: 3600)
  
  // Query layer settings
  queryTTL?: number;          // TTL for complete queries in seconds (default: 300)
  facetTTL?: number;          // TTL for faceted/partial queries in seconds (default: 60)
}

// ===== CACHE KEY BUILDERS =====

export interface CacheKeyBuilder {
  buildItemKey<T>(item: T): string;
  buildQueryKey(queryType: string, params?: any): string;
}
