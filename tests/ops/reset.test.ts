import { describe, expect, it } from "vitest";
import { reset } from "../../src/ops/reset";
import { createCoordinate } from "@fjell/core";
import { Item } from "@fjell/core";
import { CacheMap } from "../../src/CacheMap";
import { Options } from "../../src/Options";

interface TestItem extends Item<"test"> {
  value: string;
}

interface MultiLevelTestItem extends Item<"test", "level1", "level2"> {
  value: string;
}

describe("reset operation", () => {
  describe("basic functionality", () => {
    it("should create a new cache map with the same configuration", async () => {
      // Create test coordinate
      const coordinate = createCoordinate<"test">("test");

      // Create test options
      const options: Options<TestItem, "test"> = {
        cacheType: "memory",
        ttl: 1000,
      };

      // Execute reset operation
      const [newCacheMap] = await reset<TestItem, "test">(coordinate, options);

      // Verify the result is a CacheMap instance
      expect(newCacheMap).toBeInstanceOf(CacheMap);

      // Verify the new cache map has the correct configuration
      expect(newCacheMap).toBeDefined();
      expect(newCacheMap.get).toBeDefined();
      expect(newCacheMap.set).toBeDefined();
    });

    it("should return an empty cache map", async () => {
      const coordinate = createCoordinate<"test">("test");
      const options: Options<TestItem, "test"> = {
        cacheType: "memory",
        ttl: 1000,
      };

      const [newCacheMap] = await reset<TestItem, "test">(coordinate, options);

      // Verify the cache map is empty by checking includesKey() method
      const hasAny = await newCacheMap.includesKey({ kt: "test", pk: "test-key" });
      expect(hasAny).toBe(false);
    });

    it("should work with multi-level coordinates", async () => {
      const coordinate = createCoordinate<"test", "level1", "level2">(["test", "level1", "level2"]);
      const options: Options<MultiLevelTestItem, "test", "level1", "level2"> = {
        cacheType: "memory",
        ttl: 2000,
      };

      const [newCacheMap] = await reset<MultiLevelTestItem, "test", "level1", "level2">(coordinate, options);

      expect(newCacheMap).toBeInstanceOf(CacheMap);
      expect(newCacheMap.get).toBeDefined();
      expect(newCacheMap.set).toBeDefined();
    });
  });

  describe("cache type support", () => {
    it("should work with memory cache type", async () => {
      const coordinate = createCoordinate<"test">("test");
      const memoryOptions: Options<TestItem, "test"> = {
        cacheType: "memory",
        ttl: 1000,
      };

      const [memoryCache] = await reset<TestItem, "test">(coordinate, memoryOptions);
      expect(memoryCache).toBeDefined();
      expect(memoryCache.get).toBeDefined();
    });

    it("should work with enhanced memory cache configuration", async () => {
      const coordinate = createCoordinate<"test">("test");
      const enhancedMemoryOptions: Options<TestItem, "test"> = {
        cacheType: "memory",
        memoryConfig: {
          size: {
            maxSizeBytes: "1MB",
            maxItems: 100
          }
        }
      };

      const [enhancedCache] = await reset<TestItem, "test">(coordinate, enhancedMemoryOptions);
      expect(enhancedCache).toBeDefined();
    });

    it("should work with custom cache map factory", async () => {
      const coordinate = createCoordinate<"test">("test");
      const customFactory = (kta: [string, ...string[]]) => {
        // Create a simple mock cache map for testing
        return {
          get: () => undefined,
          set: () => { },
          includesKey: () => false,
          delete: () => false,
          clear: () => { },
          keys: () => [],
          values: () => [],
          entries: () => [],
          size: () => 0
        } as any;
      };

      const customOptions: Options<TestItem, "test"> = {
        cacheType: "custom",
        customCacheMapFactory: customFactory
      };

      const [customCache] = await reset<TestItem, "test">(coordinate, customOptions);
      expect(customCache).toBeDefined();
      expect(customCache.get).toBeDefined();
    });
  });

  describe("error handling", () => {
    it("should throw error for custom cache type without factory", async () => {
      const coordinate = createCoordinate<"test">("test");
      const invalidOptions: Options<TestItem, "test"> = {
        cacheType: "custom"
        // Missing customCacheMapFactory
      };

      await expect(reset<TestItem, "test">(coordinate, invalidOptions))
        .rejects.toThrow("customCacheMapFactory is required when cacheType is \"custom\"");
    });

    it("should throw error for negative maxRetries", async () => {
      const coordinate = createCoordinate<"test">("test");
      const invalidOptions: Options<TestItem, "test"> = {
        cacheType: "memory",
        maxRetries: -1
      };

      await expect(reset<TestItem, "test">(coordinate, invalidOptions))
        .rejects.toThrow("maxRetries must be non-negative");
    });

    it("should throw error for negative retryDelay", async () => {
      const coordinate = createCoordinate<"test">("test");
      const invalidOptions: Options<TestItem, "test"> = {
        cacheType: "memory",
        retryDelay: -100
      };

      await expect(reset<TestItem, "test">(coordinate, invalidOptions))
        .rejects.toThrow("retryDelay must be non-negative");
    });

    it("should throw error for zero or negative ttl", async () => {
      const coordinate = createCoordinate<"test">("test");
      const invalidOptions: Options<TestItem, "test"> = {
        cacheType: "memory",
        ttl: 0
      };

      await expect(reset<TestItem, "test">(coordinate, invalidOptions))
        .rejects.toThrow("ttl must be positive");

      const negativeOptions: Options<TestItem, "test"> = {
        cacheType: "memory",
        ttl: -500
      };

      await expect(reset<TestItem, "test">(coordinate, negativeOptions))
        .rejects.toThrow("ttl must be positive");
    });

    it("should throw error for zero or negative memory maxItems", async () => {
      const coordinate = createCoordinate<"test">("test");
      const invalidOptions: Options<TestItem, "test"> = {
        cacheType: "memory",
        memoryConfig: {
          maxItems: 0
        }
      };

      await expect(reset<TestItem, "test">(coordinate, invalidOptions))
        .rejects.toThrow("memoryConfig.maxItems must be positive");

      const negativeOptions: Options<TestItem, "test"> = {
        cacheType: "memory",
        memoryConfig: {
          maxItems: -10
        }
      };

      await expect(reset<TestItem, "test">(coordinate, negativeOptions))
        .rejects.toThrow("memoryConfig.maxItems must be positive");
    });

    it("should throw error for invalid size configuration", async () => {
      const coordinate = createCoordinate<"test">("test");
      const invalidSizeOptions: Options<TestItem, "test"> = {
        cacheType: "memory",
        memoryConfig: {
          size: {
            maxSizeBytes: "invalid-size"
          }
        }
      };

      await expect(reset<TestItem, "test">(coordinate, invalidSizeOptions))
        .rejects.toThrow();
    });

    it("should throw error for browser-only cache types in non-browser environment", async () => {
      const coordinate = createCoordinate<"test">("test");

      // Mock non-browser environment
      const originalWindow = global.window;
      delete (global as any).window;

      try {
        const localStorageOptions: Options<TestItem, "test"> = {
          cacheType: "localStorage"
        };

        await expect(reset<TestItem, "test">(coordinate, localStorageOptions))
          .rejects.toThrow("localStorage is not available in non-browser environments");

        const sessionStorageOptions: Options<TestItem, "test"> = {
          cacheType: "sessionStorage"
        };

        await expect(reset<TestItem, "test">(coordinate, sessionStorageOptions))
          .rejects.toThrow("sessionStorage is not available in non-browser environments");
      } finally {
        // Restore window object
        global.window = originalWindow;
      }
    });

    it("should throw error for asyncIndexedDB cache type", async () => {
      const coordinate = createCoordinate<"test">("test");
      const asyncIndexedDBOptions: Options<TestItem, "test"> = {
        cacheType: "asyncIndexedDB" as any // Cast to bypass TypeScript validation for testing
      };

      await expect(reset<TestItem, "test">(coordinate, asyncIndexedDBOptions))
        .rejects.toThrow("asyncIndexedDB cannot be used with synchronous cache factory");
    });

    it("should throw error for unsupported cache type", async () => {
      const coordinate = createCoordinate<"test">("test");
      const unsupportedOptions: Options<TestItem, "test"> = {
        cacheType: "unsupported" as any // Cast to bypass TypeScript validation for testing
      };

      await expect(reset<TestItem, "test">(coordinate, unsupportedOptions))
        .rejects.toThrow(/Unsupported cache type.*unsupported/);
    });
  });

  describe("configuration validation", () => {
    it("should validate memory size configuration with invalid maxSizeBytes", async () => {
      const coordinate = createCoordinate<"test">("test");
      const invalidOptions: Options<TestItem, "test"> = {
        cacheType: "memory",
        memoryConfig: {
          size: {
            maxSizeBytes: "-5MB"
          }
        }
      };

      await expect(reset<TestItem, "test">(coordinate, invalidOptions))
        .rejects.toThrow();
    });

    it("should validate memory size configuration with invalid maxItems", async () => {
      const coordinate = createCoordinate<"test">("test");
      const invalidOptions: Options<TestItem, "test"> = {
        cacheType: "memory",
        memoryConfig: {
          size: {
            maxItems: -10
          }
        }
      };

      await expect(reset<TestItem, "test">(coordinate, invalidOptions))
        .rejects.toThrow("maxItems must be a positive integer");
    });

    it("should validate webStorage size configuration", async () => {
      const coordinate = createCoordinate<"test">("test");
      const invalidOptions: Options<TestItem, "test"> = {
        cacheType: "memory", // Use memory to avoid browser checks
        webStorageConfig: {
          size: {
            maxSizeBytes: "not-a-size"
          }
        }
      };

      await expect(reset<TestItem, "test">(coordinate, invalidOptions))
        .rejects.toThrow();
    });

    it("should validate indexedDB size configuration", async () => {
      const coordinate = createCoordinate<"test">("test");
      const invalidOptions: Options<TestItem, "test"> = {
        cacheType: "memory", // Use memory to avoid browser checks
        indexedDBConfig: {
          size: {
            maxItems: 0
          }
        }
      };

      await expect(reset<TestItem, "test">(coordinate, invalidOptions))
        .rejects.toThrow("maxItems must be a positive integer");
    });
  });

  describe("successful configurations", () => {
    it("should work with complete memory configuration", async () => {
      const coordinate = createCoordinate<"test">("test");
      const completeOptions: Options<TestItem, "test"> = {
        cacheType: "memory",
        ttl: 5000,
        maxRetries: 5,
        retryDelay: 2000,
        enableDebugLogging: true,
        autoSync: false,
        memoryConfig: {
          maxItems: 500,
          size: {
            maxSizeBytes: "10MB",
            maxItems: 1000
          }
        }
      };

      const [newCacheMap] = await reset<TestItem, "test">(coordinate, completeOptions);
      expect(newCacheMap).toBeDefined();
    });

    it("should work with webStorage configuration", async () => {
      const coordinate = createCoordinate<"test">("test");
      const webStorageOptions: Options<TestItem, "test"> = {
        cacheType: "memory", // Use memory to avoid browser checks
        webStorageConfig: {
          keyPrefix: "test-cache:",
          compress: true,
          size: {
            maxSizeBytes: "5MB",
            maxItems: 200
          }
        }
      };

      const [newCacheMap] = await reset<TestItem, "test">(coordinate, webStorageOptions);
      expect(newCacheMap).toBeDefined();
    });

    it("should work with indexedDB configuration", async () => {
      const coordinate = createCoordinate<"test">("test");
      const indexedDBOptions: Options<TestItem, "test"> = {
        cacheType: "memory", // Use memory to avoid browser checks
        indexedDBConfig: {
          dbName: "test-db",
          version: 2,
          storeName: "test-store",
          size: {
            maxSizeBytes: "100MB",
            maxItems: 10000
          }
        }
      };

      const [newCacheMap] = await reset<TestItem, "test">(coordinate, indexedDBOptions);
      expect(newCacheMap).toBeDefined();
    });

    it("should work with eviction configuration", async () => {
      const coordinate = createCoordinate<"test">("test");
      const evictionOptions: Options<TestItem, "test"> = {
        cacheType: "memory",
        evictionConfig: {
          type: "lru"
        }
      };

      const [newCacheMap] = await reset<TestItem, "test">(coordinate, evictionOptions);
      expect(newCacheMap).toBeDefined();
    });
  });
});
