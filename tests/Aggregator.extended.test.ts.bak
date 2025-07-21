import { Aggregator, createAggregator, toCacheConfig } from '@/Aggregator';
import { Cache } from '@/Cache';
import { CacheMap } from '@/CacheMap';
import { Item, PriKey } from '@fjell/core';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';

vi.mock('../src/CacheMap');

describe('Aggregator - Extended Tests', () => {
  let otherCacheMock: Mocked<Cache<Item<"other">, "other">>;
  let itemCacheMock: Mocked<Cache<Item<"test">, "test">>;
  let aggregator: Aggregator<Item<"test">, "test">;
  let cacheMapMock: Mocked<CacheMap<Item<"test">, "test">>;

  const key1 = {
    kt: "test", pk: "123e4567-e89b-12d3-a456-426614174000",
  } as PriKey<"test">;

  const otherKey1 = {
    kt: "other", pk: "1-1-1-1-1",
  } as PriKey<"other">;

  const items: Item<"test">[] = [
    {
      key: key1,
      events: {
        created: { at: new Date("2023-01-01T00:00:00Z") },
        updated: { at: new Date("2023-01-02T00:00:00Z") },
        deleted: { at: null },
      },
      refs: {
        other: otherKey1,
      }
    }
  ];

  const otherItems: Item<"other">[] = [
    {
      key: otherKey1,
      events: {
        created: { at: new Date("2023-01-01T00:00:00Z") },
        updated: { at: new Date("2023-01-02T00:00:00Z") },
        deleted: { at: null },
      }
    }
  ];

  beforeEach(async () => {
    cacheMapMock = {
      all: vi.fn(),
      get: vi.fn(),
    } as unknown as Mocked<CacheMap<Item<"test">, "test">>;
    
    itemCacheMock = {
      all: vi.fn(),
      one: vi.fn(),
      get: vi.fn(),
      retrieve: vi.fn(),
      action: vi.fn(),
      allAction: vi.fn(),
      allFacet: vi.fn(),
      facet: vi.fn(),
      create: vi.fn(),
      remove: vi.fn(),
      update: vi.fn(),
      find: vi.fn(),
      findOne: vi.fn(),
      set: vi.fn(),
      reset: vi.fn(),
    } as unknown as Mocked<Cache<Item<"test">, "test">>;
    
    otherCacheMock = {
      retrieve: vi.fn(),
    } as unknown as Mocked<Cache<Item<"other">, "other">>;

    aggregator = await createAggregator(itemCacheMock, {
      aggregates: {
        other: { cache: otherCacheMock, optional: false },
      },
      events: {}
    });
  });

  it('should handle allFacet method', async () => {
    const facetData = { status: "active", count: 10 };
    itemCacheMock.allFacet.mockResolvedValue([cacheMapMock, facetData]);

    const [,result] = await aggregator.allFacet('testFacet', { param: 'value' }, []);

    expect(itemCacheMock.allFacet).toHaveBeenCalledWith('testFacet', { param: 'value' }, []);
    expect(result).toEqual(facetData);
  });

  it('should handle allFacet with default parameters', async () => {
    const facetData = { data: "test" };
    itemCacheMock.allFacet.mockResolvedValue([cacheMapMock, facetData]);

    const [,result] = await aggregator.allFacet('testFacet');

    expect(itemCacheMock.allFacet).toHaveBeenCalledWith('testFacet', {}, []);
    expect(result).toEqual(facetData);
  });

  it('should handle facet method', async () => {
    const facetData = { status: "active" };
    itemCacheMock.facet.mockResolvedValue([cacheMapMock, facetData]);

    const [,result] = await aggregator.facet(items[0].key, 'testFacet');

    expect(itemCacheMock.facet).toHaveBeenCalledWith(items[0].key, 'testFacet');
    expect(result).toEqual(facetData);
  });

  it('should handle findOne method', async () => {
    itemCacheMock.findOne.mockResolvedValue([cacheMapMock, items[0]]);
    // @ts-ignore
    otherCacheMock.retrieve.mockReturnValue([null, otherItems[0]]);

    const [,aggregatedItem] = await aggregator.findOne('testFinder', { param: 'value' }, []);

    expect(itemCacheMock.findOne).toHaveBeenCalledWith('testFinder', { param: 'value' }, []);
    expect(aggregatedItem?.aggs?.other.item).toEqual(otherItems[0]);
  });

  it('should handle reset method', async () => {
    itemCacheMock.reset.mockResolvedValue([cacheMapMock]);

    const result = await aggregator.reset();

    expect(itemCacheMock.reset).toHaveBeenCalled();
    expect(result).toEqual([cacheMapMock]);
  });

  it('should handle null item scenarios', async () => {
    itemCacheMock.one.mockResolvedValue([cacheMapMock, null]);
    itemCacheMock.get.mockResolvedValue([cacheMapMock, null]);
    itemCacheMock.retrieve.mockResolvedValue([cacheMapMock, null]);

    const [,oneResult] = await aggregator.one();
    const [,getResult] = await aggregator.get(items[0].key);
    const [,retrieveResult] = await aggregator.retrieve(items[0].key);

    expect(oneResult).toBeNull();
    expect(getResult).toBeNull();
    expect(retrieveResult).toBeNull();
  });

  it('should handle optional aggregates with missing refs', async () => {
    const aggregatorWithOptional = await createAggregator(itemCacheMock, {
      aggregates: {
        other: { cache: otherCacheMock, optional: true }
      },
      events: {}
    });

    const itemWithoutRefs = {
      key: key1,
      events: {
        created: { at: new Date("2023-01-01T00:00:00Z") },
        updated: { at: new Date("2023-01-02T00:00:00Z") },
        deleted: { at: null }
      }
    } as Item<"test">;

    const populatedItem = await aggregatorWithOptional.populate(itemWithoutRefs);

    expect(populatedItem.events?.created).toBeDefined();
    expect(populatedItem.aggs).toBeUndefined();
  });

  describe('toCacheConfig edge cases', () => {
    it('should handle cache with optional property defined', () => {
      const cacheConfig = { cache: otherCacheMock, optional: true };
      const result = toCacheConfig(cacheConfig);
      expect(result).toEqual(cacheConfig);
    });

    it('should handle cache without optional property', () => {
      const result = toCacheConfig(otherCacheMock);
      expect(result).toEqual({ cache: otherCacheMock, optional: false });
    });
  });
});