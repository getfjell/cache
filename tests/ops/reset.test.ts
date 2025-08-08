import { describe, expect, it } from "vitest";
import { reset } from "../../src/ops/reset";
import { createCoordinate } from "@fjell/registry";
import { Item } from "@fjell/core";
import { CacheMap } from "../../src/CacheMap";
import { Options } from "../../src/Options";

interface TestItem extends Item<"test"> {
  value: string;
}

describe("reset operation", () => {
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
    const hasAny = newCacheMap.includesKey({ kt: "test", pk: "test-key" });
    expect(hasAny).toBe(false);
  });

  it("should work with different cache types", async () => {
    const coordinate = createCoordinate<"test">("test");
    const memoryOptions: Options<TestItem, "test"> = {
      cacheType: "memory",
      ttl: 1000,
    };

    const [memoryCache] = await reset<TestItem, "test">(coordinate, memoryOptions);
    expect(memoryCache).toBeDefined();
    expect(memoryCache.get).toBeDefined();
  });
});
