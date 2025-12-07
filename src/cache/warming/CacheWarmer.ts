/**
 * Cache Warming System
 *
 * Proactively populates cache with commonly accessed data to improve hit rates.
 * Supports periodic warming, priority-based execution, and failure handling.
 */

import { WarmingQuery } from '../../ttl/TTLConfig.js';
import LibLogger from '../../logger';

const logger = LibLogger.get('CacheWarmer');

export interface CacheWarmerOptions {
  /** Interval between warming cycles (milliseconds) */
  interval: number;
  /** Maximum number of concurrent warming operations */
  maxConcurrency?: number;
  /** How long to wait for a warming operation before timing out (milliseconds) */
  operationTimeout?: number;
  /** Whether to continue warming on individual failures */
  continueOnError?: boolean;
}

export interface WarmingOperation<T> {
  /** Unique identifier for this warming operation */
  id: string;
  /** Parameters for the operation */
  params: any;
  /** Priority (1-10, higher = more important) */
  priority: number;
  /** Function to fetch the data */
  fetcher: () => Promise<T[]>;
  /** TTL multiplier for warmed data (optional) */
  ttlMultiplier?: number;
}

export interface WarmingResult {
  /** Operation ID */
  operationId: string;
  /** Whether the operation succeeded */
  success: boolean;
  /** Number of items warmed */
  itemsWarmed: number;
  /** Time taken in milliseconds */
  duration: number;
  /** Error if failed */
  error?: string;
}

export interface WarmingStats {
  /** Total warming cycles completed */
  totalCycles: number;
  /** Total operations attempted */
  totalOperations: number;
  /** Total successful operations */
  successfulOperations: number;
  /** Total items warmed */
  totalItemsWarmed: number;
  /** Average items per operation */
  averageItemsPerOperation: number;
  /** Success rate (0-1) */
  successRate: number;
  /** Currently running operations */
  activeOperations: number;
  /** Last warming cycle timestamp */
  lastWarmingAt?: Date;
  /** Next warming cycle timestamp */
  nextWarmingAt?: Date;
}

/**
 * Cache warming system that proactively populates cache with common queries
 */
export class CacheWarmer<T> {
  private options: Required<CacheWarmerOptions>;
  private operations: WarmingOperation<T>[];
  private activeOperations: Map<string, Promise<WarmingResult>>;
  private intervalId?: NodeJS.Timeout;
  private stats: WarmingStats;

  constructor(options: CacheWarmerOptions) {
    this.options = {
      maxConcurrency: 5,
      operationTimeout: 30000, // 30 seconds
      continueOnError: true,
      ...options
    };

    this.operations = [];
    this.activeOperations = new Map();
    this.stats = {
      totalCycles: 0,
      totalOperations: 0,
      successfulOperations: 0,
      totalItemsWarmed: 0,
      averageItemsPerOperation: 0,
      successRate: 0,
      activeOperations: 0
    };
  }

  /**
   * Add warming operations from configuration
   */
  addOperationsFromConfig(
    queries: WarmingQuery[],
    fetcherFactory: (params: any) => () => Promise<T[]>
  ): void {
    for (const query of queries) {
      this.addOperation({
        id: this.generateOperationId(query.params),
        params: query.params,
        priority: query.priority,
        fetcher: fetcherFactory(query.params),
        ttlMultiplier: query.ttlMultiplier
      });
    }
  }

  /**
   * Add a single warming operation
   */
  addOperation(operation: WarmingOperation<T>): void {
    // Remove existing operation with same ID
    this.operations = this.operations.filter(op => op.id !== operation.id);
    
    // Add new operation
    this.operations.push(operation);
    
    // Sort by priority (highest first)
    this.operations.sort((a, b) => b.priority - a.priority);

    logger.debug('Added operation', { operationId: operation.id, priority: operation.priority });
  }

  /**
   * Remove a warming operation
   */
  removeOperation(operationId: string): boolean {
    const initialLength = this.operations.length;
    this.operations = this.operations.filter(op => op.id !== operationId);
    
    const removed = this.operations.length < initialLength;
    if (removed) {
      logger.debug('Removed operation', { operationId });
    }
    
    return removed;
  }

  /**
   * Start periodic warming
   */
  startPeriodicWarming(): void {
    if (this.intervalId) {
      this.stopPeriodicWarming();
    }

    this.intervalId = setInterval(() => {
      this.performWarmingCycle().catch(error => {
        logger.error('Warming cycle failed', { error });
      });
    }, this.options.interval);

    this.stats.nextWarmingAt = new Date(Date.now() + this.options.interval);

    logger.debug('Started periodic warming', { interval: this.options.interval });

    // Perform initial warming
    this.performWarmingCycle().catch(error => {
      logger.error('Initial warming cycle failed', { error });
    });
  }

  /**
   * Stop periodic warming
   */
  stopPeriodicWarming(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
      this.stats.nextWarmingAt = undefined;
      
      logger.debug('Stopped periodic warming');
    }
  }

  /**
   * Perform a single warming cycle
   */
  async performWarmingCycle(): Promise<WarmingResult[]> {
    if (this.operations.length === 0) {
      logger.debug('No operations to warm');
      return [];
    }

    this.stats.totalCycles++;
    this.stats.lastWarmingAt = new Date();
    this.stats.nextWarmingAt = new Date(Date.now() + this.options.interval);

    logger.debug('Starting warming cycle', {
      cycleNumber: this.stats.totalCycles,
      operationCount: this.operations.length
    });

    const results: WarmingResult[] = [];
    const operationsToRun = [...this.operations]; // Copy to avoid modification during iteration

    // Process operations in batches based on concurrency limit
    for (let i = 0; i < operationsToRun.length; i += this.options.maxConcurrency) {
      const batch = operationsToRun.slice(i, i + this.options.maxConcurrency);
      const batchPromises = batch.map(operation => this.performWarmingOperation(operation));
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else if (result.status === 'rejected') {
          logger.error('Batch operation failed', { reason: result.reason });
          if (!this.options.continueOnError) {
            throw result.reason;
          }
        }
      }
    }

    this.updateStats(results);

    logger.debug('Completed warming cycle', {
      totalOperations: results.length,
      successfulOperations: results.filter(r => r.success).length
    });

    return results;
  }

  /**
   * Perform a single warming operation
   */
  private async performWarmingOperation(operation: WarmingOperation<T>): Promise<WarmingResult> {
    const startTime = Date.now();
    
    // Check if already running
    if (this.activeOperations.has(operation.id)) {
      return {
        operationId: operation.id,
        success: false,
        itemsWarmed: 0,
        duration: 0,
        error: 'Operation already running'
      };
    }

    this.stats.totalOperations++;
    this.stats.activeOperations++;

    // Create the operation promise and mark as active
    const operationPromise = this.executeOperation(operation, startTime);
    this.activeOperations.set(operation.id, operationPromise);

    try {
      const result = await operationPromise;
      return result;
    } finally {
      this.stats.activeOperations--;
      this.activeOperations.delete(operation.id);
    }
  }

  /**
   * Execute the actual operation with timeout handling
   */
  private async executeOperation(operation: WarmingOperation<T>, startTime: number): Promise<WarmingResult> {
    try {
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Operation timeout')), this.options.operationTimeout);
      });

      // Race between the operation and timeout
      const items = await Promise.race([
        operation.fetcher(),
        timeoutPromise
      ]);

      const duration = Date.now() - startTime;

      logger.debug('Operation completed', {
        operationId: operation.id,
        itemCount: items.length,
        duration
      });

      this.stats.successfulOperations++;
      this.stats.totalItemsWarmed += items.length;

      return {
        operationId: operation.id,
        success: true,
        itemsWarmed: items.length,
        duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error('Operation failed', {
        operationId: operation.id,
        duration,
        error: errorMessage
      });

      return {
        operationId: operation.id,
        success: false,
        itemsWarmed: 0,
        duration,
        error: errorMessage
      };
    }
  }

  /**
   * Warm specific operations immediately
   */
  async warmOperations(operationIds: string[]): Promise<WarmingResult[]> {
    const operationsToWarm = this.operations.filter(op => operationIds.includes(op.id));
    
    if (operationsToWarm.length === 0) {
      logger.debug('No matching operations to warm');
      return [];
    }

    logger.debug('Warming specific operations', { count: operationsToWarm.length });

    const results = await Promise.allSettled(
      operationsToWarm.map(operation => this.performWarmingOperation(operation))
    );

    const warmingResults: WarmingResult[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        warmingResults.push(result.value);
      } else {
        logger.error('Specific warming operation failed', { reason: result.reason });
      }
    }

    this.updateStats(warmingResults);
    return warmingResults;
  }

  /**
   * Get current warming statistics
   */
  getStats(): WarmingStats {
    this.stats.averageItemsPerOperation = this.stats.totalOperations > 0
      ? this.stats.totalItemsWarmed / this.stats.totalOperations
      : 0;
    
    this.stats.successRate = this.stats.totalOperations > 0
      ? this.stats.successfulOperations / this.stats.totalOperations
      : 0;

    return { ...this.stats };
  }

  /**
   * Get list of configured operations
   */
  getOperations(): Array<{ id: string; priority: number; params: any }> {
    return this.operations.map(op => ({
      id: op.id,
      priority: op.priority,
      params: op.params
    }));
  }

  /**
   * Check if warming is currently active
   */
  isActive(): boolean {
    return this.intervalId !== undefined;
  }

  /**
   * Clear all statistics
   */
  resetStats(): void {
    this.stats = {
      totalCycles: 0,
      totalOperations: 0,
      successfulOperations: 0,
      totalItemsWarmed: 0,
      averageItemsPerOperation: 0,
      successRate: 0,
      activeOperations: this.stats.activeOperations, // Keep active count
      lastWarmingAt: undefined,
      nextWarmingAt: this.stats.nextWarmingAt
    };

    logger.debug('Statistics reset');
  }

  /**
   * Update internal statistics
   */
  private updateStats(results: WarmingResult[]): void {
    // Stats are updated in performWarmingOperation
  }

  /**
   * Generate a unique operation ID from parameters
   */
  private generateOperationId(params: any): string {
    return `warming_${JSON.stringify(params).replace(/[^a-zA-Z0-9]/g, '_')}`;
  }

  /**
   * Cleanup - stop warming and clear operations
   */
  cleanup(): void {
    this.stopPeriodicWarming();
    this.operations = [];
    this.activeOperations.clear();
    
    logger.debug('Cleaned up');
  }
}

/**
 * Factory function to create a CacheWarmer
 */
export function createCacheWarmer<T>(options: CacheWarmerOptions): CacheWarmer<T> {
  return new CacheWarmer<T>(options);
}
