import { ComKey, IQFactory, Item, ItemQuery, LocKeyArray, UUID } from "@fjell/core";
import { CacheMap } from "@/CacheMap";

jest.mock('@fjell/logging', () => {
  return {
    get: jest.fn().mockReturnThis(),
    getLogger: jest.fn().mockReturnThis(),
    default: jest.fn(),
    error: jest.fn(),
    warning: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    emergency: jest.fn(),
    alert: jest.fn(),
    critical: jest.fn(),
    notice: jest.fn(),
    time: jest.fn().mockReturnThis(),
    end: jest.fn(),
    log: jest.fn(),
  }
});

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
    }
  ];

  let cacheMap: CacheMap<Item<"test", "container">, "test", "container">;

  beforeEach(() => {
    cacheMap = new CacheMap<Item<"test", "container">, "test", "container">(["test", "container"]);
    cacheMap.set(key1, items[0]);
    cacheMap.set(key2, items[1]);
  });

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

  it('should return all items in specified locations', () => {
    const locKeys: LocKeyArray<"container"> = [{ kt: "container", lk: "123e4567-e89b-12d3-a456-426614174100" }];
    const itemsInLoc = cacheMap.allIn(locKeys);
    expect(itemsInLoc).toEqual([items[0]]);
  });

  it('should return all items when locations array is empty', () => {
    const itemsInLoc = cacheMap.allIn([]);
    expect(itemsInLoc).toEqual(items);
  });

  it('should check if an item matching the query exists in specified locations', () => {
    const query: ItemQuery = IQFactory.pk("banana", "0").toQuery();
    const locKeys: LocKeyArray<"container"> = [{ kt: "container", lk: "123e4567-e89b-12d3-a456-426614174100" }];
    const contains = cacheMap.contains(query, locKeys);
    expect(contains).toBe(true);
  });

  it('should check if an item matching the query does not exists in specified locations', () => {
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

  it('should return items matching the query in specified locations', () => {
    const query: ItemQuery = IQFactory.pk("banana", "0").toQuery();
    const locKeys: LocKeyArray<"container"> = [{ kt: "container", lk: "123e4567-e89b-12d3-a456-426614174100" }];
    const queriedItems = cacheMap.queryIn(query, locKeys);
    expect(queriedItems).toEqual([items[0]]);
  });

  it('should return items matching the query iwith locations set to empty', () => {
    const query: ItemQuery = IQFactory.pk("banana", "0").toQuery();
    const queriedItems = cacheMap.queryIn(query);
    expect(queriedItems).toEqual([items[0]]);
  });

  it('should clone the cache map', () => {
    const clone = cacheMap.clone();
    expect(clone).not.toBe(cacheMap); // Ensure it's a different instance
  });

});