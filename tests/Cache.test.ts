import { Cache, createCache } from "../src/Cache";
import { ClientApi } from "@fjell/client-api";
import { ComKey, Item } from "@fjell/core";
import { NotFoundError } from "@fjell/http-api";
import { createCoordinate, createRegistry } from "@fjell/registry";
import { afterEach, beforeEach, describe, expect, type Mocked, test, vi } from 'vitest';

vi.mock("@fjell/client-api");
vi.mock("../src/CacheMap");

describe("AItemCache", () => {
  let api: Mocked<ClientApi<Item<"test", "container">, "test", "container">>;
  let cache: Cache<Item<"test", "container">, "test", "container">;

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
      }
    },
    {
      key: key2,
      events: {
        created: { at: new Date("2023-01-03T00:00:00Z") },
        updated: { at: new Date("2023-01-04T00:00:00Z") },
        deleted: { at: null },
      }
    }
  ];

  beforeEach(async () => {
    api = {
      all: vi.fn(),
      one: vi.fn(),
      action: vi.fn().mockReturnValue(items[1]),
      create: vi.fn(),
      remove: vi.fn(),
      update: vi.fn(),
      allAction: vi.fn(),
      allFacet: vi.fn(),
      get: vi.fn(),
      find: vi.fn().mockResolvedValue(items),
    } as unknown as Mocked<ClientApi<Item<"test", "container">, "test", "container">>;
    const registry = createRegistry('test');
    cache = await createCache<Item<"test", "container">, "test", "container">(api, createCoordinate(['test', 'container']), registry);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test("should fetch all items and update cache", async () => {

    api.all.mockResolvedValue(items);

    const [cacheMap, result] = await cache.operations.all();

    expect(api.all).toHaveBeenCalledWith({}, []);
    expect(cacheMap.set).toHaveBeenCalledTimes(items.length);
    expect(result).toEqual(items);
  });

  test("should handle NotFoundError in all method", async () => {
    api.all.mockRejectedValue(new NotFoundError("Screwed Up", "/test", {}));

    const [, result] = await cache.operations.all();

    expect(api.all).toHaveBeenCalledWith({}, []);
    expect(result).toEqual([]);
  });

  test("should fetch one item and update cache", async () => {
    const item: Item<"test", "container"> = items[0];
    api.one.mockResolvedValue(item);

    const [cacheMap, result] = await cache.operations.one();

    expect(api.one).toHaveBeenCalledWith({}, []);
    expect(cacheMap.set).toHaveBeenCalledWith(items[0].key, items[0]);
    expect(result).toEqual(item);
  });

  test("should handle NotFoundError in one method", async () => {
    api.one.mockRejectedValue(new NotFoundError("Nothing Works", "/test", {}));

    const [, result] = await cache.operations.one();

    expect(api.one).toHaveBeenCalledWith({}, []);
    expect(result).toBeNull();
  });

  test("oneshould throw error other than NotFoundError in one method", async () => {
    api.one.mockRejectedValue(new Error("Hateful Error"));

    await expect(cache.operations.one()).rejects.toThrow(new Error("Hateful Error"));
  });

  test("all should throw error other than NotFoundError in one method", async () => {
    api.all.mockRejectedValue(new Error("Hateful Error"));

    await expect(cache.operations.all()).rejects.toThrow(new Error("Hateful Error"));
  });

  test("should perform action and update cache", async () => {
    const [cacheMap, result] = await cache.operations.action(key2, "action");

    expect(api.action).toHaveBeenCalledWith(key2, "action", {});
    expect(cacheMap.set).toHaveBeenCalledWith(key2, items[1]);
    expect(result).toEqual(items[1]);
  });

  test("should validate key supplied to action", async () => {
    await expect(cache.operations.action({
      kt: 'test',
      pk: 'null',
      loc: [{ kt: 'container', lk: 'null' }]
    }, "action")).rejects.toThrow(new Error("Key for Action is not a valid ItemKey"));
  });

  test("should validate key supplied to get", async () => {
    await expect(cache.operations.get({
      kt: 'test',
      pk: 'null',
      loc: [{ kt: 'container', lk: 'null' }]
    })).rejects.toThrow(new Error("Key for Get is not a valid ItemKey"));
  });

  test("should validate key supplied to retrieve", async () => {
    await expect(cache.operations.retrieve({
      kt: 'test',
      pk: 'null',
      loc: [{ kt: 'container', lk: 'null' }]
    })).rejects.toThrow(new Error("Key for Retrieve is not a valid ItemKey"));
  });

  test("should validate key supplied to remove", async () => {
    await expect(cache.operations.remove({
      kt: 'test',
      pk: 'null',
      loc: [{ kt: 'container', lk: 'null' }]
    })).rejects.toThrow(new Error("Key for Remove is not a valid ItemKey"));
  });

  test("should validate key supplied to update", async () => {
    await expect(cache.operations.update({
      kt: 'test',
      pk: 'null',
      loc: [{ kt: 'container', lk: 'null' }]
    }, { key: key2 })).rejects.toThrow(new Error("Key for Update is not a valid ItemKey"));
  });

  test("should create item and update cache", async () => {
    const itemProps: Partial<Item<"test", "container">> = { key: key2 };
    const item: Item<"test", "container"> = items[1];
    api.create.mockResolvedValue(items[1]);

    const [cacheMap, result] = await cache.operations.create(itemProps);

    expect(api.create).toHaveBeenCalledWith(itemProps, []);
    expect(cacheMap.set).toHaveBeenCalledWith(item.key, item);
    expect(result).toEqual(item);
  });

  test("should remove item from cache", async () => {
    const key: ComKey<"test", "container"> = key1;

    await cache.operations.remove(key);

    expect(api.remove).toHaveBeenCalledWith(key);
    expect(cache.cacheMap.delete).toHaveBeenCalledWith(key);
  });

  test("should handle error in remove method", async () => {
    const key: ComKey<"test", "container"> = key1;
    const error = new Error("Remove failed");
    api.remove.mockRejectedValue(error);

    await expect(cache.operations.remove(key)).rejects.toThrow(error);
    expect(api.remove).toHaveBeenCalledWith(key);
    expect(cache.cacheMap.delete).not.toHaveBeenCalled();
  });

  test("should update item and update cache", async () => {
    const itemProps: Partial<Item<"test", "container">> = { key: key2 };
    const item: Item<"test", "container"> = items[1];
    api.update.mockResolvedValue(item);

    const [cacheMap, result] = await cache.operations.update(key2, itemProps);

    expect(api.update).toHaveBeenCalledWith(key2, itemProps);
    expect(cacheMap.set).toHaveBeenCalledWith(item.key, item);
    expect(result).toEqual(item);
  });

  test("should handle error in update method", async () => {
    const itemProps: Partial<Item<"test", "container">> = { key: key2 };
    const error = new Error("Update failed");
    api.update.mockRejectedValue(error);

    await expect(cache.operations.update(key2, itemProps)).rejects.toThrow(error);
    expect(api.update).toHaveBeenCalledWith(key2, itemProps);
    expect(cache.cacheMap.set).not.toHaveBeenCalled();
  });

  test("should perform allAction and update cache", async () => {
    const action = "someAction";
    const item: Item<"test", "container"> = items[1];
    api.allAction.mockResolvedValue([item]);

    const [cacheMap, result] = await cache.operations.allAction(action);

    expect(api.allAction).toHaveBeenCalledWith(action, {}, []);
    expect(cacheMap.set).toHaveBeenCalledWith(item.key, item);
    expect(result).toEqual([item]);
  });

  test("should handle error in allAction method", async () => {
    const action = "someAction";
    const error = new Error("AllAction failed");
    api.allAction.mockRejectedValue(error);

    await expect(cache.operations.allAction(action)).rejects.toThrow(error);
    expect(api.allAction).toHaveBeenCalledWith(action, {}, []);
    expect(cache.cacheMap.set).not.toHaveBeenCalled();
  });

  test("should perform allFacet and return data", async () => {
    const facet = "testFacet";
    const facetData = { status: "active", count: 5 };
    api.allFacet.mockResolvedValue(facetData);

    const [cacheMap, result] = await cache.operations.allFacet(facet);

    expect(api.allFacet).toHaveBeenCalledWith(facet, {}, []);
    expect(result).toEqual(facetData);
    expect(cacheMap).toEqual(cache.cacheMap);
  });

  test("should perform allFacet with parameters", async () => {
    const facet = "testFacet";
    const params = { filter: "active" };
    const locations = [{ kt: "container", lk: "location1" }] as [{ kt: "container", lk: string }];
    const facetData = { results: [] };
    api.allFacet.mockResolvedValue(facetData);

    const [cacheMap, result] = await cache.operations.allFacet(facet, params, locations);

    expect(api.allFacet).toHaveBeenCalledWith(facet, params, locations);
    expect(result).toEqual(facetData);
    expect(cacheMap).toEqual(cache.cacheMap);
  });

  test("should fetch item by key and update cache", async () => {
    const item: Item<"test", "container"> = items[0];
    api.get.mockResolvedValue(item);

    const [cacheMap, result] = await cache.operations.get(key1);

    expect(api.get).toHaveBeenCalledWith(key1);
    expect(cacheMap.set).toHaveBeenCalledWith(item.key, item);
    expect(result).toEqual(item);
  });

  test("should handle error in get method", async () => {
    const error = new Error("Get failed");
    api.get.mockRejectedValue(error);

    await expect(cache.operations.get(key1)).rejects.toThrow(error);
    expect(api.get).toHaveBeenCalledWith(key1);
    expect(cache.cacheMap.set).not.toHaveBeenCalled();
  });

  test("should return null if item not found in get method", async () => {
    api.get.mockResolvedValue(null);

    const [, result] = await cache.operations.get(key1);

    expect(api.get).toHaveBeenCalledWith(key1);
    expect(result).toBeNull();
  });

  test("should retrieve item from cache if it exists", async () => {
    const item: Item<"test", "container"> = items[0];
    cache.cacheMap.includesKey = vi.fn().mockReturnValue(true);
    cache.cacheMap.get = vi.fn().mockReturnValue(item);

    const [cacheMap, result] = await cache.operations.retrieve(key1);

    expect(cache.cacheMap.includesKey).toHaveBeenCalledWith(key1);
    expect(cache.cacheMap.get).toHaveBeenCalledWith(key1);
    expect(result).toEqual(item);
    expect(cacheMap).toBeNull();
  });

  test("should retrieve item from API if not in cache", async () => {
    const item: Item<"test", "container"> = items[0];
    cache.cacheMap.includesKey = vi.fn().mockReturnValue(false);
    api.get.mockResolvedValue(item);

    const [cacheMap, result] = await cache.operations.retrieve(key1);

    expect(cache.cacheMap.includesKey).toHaveBeenCalledWith(key1);
    expect(api.get).toHaveBeenCalledWith(key1);
    expect(result).toEqual(item);
    expect(cacheMap).toEqual(cache.cacheMap);
  });

  test("should return null if item not found in cache or API", async () => {
    cache.cacheMap.includesKey = vi.fn().mockReturnValue(false);
    api.get.mockResolvedValue(null);

    const [cacheMap, result] = await cache.operations.retrieve(key1);

    expect(cache.cacheMap.includesKey).toHaveBeenCalledWith(key1);
    expect(api.get).toHaveBeenCalledWith(key1);
    expect(result).toBeNull();
    expect(cacheMap).toEqual(cache.cacheMap);
  });

  test("should handle error in retrieve method", async () => {
    const error = new Error("Retrieve failed");
    cache.cacheMap.includesKey = vi.fn().mockReturnValue(false);
    api.get.mockRejectedValue(error);

    await expect(cache.operations.retrieve(key1)).rejects.toThrow(error);
    expect(cache.cacheMap.includesKey).toHaveBeenCalledWith(key1);
    expect(api.get).toHaveBeenCalledWith(key1);
  });

  test("find should return null if item not found", async () => {
    const [, result] = await cache.operations.find('someFinder', {});

    expect(result).toEqual(items);
  });

  test("set should update cache", async () => {
    const item: Item<"test", "container"> = items[0];
    await cache.operations.set(key1, item);

    expect(cache.cacheMap.set).toHaveBeenCalledWith(key1, item);
  });

  test("should call the facet method with correct parameters", async () => {
    const facetData = { status: "active", count: 10 };
    api.facet = vi.fn().mockResolvedValue(facetData);

    const [cacheMap, result] = await cache.operations.facet(key1, "testFacet", { param: "value" });

    expect(api.facet).toHaveBeenCalledWith(key1, "testFacet", { param: "value" });
    expect(result).toEqual(facetData);
    expect(cacheMap).toEqual(cache.cacheMap);
  });

  test("should call the facet method with default parameters", async () => {
    const facetData = { data: "test" };
    api.facet = vi.fn().mockResolvedValue(facetData);

    const [cacheMap, result] = await cache.operations.facet(key1, "testFacet");

    expect(api.facet).toHaveBeenCalledWith(key1, "testFacet", {});
    expect(result).toEqual(facetData);
    expect(cacheMap).toEqual(cache.cacheMap);
  });

  test("should call the findOne method with correct parameters", async () => {
    const item: Item<"test", "container"> = items[0];
    api.findOne = vi.fn().mockResolvedValue(item);

    const [cacheMap, result] = await cache.operations.findOne("testFinder", { param: "value" }, []);

    expect(api.findOne).toHaveBeenCalledWith("testFinder", { param: "value" }, []);
    expect(cacheMap.set).toHaveBeenCalledWith(item.key, item);
    expect(result).toEqual(item);
  });

  test("should call the findOne method with default parameters", async () => {
    const item: Item<"test", "container"> = items[0];
    api.findOne = vi.fn().mockResolvedValue(item);

    const [cacheMap, result] = await cache.operations.findOne("testFinder");

    expect(api.findOne).toHaveBeenCalledWith("testFinder", {}, []);
    expect(cacheMap.set).toHaveBeenCalledWith(item.key, item);
    expect(result).toEqual(item);
  });

  test("should reset the cache", async () => {
    const [cacheMap] = await cache.operations.reset();

    expect(cacheMap).toBeDefined();
    // After reset, the cache should have a new cacheMap instance
    expect(cacheMap).toEqual(expect.any(Object));
  });

  test("should validate key for set method", async () => {
    const invalidKey = {
      kt: 'test',
      pk: 'null',
      loc: [{ kt: 'container', lk: 'null' }]
    } as unknown as ComKey<"test", "container">;

    await expect(cache.operations.set(invalidKey, items[0]))
      .rejects
      .toThrow("Key for Set is not a valid ItemKey");
  });

  test("should validate primary key type in set method", async () => {
    const validKey = key1;
    const itemWithWrongPkType = {
      ...items[0],
      key: {
        ...items[0].key,
        kt: 'wrong' as any
      }
    };

    await expect(cache.operations.set(validKey, itemWithWrongPkType))
      .rejects
      .toThrow("Item does not have the correct primary key type");
  });

  test("should validate key equality in set method", async () => {
    const differentKey = key2;
    const item = items[0]; // This has key1

    await expect(cache.operations.set(differentKey, item))
      .rejects
      .toThrow("Key does not match item key");
  });

  test("should handle createCache with child cache coordinate", async () => {
    const childRegistry = createRegistry('test');
    const childCache = await createCache<Item<"test", "container">, "test", "container">(api, createCoordinate(['test', 'container']), childRegistry);

    expect(childCache.coordinate.kta).toEqual(['test', 'container']);
  });
});
