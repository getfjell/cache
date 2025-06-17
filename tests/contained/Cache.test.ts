import { Cache, createCache } from '@/Cache';
import { CItemApi } from "@fjell/client-api";
import { ComKey, Item, ItemProperties, ItemQuery, LocKey, LocKeyArray, PriKey, UUID } from "@fjell/core";
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';

vi.mock('../src/logger', () => {
  return {
    get: vi.fn().mockReturnThis(),
    getLogger: vi.fn().mockReturnThis(),
    default: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    emergency: vi.fn(),
    alert: vi.fn(),
    critical: vi.fn(),
    notice: vi.fn(),
    time: vi.fn().mockReturnThis(),
    end: vi.fn(),
    log: vi.fn(),
  }
});
vi.mock("@fjell/client-api");

type ContainerItem = Item<"container">;

type TestItem = Item<"test", "container">;
type TestKey = ComKey<"test", "container">;

describe("Combined Item Cache Tests", () => {

  let mockParentCache: Mocked<Cache<ContainerItem, 'container'>>;
  let mockApi: Mocked<CItemApi<TestItem, "test", "container">>;
  let itemCache: Cache<TestItem, "test", "container">;

  const loc1: [LocKey<"container">] = [{ kt: "container", lk: "123e4567-e89b-12d3-a456-426614174100" }];
  const loc2: [LocKey<"container">] = [{ kt: "container", lk: "123e4567-e89b-12d3-a456-426614174101" }];

  const key1 = {
    kt: "test",
    pk: "123e4567-e89b-12d3-a456-426614174000",
    loc: loc1,
  } as ComKey<"test", "container">;
  const key2 = {
    kt: "test",
    pk: "123e4567-e89b-12d3-a456-426614174001",
    loc: loc2,
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

  const key: TestKey = {
    kt: 'test',
    pk: '1-1-1-1-1' as UUID,
    loc: [{ kt: 'container', lk: '2-2-2-2-2' as UUID }]
  };

  beforeEach(async () => {
    vi.resetAllMocks();

    mockParentCache = {
      all: vi.fn(),
      one: vi.fn(),
      action: vi.fn(),
      create: vi.fn(),
      remove: vi.fn(),
      update: vi.fn(),
      allAction: vi.fn(),
      get: vi.fn(),
      getKeyTypes: vi.fn().mockReturnValue(["container"]),
      set: vi.fn(),
    } as unknown as Mocked<Cache<ContainerItem, 'container'>>

    mockApi = {
      all: vi.fn(),
      one: vi.fn(),
      action: vi.fn(),
      create: vi.fn(),
      remove: vi.fn(),
      update: vi.fn(),
      allAction: vi.fn(),
      get: vi.fn(),
      find: vi.fn(),
      set: vi.fn(),
    } as unknown as Mocked<CItemApi<TestItem, "test", "container">>;

    itemCache = await createCache<TestItem, "test", "container">(mockApi, "test", mockParentCache);

  });

  it("should call the all method with correct parameters", async () => {
    // @ts-ignore
    mockApi.all.mockResolvedValue(items);
    const query: ItemQuery = {};
    const locations: LocKeyArray<"container"> = loc1;
    await itemCache.all(query, locations);
    expect(mockApi.all).toHaveBeenCalledWith(query, {}, locations);
  });

  it("should call the one method with correct parameters", async () => {
    // @ts-ignore
    mockApi.one.mockResolvedValue(items[0]);
    const query: ItemQuery = {};
    const locations: LocKeyArray<"container"> = loc1;
    await itemCache.one(query, locations);
    expect(mockApi.one).toHaveBeenCalledWith(query, {}, locations);
  });

  it("should call the action method with correct parameters", async () => {
    // @ts-ignore
    mockApi.action.mockResolvedValue(items[0]);
    const action = "testAction";
    const body = { data: "testData" };
    await itemCache.action(key1, action, body);
    expect(mockApi.action).toHaveBeenCalledWith(key1, action, body, {});
  });

  it("should call the action method with correct parameters and no body", async () => {
    // @ts-ignore
    mockApi.action.mockResolvedValue(items[0]);
    const action = "testAction";
    await itemCache.action(key1, action);
    expect(mockApi.action).toHaveBeenCalledWith(key1, action, {}, {});
  });

  it("should call the allAction method with correct parameters", async () => {
    // @ts-ignore
    mockApi.allAction.mockResolvedValue(items);
    const action = "testAction";
    const body = { data: "testData" };
    const locations: LocKeyArray<"container"> = loc1;
    await itemCache.allAction(action, body, locations);
    expect(mockApi.allAction).toHaveBeenCalledWith(action, body, {}, locations);
  });

  it("should call the create method with correct parameters", async () => {
    // @ts-ignore
    mockApi.create.mockResolvedValue(items[0]);
    const itemProps: ItemProperties<"test", "container"> = { key: key1 };
    const locations: LocKeyArray<"container"> = loc2;
    await itemCache.create(itemProps, locations);
    expect(mockApi.create).toHaveBeenCalledWith(itemProps, {}, locations);
  });

  it("should call the get method with correct parameters", async () => {
    // @ts-ignore
    mockApi.get.mockResolvedValue(items[0]);
    await itemCache.get(key);
    expect(mockApi.get).toHaveBeenCalledWith(key, {});
  });

  it("should call the retrieve method with correct parameters", async () => {
    // @ts-ignore
    mockApi.get.mockResolvedValue(items[0]);
    await itemCache.retrieve(key);
    expect(mockApi.get).toHaveBeenCalledWith(key, {});
  });

  it("should call the remove method with correct parameters", async () => {
    // @ts-ignore
    mockApi.get.mockResolvedValue(key1);
    await itemCache.remove(key);
    expect(mockApi.remove).toHaveBeenCalledWith(key, {});
  });

  it("should call the update method with correct parameters", async () => {
    // @ts-ignore
    mockApi.update.mockResolvedValue(items[0]);
    await itemCache.update(key1, items[0]);
    expect(mockApi.update).toHaveBeenCalledWith(key1, items[0], {});
  });

  it("should call the find method with correct parameters", async () => {
    const finder = "testFinder";
    const locations: LocKeyArray<"container"> = loc1;
    // @ts-ignore
    mockApi.find.mockResolvedValue(items);

    await itemCache.find(finder, {}, locations);

    expect(mockApi.find).toHaveBeenCalledWith(finder, {}, {}, locations);
  });

  // TODO: There's something weird here that we need a unified approach to locations is optional?
  it("should call the find method with correct parameters and no locations", async () => {
    const finder = "testFinder";
    // @ts-ignore
    mockApi.find.mockResolvedValue(items);

    await itemCache.find(finder, {});

    expect(mockApi.find).toHaveBeenCalledWith(finder, {}, {}, []);
  });

  it("should call the set method with correct parameters", async () => {
    // @ts-ignore
    mockApi.get.mockResolvedValue(items[0]);
    await itemCache.set(key1, items[0]);
    expect(mockApi.update).not.toHaveBeenCalledWith(key1, items[0]);
  });

  it("should throw error when setting item with malformed key", async () => {
    const key1 = {
      kt: 'whatever',
      pk: "not-a-valid-uuid" // Invalid UUID format
    } as unknown as ComKey<"test", "container">;

    const malformedItem = {
      ...items[0],
      key: key1
    };

    await expect(itemCache.set(key1, malformedItem as unknown as TestItem))
      .rejects
      .toThrow("Item does not have the correct primary key type");
  });

  it("should throw error when setting item with mismatched keys", async () => {
    const differentKey = {
      kt: 'test',
      pk: '123e4567-e89b-12d3-a456-426614174000'
    } as PriKey<"test">;

    await expect(itemCache.set(differentKey, items[0]))
      .rejects
      .toThrow('Key does not match item key');
  });

});