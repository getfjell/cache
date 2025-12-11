import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { find } from "../../src/ops/find";
import { CacheContext } from "../../src/CacheContext";

describe("find operation edge cases", () => {
  let mockContext: any;
  let mockApi: any;
  let mockCacheMap: any;
  let mockTtlManager: any;
  let mockEvictionManager: any;
  let mockEventEmitter: any;

  beforeEach(() => {
    mockApi = {
      find: vi.fn()
    };

    mockCacheMap = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      getQueryResult: vi.fn(),
      setQueryResult: vi.fn(),
      deleteQueryResult: vi.fn(),
      implementationType: "memory/test"
    };

    mockTtlManager = {
      onItemAdded: vi.fn()
    };

    mockEvictionManager = {
      onItemAdded: vi.fn().mockResolvedValue([])
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
      eventEmitter: mockEventEmitter,
      coordinate: { kta: ["test"] },
      options: {}
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("query cache hit scenarios", () => {
    it("should return cached results when all items available", async () => {
      const item1 = { key: { kt: "test", pk: "1" }, name: "item1" };
      const item2 = { key: { kt: "test", pk: "2" }, name: "item2" };
      const cachedKeys = [item1.key, item2.key];
      
      mockCacheMap.getQueryResult.mockResolvedValueOnce(cachedKeys);
      mockCacheMap.get.mockImplementation((key: any) => {
        if (key.pk === "1") return Promise.resolve(item1);
        if (key.pk === "2") return Promise.resolve(item2);
        return Promise.resolve(null);
      });

      const [ctx, result] = await find("testFinder", {}, [], mockContext);

      expect(result.items).toHaveLength(2);
      expect(result.items).toContainEqual(item1);
      expect(result.items).toContainEqual(item2);
      expect(mockApi.find).not.toHaveBeenCalled();
    });

    it("should invalidate query cache when some items missing", async () => {
      const item1 = { key: { kt: "test", pk: "1" }, name: "item1" };
      const cachedKeys = [{ kt: "test", pk: "1" }, { kt: "test", pk: "2" }];
      const freshResult = {
        items: [item1],
        metadata: { total: 1, returned: 1, offset: 0, hasMore: false }
      };
      
      mockCacheMap.getQueryResult.mockResolvedValueOnce(cachedKeys);
      mockCacheMap.get.mockImplementation((key: any) => {
        if (key.pk === "1") return Promise.resolve(item1);
        return Promise.resolve(null); // item2 is missing
      });
      mockApi.find.mockResolvedValueOnce(freshResult);

      const [ctx, result] = await find("testFinder", {}, [], mockContext);

      expect(mockCacheMap.deleteQueryResult).toHaveBeenCalled();
      expect(mockApi.find).toHaveBeenCalled();
    });
  });

  describe("query cache miss scenarios", () => {
    it("should fetch from API and cache results on miss", async () => {
      const item1 = { key: { kt: "test", pk: "1" }, name: "item1" };
      const freshResult = {
        items: [item1],
        metadata: { total: 1, returned: 1, offset: 0, hasMore: false }
      };
      
      mockCacheMap.getQueryResult.mockResolvedValueOnce(null);
      mockApi.find.mockResolvedValueOnce(freshResult);

      const [ctx, result] = await find("testFinder", {}, [], mockContext);

      expect(result.items).toHaveLength(1);
      expect(mockCacheMap.set).toHaveBeenCalledWith(item1.key, item1);
      expect(mockCacheMap.setQueryResult).toHaveBeenCalled();
    });

    it("should handle empty results from API", async () => {
      const freshResult = {
        items: [],
        metadata: { total: 0, returned: 0, offset: 0, hasMore: false }
      };
      
      mockCacheMap.getQueryResult.mockResolvedValueOnce(null);
      mockApi.find.mockResolvedValueOnce(freshResult);

      const [ctx, result] = await find("testFinder", {}, [], mockContext);

      expect(result.items).toHaveLength(0);
      expect(mockCacheMap.setQueryResult).toHaveBeenCalled();
    });
  });

  describe("pagination handling", () => {
    it("should apply pagination to cached results", async () => {
      const items = [
        { key: { kt: "test", pk: "1" }, name: "item1" },
        { key: { kt: "test", pk: "2" }, name: "item2" },
        { key: { kt: "test", pk: "3" }, name: "item3" },
        { key: { kt: "test", pk: "4" }, name: "item4" }
      ];
      const cachedKeys = items.map(i => i.key);
      
      mockCacheMap.getQueryResult.mockResolvedValueOnce(cachedKeys);
      mockCacheMap.get.mockImplementation((key: any) => {
        const item = items.find(i => i.key.pk === key.pk);
        return Promise.resolve(item || null);
      });

      const [ctx, result] = await find(
        "testFinder",
        {},
        [],
        mockContext,
        { limit: 2, offset: 1 }
      );

      expect(result.items).toHaveLength(2);
      expect(result.items[0].name).toBe("item2");
      expect(result.items[1].name).toBe("item3");
      expect(result.metadata.total).toBe(4);
      expect(result.metadata.returned).toBe(2);
      expect(result.metadata.hasMore).toBe(true);
    });

    it("should handle offset beyond available items", async () => {
      const items = [
        { key: { kt: "test", pk: "1" }, name: "item1" }
      ];
      const cachedKeys = items.map(i => i.key);
      
      mockCacheMap.getQueryResult.mockResolvedValueOnce(cachedKeys);
      mockCacheMap.get.mockImplementation((key: any) => {
        const item = items.find(i => i.key.pk === key.pk);
        return Promise.resolve(item || null);
      });

      const [ctx, result] = await find(
        "testFinder",
        {},
        [],
        mockContext,
        { limit: 10, offset: 100 }
      );

      expect(result.items).toHaveLength(0);
      expect(result.metadata.hasMore).toBe(false);
    });

    it("should handle limit of 0", async () => {
      const items = [
        { key: { kt: "test", pk: "1" }, name: "item1" }
      ];
      const cachedKeys = items.map(i => i.key);
      
      mockCacheMap.getQueryResult.mockResolvedValueOnce(cachedKeys);
      mockCacheMap.get.mockImplementation((key: any) => {
        const item = items.find(i => i.key.pk === key.pk);
        return Promise.resolve(item || null);
      });

      const [ctx, result] = await find(
        "testFinder",
        {},
        [],
        mockContext,
        { limit: 0, offset: 0 }
      );

      expect(result.items).toHaveLength(0);
    });
  });

  describe("bypass cache mode", () => {
    it("should skip cache when bypassCache is enabled", async () => {
      const cachedItems = [{ key: { kt: "test", pk: "cached" }, name: "cached" }];
      const freshItems = [{ key: { kt: "test", pk: "fresh" }, name: "fresh" }];
      
      mockContext.options = { bypassCache: true };
      mockCacheMap.getQueryResult.mockResolvedValueOnce(cachedItems.map(i => i.key));
      mockApi.find.mockResolvedValueOnce({
        items: freshItems,
        metadata: { total: 1, returned: 1, offset: 0, hasMore: false }
      });

      const [ctx, result] = await find("testFinder", {}, [], mockContext);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe("fresh");
      expect(mockCacheMap.getQueryResult).not.toHaveBeenCalled();
    });

    it("should not cache results when bypassCache is enabled", async () => {
      mockContext.options = { bypassCache: true };
      mockApi.find.mockResolvedValueOnce({
        items: [{ key: { kt: "test", pk: "1" }, name: "item" }],
        metadata: { total: 1, returned: 1, offset: 0, hasMore: false }
      });

      await find("testFinder", {}, [], mockContext);

      expect(mockCacheMap.set).not.toHaveBeenCalled();
      expect(mockCacheMap.setQueryResult).not.toHaveBeenCalled();
    });
  });

  describe("eviction during find", () => {
    it("should handle eviction of items during caching", async () => {
      const items = [
        { key: { kt: "test", pk: "1" }, name: "item1" },
        { key: { kt: "test", pk: "2" }, name: "item2" }
      ];
      
      mockCacheMap.getQueryResult.mockResolvedValueOnce(null);
      mockApi.find.mockResolvedValueOnce({
        items,
        metadata: { total: 2, returned: 2, offset: 0, hasMore: false }
      });
      
      // First item causes eviction
      mockEvictionManager.onItemAdded
        .mockResolvedValueOnce(['{"kt":"test","pk":"old"}'])
        .mockResolvedValueOnce([]);

      const [ctx, result] = await find("testFinder", {}, [], mockContext);

      expect(result.items).toHaveLength(2);
      expect(mockCacheMap.delete).toHaveBeenCalled();
    });
  });

  describe("parameter normalization", () => {
    it("should generate consistent hash for equivalent parameters", async () => {
      mockCacheMap.getQueryResult.mockResolvedValue(null);
      mockApi.find.mockResolvedValue({
        items: [],
        metadata: { total: 0, returned: 0, offset: 0, hasMore: false }
      });

      // First call
      await find("testFinder", { a: "1", b: "2" }, [], mockContext);
      const firstCall = mockCacheMap.setQueryResult.mock.calls[0][0];

      mockCacheMap.setQueryResult.mockClear();

      // Second call with same params in different order
      await find("testFinder", { b: "2", a: "1" }, [], mockContext);
      const secondCall = mockCacheMap.setQueryResult.mock.calls[0][0];

      expect(firstCall).toBe(secondCall);
    });

    it("should handle Date parameters", async () => {
      mockCacheMap.getQueryResult.mockResolvedValue(null);
      mockApi.find.mockResolvedValue({
        items: [],
        metadata: { total: 0, returned: 0, offset: 0, hasMore: false }
      });

      const date = new Date("2024-01-01");
      
      // Should not throw
      await expect(find("testFinder", { date }, [], mockContext))
        .resolves.toBeDefined();
    });

    it("should handle array parameters", async () => {
      mockCacheMap.getQueryResult.mockResolvedValue(null);
      mockApi.find.mockResolvedValue({
        items: [],
        metadata: { total: 0, returned: 0, offset: 0, hasMore: false }
      });

      // Should not throw
      await expect(find("testFinder", { ids: [1, 2, 3] }, [], mockContext))
        .resolves.toBeDefined();
    });
  });

  describe("error handling", () => {
    it("should propagate API errors", async () => {
      mockCacheMap.getQueryResult.mockResolvedValueOnce(null);
      mockApi.find.mockRejectedValueOnce(new Error("API Error"));

      await expect(find("testFinder", {}, [], mockContext))
        .rejects.toThrow("API Error");
    });

    it("should handle cache errors gracefully", async () => {
      mockCacheMap.getQueryResult.mockRejectedValueOnce(new Error("Cache Error"));
      mockApi.find.mockResolvedValueOnce({
        items: [{ key: { kt: "test", pk: "1" }, name: "item" }],
        metadata: { total: 1, returned: 1, offset: 0, hasMore: false }
      });

      // Should fall back to API
      const [ctx, result] = await find("testFinder", {}, [], mockContext);
      
      expect(mockApi.find).toHaveBeenCalled();
    });
  });

  describe("event emission", () => {
    it("should emit query event after successful find", async () => {
      mockCacheMap.getQueryResult.mockResolvedValueOnce(null);
      mockApi.find.mockResolvedValueOnce({
        items: [{ key: { kt: "test", pk: "1" }, name: "item" }],
        metadata: { total: 1, returned: 1, offset: 0, hasMore: false }
      });

      await find("testFinder", { param: "value" }, [], mockContext);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "items_queried"
        })
      );
    });
  });
});

describe("query cache race conditions", () => {
  let mockContext: any;
  let mockApi: any;
  let mockCacheMap: any;

  beforeEach(() => {
    mockApi = {
      find: vi.fn()
    };

    mockCacheMap = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      getQueryResult: vi.fn(),
      setQueryResult: vi.fn(),
      deleteQueryResult: vi.fn(),
      implementationType: "memory/test"
    };

    mockContext = {
      api: mockApi,
      cacheMap: mockCacheMap,
      pkType: "test",
      ttlManager: { onItemAdded: vi.fn() },
      evictionManager: { onItemAdded: vi.fn().mockResolvedValue([]) },
      eventEmitter: { emit: vi.fn() },
      coordinate: { kta: ["test"] },
      options: {}
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should handle item evicted between query check and item retrieval", async () => {
    const item1 = { key: { kt: "test", pk: "1" }, name: "item1" };
    const cachedKeys = [item1.key, { kt: "test", pk: "2" }];
    
    // Query cache returns keys for 2 items
    mockCacheMap.getQueryResult.mockResolvedValueOnce(cachedKeys);
    
    // But one item has been evicted
    mockCacheMap.get
      .mockResolvedValueOnce(item1)
      .mockResolvedValueOnce(null); // item2 was evicted
    
    // API fallback
    mockApi.find.mockResolvedValueOnce({
      items: [item1],
      metadata: { total: 1, returned: 1, offset: 0, hasMore: false }
    });

    const [ctx, result] = await find("testFinder", {}, [], mockContext);

    // Should have invalidated query and fetched from API
    expect(mockCacheMap.deleteQueryResult).toHaveBeenCalled();
    expect(mockApi.find).toHaveBeenCalled();
  });

  it("should handle concurrent find operations for same query", async () => {
    const items = [{ key: { kt: "test", pk: "1" }, name: "item1" }];
    
    let resolveApi: (value: any) => void;
    const apiPromise = new Promise((resolve) => {
      resolveApi = resolve;
    });
    
    mockCacheMap.getQueryResult.mockResolvedValue(null);
    mockApi.find.mockReturnValue(apiPromise);

    // Start two concurrent find operations
    const promise1 = find("testFinder", { shared: "param" }, [], mockContext);
    const promise2 = find("testFinder", { shared: "param" }, [], mockContext);

    // Resolve API call
    resolveApi!({
      items,
      metadata: { total: 1, returned: 1, offset: 0, hasMore: false }
    });

    const [ctx1, result1] = await promise1;
    const [ctx2, result2] = await promise2;

    // Both should succeed (even if API was called twice)
    expect(result1.items).toHaveLength(1);
    expect(result2.items).toHaveLength(1);
  });
});
