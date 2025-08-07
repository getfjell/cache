import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCache } from '../src/Cache';
import { MemoryCacheMap } from '../src/memory/MemoryCacheMap';
import { ComKey, Item, PriKey } from '@fjell/core';
import { createCoordinate, createRegistry } from '@fjell/registry';

// Mock the client API
const mockClientApi = {
  get: vi.fn(),
  set: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  all: vi.fn(),
  one: vi.fn(),
  action: vi.fn(),
  allAction: vi.fn(),
  allFacet: vi.fn(),
  facet: vi.fn(),
  find: vi.fn(),
  findOne: vi.fn(),
};

// Test item type
type TestItem = Item<'test'>;

describe('Cache String/Number Key Normalization', () => {
  let cache: Awaited<ReturnType<typeof createCache<TestItem, 'test'>>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const registry = createRegistry('test');
    cache = await createCache(mockClientApi as any, createCoordinate('test'), registry);
  });

  it('should treat string and number keys as equivalent in CacheMap', async () => {
    // Test PriKey with string pk
    const stringKey: PriKey<'test'> = { kt: 'test', pk: '123' };
    const numberKey: PriKey<'test'> = { kt: 'test', pk: 123 };

    const testItem: TestItem = {
      key: stringKey,
      events: {
        created: { at: new Date(), by: stringKey },
        updated: { at: new Date(), by: stringKey },
        deleted: { at: null }
      }
    };

    // Set an item with string key
    await cache.operations.set(stringKey, testItem);

    // Try to retrieve with number key - should find the same item
    const [, retrievedItem] = await cache.operations.retrieve(numberKey);

    expect(retrievedItem).not.toBeNull();
    expect(retrievedItem?.key).toEqual(stringKey);
  });

  it('should treat string and number keys as equivalent in ComKey', async () => {
    // Test ComKey with string pk and lk
    const stringComKey: ComKey<'test', 'location'> = {
      kt: 'test',
      pk: '123',
      loc: [{ kt: 'location', lk: '456' }]
    };

    const numberComKey: ComKey<'test', 'location'> = {
      kt: 'test',
      pk: 123,
      loc: [{ kt: 'location', lk: 456 }]
    };

    const testItem: TestItem = {
      key: stringComKey,
      events: {
        created: { at: new Date(), by: stringComKey },
        updated: { at: new Date(), by: stringComKey },
        deleted: { at: null }
      }
    };

    // Set an item with string keys
    await cache.operations.set(stringComKey, testItem);

    // Try to retrieve with number keys - should find the same item
    const [, retrievedItem] = await cache.operations.retrieve(numberComKey);

    expect(retrievedItem).not.toBeNull();
    expect(retrievedItem?.key).toEqual(stringComKey);
  });

  it('should normalize keys consistently in CacheMap operations', () => {
    const cacheMap = new MemoryCacheMap<TestItem, 'test'>(['test']);

    // Test with string key
    const stringKey: PriKey<'test'> = { kt: 'test', pk: '123' };
    const testItem: TestItem = {
      key: stringKey,
      events: {
        created: { at: new Date(), by: stringKey },
        updated: { at: new Date(), by: stringKey },
        deleted: { at: null }
      }
    };

    cacheMap.set(stringKey, testItem);

    // Test with number key - should find the same item
    const numberKey: PriKey<'test'> = { kt: 'test', pk: 123 };
    const retrievedItem = cacheMap.get(numberKey);

    expect(retrievedItem).not.toBeNull();
    expect(retrievedItem?.key).toEqual(stringKey);
  });

  it('should handle location key arrays with mixed string/number keys', () => {
    const cacheMap = new MemoryCacheMap<TestItem, 'test', 'location'>(['test', 'location']);

    // Create items with different key types
    const stringComKey: ComKey<'test', 'location'> = {
      kt: 'test',
      pk: '123',
      loc: [{ kt: 'location', lk: '456' }]
    };

    const testItem: TestItem = {
      key: stringComKey,
      events: {
        created: { at: new Date(), by: stringComKey },
        updated: { at: new Date(), by: stringComKey },
        deleted: { at: null }
      }
    };

    cacheMap.set(stringComKey, testItem);

    // Query with number location key - should find the same item
    const numberLocations = [{ kt: 'location', lk: 456 }] as [{ kt: 'location', lk: number }];
    const items = cacheMap.allIn(numberLocations);

    expect(items).toHaveLength(1);
    expect(items[0].key).toEqual(stringComKey);
  });
});
