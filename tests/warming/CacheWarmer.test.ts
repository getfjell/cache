/**
 * Cache Warmer Tests
 *
 * Tests the proactive cache population system
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CacheWarmer } from '../../src/cache/warming/CacheWarmer.js';
import { WarmingQuery } from '../../src/ttl/TTLConfig.js';

// Mock data interface
interface TestItem {
  id: string;
  value: number;
  category: string;
}

describe('CacheWarmer', () => {
  let warmer: CacheWarmer<TestItem>;
  let mockFetcher: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    warmer = new CacheWarmer<TestItem>({
      interval: 1000,  // 1 second for testing
      maxConcurrency: 3,
      operationTimeout: 500,  // 500ms for testing
      continueOnError: true,
      debug: false
    });

    mockFetcher = vi.fn();
  });

  afterEach(() => {
    warmer.cleanup();
    vi.clearAllMocks();
  });

  describe('Operation Management', () => {
    it('should add operations', () => {
      const operation = {
        id: 'test-op',
        params: { category: 'A' },
        priority: 5,
        fetcher: mockFetcher
      };

      warmer.addOperation(operation);

      const operations = warmer.getOperations();
      expect(operations).toHaveLength(1);
      expect(operations[0]).toEqual({
        id: 'test-op',
        priority: 5,
        params: { category: 'A' }
      });
    });

    it('should sort operations by priority', () => {
      warmer.addOperation({
        id: 'low-priority',
        params: { category: 'A' },
        priority: 1,
        fetcher: mockFetcher
      });

      warmer.addOperation({
        id: 'high-priority',
        params: { category: 'B' },
        priority: 10,
        fetcher: mockFetcher
      });

      warmer.addOperation({
        id: 'med-priority',
        params: { category: 'C' },
        priority: 5,
        fetcher: mockFetcher
      });

      const operations = warmer.getOperations();
      expect(operations.map(op => op.id)).toEqual([
        'high-priority',
        'med-priority',
        'low-priority'
      ]);
    });

    it('should replace existing operations with same ID', () => {
      const operation1 = {
        id: 'test-op',
        params: { category: 'A' },
        priority: 5,
        fetcher: mockFetcher
      };

      const operation2 = {
        id: 'test-op',
        params: { category: 'B' },
        priority: 8,
        fetcher: mockFetcher
      };

      warmer.addOperation(operation1);
      warmer.addOperation(operation2);

      const operations = warmer.getOperations();
      expect(operations).toHaveLength(1);
      expect(operations[0].priority).toBe(8);
      expect(operations[0].params.category).toBe('B');
    });

    it('should remove operations', () => {
      warmer.addOperation({
        id: 'test-op',
        params: { category: 'A' },
        priority: 5,
        fetcher: mockFetcher
      });

      expect(warmer.getOperations()).toHaveLength(1);

      const removed = warmer.removeOperation('test-op');
      expect(removed).toBe(true);
      expect(warmer.getOperations()).toHaveLength(0);

      // Try removing non-existent operation
      const notRemoved = warmer.removeOperation('non-existent');
      expect(notRemoved).toBe(false);
    });
  });

  describe('Configuration-based Operations', () => {
    it('should add operations from warming config', () => {
      const queries: WarmingQuery[] = [
        { params: { category: 'A' }, priority: 5 },
        { params: { category: 'B', limit: 10 }, priority: 8, ttlMultiplier: 1.5 }
      ];

      const fetcherFactory = (params: any) => () => Promise.resolve([
        { id: '1', value: 100, category: params.category }
      ]);

      warmer.addOperationsFromConfig(queries, fetcherFactory);

      const operations = warmer.getOperations();
      expect(operations).toHaveLength(2);
      expect(operations[0].priority).toBe(8); // Should be sorted by priority
      expect(operations[1].priority).toBe(5);
    });
  });

  describe('Single Warming Operation', () => {
    it('should perform successful warming operation', async () => {
      const testItems: TestItem[] = [
        { id: '1', value: 100, category: 'A' },
        { id: '2', value: 200, category: 'A' }
      ];

      mockFetcher.mockResolvedValue(testItems);

      warmer.addOperation({
        id: 'test-op',
        params: { category: 'A' },
        priority: 5,
        fetcher: mockFetcher
      });

      const results = await warmer.warmOperations(['test-op']);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        operationId: 'test-op',
        success: true,
        itemsWarmed: 2,
        duration: expect.any(Number)
      });
      expect(mockFetcher).toHaveBeenCalledOnce();
    });

    it('should handle operation failure', async () => {
      const error = new Error('Fetch failed');
      mockFetcher.mockRejectedValue(error);

      warmer.addOperation({
        id: 'failing-op',
        params: { category: 'A' },
        priority: 5,
        fetcher: mockFetcher
      });

      const results = await warmer.warmOperations(['failing-op']);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        operationId: 'failing-op',
        success: false,
        itemsWarmed: 0,
        duration: expect.any(Number),
        error: 'Fetch failed'
      });
    });

    it('should handle operation timeout', async () => {
      // Create a promise that never resolves
      const slowPromise = new Promise(() => {}); // Never resolves
      mockFetcher.mockReturnValue(slowPromise);

      warmer.addOperation({
        id: 'slow-op',
        params: { category: 'A' },
        priority: 5,
        fetcher: mockFetcher
      });

      const results = await warmer.warmOperations(['slow-op']);

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toBe('Operation timeout');
    });
  });

  describe('Warming Cycles', () => {
    it('should perform warming cycle with multiple operations', async () => {
      const items1 = [{ id: '1', value: 100, category: 'A' }];
      const items2 = [{ id: '2', value: 200, category: 'B' }];

      const fetcher1 = vi.fn().mockResolvedValue(items1);
      const fetcher2 = vi.fn().mockResolvedValue(items2);

      warmer.addOperation({
        id: 'op-1',
        params: { category: 'A' },
        priority: 5,
        fetcher: fetcher1
      });

      warmer.addOperation({
        id: 'op-2',
        params: { category: 'B' },
        priority: 8,
        fetcher: fetcher2
      });

      const results = await warmer.performWarmingCycle();

      expect(results).toHaveLength(2);
      expect(results.every(r => r.success)).toBe(true);
      expect(results.map(r => r.itemsWarmed)).toEqual([1, 1]);
      expect(fetcher1).toHaveBeenCalledOnce();
      expect(fetcher2).toHaveBeenCalledOnce();
    });

    it('should respect concurrency limits', async () => {
      // Create warmer with concurrency limit of 1
      const limitedWarmer = new CacheWarmer<TestItem>({
        interval: 1000,
        maxConcurrency: 1,
        operationTimeout: 100,
        debug: false
      });

      const slowFetcher = vi.fn().mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve([]), 50))
      );

      // Add multiple operations
      for (let i = 0; i < 3; i++) {
        limitedWarmer.addOperation({
          id: `op-${i}`,
          params: { id: i },
          priority: 5,
          fetcher: slowFetcher
        });
      }

      const startTime = Date.now();
      const results = await limitedWarmer.performWarmingCycle();
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(3);
      expect(results.every(r => r.success)).toBe(true);
      
      // With concurrency of 1, operations should run sequentially
      // Total time should be at least 3 * 50ms = 150ms
      expect(duration).toBeGreaterThan(120);

      limitedWarmer.cleanup();
    });

    it('should handle empty operations list', async () => {
      const results = await warmer.performWarmingCycle();
      
      expect(results).toHaveLength(0);
    });

    it('should continue on error when configured', async () => {
      const successFetcher = vi.fn().mockResolvedValue([{ id: '1', value: 100, category: 'A' }]);
      const errorFetcher = vi.fn().mockRejectedValue(new Error('Test error'));

      warmer.addOperation({
        id: 'success-op',
        params: { category: 'A' },
        priority: 5,
        fetcher: successFetcher
      });

      warmer.addOperation({
        id: 'error-op',
        params: { category: 'B' },
        priority: 8,
        fetcher: errorFetcher
      });

      const results = await warmer.performWarmingCycle();

      expect(results).toHaveLength(2);
      expect(results.some(r => r.success)).toBe(true);  // At least one succeeded
      expect(results.some(r => !r.success)).toBe(true); // At least one failed
    });
  });

  describe('Periodic Warming', () => {
    it('should start and stop periodic warming', () => {
      expect(warmer.isActive()).toBe(false);

      warmer.startPeriodicWarming();
      expect(warmer.isActive()).toBe(true);

      warmer.stopPeriodicWarming();
      expect(warmer.isActive()).toBe(false);
    });

    it('should update next warming time', () => {
      warmer.startPeriodicWarming();

      const stats = warmer.getStats();
      expect(stats.nextWarmingAt).toBeDefined();
      expect(stats.nextWarmingAt!.getTime()).toBeGreaterThan(Date.now());

      warmer.stopPeriodicWarming();
    });
  });

  describe('Statistics', () => {
    it('should track basic statistics', async () => {
      const items = [{ id: '1', value: 100, category: 'A' }];
      mockFetcher.mockResolvedValue(items);

      warmer.addOperation({
        id: 'test-op',
        params: { category: 'A' },
        priority: 5,
        fetcher: mockFetcher
      });

      // Perform multiple warming cycles
      await warmer.performWarmingCycle();
      await warmer.performWarmingCycle();

      const stats = warmer.getStats();

      expect(stats.totalCycles).toBe(2);
      expect(stats.totalOperations).toBe(2);
      expect(stats.successfulOperations).toBe(2);
      expect(stats.totalItemsWarmed).toBe(2);
      expect(stats.averageItemsPerOperation).toBe(1);
      expect(stats.successRate).toBe(1);
      expect(stats.activeOperations).toBe(0);
      expect(stats.lastWarmingAt).toBeDefined();
    });

    it('should calculate success rate correctly', async () => {
      const successFetcher = vi.fn().mockResolvedValue([{ id: '1', value: 100, category: 'A' }]);
      const errorFetcher = vi.fn().mockRejectedValue(new Error('Test error'));

      warmer.addOperation({
        id: 'success-op',
        params: { category: 'A' },
        priority: 5,
        fetcher: successFetcher
      });

      warmer.addOperation({
        id: 'error-op',
        params: { category: 'B' },
        priority: 8,
        fetcher: errorFetcher
      });

      await warmer.performWarmingCycle();

      const stats = warmer.getStats();
      expect(stats.totalOperations).toBe(2);
      expect(stats.successfulOperations).toBe(1);
      expect(stats.successRate).toBe(0.5);
    });

    it('should reset statistics', async () => {
      mockFetcher.mockResolvedValue([]);
      
      warmer.addOperation({
        id: 'test-op',
        params: { category: 'A' },
        priority: 5,
        fetcher: mockFetcher
      });

      await warmer.performWarmingCycle();

      let stats = warmer.getStats();
      expect(stats.totalCycles).toBe(1);

      warmer.resetStats();

      stats = warmer.getStats();
      expect(stats.totalCycles).toBe(0);
      expect(stats.totalOperations).toBe(0);
      expect(stats.successfulOperations).toBe(0);
      expect(stats.totalItemsWarmed).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle duplicate concurrent operations', async () => {
      const items = [{ id: '1', value: 100, category: 'A' }];
      
      // Create a slow fetcher
      const slowFetcher = vi.fn().mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve(items), 100))
      );

      warmer.addOperation({
        id: 'slow-op',
        params: { category: 'A' },
        priority: 5,
        fetcher: slowFetcher
      });

      // Start two warming operations simultaneously
      const promise1 = warmer.warmOperations(['slow-op']);
      const promise2 = warmer.warmOperations(['slow-op']);

      const [results1, results2] = await Promise.all([promise1, promise2]);

      // One should succeed, one should be blocked
      const allResults = [...results1, ...results2];
      const successCount = allResults.filter(r => r.success).length;
      const alreadyRunningCount = allResults.filter(r => r.error === 'Operation already running').length;

      expect(successCount).toBe(1);
      expect(alreadyRunningCount).toBe(1);
    });

    it('should handle warming non-existent operations', async () => {
      const results = await warmer.warmOperations(['non-existent']);
      
      expect(results).toHaveLength(0);
    });

    it('should cleanup properly', () => {
      warmer.addOperation({
        id: 'test-op',
        params: { category: 'A' },
        priority: 5,
        fetcher: mockFetcher
      });

      warmer.startPeriodicWarming();
      expect(warmer.isActive()).toBe(true);
      expect(warmer.getOperations()).toHaveLength(1);

      warmer.cleanup();

      expect(warmer.isActive()).toBe(false);
      expect(warmer.getOperations()).toHaveLength(0);
    });
  });
});
