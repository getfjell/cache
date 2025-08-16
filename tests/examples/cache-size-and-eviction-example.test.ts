import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { demonstrateCacheSizeLimits, monitorCachePerformance } from '../../examples/cache-size-and-eviction-example';

describe('Cache Size and Eviction Example', () => {
  let consoleSpy: { log: any; error: any; warn: any };

  beforeEach(() => {
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => { }),
      error: vi.spyOn(console, 'error').mockImplementation(() => { }),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => { })
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('demonstrateCacheSizeLimits', () => {
    it('should log the demonstration header and placeholder message', () => {
      demonstrateCacheSizeLimits();

      expect(consoleSpy.log).toHaveBeenCalledWith('=== Cache Size Limits and Eviction Policies Demo ===\n');
      expect(consoleSpy.log).toHaveBeenCalledWith('This is a placeholder demonstration.');
      expect(consoleSpy.log).toHaveBeenCalledWith('For working examples, see the integration tests in the tests directory.');
      expect(consoleSpy.log).toHaveBeenCalledWith('\n=== Demo Complete ===');
    });

    it('should call console.log exactly 4 times', () => {
      demonstrateCacheSizeLimits();

      expect(consoleSpy.log).toHaveBeenCalledTimes(4);
    });
  });

  describe('monitorCachePerformance', () => {
    it('should display basic cache statistics with default label', () => {
      const mockCache = {
        getStats: vi.fn().mockReturnValue({
          currentItemCount: 5,
          currentSizeBytes: 1024,
          maxItems: 10,
          maxSizeBytes: 2048
        })
      };

      monitorCachePerformance(mockCache);

      expect(consoleSpy.log).toHaveBeenCalledWith('\nCache Performance:');
      expect(consoleSpy.log).toHaveBeenCalledWith('  Items: 5/10');
      expect(consoleSpy.log).toHaveBeenCalledWith('  Size: 1.0 KB/2.0 KB');
    });

    it('should display cache statistics with custom label', () => {
      const mockCache = {
        getStats: vi.fn().mockReturnValue({
          currentItemCount: 3,
          currentSizeBytes: 512,
          maxItems: 20,
          maxSizeBytes: 4096
        })
      };

      monitorCachePerformance(mockCache, 'Custom Cache');

      expect(consoleSpy.log).toHaveBeenCalledWith('\nCustom Cache Performance:');
      expect(consoleSpy.log).toHaveBeenCalledWith('  Items: 3/20');
      expect(consoleSpy.log).toHaveBeenCalledWith('  Size: 512 B/4.1 KB');
    });

    it('should handle cache without size limits', () => {
      const mockCache = {
        getStats: vi.fn().mockReturnValue({
          currentItemCount: 7,
          currentSizeBytes: 1536
        })
      };

      monitorCachePerformance(mockCache);

      expect(consoleSpy.log).toHaveBeenCalledWith('\nCache Performance:');
      expect(consoleSpy.log).toHaveBeenCalledWith('  Items: 7');
      expect(consoleSpy.log).toHaveBeenCalledWith('  Size: 1.5 KB');
    });

    it('should display utilization percentages when available', () => {
      const mockCache = {
        getStats: vi.fn().mockReturnValue({
          currentItemCount: 8,
          currentSizeBytes: 1600,
          maxItems: 10,
          maxSizeBytes: 2000,
          utilizationPercent: {
            items: 80.0,
            bytes: 80.0
          }
        })
      };

      monitorCachePerformance(mockCache);

      expect(consoleSpy.log).toHaveBeenCalledWith('\nCache Performance:');
      expect(consoleSpy.log).toHaveBeenCalledWith('  Items: 8/10');
      expect(consoleSpy.log).toHaveBeenCalledWith('  Size: 1.6 KB/2 KB');
      expect(consoleSpy.log).toHaveBeenCalledWith('  Item Utilization: 80.0%');
      expect(consoleSpy.log).toHaveBeenCalledWith('  Size Utilization: 80.0%');
    });

    it('should handle partial utilization data', () => {
      const mockCache = {
        getStats: vi.fn().mockReturnValue({
          currentItemCount: 5,
          currentSizeBytes: 1000,
          maxItems: 10,
          maxSizeBytes: 2000,
          utilizationPercent: {
            items: 50.0
            // bytes not provided
          }
        })
      };

      monitorCachePerformance(mockCache);

      expect(consoleSpy.log).toHaveBeenCalledWith('\nCache Performance:');
      expect(consoleSpy.log).toHaveBeenCalledWith('  Items: 5/10');
      expect(consoleSpy.log).toHaveBeenCalledWith('  Size: 1 KB/2 KB');
      expect(consoleSpy.log).toHaveBeenCalledWith('  Item Utilization: 50.0%');
      // Should not call size utilization
    });

    it('should handle empty cache', () => {
      const mockCache = {
        getStats: vi.fn().mockReturnValue({
          currentItemCount: 0,
          currentSizeBytes: 0,
          maxItems: 100,
          maxSizeBytes: 1024
        })
      };

      monitorCachePerformance(mockCache);

      expect(consoleSpy.log).toHaveBeenCalledWith('\nCache Performance:');
      expect(consoleSpy.log).toHaveBeenCalledWith('  Items: 0/100');
      expect(consoleSpy.log).toHaveBeenCalledWith('  Size: 0 B/1.0 KB');
    });

    it('should handle large cache sizes', () => {
      const mockCache = {
        getStats: vi.fn().mockReturnValue({
          currentItemCount: 1000,
          currentSizeBytes: 1048576, // 1 MB
          maxItems: 5000,
          maxSizeBytes: 5242880 // 5 MB
        })
      };

      monitorCachePerformance(mockCache);

      expect(consoleSpy.log).toHaveBeenCalledWith('\nCache Performance:');
      expect(consoleSpy.log).toHaveBeenCalledWith('  Items: 1000/5000');
      expect(consoleSpy.log).toHaveBeenCalledWith('  Size: 1.0 MB/5.2 MB');
    });

    it('should handle very large cache sizes', () => {
      const mockCache = {
        getStats: vi.fn().mockReturnValue({
          currentItemCount: 10000,
          currentSizeBytes: 1073741824, // 1 GB
          maxItems: 50000,
          maxSizeBytes: 5368709120 // 5 GB
        })
      };

      monitorCachePerformance(mockCache);

      expect(consoleSpy.log).toHaveBeenCalledWith('\nCache Performance:');
      expect(consoleSpy.log).toHaveBeenCalledWith('  Items: 10000/50000');
      expect(consoleSpy.log).toHaveBeenCalledWith('  Size: 1.1 GB/5.4 GB');
    });

    it('should handle cache with only item limits', () => {
      const mockCache = {
        getStats: vi.fn().mockReturnValue({
          currentItemCount: 15,
          currentSizeBytes: 2048,
          maxItems: 50
          // no maxSizeBytes
        })
      };

      monitorCachePerformance(mockCache);

      expect(consoleSpy.log).toHaveBeenCalledWith('\nCache Performance:');
      expect(consoleSpy.log).toHaveBeenCalledWith('  Items: 15/50');
      expect(consoleSpy.log).toHaveBeenCalledWith('  Size: 2.0 KB');
    });

    it('should handle cache with only size limits', () => {
      const mockCache = {
        getStats: vi.fn().mockReturnValue({
          currentItemCount: 25,
          currentSizeBytes: 3072,
          maxSizeBytes: 8192
          // no maxItems
        })
      };

      monitorCachePerformance(mockCache);

      expect(consoleSpy.log).toHaveBeenCalledWith('\nCache Performance:');
      expect(consoleSpy.log).toHaveBeenCalledWith('  Items: 25');
      expect(consoleSpy.log).toHaveBeenCalledWith('  Size: 3.1 KB/8.2 KB');
    });

    it('should handle cache with no limits at all', () => {
      const mockCache = {
        getStats: vi.fn().mockReturnValue({
          currentItemCount: 42,
          currentSizeBytes: 4096
          // no limits
        })
      };

      monitorCachePerformance(mockCache);

      expect(consoleSpy.log).toHaveBeenCalledWith('\nCache Performance:');
      expect(consoleSpy.log).toHaveBeenCalledWith('  Items: 42');
      expect(consoleSpy.log).toHaveBeenCalledWith('  Size: 4.1 KB');
    });

    it('should handle cache with zero utilization percentages', () => {
      const mockCache = {
        getStats: vi.fn().mockReturnValue({
          currentItemCount: 0,
          currentSizeBytes: 0,
          maxItems: 100,
          maxSizeBytes: 1024,
          utilizationPercent: {
            items: 0.0,
            bytes: 0.0
          }
        })
      };

      monitorCachePerformance(mockCache);

      expect(consoleSpy.log).toHaveBeenCalledWith('\nCache Performance:');
      expect(consoleSpy.log).toHaveBeenCalledWith('  Items: 0/100');
      expect(consoleSpy.log).toHaveBeenCalledWith('  Size: 0 B/1.0 KB');
      expect(consoleSpy.log).toHaveBeenCalledWith('  Item Utilization: 0.0%');
      expect(consoleSpy.log).toHaveBeenCalledWith('  Size Utilization: 0.0%');
    });

    it('should handle cache with high utilization percentages', () => {
      const mockCache = {
        getStats: vi.fn().mockReturnValue({
          currentItemCount: 95,
          currentSizeBytes: 950,
          maxItems: 100,
          maxSizeBytes: 1000,
          utilizationPercent: {
            items: 95.0,
            bytes: 95.0
          }
        })
      };

      monitorCachePerformance(mockCache);

      expect(consoleSpy.log).toHaveBeenCalledWith('\nCache Performance:');
      expect(consoleSpy.log).toHaveBeenCalledWith('  Items: 95/100');
      expect(consoleSpy.log).toHaveBeenCalledWith('  Size: 950 B/1 KB');
      expect(consoleSpy.log).toHaveBeenCalledWith('  Item Utilization: 95.0%');
      expect(consoleSpy.log).toHaveBeenCalledWith('  Size Utilization: 95.0%');
    });

    it('should handle cache with decimal utilization percentages', () => {
      const mockCache = {
        getStats: vi.fn().mockReturnValue({
          currentItemCount: 33,
          currentSizeBytes: 333,
          maxItems: 100,
          maxSizeBytes: 1000,
          utilizationPercent: {
            items: 33.3,
            bytes: 33.3
          }
        })
      };

      monitorCachePerformance(mockCache);

      expect(consoleSpy.log).toHaveBeenCalledWith('\nCache Performance:');
      expect(consoleSpy.log).toHaveBeenCalledWith('  Items: 33/100');
      expect(consoleSpy.log).toHaveBeenCalledWith('  Size: 333 B/1 KB');
      expect(consoleSpy.log).toHaveBeenCalledWith('  Item Utilization: 33.3%');
      expect(consoleSpy.log).toHaveBeenCalledWith('  Size Utilization: 33.3%');
    });
  });
});
