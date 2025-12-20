import { CacheMap } from '../../src/CacheMap';
import { Cache, createCache } from '../../src/Cache';
import { PItemApi } from '@fjell/client-api';
import { AllOperationResult, Item, PriKey } from '@fjell/types';
import { createCoordinate } from '@fjell/core';
import { createRegistry } from '@fjell/registry';
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

    const mockAllResult: AllOperationResult<TestItem> = {
      items,
      metadata: { total: items.length, returned: items.length, offset: 0, hasMore: false }
    };
    apiMock = {
      all: vi.fn().mockResolvedValue(mockAllResult),
      one: vi.fn().mockResolvedValue(items[0]),
      action: vi.fn().mockResolvedValue([items[0], []]),
      create: vi.fn().mockResolvedValue([key1, items[0]]),
      remove: vi.fn().mockResolvedValue(items[0]),
      update: vi.fn().mockResolvedValue(items[0]),
      allAction: vi.fn().mockResolvedValue([[], []]),
      allFacet: vi.fn().mockResolvedValue({ facetData: "test" }),
      get: vi.fn().mockResolvedValue(items[0]),
      find: vi.fn().mockResolvedValue({
        items,
        metadata: { total: items.length, returned: items.length, offset: 0, hasMore: false }
      }),
    } as unknown as Mocked<PItemApi<TestItem, 'test'>>;

    const registry = createRegistry('test');
    cache = await createCache(apiMock, createCoordinate('test'), registry);
  });

  it('should call all method', async () => {
    const result = await cache.operations.all();

    expect(apiMock.all).toHaveBeenCalledWith({}, [], undefined);
    expect(result.items).toEqual(items);
    expect(result.metadata.total).toBe(items.length);
  });

  it('should call one method', async () => {
    const result = await cache.operations.one();

    expect(apiMock.one).toHaveBeenCalledWith({}, []);
    expect(result).toEqual(items[0]);
  });

  it('should call action method', async () => {
    const action = 'testAction';

    const result = await cache.operations.action(key1, action);

    expect(apiMock.action).toHaveBeenCalledWith(key1, action, {});
    expect(result).toEqual(expect.any(Object));
  });

  it('should call allAction method', async () => {
    const action = 'testAction';

    const result = await cache.operations.allAction(action);

    expect(apiMock.allAction).toHaveBeenCalledWith(action, {}, []);
    expect(result).toEqual([[], []]);
  });

  it('should call allFacet method', async () => {
    const facet = 'testFacet';
    const params = { param1: 'value1' };

    const result = await cache.operations.allFacet(facet, params);

    expect(apiMock.allFacet).toHaveBeenCalledWith(facet, params, []);
    expect(result).toEqual({ facetData: "test" });
  });

  it('should call allFacet method with default parameters', async () => {
    const facet = 'testFacet';

    const result = await cache.operations.allFacet(facet);

    expect(apiMock.allFacet).toHaveBeenCalledWith(facet, {}, []);
    expect(result).toEqual({ facetData: "test" });
  });

  it('should call get method', async () => {

    const result = await cache.operations.get(key1);

    expect(apiMock.get).toHaveBeenCalledWith(key1);
    expect(result).toEqual(items[0]);
  });

  it('should call retrieve method', async () => {
    const result = await cache.operations.retrieve(key1);

    expect(apiMock.get).toHaveBeenCalledWith(key1);
    expect(result).toEqual(items[0]);
  });

  it('should call remove method', async () => {
    const result = await cache.operations.remove(key1);

    expect(apiMock.remove).toHaveBeenCalledWith(key1);
    expect(result).toBeUndefined();
  });

  it('should call update method', async () => {
    const itemProps: Partial<Item<'test'>> = { key: key1 };

    const result = await cache.operations.update(key1, itemProps);

    expect(apiMock.update).toHaveBeenCalledWith(key1, itemProps);
    expect(result).toEqual(expect.any(Object));
  });

  it('find should call find method', async () => {
    const result = await cache.operations.find('someFinder', {});

    expect(apiMock.find).toHaveBeenCalledWith('someFinder', {}, [], undefined);
    expect(result).toEqual(expect.any(Object));
  });

  it('should call set method', async () => {
    const result = await cache.operations.set(key1, items[0]);

    expect(apiMock.update).not.toHaveBeenCalledWith(key1, items[0]);
    expect(result).toEqual(expect.any(Object));
  });

  it('should throw error when setting item with mismatched keys', async () => {
    const differentKey = {
      kt: 'whatever',
      pk: '123e4567-e89b-12d3-a456-426614174000'
    } as unknown as PriKey<"test">;

    await expect(cache.operations.set(differentKey, items[0]))
      .rejects
      .toThrow('Key does not match item key');
  });
});
