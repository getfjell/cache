import { CacheMap } from '@/CacheMap';
import { Cache, createCache } from '@/Cache';
import { PItemApi } from '@fjell/client-api';
import { Item, ItemProperties, PriKey } from '@fjell/core';

// TODO: Eventually, maybe we have a testing libray shared between all libs.
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
jest.mock('@fjell/client-api');
jest.mock('@/CacheMap');

type TestItem = Item<'test'>;

describe('PItemCache', () => {
  let apiMock: jest.Mocked<PItemApi<TestItem, 'test'>>;
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

  beforeEach(() => {
    jest.resetAllMocks();

    apiMock = {
      all: jest.fn().mockReturnValue([items]),
      one: jest.fn().mockReturnValue(items[0]),
      action: jest.fn().mockReturnValue(items[0]),
      create: jest.fn().mockReturnValue([key1, items[0]]),
      remove: jest.fn().mockReturnValue(items[0]),
      update: jest.fn().mockReturnValue(items[0]),
      allAction: jest.fn().mockReturnValue([]),
      get: jest.fn().mockReturnValue(items[0]),
      find: jest.fn().mockReturnValue(items),
    } as unknown as jest.Mocked<PItemApi<TestItem, 'test'>>;

    cache = createCache(apiMock, 'test');
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
});
