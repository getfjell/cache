
import { MemoryCacheMap } from "../src/memory/MemoryCacheMap";
import { ComKey, IQFactory, Item, ItemQuery, LocKeyArray, PriKey, UUID } from "@fjell/core";
import { beforeEach, describe, expect, it } from 'vitest';

describe('CacheMap', () => {

  const key1 = {
    kt: "test",
    pk: "123e4567-e89b-12d3-a456-426614174000",
    loc: [{ kt: "container", lk: "123e4567-e89b-12d3-a456-426614174100" }]
  } as ComKey<"test", "container">;
  const key2 = {
    kt: "test",
    pk: "123e4567-e89b-12d3-a456-426614174001",
    loc: [{ kt: "container", lk: "123e4567-e89b-12d3-a456-426614174101" }]
  } as ComKey<"test", "container">;
  const key3 = {
    kt: "test",
    pk: "123e4567-e89b-12d3-a456-426614174002",
    loc: [{ kt: "container", lk: "123e4567-e89b-12d3-a456-426614174102" }]
  } as ComKey<"test", "container">;

  // PriKey for testing
  const priKey1 = {
    kt: "test",
    pk: "123e4567-e89b-12d3-a456-426614174003"
  } as PriKey<"test">;

  const items: Item<"test", "container">[] = [
    {
      key: key1,
      events: {
        created: { at: new Date("2023-01-01T00:00:00Z") },
        updated: { at: new Date("2023-01-02T00:00:00Z") },
        deleted: { at: null },
      },
      refs: {
        banana: { key: { kt: "banana", pk: "0" as UUID } },
      }
    },
    {
      key: key2,
      events: {
        created: { at: new Date("2023-01-03T00:00:00Z") },
        updated: { at: new Date("2023-01-04T00:00:00Z") },
        deleted: { at: null },
      },
      refs: {
        banana: { key: { kt: "banana", pk: "1" as UUID } },
      }
    },
    {
      key: key3,
      events: {
        created: { at: new Date("2023-01-05T00:00:00Z") },
        updated: { at: new Date("2023-01-06T00:00:00Z") },
        deleted: { at: null },
      },
      refs: {
        banana: { key: { kt: "banana", pk: "2" as UUID } },
      }
    }
  ];

  const priItem: Item<"test", "container"> = {
    key: priKey1,
    events: {
      created: { at: new Date("2023-01-07T00:00:00Z") },
      updated: { at: new Date("2023-01-08T00:00:00Z") },
      deleted: { at: null },
    },
    refs: {
      banana: { key: { kt: "banana", pk: "3" as UUID } },
    }
  };

  let cacheMap: MemoryCacheMap<Item<"test", "container">, "test", "container">;

  beforeEach(async () => {
    cacheMap = new MemoryCacheMap<Item<"test", "container">, "test", "container">(["test", "container"]);
    await cacheMap.set(key1, items[0]);
    await cacheMap.set(key2, items[1]);
  });

  describe('Constructor', () => {
    it('should create an empty cache map with just types', async () => {
      const emptyCacheMap = new MemoryCacheMap<Item<"test", "container">, "test", "container">(["test", "container"]);
      expect(await emptyCacheMap.values()).toHaveLength(0);
    });

    it('should create cache map and allow adding initial data', async () => {
      const preloadedCacheMap = new MemoryCacheMap<Item<"test", "container">, "test", "container">(
        ["test", "container"]
      );

      // Add initial data after construction
      await preloadedCacheMap.set(key1, items[0]);

      expect(await preloadedCacheMap.values()).toHaveLength(1);
      expect(await preloadedCacheMap.get(key1)).toEqual(items[0]);
    });
  });

  describe('Basic operations', () => {
    it('should get an item by key', async () => {
      const item = await cacheMap.get(key1);
      expect(item).toEqual(items[0]);
    });

    it('should return null for a non-existent key', async () => {
      const nonExistentKey = {
        kt: "test",
        pk: "non-existent" as UUID,
        loc: [{ kt: "container", lk: "non-existent" as UUID }]
      } as ComKey<"test", "container">;
      const item = await cacheMap.get(nonExistentKey);
      expect(item).toBeNull();
    });

    it('should set a new item', async () => {
      await cacheMap.set(key3, items[2]);
      expect(await cacheMap.get(key3)).toEqual(items[2]);
    });

    it('should overwrite an existing item', async () => {
      const updatedItem = { ...items[0], refs: { banana: { kt: "banana", pk: "updated" as UUID } } };
      await cacheMap.set(key1, updatedItem);
      expect(await cacheMap.get(key1)).toEqual(updatedItem);
    });

    it('should work with PriKey', async () => {
      await cacheMap.set(priKey1, priItem);
      expect(await cacheMap.get(priKey1)).toEqual(priItem);
    });
  });

  describe('Dictionary inherited methods', () => {
    it('should delete an item by key', async () => {
      expect(await cacheMap.get(key1)).toEqual(items[0]);
      await cacheMap.delete(key1);
      expect(await cacheMap.get(key1)).toBeNull();
    });

    it('should return all keys', async () => {
      const keys = await cacheMap.keys();
      expect(keys).toHaveLength(2);
      expect(keys).toContainEqual(key1);
      expect(keys).toContainEqual(key2);
    });

    it('should return all values', async () => {
      const values = await await cacheMap.values();
      expect(values).toHaveLength(2);
      expect(values).toContainEqual(items[0]);
      expect(values).toContainEqual(items[1]);
    });

    it('should check if key exists with includesKey', async () => {
      expect(await cacheMap.includesKey(key1)).toBe(true);
      expect(await cacheMap.includesKey(key2)).toBe(true);

      const nonExistentKey = {
        kt: "test",
        pk: "non-existent" as UUID,
        loc: [{ kt: "container", lk: "non-existent" as UUID }]
      } as ComKey<"test", "container">;
      expect(await cacheMap.includesKey(nonExistentKey)).toBe(false);
    });

    it('should check if PriKey exists with includesKey', async () => {
      await cacheMap.set(priKey1, priItem);
      expect(await cacheMap.includesKey(priKey1)).toBe(true);

      const nonExistentPriKey = {
        kt: "test",
        pk: "non-existent" as UUID
      } as PriKey<"test">;
      expect(await cacheMap.includesKey(nonExistentPriKey)).toBe(false);
    });
  });

  describe('Location-based operations', () => {
    it('should return all items in specified locations', async () => {
      const locKeys: LocKeyArray<"container"> = [{ kt: "container", lk: "123e4567-e89b-12d3-a456-426614174100" }];
      const itemsInLoc = await cacheMap.allIn(locKeys);
      expect(itemsInLoc).toEqual([items[0]]);
    });

    it('should return all items when locations array is empty', async () => {
      const itemsInLoc = await cacheMap.allIn([]);
      expect(itemsInLoc).toEqual(items.slice(0, 2)); // Only first 2 items since key3 isn't added in beforeEach
    });

    it('should return empty array for non-existent location', async () => {
      const nonExistentLoc: LocKeyArray<"container"> = [{ kt: "container", lk: "non-existent" as UUID }];
      const itemsInLoc = await cacheMap.allIn(nonExistentLoc);
      expect(itemsInLoc).toEqual([]);
    });

    it('should return items in specific locations separately', async () => {
      await cacheMap.set(key3, items[2]);

      // Test each location separately since allIn filters by exact location match
      const loc1Items = await cacheMap.allIn([{ kt: "container", lk: "123e4567-e89b-12d3-a456-426614174100" }]);
      const loc2Items = await cacheMap.allIn([{ kt: "container", lk: "123e4567-e89b-12d3-a456-426614174101" }]);
      const loc3Items = await cacheMap.allIn([{ kt: "container", lk: "123e4567-e89b-12d3-a456-426614174102" }]);

      expect(loc1Items).toEqual([items[0]]);
      expect(loc2Items).toEqual([items[1]]);
      expect(loc3Items).toEqual([items[2]]);
    });

    it('should filter out PriKey items when getting items by location', async () => {
      await cacheMap.set(priKey1, priItem);
      const locKeys: LocKeyArray<"container"> = [{ kt: "container", lk: "123e4567-e89b-12d3-a456-426614174100" }];
      const itemsInLoc = await cacheMap.allIn(locKeys);
      expect(itemsInLoc).toEqual([items[0]]);
      expect(itemsInLoc).not.toContain(priItem);
    });

    it('should handle location arrays with different lengths', async () => {
      // Create keys with different length location arrays to test the length comparison in isLocKeyArrayEqual
      const singleLocKey = {
        kt: "test",
        pk: "single-loc-key",
        loc: [{ kt: "container", lk: "single-location" }]
      } as ComKey<"test", "container">;

      const multiLocKey = {
        kt: "test",
        pk: "multi-loc-key",
        loc: [
          { kt: "container", lk: "multi-location-1" },
          { kt: "container", lk: "multi-location-2" }
        ]
      } as any; // Using any since TypeScript doesn't allow multiple locations in this type

      const singleLocItem = {
        key: singleLocKey,
        events: {
          created: { at: new Date("2023-01-01T00:00:00Z") },
          updated: { at: new Date("2023-01-02T00:00:00Z") },
          deleted: { at: null },
        },
        refs: {
          banana: { kt: "banana", pk: "single" as UUID },
        }
      };

      const multiLocItem = {
        key: multiLocKey,
        events: {
          created: { at: new Date("2023-01-01T00:00:00Z") },
          updated: { at: new Date("2023-01-02T00:00:00Z") },
          deleted: { at: null },
        },
        refs: {
          banana: { kt: "banana", pk: "multi" as UUID },
        }
      };

      await cacheMap.set(singleLocKey, singleLocItem);
      await cacheMap.set(multiLocKey, multiLocItem);

      // Query for single location should only return singleLocItem
      const singleLocResult = await cacheMap.allIn([{ kt: "container", lk: "single-location" }]);
      expect(singleLocResult).toEqual([singleLocItem]);
      expect(singleLocResult).not.toContain(multiLocItem);

      // Query for multiple locations should only return multiLocItem
      const multiLocResult = await cacheMap.allIn([
        { kt: "container", lk: "multi-location-1" },
        { kt: "container", lk: "multi-location-2" }
      ] as any);
      expect(multiLocResult).toEqual([multiLocItem]);
      expect(multiLocResult).not.toContain(singleLocItem);

      // Query with different length should return empty (tests the length comparison)
      const differentLengthResult = await cacheMap.allIn([
        { kt: "container", lk: "multi-location-1" }
      ]);
      expect(differentLengthResult).not.toContain(multiLocItem);
    });
  });

  describe('Query operations', () => {
    it('should check if an item matching the query exists in specified locations', async () => {
      const query: ItemQuery = IQFactory.pk("banana", "0").toQuery();
      const locKeys: LocKeyArray<"container"> = [{ kt: "container", lk: "123e4567-e89b-12d3-a456-426614174100" }];
      const contains = await cacheMap.contains(query, locKeys);
      expect(contains).toBe(true);
    });

    it('should check if an item matching the query does not exist in specified locations', async () => {
      const query: ItemQuery = IQFactory.pk("banana", "1").toQuery();
      const locKeys: LocKeyArray<"container"> = [{ kt: "container", lk: "123e4567-e89b-12d3-a456-426614174100" }];
      const contains = await cacheMap.contains(query, locKeys);
      expect(contains).toBe(false);
    });

    it('should return false if no item matching the query exists in specified locations', async () => {
      const query: ItemQuery = IQFactory.pk("test", "non-existant").toQuery();
      const locKeys: LocKeyArray<"container"> = [{ kt: "container", lk: "123e4567-e89b-12d3-a456-426614174100" }];
      const contains = await cacheMap.contains(query, locKeys);
      expect(contains).toBe(false);
    });

    it('should check if item exists in empty location array (searches all)', async () => {
      const query: ItemQuery = IQFactory.pk("banana", "0").toQuery();
      const contains = await cacheMap.contains(query, []);
      expect(contains).toBe(true);
    });

    it('should return items matching the query in specified locations', async () => {
      const query: ItemQuery = IQFactory.pk("banana", "0").toQuery();
      const locKeys: LocKeyArray<"container"> = [{ kt: "container", lk: "123e4567-e89b-12d3-a456-426614174100" }];
      const queriedItems = await cacheMap.queryIn(query, locKeys);
      expect(queriedItems).toEqual([items[0]]);
    });

    it('should return items matching the query with locations set to empty', async () => {
      const query: ItemQuery = IQFactory.pk("banana", "0").toQuery();
      const queriedItems = await cacheMap.queryIn(query, []);
      expect(queriedItems).toEqual([items[0]]);
    });

    it('should return empty array for non-matching query', async () => {
      const query: ItemQuery = IQFactory.pk("banana", "non-existent").toQuery();
      const queriedItems = await cacheMap.queryIn(query, []);
      expect(queriedItems).toEqual([]);
    });

    it('should return multiple items matching the query', async () => {
      // Add an item with the same banana reference
      const duplicateItem = {
        key: key3,
        events: {
          created: { at: new Date("2023-01-05T00:00:00Z") },
          updated: { at: new Date("2023-01-06T00:00:00Z") },
          deleted: { at: null },
        },
        refs: {
          banana: { key: { kt: "banana", pk: "0" as UUID } }, // Same banana reference as items[0]
        }
      };
      await cacheMap.set(key3, duplicateItem);

      const query: ItemQuery = IQFactory.pk("banana", "0").toQuery();
      const queriedItems = await cacheMap.queryIn(query, []);
      expect(queriedItems).toHaveLength(2);
      expect(queriedItems).toContainEqual(items[0]);
      expect(queriedItems).toContainEqual(duplicateItem);
    });
  });

  describe('Clone operations', () => {
    it('should clone the cache map', async () => {
      const clone = await cacheMap.clone();
      expect(clone).not.toBe(cacheMap); // Ensure it's a different instance
      expect(await clone.get(key1)).toEqual(items[0]);
      expect(await clone.get(key2)).toEqual(items[1]);
    });

    it('should create clones that are independent copies', async () => {
      const clone = await cacheMap.clone();

      // Modify original
      await cacheMap.set(key3, items[2]);

      // Clone should not have the new item since they are independent
      expect(await cacheMap.get(key3)).toEqual(items[2]);
      expect(await clone.get(key3)).toBeNull();
    });

    it('should preserve types in cloned cache map', async () => {
      const clone = await cacheMap.clone();

      // Should be able to add new items to clone
      clone.set(key3, items[2]);
      expect(await clone.get(key3)).toEqual(items[2]);
    });
  });

  describe('Key normalization', () => {
    it('should handle string and number keys consistently', async () => {
      const stringKey = {
        kt: "test",
        pk: "123",
        loc: [{ kt: "container", lk: "456" }]
      } as ComKey<"test", "container">;

      const numberKey = {
        kt: "test",
        pk: 123,
        loc: [{ kt: "container", lk: 456 }]
      } as any; // Using any to simulate mixed key types

      const testItem = {
        key: stringKey,
        events: {
          created: { at: new Date("2023-01-01T00:00:00Z") },
          updated: { at: new Date("2023-01-02T00:00:00Z") },
          deleted: { at: null },
        },
        refs: {
          banana: { kt: "banana", pk: "test" as UUID },
        }
      };

      await cacheMap.set(stringKey, testItem);

      // Should be able to retrieve using either string or number key due to normalization
      expect(await cacheMap.get(stringKey)).toEqual(testItem);
      expect(await cacheMap.get(numberKey)).toEqual(testItem);
    });

    it('should normalize lk values from numbers to strings', async () => {
      // Test the specific lk normalization code path
      const keyWithNumberLk = {
        kt: "test",
        pk: "test-pk",
        loc: [{ kt: "container", lk: 123 }] // Number lk that should be normalized to string
      } as any;

      const keyWithStringLk = {
        kt: "test",
        pk: "test-pk",
        loc: [{ kt: "container", lk: "123" }] // String lk
      } as ComKey<"test", "container">;

      const testItem = {
        key: keyWithStringLk,
        events: {
          created: { at: new Date("2023-01-01T00:00:00Z") },
          updated: { at: new Date("2023-01-02T00:00:00Z") },
          deleted: { at: null },
        },
        refs: {
          banana: { kt: "banana", pk: "test" as UUID },
        }
      };

      // Set with number lk
      await cacheMap.set(keyWithNumberLk, testItem);

      // Should be able to retrieve with either number or string lk due to normalization
      expect(await cacheMap.get(keyWithNumberLk)).toEqual(testItem);
      expect(await cacheMap.get(keyWithStringLk)).toEqual(testItem);

      // Both should be considered the same key
      expect(await cacheMap.includesKey(keyWithNumberLk)).toBe(true);
      expect(await cacheMap.includesKey(keyWithStringLk)).toBe(true);
    });

    it('should handle null lk values without normalization', async () => {
      const keyWithNullLk = {
        kt: "test",
        pk: "test-pk-null",
        loc: [{ kt: "container", lk: null }] // Null lk should not be normalized
      } as any;

      const testItem = {
        key: keyWithNullLk,
        events: {
          created: { at: new Date("2023-01-01T00:00:00Z") },
          updated: { at: new Date("2023-01-02T00:00:00Z") },
          deleted: { at: null },
        },
        refs: {
          banana: { kt: "banana", pk: "test-null" as UUID },
        }
      };

      // Should not throw when setting with null lk
      await expect(cacheMap.set(keyWithNullLk, testItem)).resolves.not.toThrow();

      // Should be able to retrieve the item
      expect(await cacheMap.get(keyWithNullLk)).toEqual(testItem);
    });

    it('should handle non-object keys using JSON.stringify fallback', async () => {
      // Test the fallback path when key is not an object (line 50)
      const primitiveKey = "simple-string-key" as any;
      const testItem = {
        key: primitiveKey,
        events: {
          created: { at: new Date("2023-01-01T00:00:00Z") },
          updated: { at: new Date("2023-01-02T00:00:00Z") },
          deleted: { at: null },
        },
        refs: {
          banana: { kt: "banana", pk: "primitive" as UUID },
        }
      };

      // Should handle primitive keys using JSON.stringify
      await expect(cacheMap.set(primitiveKey, testItem)).resolves.not.toThrow();

      expect(await cacheMap.get(primitiveKey)).toEqual(testItem);
    });

    it('should handle null keys using JSON.stringify fallback', async () => {
      // Test the fallback path when key is null (line 50)
      const nullKey = null as any;
      const testItem = {
        key: nullKey,
        events: {
          created: { at: new Date("2023-01-01T00:00:00Z") },
          updated: { at: new Date("2023-01-02T00:00:00Z") },
          deleted: { at: null },
        },
        refs: {
          banana: { kt: "banana", pk: "null-key" as UUID },
        }
      };

      // Should handle null keys using JSON.stringify
      await expect(cacheMap.set(nullKey, testItem)).resolves.not.toThrow();

      expect(await cacheMap.get(nullKey)).toEqual(testItem);
    });

    it('should handle non-object location items in isLocKeyArrayEqual', async () => {
      // Test the normalizeLocKeyItem function with non-object items (lines 84-85)
      // This happens when isLocKeyArrayEqual is called with non-object items
      const keyWithNullLocItem = {
        kt: "test",
        pk: "null-loc-test",
        loc: [null] // Non-object item that should trigger line 84-85 in normalizeLocKeyItem
      } as any;

      const testItem = {
        key: keyWithNullLocItem,
        events: {
          created: { at: new Date("2023-01-01T00:00:00Z") },
          updated: { at: new Date("2023-01-02T00:00:00Z") },
          deleted: { at: null },
        },
        refs: {
          banana: { kt: "banana", pk: "null-loc" as UUID },
        }
      };

      await cacheMap.set(keyWithNullLocItem, testItem);

      // Test allIn which uses isLocKeyArrayEqual internally
      const result = await cacheMap.allIn([null] as any);
      expect(result).toEqual([testItem]);
    });

    it('should normalize lk values inside location arrays', async () => {
      // Ensure the lk normalization code in loc array processing is covered
      const keyWithMixedLocTypes = {
        kt: "test",
        pk: "mixed-loc-types",
        loc: [
          { kt: "container", lk: 456 }, // Number lk
          { kt: "container", lk: "789" }, // String lk
          { kt: "container", lk: null }, // Null lk
        ]
      } as any;

      const testItem = {
        key: keyWithMixedLocTypes,
        events: {
          created: { at: new Date("2023-01-01T00:00:00Z") },
          updated: { at: new Date("2023-01-02T00:00:00Z") },
          deleted: { at: null },
        },
        refs: {
          banana: { kt: "banana", pk: "mixed-loc" as UUID },
        }
      };

      // Should normalize number lk to string, leave string lk as is, and skip null lk
      await expect(cacheMap.set(keyWithMixedLocTypes, testItem)).resolves.not.toThrow();

      expect(await cacheMap.get(keyWithMixedLocTypes)).toEqual(testItem);
    });

    it('should normalize top-level lk values in key objects', async () => {
      // Test the specific lk normalization code path for top-level lk (lines 35-36)
      const keyWithTopLevelLk = {
        kt: "test",
        pk: "top-level-lk-test",
        lk: 999, // Top-level lk that should be normalized
        loc: [{ kt: "container", lk: "container-loc" }]
      } as any;

      const testItem = {
        key: keyWithTopLevelLk,
        events: {
          created: { at: new Date("2023-01-01T00:00:00Z") },
          updated: { at: new Date("2023-01-02T00:00:00Z") },
          deleted: { at: null },
        },
        refs: {
          banana: { kt: "banana", pk: "top-level-lk" as UUID },
        }
      };

      // Should normalize top-level lk from number to string
      await expect(cacheMap.set(keyWithTopLevelLk, testItem)).resolves.not.toThrow();

      expect(await cacheMap.get(keyWithTopLevelLk)).toEqual(testItem);

      // Test that it can be retrieved with string lk as well
      const keyWithStringLk = {
        kt: "test",
        pk: "top-level-lk-test",
        lk: "999", // String version of the same lk
        loc: [{ kt: "container", lk: "container-loc" }]
      } as any;

      expect(await cacheMap.get(keyWithStringLk)).toEqual(testItem);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty cache operations', async () => {
      const emptyCacheMap = new MemoryCacheMap<Item<"test", "container">, "test", "container">(["test", "container"]);

      expect(await emptyCacheMap.values()).toEqual([]);
      expect(await emptyCacheMap.keys()).toEqual([]);
      expect(await emptyCacheMap.allIn([])).toEqual([]);
      expect(await emptyCacheMap.contains(IQFactory.pk("banana", "0").toQuery(), [])).toBe(false);
      expect(await emptyCacheMap.queryIn(IQFactory.pk("banana", "0").toQuery(), [])).toEqual([]);
    });

    it('should handle null and undefined values gracefully', async () => {
      const nullKey = {
        kt: "test",
        pk: null as any,
        loc: [{ kt: "container", lk: null as any }]
      } as ComKey<"test", "container">;

      // Should not throw when setting with null values
      await expect(cacheMap.set(nullKey, items[0])).resolves.not.toThrow();
    });

    it('should handle complex location arrays', async () => {
      const multiLocKey = {
        kt: "test",
        pk: "multi-loc-test",
        loc: [
          { kt: "container", lk: "loc1" },
          { kt: "subcontainer", lk: "subloc1" }
        ]
      } as any; // Using any for complex location structure

      const multiLocItem = {
        key: multiLocKey,
        events: {
          created: { at: new Date("2023-01-01T00:00:00Z") },
          updated: { at: new Date("2023-01-02T00:00:00Z") },
          deleted: { at: null },
        },
        refs: {
          banana: { kt: "banana", pk: "multi" as UUID },
        }
      };

      await cacheMap.set(multiLocKey, multiLocItem);
      expect(await cacheMap.get(multiLocKey)).toEqual(multiLocItem);
    });
  });

});
