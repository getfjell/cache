import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, get } from "../../src/ops/get";
import { CacheContext } from "../../src/CacheContext";
import { CacheEventEmitter } from "../../src/events/CacheEventEmitter";
import { TTLManager } from "../../src/ttl/TTLManager";
import { EvictionManager } from "../../src/eviction/EvictionManager";
import { CacheStatsManager } from "../../src/CacheStats";

describe("get operation edge cases", () => {
  let mockContext: any;
  let mockApi: any;
  let mockCacheMap: any;
  let mockTtlManager: any;
  let mockEvictionManager: any;
  let mockStatsManager: any;
  let mockEventEmitter: any;

  beforeEach(() => {
    mockApi = {
      get: vi.fn()
    };

    mockCacheMap = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      getMetadata: vi.fn(),
      setMetadata: vi.fn(),
      implementationType: "memory/test"
    };

    mockTtlManager = {
      isTTLEnabled: vi.fn().mockReturnValue(true),
      getDefaultTTL: vi.fn().mockReturnValue(3600),
      validateItem: vi.fn().mockResolvedValue(true),
      onItemAdded: vi.fn()
    };

    mockEvictionManager = {
      onItemAdded: vi.fn().mockResolvedValue([])
    };

    mockStatsManager = {
      incrementRequests: vi.fn(),
      incrementHits: vi.fn(),
      incrementMisses: vi.fn()
    };

    mockEventEmitter = {
      emit: vi.fn()
    };

    mockContext = {
      api: mockApi,
      cacheMap: mockCacheMap,
      pkType: "test",
      ttlManager: mockTtlManager,
      evictionManager: mockEvictionManager,
      statsManager: mockStatsManager,
      eventEmitter: mockEventEmitter,
      coordinate: { kta: ["test"] },
      options: {}
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("cache hit scenarios", () => {
    it("should return cached item when TTL is valid", async () => {
      const cachedItem = { key: { kt: "test", pk: "1" }, name: "cached" };
      mockCacheMap.get.mockResolvedValueOnce(cachedItem);
      mockTtlManager.validateItem.mockResolvedValueOnce(true);

      const [ctx, result] = await get({ kt: "test", pk: "1" } as any, mockContext);

      expect(result).toEqual(cachedItem);
      expect(mockApi.get).not.toHaveBeenCalled();
      expect(mockStatsManager.incrementHits).toHaveBeenCalledTimes(1);
    });

    it("should fetch from API when TTL is expired", async () => {
      const cachedItem = { key: { kt: "test", pk: "1" }, name: "cached" };
      const freshItem = { key: { kt: "test", pk: "1" }, name: "fresh" };
      
      mockCacheMap.get.mockResolvedValueOnce(cachedItem);
      mockTtlManager.validateItem.mockResolvedValueOnce(false);
      mockApi.get.mockResolvedValueOnce(freshItem);
      mockCacheMap.getMetadata.mockResolvedValueOnce(null);

      const [ctx, result] = await get({ kt: "test", pk: "1" } as any, mockContext);

      expect(result).toEqual(freshItem);
      expect(mockApi.get).toHaveBeenCalledTimes(1);
      expect(mockCacheMap.delete).toHaveBeenCalled();
      expect(mockStatsManager.incrementMisses).toHaveBeenCalled();
    });
  });

  describe("cache miss scenarios", () => {
    it("should fetch from API when item not in cache", async () => {
      const freshItem = { key: { kt: "test", pk: "1" }, name: "fresh" };
      
      mockCacheMap.get.mockResolvedValueOnce(null);
      mockApi.get.mockResolvedValueOnce(freshItem);
      mockCacheMap.getMetadata.mockResolvedValueOnce(null);

      const [ctx, result] = await get({ kt: "test", pk: "1" } as any, mockContext);

      expect(result).toEqual(freshItem);
      expect(mockApi.get).toHaveBeenCalledTimes(1);
      expect(mockCacheMap.set).toHaveBeenCalledWith(freshItem.key, freshItem);
    });

    it("should return null when API returns null", async () => {
      mockCacheMap.get.mockResolvedValueOnce(null);
      mockApi.get.mockResolvedValueOnce(null);

      const [ctx, result] = await get({ kt: "test", pk: "1" } as any, mockContext);

      expect(result).toBeNull();
      expect(mockCacheMap.set).not.toHaveBeenCalled();
    });
  });

  describe("in-flight request deduplication", () => {
    it("should deduplicate concurrent requests for same key", async () => {
      const freshItem = { key: { kt: "test", pk: "1" }, name: "fresh" };
      
      // Create a delayed promise to simulate slow API
      let resolveApi: (value: any) => void;
      const apiPromise = new Promise((resolve) => {
        resolveApi = resolve;
      });
      
      mockCacheMap.get.mockResolvedValue(null);
      mockApi.get.mockReturnValue(apiPromise);
      mockCacheMap.getMetadata.mockResolvedValue(null);

      // Make concurrent requests
      const promise1 = get({ kt: "test", pk: "1" } as any, mockContext);
      const promise2 = get({ kt: "test", pk: "1" } as any, mockContext);

      // Resolve the API call
      resolveApi!(freshItem);

      const [ctx1, result1] = await promise1;
      const [ctx2, result2] = await promise2;

      // Both should get same result
      expect(result1).toEqual(freshItem);
      expect(result2).toEqual(freshItem);
      
      // API should only be called once
      expect(mockApi.get).toHaveBeenCalledTimes(1);
    });

    it("should handle error in one request without affecting others", async () => {
      const error = new Error("API Error");
      
      mockCacheMap.get.mockResolvedValue(null);
      mockApi.get.mockRejectedValue(error);

      await expect(get({ kt: "test", pk: "1" } as any, mockContext))
        .rejects.toThrow("API Error");
    });
  });

  describe("bypass cache mode", () => {
    it("should skip cache when bypassCache is enabled", async () => {
      const freshItem = { key: { kt: "test", pk: "1" }, name: "fresh" };
      const cachedItem = { key: { kt: "test", pk: "1" }, name: "cached" };
      
      mockContext.options = { bypassCache: true };
      mockCacheMap.get.mockResolvedValueOnce(cachedItem);
      mockApi.get.mockResolvedValueOnce(freshItem);

      const [ctx, result] = await get({ kt: "test", pk: "1" } as any, mockContext);

      expect(result).toEqual(freshItem);
      expect(mockApi.get).toHaveBeenCalledTimes(1);
      // Should NOT set in cache when bypassing
      expect(mockCacheMap.set).not.toHaveBeenCalled();
    });

    it("should return null when API returns null in bypass mode", async () => {
      mockContext.options = { bypassCache: true };
      mockApi.get.mockResolvedValueOnce(null);

      const [ctx, result] = await get({ kt: "test", pk: "1" } as any, mockContext);

      expect(result).toBeNull();
    });
  });

  describe("TTL disabled mode", () => {
    it("should return cached item without TTL validation when TTL disabled", async () => {
      const cachedItem = { key: { kt: "test", pk: "1" }, name: "cached" };
      
      mockTtlManager.isTTLEnabled.mockReturnValue(false);
      mockCacheMap.get.mockResolvedValueOnce(cachedItem);

      const [ctx, result] = await get({ kt: "test", pk: "1" } as any, mockContext);

      expect(result).toEqual(cachedItem);
      expect(mockTtlManager.validateItem).not.toHaveBeenCalled();
      expect(mockApi.get).not.toHaveBeenCalled();
    });

    it("should fetch from API when cache miss with TTL disabled", async () => {
      const freshItem = { key: { kt: "test", pk: "1" }, name: "fresh" };
      
      mockTtlManager.isTTLEnabled.mockReturnValue(false);
      mockCacheMap.get.mockResolvedValueOnce(null);
      mockApi.get.mockResolvedValueOnce(freshItem);
      mockCacheMap.getMetadata.mockResolvedValueOnce(null);

      const [ctx, result] = await get({ kt: "test", pk: "1" } as any, mockContext);

      expect(result).toEqual(freshItem);
      expect(mockApi.get).toHaveBeenCalledTimes(1);
    });
  });

  describe("error handling", () => {
    it("should throw on invalid key", async () => {
      await expect(get({} as any, mockContext))
        .rejects.toThrow("Invalid key structure for get operation");
    });

    it("should throw on null key", async () => {
      await expect(get(null as any, mockContext))
        .rejects.toThrow("Invalid key structure for get operation");
    });

    it("should propagate API errors", async () => {
      mockCacheMap.get.mockResolvedValueOnce(null);
      mockApi.get.mockRejectedValueOnce(new Error("Network Error"));

      await expect(get({ kt: "test", pk: "1" } as any, mockContext))
        .rejects.toThrow("Network Error");
    });
  });

  describe("eviction integration", () => {
    it("should trigger eviction after caching new item", async () => {
      const freshItem = { key: { kt: "test", pk: "1" }, name: "fresh" };
      const evictedKey = JSON.stringify({ kt: "test", pk: "evicted" });
      
      mockCacheMap.get.mockResolvedValueOnce(null);
      mockApi.get.mockResolvedValueOnce(freshItem);
      mockCacheMap.getMetadata.mockResolvedValueOnce(null);
      mockEvictionManager.onItemAdded.mockResolvedValueOnce([evictedKey]);

      await get({ kt: "test", pk: "1" } as any, mockContext);

      expect(mockEvictionManager.onItemAdded).toHaveBeenCalled();
      expect(mockCacheMap.delete).toHaveBeenCalled();
    });

    it("should handle empty eviction result", async () => {
      const freshItem = { key: { kt: "test", pk: "1" }, name: "fresh" };
      
      mockCacheMap.get.mockResolvedValueOnce(null);
      mockApi.get.mockResolvedValueOnce(freshItem);
      mockCacheMap.getMetadata.mockResolvedValueOnce(null);
      mockEvictionManager.onItemAdded.mockResolvedValueOnce([]);

      await get({ kt: "test", pk: "1" } as any, mockContext);

      expect(mockEvictionManager.onItemAdded).toHaveBeenCalled();
      // delete should not be called for eviction (only for expired items)
    });
  });

  describe("metadata handling", () => {
    it("should create metadata for new items", async () => {
      const freshItem = { key: { kt: "test", pk: "1" }, name: "fresh" };
      
      mockCacheMap.get.mockResolvedValueOnce(null);
      mockApi.get.mockResolvedValueOnce(freshItem);
      mockCacheMap.getMetadata.mockResolvedValueOnce(null);

      await get({ kt: "test", pk: "1" } as any, mockContext);

      expect(mockCacheMap.setMetadata).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          addedAt: expect.any(Number),
          lastAccessedAt: expect.any(Number),
          accessCount: 1,
          estimatedSize: expect.any(Number)
        })
      );
    });

    it("should not overwrite existing metadata", async () => {
      const freshItem = { key: { kt: "test", pk: "1" }, name: "fresh" };
      const existingMetadata = { addedAt: Date.now() - 1000, accessCount: 5 };
      
      mockCacheMap.get.mockResolvedValueOnce(null);
      mockApi.get.mockResolvedValueOnce(freshItem);
      mockCacheMap.getMetadata.mockResolvedValueOnce(existingMetadata);

      await get({ kt: "test", pk: "1" } as any, mockContext);

      expect(mockCacheMap.setMetadata).not.toHaveBeenCalled();
    });
  });

  describe("event emission", () => {
    it("should emit item_retrieved event for API fetch", async () => {
      const freshItem = { key: { kt: "test", pk: "1" }, name: "fresh" };
      
      mockCacheMap.get.mockResolvedValueOnce(null);
      mockApi.get.mockResolvedValueOnce(freshItem);
      mockCacheMap.getMetadata.mockResolvedValueOnce(null);

      await get({ kt: "test", pk: "1" } as any, mockContext);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "item_retrieved",
          source: "api"
        })
      );
    });
  });
});

describe("get operation cleanup", () => {
  it("should export cleanup function", () => {
    expect(typeof cleanup).toBe("function");
    // Should not throw
    cleanup();
  });
});
