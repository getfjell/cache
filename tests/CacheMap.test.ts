
import { CacheMap } from "@/CacheMap";
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
        banana: { kt: "banana", pk: "0" as UUID },
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
        banana: { kt: "banana", pk: "1" as UUID },
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
        banana: { kt: "banana", pk: "2" as UUID },
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
      banana: { kt: "banana", pk: "3" as UUID },
    }
  };

  let cacheMap: CacheMap<Item<"test", "container">, "test", "container">;

  beforeEach(() => {
    cacheMap = new CacheMap<Item<"test", "container">, "test", "container">(["test", "container"]);
    cacheMap.set(key1, items[0]);
    cacheMap.set(key2, items[1]);
  });

  describe('Constructor', () => {
    it('should create an empty cache map with just types', () => {
      const emptyCacheMap = new CacheMap<Item<"test", "container">, "test", "container">(["test", "container"]);
      expect(emptyCacheMap.values()).toHaveLength(0);
    });

    it('should create cache map with initial data', () => {
      const initialData = {
        [JSON.stringify(key1)]: items[0]
      };
      const preloadedCacheMap = new CacheMap<Item<"test", "container">, "test", "container">(
        ["test", "container"],
        initialData
      );
      expect(preloadedCacheMap.values()).toHaveLength(1);
      expect(preloadedCacheMap.get(key1)).toEqual(items[0]);
    });
  });

  describe('Basic operations', () => {
    it('should get an item by key', () => {
      const item = cacheMap.get(key1);
      expect(item).toEqual(items[0]);
    });

    it('should return null for a non-existent key', () => {
      const nonExistentKey = {
        kt: "test",
        pk: "non-existent" as UUID,
        loc: [{ kt: "container", lk: "non-existent" as UUID }]
      } as ComKey<"test", "container">;
      const item = cacheMap.get(nonExistentKey);
      expect(item).toBeNull();
    });

    it('should set a new item', () => {
      cacheMap.set(key3, items[2]);
      expect(cacheMap.get(key3)).toEqual(items[2]);
    });

    it('should overwrite an existing item', () => {
      const updatedItem = { ...items[0], refs: { banana: { kt: "banana", pk: "updated" as UUID } } };
      cacheMap.set(key1, updatedItem);
      expect(cacheMap.get(key1)).toEqual(updatedItem);
    });

    it('should work with PriKey', () => {
      cacheMap.set(priKey1, priItem);
      expect(cacheMap.get(priKey1)).toEqual(priItem);
    });
  });

  describe('Dictionary inherited methods', () => {
    it('should delete an item by key', () => {
      expect(cacheMap.get(key1)).toEqual(items[0]);
      cacheMap.delete(key1);
      expect(cacheMap.get(key1)).toBeNull();
    });

    it('should return all keys', () => {
      const keys = cacheMap.keys();
      expect(keys).toHaveLength(2);
      expect(keys).toContainEqual(key1);
      expect(keys).toContainEqual(key2);
    });

    it('should return all values', () => {
      const values = cacheMap.values();
      expect(values).toHaveLength(2);
      expect(values).toContainEqual(items[0]);
      expect(values).toContainEqual(items[1]);
    });

    it('should check if key exists with includesKey', () => {
      expect(cacheMap.includesKey(key1)).toBe(true);
      expect(cacheMap.includesKey(key2)).toBe(true);

      const nonExistentKey = {
        kt: "test",
        pk: "non-existent" as UUID,
        loc: [{ kt: "container", lk: "non-existent" as UUID }]
      } as ComKey<"test", "container">;
      expect(cacheMap.includesKey(nonExistentKey)).toBe(false);
    });

    it('should check if PriKey exists with includesKey', () => {
      cacheMap.set(priKey1, priItem);
      expect(cacheMap.includesKey(priKey1)).toBe(true);

      const nonExistentPriKey = {
        kt: "test",
        pk: "non-existent" as UUID
      } as PriKey<"test">;
      expect(cacheMap.includesKey(nonExistentPriKey)).toBe(false);
    });
  });

  describe('Location-based operations', () => {
    it('should return all items in specified locations', () => {
      const locKeys: LocKeyArray<"container"> = [{ kt: "container", lk: "123e4567-e89b-12d3-a456-426614174100" }];
      const itemsInLoc = cacheMap.allIn(locKeys);
      expect(itemsInLoc).toEqual([items[0]]);
    });

    it('should return all items when locations array is empty', () => {
      const itemsInLoc = cacheMap.allIn([]);
      expect(itemsInLoc).toEqual(items.slice(0, 2)); // Only first 2 items since key3 isn't added in beforeEach
    });

    it('should return empty array for non-existent location', () => {
      const nonExistentLoc: LocKeyArray<"container"> = [{ kt: "container", lk: "non-existent" as UUID }];
      const itemsInLoc = cacheMap.allIn(nonExistentLoc);
      expect(itemsInLoc).toEqual([]);
    });

    it('should return items in specific locations separately', () => {
      cacheMap.set(key3, items[2]);

      // Test each location separately since allIn filters by exact location match
      const loc1Items = cacheMap.allIn([{ kt: "container", lk: "123e4567-e89b-12d3-a456-426614174100" }]);
      const loc2Items = cacheMap.allIn([{ kt: "container", lk: "123e4567-e89b-12d3-a456-426614174101" }]);
      const loc3Items = cacheMap.allIn([{ kt: "container", lk: "123e4567-e89b-12d3-a456-426614174102" }]);

      expect(loc1Items).toEqual([items[0]]);
      expect(loc2Items).toEqual([items[1]]);
      expect(loc3Items).toEqual([items[2]]);
    });

    it('should filter out PriKey items when getting items by location', () => {
      cacheMap.set(priKey1, priItem);
      const locKeys: LocKeyArray<"container"> = [{ kt: "container", lk: "123e4567-e89b-12d3-a456-426614174100" }];
      const itemsInLoc = cacheMap.allIn(locKeys);
      expect(itemsInLoc).toEqual([items[0]]);
      expect(itemsInLoc).not.toContain(priItem);
    });

    it('should handle location arrays with different lengths', () => {
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

      cacheMap.set(singleLocKey, singleLocItem);
      cacheMap.set(multiLocKey, multiLocItem);

      // Query for single location should only return singleLocItem
      const singleLocResult = cacheMap.allIn([{ kt: "container", lk: "single-location" }]);
      expect(singleLocResult).toEqual([singleLocItem]);
      expect(singleLocResult).not.toContain(multiLocItem);

      // Query for multiple locations should only return multiLocItem
      const multiLocResult = cacheMap.allIn([
        { kt: "container", lk: "multi-location-1" },
        { kt: "container", lk: "multi-location-2" }
      ] as any);
      expect(multiLocResult).toEqual([multiLocItem]);
      expect(multiLocResult).not.toContain(singleLocItem);

      // Query with different length should return empty (tests the length comparison)
      const differentLengthResult = cacheMap.allIn([
        { kt: "container", lk: "multi-location-1" }
      ]);
      expect(differentLengthResult).not.toContain(multiLocItem);
    });
  });

  describe('Query operations', () => {
    it('should check if an item matching the query exists in specified locations', () => {
      const query: ItemQuery = IQFactory.pk("banana", "0").toQuery();
      const locKeys: LocKeyArray<"container"> = [{ kt: "container", lk: "123e4567-e89b-12d3-a456-426614174100" }];
      const contains = cacheMap.contains(query, locKeys);
      expect(contains).toBe(true);
    });

    it('should check if an item matching the query does not exist in specified locations', () => {
      const query: ItemQuery = IQFactory.pk("banana", "1").toQuery();
      const locKeys: LocKeyArray<"container"> = [{ kt: "container", lk: "123e4567-e89b-12d3-a456-426614174100" }];
      const contains = cacheMap.contains(query, locKeys);
      expect(contains).toBe(false);
    });

    it('should return false if no item matching the query exists in specified locations', () => {
      const query: ItemQuery = IQFactory.pk("test", "non-existant").toQuery();
      const locKeys: LocKeyArray<"container"> = [{ kt: "container", lk: "123e4567-e89b-12d3-a456-426614174100" }];
      const contains = cacheMap.contains(query, locKeys);
      expect(contains).toBe(false);
    });

    it('should check if item exists in empty location array (searches all)', () => {
      const query: ItemQuery = IQFactory.pk("banana", "0").toQuery();
      const contains = cacheMap.contains(query, []);
      expect(contains).toBe(true);
    });

    it('should return items matching the query in specified locations', () => {
      const query: ItemQuery = IQFactory.pk("banana", "0").toQuery();
      const locKeys: LocKeyArray<"container"> = [{ kt: "container", lk: "123e4567-e89b-12d3-a456-426614174100" }];
      const queriedItems = cacheMap.queryIn(query, locKeys);
      expect(queriedItems).toEqual([items[0]]);
    });

    it('should return items matching the query with locations set to empty', () => {
      const query: ItemQuery = IQFactory.pk("banana", "0").toQuery();
      const queriedItems = cacheMap.queryIn(query);
      expect(queriedItems).toEqual([items[0]]);
    });

    it('should return empty array for non-matching query', () => {
      const query: ItemQuery = IQFactory.pk("banana", "non-existent").toQuery();
      const queriedItems = cacheMap.queryIn(query, []);
      expect(queriedItems).toEqual([]);
    });

    it('should return multiple items matching the query', () => {
      // Add an item with the same banana reference
      const duplicateItem = {
        key: key3,
        events: {
          created: { at: new Date("2023-01-05T00:00:00Z") },
          updated: { at: new Date("2023-01-06T00:00:00Z") },
          deleted: { at: null },
        },
        refs: {
          banana: { kt: "banana", pk: "0" as UUID }, // Same banana reference as items[0]
        }
      };
      cacheMap.set(key3, duplicateItem);

      const query: ItemQuery = IQFactory.pk("banana", "0").toQuery();
      const queriedItems = cacheMap.queryIn(query, []);
      expect(queriedItems).toHaveLength(2);
      expect(queriedItems).toContainEqual(items[0]);
      expect(queriedItems).toContainEqual(duplicateItem);
    });
  });

  describe('Clone operations', () => {
    it('should clone the cache map', () => {
      const clone = cacheMap.clone();
      expect(clone).not.toBe(cacheMap); // Ensure it's a different instance
      expect(clone.get(key1)).toEqual(items[0]);
      expect(clone.get(key2)).toEqual(items[1]);
    });

    it('should create clones that share the same underlying map', () => {
      const clone = cacheMap.clone();

      // Modify original
      cacheMap.set(key3, items[2]);

      // Clone should have the new item since they share the same map
      expect(cacheMap.get(key3)).toEqual(items[2]);
      expect(clone.get(key3)).toEqual(items[2]);
    });

    it('should preserve types in cloned cache map', () => {
      const clone = cacheMap.clone();

      // Should be able to add new items to clone
      clone.set(key3, items[2]);
      expect(clone.get(key3)).toEqual(items[2]);
    });
  });

  describe('Key normalization', () => {
    it('should handle string and number keys consistently', () => {
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

      cacheMap.set(stringKey, testItem);

      // Should be able to retrieve using either string or number key due to normalization
      expect(cacheMap.get(stringKey)).toEqual(testItem);
      expect(cacheMap.get(numberKey)).toEqual(testItem);
    });

    it('should normalize lk values from numbers to strings', () => {
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
      cacheMap.set(keyWithNumberLk, testItem);

      // Should be able to retrieve with either number or string lk due to normalization
      expect(cacheMap.get(keyWithNumberLk)).toEqual(testItem);
      expect(cacheMap.get(keyWithStringLk)).toEqual(testItem);

      // Both should be considered the same key
      expect(cacheMap.includesKey(keyWithNumberLk)).toBe(true);
      expect(cacheMap.includesKey(keyWithStringLk)).toBe(true);
    });

    it('should handle null lk values without normalization', () => {
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
      expect(() => {
        cacheMap.set(keyWithNullLk, testItem);
      }).not.toThrow();

      // Should be able to retrieve the item
      expect(cacheMap.get(keyWithNullLk)).toEqual(testItem);
    });

    it('should handle non-object keys using JSON.stringify fallback', () => {
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
      expect(() => {
        cacheMap.set(primitiveKey, testItem);
      }).not.toThrow();

      expect(cacheMap.get(primitiveKey)).toEqual(testItem);
    });

    it('should handle null keys using JSON.stringify fallback', () => {
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
      expect(() => {
        cacheMap.set(nullKey, testItem);
      }).not.toThrow();

      expect(cacheMap.get(nullKey)).toEqual(testItem);
    });

    it('should handle non-object location items in isLocKeyArrayEqual', () => {
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

      cacheMap.set(keyWithNullLocItem, testItem);

      // Test allIn which uses isLocKeyArrayEqual internally
      const result = cacheMap.allIn([null] as any);
      expect(result).toEqual([testItem]);
    });

    it('should normalize lk values inside location arrays', () => {
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
      expect(() => {
        cacheMap.set(keyWithMixedLocTypes, testItem);
      }).not.toThrow();

      expect(cacheMap.get(keyWithMixedLocTypes)).toEqual(testItem);
    });

    it('should normalize top-level lk values in key objects', () => {
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
      expect(() => {
        cacheMap.set(keyWithTopLevelLk, testItem);
      }).not.toThrow();

      expect(cacheMap.get(keyWithTopLevelLk)).toEqual(testItem);

      // Test that it can be retrieved with string lk as well
      const keyWithStringLk = {
        kt: "test",
        pk: "top-level-lk-test",
        lk: "999", // String version of the same lk
        loc: [{ kt: "container", lk: "container-loc" }]
      } as any;

      expect(cacheMap.get(keyWithStringLk)).toEqual(testItem);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty cache operations', () => {
      const emptyCacheMap = new CacheMap<Item<"test", "container">, "test", "container">(["test", "container"]);

      expect(emptyCacheMap.values()).toEqual([]);
      expect(emptyCacheMap.keys()).toEqual([]);
      expect(emptyCacheMap.allIn([])).toEqual([]);
      expect(emptyCacheMap.contains(IQFactory.pk("banana", "0").toQuery(), [])).toBe(false);
      expect(emptyCacheMap.queryIn(IQFactory.pk("banana", "0").toQuery(), [])).toEqual([]);
    });

    it('should handle null and undefined values gracefully', () => {
      const nullKey = {
        kt: "test",
        pk: null as any,
        loc: [{ kt: "container", lk: null as any }]
      } as ComKey<"test", "container">;

      // Should not throw when setting with null values
      expect(() => {
        cacheMap.set(nullKey, items[0]);
      }).not.toThrow();
    });

    it('should handle complex location arrays', () => {
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

      cacheMap.set(multiLocKey, multiLocItem);
      expect(cacheMap.get(multiLocKey)).toEqual(multiLocItem);
    });
  });

});
