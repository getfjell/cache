import { ClientApi } from "@fjell/client-api";
import { ComKey, Item, ItemProperties } from "@fjell/core";
import { NotFoundError } from "@fjell/http-api";
import { AItemCache } from "@/AItemCache";
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
jest.mock("@fjell/client-api");
jest.mock("@/CacheMap");

describe("AItemCache", () => {
  let api: jest.Mocked<ClientApi<Item<"test", "container">, "test", "container">>;
  let cache: AItemCache<Item<"test", "container">, "test", "container">;

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

  beforeEach(() => {
    api = {
      all: jest.fn(),
      one: jest.fn(),
      action: jest.fn().mockReturnValue(items[1]),
      create: jest.fn(),
      remove: jest.fn(),
      update: jest.fn(),
      allAction: jest.fn(),
      get: jest.fn(),
      find: jest.fn().mockResolvedValue(items)
    } as unknown as jest.Mocked<ClientApi<Item<"test", "container">, "test", "container">>;
    cache = new AItemCache("testCache", api, "test");
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("should fetch all items and update cache", async () => {

    api.all.mockResolvedValue(items);

    const [cacheMap, result] = await cache.all();

    expect(api.all).toHaveBeenCalledWith({}, {}, []);
    expect(cacheMap.set).toHaveBeenCalledTimes(items.length);
    expect(result).toEqual(items);
  });

  test("should handle NotFoundError in all method", async () => {
    api.all.mockRejectedValue(new NotFoundError("Screwed Up", "/test", {}));

    const [, result] = await cache.all();

    expect(api.all).toHaveBeenCalledWith({}, {}, []);
    expect(result).toEqual([]);
  });

  test("should fetch one item and update cache", async () => {
    const item: Item<"test", "container"> = items[0];
    api.one.mockResolvedValue(item);

    const [cacheMap, result] = await cache.one();

    expect(api.one).toHaveBeenCalledWith({}, {}, []);
    expect(cacheMap.set).toHaveBeenCalledWith(items[0].key, items[0]);
    expect(result).toEqual(item);
  });

  test("should handle NotFoundError in one method", async () => {
    api.one.mockRejectedValue(new NotFoundError("Nothing Works", "/test", {}));

    const [, result] = await cache.one();

    expect(api.one).toHaveBeenCalledWith({}, {}, []);
    expect(result).toBeNull();
  });

  test("oneshould throw error other than NotFoundError in one method", async () => {
    api.one.mockRejectedValue(new Error("Hateful Error"));

    await expect(cache.one()).rejects.toThrow(new Error("Hateful Error"));
  });

  test("all should throw error other than NotFoundError in one method", async () => {
    api.all.mockRejectedValue(new Error("Hateful Error"));

    await expect(cache.all()).rejects.toThrow(new Error("Hateful Error"));
  });

  test("should perform action and update cache", async () => {
    const [cacheMap, result] = await cache.action(key2, "action");

    expect(api.action).toHaveBeenCalledWith(key2, "action", {}, {});
    expect(cacheMap.set).toHaveBeenCalledWith(key2, items[1]);
    expect(result).toEqual(items[1]);
  });

  test("should validate key supplied to action", async () => {
    await expect(cache.action({
      kt: 'test',
      pk: 'null',
      loc: [ { kt: 'container', lk: 'null' }]
    }, "action")).rejects.toThrow(new Error("Key for Action is not a valid ItemKey"));
  });

  test("should validate key supplied to get", async () => {
    await expect(cache.get({
      kt: 'test',
      pk: 'null',
      loc: [ { kt: 'container', lk: 'null' }]
    })).rejects.toThrow(new Error("Key for Get is not a valid ItemKey"));
  });

  test("should validate key supplied to retrieve", async () => {
    await expect(cache.retrieve({
      kt: 'test',
      pk: 'null',
      loc: [ { kt: 'container', lk: 'null' }]
    })).rejects.toThrow(new Error("Key for Retrieve is not a valid ItemKey"));
  });

  test("should validate key supplied to remove", async () => {
    await expect(cache.remove({
      kt: 'test',
      pk: 'null',
      loc: [ { kt: 'container', lk: 'null' }]
    })).rejects.toThrow(new Error("Key for Remove is not a valid ItemKey"));
  });

  test("should validate key supplied to update", async () => {
    await expect(cache.update({
      kt: 'test',
      pk: 'null',
      loc: [ { kt: 'container', lk: 'null' }]
    }, { key: key2 })).rejects.toThrow(new Error("Key for Update is not a valid ItemKey"));
  });

  test("should create item and update cache", async () => {
    const itemProps: ItemProperties<"test", "container"> = { key: key2 };
    const item: Item<"test", "container"> = items[1];
    api.create.mockResolvedValue(items[1]);

    const [cacheMap, result] = await cache.create(itemProps);

    expect(api.create).toHaveBeenCalledWith(itemProps, {}, []);
    expect(cacheMap.set).toHaveBeenCalledWith(item.key, item);
    expect(result).toEqual(item);
  });

  test("should remove item from cache", async () => {
    const key: ComKey<"test", "container"> = key1;

    await cache.remove(key);

    expect(api.remove).toHaveBeenCalledWith(key, {});
    expect(cache.cacheMap.delete).toHaveBeenCalledWith(key);
  });

  test("should handle error in remove method", async () => {
    const key: ComKey<"test", "container"> = key1;
    const error = new Error("Remove failed");
    api.remove.mockRejectedValue(error);

    await expect(cache.remove(key)).rejects.toThrow(error);
    expect(api.remove).toHaveBeenCalledWith(key, {});
    expect(cache.cacheMap.delete).not.toHaveBeenCalled();
  });

  test("should update item and update cache", async () => {
    const itemProps: ItemProperties<"test", "container"> = { key: key2 };
    const item: Item<"test", "container"> = items[1];
    api.update.mockResolvedValue(item);

    const [cacheMap, result] = await cache.update(key2, itemProps);

    expect(api.update).toHaveBeenCalledWith(key2, itemProps, {});
    expect(cacheMap.set).toHaveBeenCalledWith(item.key, item);
    expect(result).toEqual(item);
  });

  test("should handle error in update method", async () => {
    const itemProps: ItemProperties<"test", "container"> = { key: key2 };
    const error = new Error("Update failed");
    api.update.mockRejectedValue(error);

    await expect(cache.update(key2, itemProps)).rejects.toThrow(error);
    expect(api.update).toHaveBeenCalledWith(key2, itemProps, {});
    expect(cache.cacheMap.set).not.toHaveBeenCalled();
  });

  test("should perform allAction and update cache", async () => {
    const action = "someAction";
    const item: Item<"test", "container"> = items[1];
    api.allAction.mockResolvedValue([item]);

    const [cacheMap, result] = await cache.allAction(action);

    expect(api.allAction).toHaveBeenCalledWith(action, {}, {}, []);
    expect(cacheMap.set).toHaveBeenCalledWith(item.key, item);
    expect(result).toEqual([item]);
  });

  test("should handle error in allAction method", async () => {
    const action = "someAction";
    const error = new Error("AllAction failed");
    api.allAction.mockRejectedValue(error);

    await expect(cache.allAction(action)).rejects.toThrow(error);
    expect(api.allAction).toHaveBeenCalledWith(action, {}, {}, []);
    expect(cache.cacheMap.set).not.toHaveBeenCalled();
  });

  test("should fetch item by key and update cache", async () => {
    const item: Item<"test", "container"> = items[0];
    api.get.mockResolvedValue(item);

    const [cacheMap, result] = await cache.get(key1);

    expect(api.get).toHaveBeenCalledWith(key1, {});
    expect(cacheMap.set).toHaveBeenCalledWith(item.key, item);
    expect(result).toEqual(item);
  });

  test("should handle error in get method", async () => {
    const error = new Error("Get failed");
    api.get.mockRejectedValue(error);

    await expect(cache.get(key1)).rejects.toThrow(error);
    expect(api.get).toHaveBeenCalledWith(key1, {});
    expect(cache.cacheMap.set).not.toHaveBeenCalled();
  });

  test("should return null if item not found in get method", async () => {
    api.get.mockResolvedValue(null);

    const [, result] = await cache.get(key1);

    expect(api.get).toHaveBeenCalledWith(key1, {});
    expect(result).toBeNull();
  });

  test("should retrieve item from cache if it exists", async () => {
    const item: Item<"test", "container"> = items[0];
    cache.cacheMap.includesKey = jest.fn().mockReturnValue(true);
    cache.cacheMap.get = jest.fn().mockReturnValue(item);

    const [cacheMap, result] = await cache.retrieve(key1);

    expect(cache.cacheMap.includesKey).toHaveBeenCalledWith(key1);
    expect(cache.cacheMap.get).toHaveBeenCalledWith(key1);
    expect(result).toEqual(item);
    expect(cacheMap).toBeNull();
  });

  test("should retrieve item from API if not in cache", async () => {
    const item: Item<"test", "container"> = items[0];
    cache.cacheMap.includesKey = jest.fn().mockReturnValue(false);
    api.get.mockResolvedValue(item);

    const [cacheMap, result] = await cache.retrieve(key1);

    expect(cache.cacheMap.includesKey).toHaveBeenCalledWith(key1);
    expect(api.get).toHaveBeenCalledWith(key1, {});
    expect(result).toEqual(item);
    expect(cacheMap).toEqual(cache.cacheMap);
  });

  test("should return null if item not found in cache or API", async () => {
    cache.cacheMap.includesKey = jest.fn().mockReturnValue(false);
    api.get.mockResolvedValue(null);

    const [cacheMap, result] = await cache.retrieve(key1);

    expect(cache.cacheMap.includesKey).toHaveBeenCalledWith(key1);
    expect(api.get).toHaveBeenCalledWith(key1, {});
    expect(result).toBeNull();
    expect(cacheMap).toEqual(cache.cacheMap);
  });

  test("should handle error in retrieve method", async () => {
    const error = new Error("Retrieve failed");
    cache.cacheMap.includesKey = jest.fn().mockReturnValue(false);
    api.get.mockRejectedValue(error);

    await expect(cache.retrieve(key1)).rejects.toThrow(error);
    expect(cache.cacheMap.includesKey).toHaveBeenCalledWith(key1);
    expect(api.get).toHaveBeenCalledWith(key1, {});
  });

  test("should load cache correctly", async () => {
    const newCacheMap = new Map();
    newCacheMap.set(key1, items[0]);
    newCacheMap.set(key2, items[1]);

    await cache.loadCache(newCacheMap as unknown as CacheMap<Item<"test", "container">, "test", "container">);

    expect(cache.cacheMap).toEqual(newCacheMap);
  });

  test("find should return null if item not found", async () => {
    const [, result] = await cache.find('someFinder', {});

    expect(result).toEqual(items);
  });
});
