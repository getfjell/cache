import { CacheMap } from '@/CacheMap';
import { Cache, createCache } from '@/Cache';
import { PItemApi } from '@fjell/client-api';
import { Item, ItemProperties, PriKey } from '@fjell/core';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';

vi.mock('@fjell/client-api');
vi.mock('../src/CacheMap');

type TestItem = Item<'test'>;

describe('PItemCache', () => {
  let apiMock: Mocked<PItemApi<TestItem, 'test'>>;
  let cache: Cache<TestItem, 'test'>;

  const key1 = {
    kt: "test", pk: "123e4567-e89b-12d3-a456-426614174000",
  } as PriKey<"test">;

  const key2 = {
    kt: "test", pk: "123e4567-e89b-12d3-a456-426614174001",
  } as PriKey<"test">;

  const items: Item<"test">[] = [
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
    vi.resetAllMocks();

    apiMock = {
      all: vi.fn().mockReturnValue([items]),
      one: vi.fn().mockReturnValue(items[0]),
      action: vi.fn().mockReturnValue(items[0]),
      create: vi.fn().mockReturnValue([key1, items[0]]),
      remove: vi.fn().mockReturnValue(items[0]),
      update: vi.fn().mockReturnValue(items[0]),
      allAction: vi.fn().mockReturnValue([]),
      get: vi.fn().mockReturnValue(items[0]),
      find: vi.fn().mockReturnValue(items),
    } as unknown as Mocked<PItemApi<TestItem, 'test'>>;

    cache = await createCache(apiMock, 'test');
  });

  it('should call all method', async () => {
    const result = await cache.all();

    expect(apiMock.all).toHaveBeenCalledWith({}, {}, []);
    expect(result).toEqual([expect.any(CacheMap), [items]]);
  });

  it('should call one method', async () => {
    const result = await cache.one();

    expect(apiMock.one).toHaveBeenCalledWith({}, {}, []);
    expect(result).toEqual([expect.any(CacheMap), items[0]]);
  });

  it('should call action method', async () => {
    const action = 'testAction';

    const result = await cache.action(key1, action);

    expect(apiMock.action).toHaveBeenCalledWith(key1, action, {}, {});
    expect(result).toEqual([expect.any(CacheMap), expect.any(Object)]);
  });

  it('should call allAction method', async () => {
    const action = 'testAction';

    const result = await cache.allAction(action);

    expect(apiMock.allAction).toHaveBeenCalledWith(action, {}, {}, []);
    expect(result).toEqual([expect.any(CacheMap), []]);
  });

  it('should call get method', async () => {

    const result = await cache.get(key1);

    expect(apiMock.get).toHaveBeenCalledWith(key1, {});
    expect(result).toEqual([expect.any(CacheMap), items[0]]);
  });

  it('should call retrieve method', async () => {
    const result = await cache.retrieve(key1);

    expect(apiMock.get).toHaveBeenCalledWith(key1, {});
    expect(result).toEqual([expect.any(CacheMap), items[0]]);
  });

  it('should call remove method', async () => {
    const result = await cache.remove(key1);

    expect(apiMock.remove).toHaveBeenCalledWith(key1, {});
    expect(result).toEqual(expect.any(CacheMap));
  });

  it('should call update method', async () => {
    const itemProps: ItemProperties<'test'> = { id: 'test' };

    const result = await cache.update(key1, itemProps);

    expect(apiMock.update).toHaveBeenCalledWith(key1, itemProps, {});
    expect(result).toEqual([expect.any(CacheMap), expect.any(Object)]);
  });

  it('find should call find method', async () => {
    const result = await cache.find('someFinder', {});

    expect(apiMock.find).toHaveBeenCalledWith('someFinder', {}, {}, []);
    expect(result).toEqual([expect.any(CacheMap), expect.any(Object)]);
  });

  it('should call set method', async () => {
    const result = await cache.set(key1, items[0]);

    expect(apiMock.update).not.toHaveBeenCalledWith(key1, items[0], {});
    expect(result).toEqual([expect.any(CacheMap), expect.any(Object)]);
  });

  it('should throw error when setting item with malformed key', async () => {
    const malformedKey = {
      kt: 'whatever',
      pk: "not-a-valid-uuid" // Invalid UUID format
    } as unknown as PriKey<"test">;

    const malformedItem = {
      ...items[0],
      key: malformedKey
    };

    await expect(cache.set(malformedKey, malformedItem as unknown as TestItem))
      .rejects
      .toThrow("Item does not have the correct primary key type");
  });

  it('should throw error when setting item with mismatched keys', async () => {
    const differentKey = {
      kt: 'whatever',
      pk: '123e4567-e89b-12d3-a456-426614174000'
    } as unknown as PriKey<"test">;

    await expect(cache.set(differentKey, items[0]))
      .rejects
      .toThrow('Key does not match item key');
  });
});
