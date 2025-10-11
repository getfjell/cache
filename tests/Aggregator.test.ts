import { Aggregator, CacheConfig, createAggregator, toCacheConfig } from '../src/Aggregator';
import { Cache } from '../src/Cache';
import { CacheMap } from '../src/CacheMap';
import { Item, PriKey } from '@fjell/core';
import { afterEach, beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';

vi.mock('../src/CacheMap');

describe('Aggregator', () => {
  let otherCacheMock: Mocked<Cache<Item<"other">, "other">>;
  let itemCacheMock: Mocked<Cache<Item<"test">, "test">>;
  let aggregator: Aggregator<Item<"test">, "test">;
  let cacheMapMock: Mocked<CacheMap<Item<"test">, "test">>;

  const key1 = {
    kt: "test", pk: "123e4567-e89b-12d3-a456-426614174000",
  } as PriKey<"test">;

  const key2 = {
    kt: "test", pk: "123e4567-e89b-12d3-a456-426614174001",
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
        other: { key: otherKey1 },
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

  afterEach(() => {
    // Clear timers to prevent memory leaks
    vi.clearAllTimers();
  });

  beforeEach(async () => {
    cacheMapMock = {
      all: vi.fn(),
      get: vi.fn(),
    } as unknown as Mocked<CacheMap<Item<"test">, "test">>;
    itemCacheMock = {
      operations: {
        all: vi.fn(),
        one: vi.fn(),
        get: vi.fn(),
        retrieve: vi.fn(),
        action: vi.fn(),
        allAction: vi.fn(),
        create: vi.fn(),
        remove: vi.fn(),
        update: vi.fn(),
        find: vi.fn(),
        set: vi.fn(),
        allFacet: vi.fn(),
        facet: vi.fn(),
        findOne: vi.fn(),
        reset: vi.fn(),
      },
      coordinate: { kta: ['test'] },
      registry: {},
      api: {},
      cacheMap: cacheMapMock,
      evictionManager: {
        getEvictionStrategyName: vi.fn().mockReturnValue('lru'),
        isEvictionSupported: vi.fn().mockReturnValue(true),
      },
      ttlManager: {
        getDefaultTTL: vi.fn().mockReturnValue(null),
        isTTLEnabled: vi.fn().mockReturnValue(false),
      },
      getCacheInfo: vi.fn().mockReturnValue({
        implementationType: 'memory/test',
        evictionPolicy: 'lru',
        defaultTTL: null,
        supportsTTL: false,
        supportsEviction: true,
      }),
      getStats: vi.fn().mockReturnValue({
        numRequests: 0,
        numMisses: 0,
        numHits: 0,
        numSubscriptions: 0,
        numUnsubscriptions: 0,
        activeSubscriptions: 0
      }),
    } as unknown as Mocked<Cache<Item<"test">, "test">>;
    otherCacheMock = {
      operations: {
        retrieve: vi.fn(),
      },
      coordinate: { kta: ['other'] },
      registry: {},
      api: {},
      cacheMap: {},
      getStats: vi.fn().mockReturnValue({
        numRequests: 0,
        numMisses: 0,
        numHits: 0,
        numSubscriptions: 0,
        numUnsubscriptions: 0,
        activeSubscriptions: 0
      }),
    } as unknown as Mocked<Cache<Item<"other">, "other">>;

    aggregator = await createAggregator(itemCacheMock, {
      aggregates: {
        other: { cache: otherCacheMock, optional: false },
        other2: { cache: otherCacheMock, optional: true },
      },
      events: {}
    });
  });

  it('should populate an item with references', async () => {

    (otherCacheMock.operations.retrieve as any).mockReturnValue(otherItems[0]);

    const populatedItem = await aggregator.populate(items[0]);

    expect(populatedItem.aggs).toHaveProperty('other');
    expect(populatedItem.aggs?.['other'][0].item).toEqual(otherItems[0]);
  });

  it('should throw an error if a mandatory reference is missing', async () => {
    const itemWithMissingRef = {
      key: key1,
      events: {
        created: { at: new Date("2023-01-01T00:00:00Z") },
        updated: { at: new Date("2023-01-02T00:00:00Z") },
        deleted: { at: null },
      },
      refs: {}
    } as Item<"test">;

    await expect(aggregator.populate(itemWithMissingRef))
      .rejects.toThrow('Item does not have mandatory ref with key, not optional other');
  });

  it('should handle optional references gracefully', async () => {
    aggregator = await createAggregator(itemCacheMock, {
      aggregates: {
        other: { cache: otherCacheMock, optional: true },
        other2: { cache: otherCacheMock, optional: true },
      },
      events: {}
    });

    const itemWithMissingOptionalRef = {
      key: key1,
      events: {
        created: { at: new Date("2023-01-01T00:00:00Z") },
        updated: { at: new Date("2023-01-02T00:00:00Z") },
        deleted: { at: null },
      },
      refs: {}
    } as Item<"test">;

    const populatedItem = await aggregator.populate(itemWithMissingOptionalRef);

    expect(populatedItem.events?.created).toBeDefined();
  });

  it('should throw error for missing non-optional references', async () => {
    aggregator = await createAggregator(itemCacheMock, {
      aggregates: {
        other: { cache: otherCacheMock, optional: false },
      },
      events: {}
    });

    const itemWithMissingOptionalRef = {
      key: key1,
      events: {
        created: { at: new Date("2023-01-01T00:00:00Z") },
        updated: { at: new Date("2023-01-02T00:00:00Z") },
        deleted: { at: null },
      },
      refs: {}
    } as Item<"test">;

    await expect(
      aggregator.populate(itemWithMissingOptionalRef)
    ).rejects.toThrow('Item does not have mandatory ref with key, not optional other');
  });

  it('should throw error for missing references entirely', async () => {
    aggregator = await createAggregator(itemCacheMock, {
      aggregates: {
        other: { cache: otherCacheMock, optional: false },
      },
      events: {}
    });

    const itemWithMissingOptionalRef = {
      key: key1,
      events: {
        created: { at: new Date("2023-01-01T00:00:00Z") },
        updated: { at: new Date("2023-01-02T00:00:00Z") },
        deleted: { at: null },
      },
    } as Item<"test">;

    await expect(
      aggregator.populate(itemWithMissingOptionalRef)
    ).rejects.toThrow('Item does not have refs an is not optional');
  });

  it('should populate an item with events', async () => {
    const eventCacheMock = {
      operations: {
        retrieve: vi.fn(),
      },
    } as unknown as Mocked<Cache<Item<"other">, "other">>;

    aggregator = await createAggregator(itemCacheMock, {
      aggregates: {},
      events: {
        created: { cache: eventCacheMock, optional: false }
      }
    });

    const itemWithEvent = {
      key: key1,
      events: {
        created: { at: new Date("2023-01-01T00:00:00Z"), by: otherKey1 },
        updated: { at: new Date("2023-01-02T00:00:00Z") },
        deleted: { at: null },
      }
    } as unknown as Item<"test">;

    (eventCacheMock.operations.retrieve as any).mockReturnValue(otherItems[0]);

    const populatedItem = await aggregator.populate(itemWithEvent);

    expect(populatedItem.events?.created.agg).toEqual(otherItems[0]);
  });

  it('should populate an item with events that is missing events', async () => {
    const eventCacheMock = {
      operations: {
        retrieve: vi.fn(),
      },
    } as unknown as Mocked<Cache<Item<"other">, "other">>;

    aggregator = await createAggregator(itemCacheMock, {
      aggregates: {},
      events: {
        created: { cache: eventCacheMock, optional: false }
      }
    });

    const itemWithEvent = {
      key: key1,
      events: {
        updated: { at: new Date("2023-01-02T00:00:00Z") },
        deleted: { at: null },
      }
    } as Item<"test">;

    (eventCacheMock.operations.retrieve as any).mockReturnValue(otherItems[0]);

    await expect(
      aggregator.populate(itemWithEvent)
    ).rejects.toThrow('Item does not have mandatory event with key created');
  });

  it('should populate an item with events when the by key is missing', async () => {
    const eventCacheMock = {
      operations: {
        retrieve: vi.fn(),
      },
    } as unknown as Mocked<Cache<Item<"other">, "other">>;

    aggregator = await createAggregator(itemCacheMock, {
      aggregates: {},
      events: {
        created: { cache: eventCacheMock, optional: false }
      }
    });

    const itemWithEvent = {
      key: key1,
      events: {
        created: { at: new Date("2023-01-01T00:00:00Z") },
        updated: { at: new Date("2023-01-02T00:00:00Z") },
        deleted: { at: null },
      }
    } as Item<"test">;

    (eventCacheMock.operations.retrieve as any).mockReturnValue(otherItems[0]);

    await expect(
      aggregator.populate(itemWithEvent)
    ).rejects.toThrow('populateEvent with an Event that does not have by');
  });

  it('should throw an error if a mandatory event is missing', async () => {
    const eventCacheMock = {
      operations: {
        retrieve: vi.fn(),
      },
    } as unknown as Mocked<Cache<Item<"other">, "other">>;

    aggregator = await createAggregator(itemCacheMock, {
      aggregates: {},
      events: {
        created: { cache: eventCacheMock, optional: false }
      }
    });

    const itemWithoutEvents = {
      key: key1,
      events: {},
      refs: {}
    } as Item<"test">;

    await expect(aggregator.populate(itemWithoutEvents))
      .rejects
      .toThrow('Item does not have mandatory event with key created');
  });

  it('should handle optional events gracefully', async () => {
    const eventCacheMock = {
      operations: {
        retrieve: vi.fn(),
      },
    } as unknown as Mocked<Cache<Item<"other">, "other">>;

    aggregator = await createAggregator(itemCacheMock, {
      aggregates: {},
      events: {
        created: { cache: eventCacheMock, optional: true }
      }
    });

    const itemWithoutEvents = {
      key: key1,
      events: {},
      refs: {}
    } as Item<"test">;

    const result = await aggregator.populate(itemWithoutEvents);
    expect(result.key).toEqual(key1);
  });

  describe('toCacheConfig', () => {
    it('should convert ICache to CacheConfig with optional set to false', () => {
      const cacheMock = {} as Mocked<Cache<Item<"test">, "test">>;
      const config = toCacheConfig<Item<"test">, "test">(cacheMock);
      expect(config).toEqual({ cache: cacheMock, optional: false });
    });

    it('should return the same CacheConfig if optional is defined', () => {
      const cacheMock = {} as Mocked<Cache<Item<"test">, "test">>;
      const cacheConfig: CacheConfig = { cache: cacheMock, optional: true };
      const config = toCacheConfig(cacheConfig);
      expect(config).toEqual(cacheConfig);
    });

    it('should return CacheConfig with optional set to false if optional is undefined', () => {
      const cacheMock = {} as Mocked<Cache<Item<"test">, "test">>;
      const cacheConfig = { cache: cacheMock } as CacheConfig;
      const config = toCacheConfig(cacheConfig);
      // TODO: Is this wrong?
      expect(config).toEqual({ cache: { cache: cacheMock }, optional: false });
    });
  });

  describe('test operations', () => {

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
      },
      {
        key: key2,
        events: {
          created: { at: new Date("2023-01-03T00:00:00Z") },
          updated: { at: new Date("2023-01-04T00:00:00Z") },
          deleted: { at: null },
        },
        refs: {
          other: otherKey1,
        }
      }
    ];

    it('all', async () => {
      (itemCacheMock.operations.all as any).mockResolvedValue(items);
      (otherCacheMock.operations.retrieve as any).mockResolvedValue(otherItems[0]);

      const aggregatedItems = await aggregator.all();

      expect(aggregatedItems[0].aggs?.other[0].item).toEqual(otherItems[0]);
    });

    it('one', async () => {
      (itemCacheMock.operations.one as any).mockResolvedValue(items[0]);
      (otherCacheMock.operations.retrieve as any).mockResolvedValue(otherItems[0]);

      const item = await aggregator.one();

      expect(item?.aggs?.other[0].item).toEqual(otherItems[0]);
    });

    it('actions', async () => {
      (itemCacheMock.operations.action as any).mockResolvedValue([items[0], []]);
      (otherCacheMock.operations.retrieve as any).mockResolvedValue(otherItems[0]);

      const [item] = await aggregator.action(items[0].key, 'doSomething');

      expect(item?.aggs?.other[0].item).toEqual(otherItems[0]);
    });

    it('allActions', async () => {
      (itemCacheMock.operations.allAction as any).mockResolvedValue([items, []]);
      (otherCacheMock.operations.retrieve as any).mockResolvedValue(otherItems[0]);

      const [aggregatedItems] = await aggregator.allAction('doSomethingToAll');

      expect(aggregatedItems[0].aggs?.other[0].item).toEqual(otherItems[0]);
    });

    it('create', async () => {
      (itemCacheMock.operations.create as any).mockResolvedValue(items[0]);
      (otherCacheMock.operations.retrieve as any).mockResolvedValue(otherItems[0]);

      const item = await aggregator.create(items[0]);

      expect(item?.aggs?.other[0].item).toEqual(otherItems[0]);
    });

    it('get', async () => {
      (itemCacheMock.operations.get as any).mockResolvedValue(items[0]);
      (otherCacheMock.operations.retrieve as any).mockResolvedValue(otherItems[0]);

      const item = await aggregator.get(items[0].key);

      expect(item?.aggs?.other[0].item).toEqual(otherItems[0]);
    });

    it('retrieve', async () => {
      (itemCacheMock.operations.retrieve as any).mockResolvedValue(items[0]);
      (otherCacheMock.operations.retrieve as any).mockResolvedValue(otherItems[0]);

      const item = await aggregator.retrieve(items[0].key);

      expect(item?.aggs?.other[0].item).toEqual(otherItems[0]);
    });

    it('remove', async () => {
      (itemCacheMock.operations.remove as any).mockResolvedValue(undefined);
      (otherCacheMock.operations.retrieve as any).mockReturnValue(otherItems[0]);

      const result = await aggregator.remove(items[0].key);

      expect(result).toBeUndefined();
    });

    it('update', async () => {
      (itemCacheMock.operations.update as any).mockResolvedValue(items[0]);
      (otherCacheMock.operations.retrieve as any).mockResolvedValue(otherItems[0]);

      const item = await aggregator.update(items[0].key, items[0]);

      expect(item?.aggs?.other[0].item).toEqual(otherItems[0]);
    });

    it('find', async () => {
      (itemCacheMock.operations.find as any).mockResolvedValue(items);
      (otherCacheMock.operations.retrieve as any).mockResolvedValue(otherItems[0]);

      const aggregatedItems = await aggregator.find('findAll');

      expect(aggregatedItems[0]?.aggs?.other[0].item).toEqual(otherItems[0]);
    });

    it('set', async () => {
      (itemCacheMock.operations.set as any).mockResolvedValue(items[0]);
      (otherCacheMock.operations.retrieve as any).mockResolvedValue(otherItems[0]);

      const item = await aggregator.set(items[0].key, items[0]);

      expect(item?.aggs?.other[0].item).toEqual(otherItems[0]);
    });

  });

});
