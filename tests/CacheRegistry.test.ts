import { CItemApi, PItemApi } from '@fjell/client-api';
import { Item } from '@fjell/core';
import { CacheRegistry } from '@/CacheRegistry';
import { createCache } from '@/Cache';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';

describe('CacheRegistry', async () => {
  let registry: CacheRegistry;

  const pItemApi = {
    all: vi.fn(),
    one: vi.fn(),
    action: vi.fn(),
    create: vi.fn(),
    remove: vi.fn(),
    update: vi.fn(),
    allAction: vi.fn(),
    get: vi.fn()
  } as unknown as Mocked<PItemApi<Item<"test">, "test">>;

  const pItemCache = await createCache<Item<'test'>, 'test'>(pItemApi, "test")

  const cItemApi = {
    all: vi.fn(),
    one: vi.fn(),
    action: vi.fn(),
    create: vi.fn(),
    remove: vi.fn(),
    update: vi.fn(),
    allAction: vi.fn(),
    get: vi.fn()
  } as unknown as Mocked<CItemApi<Item<"container", "test">, "container", "test">>;

  const cItemCache = await createCache<Item<'container', 'test'>, 'container', 'test'>(
    cItemApi, "container", pItemCache
  );

  beforeEach(async () => {
    registry = new CacheRegistry();
  });

  it('should register and retrieve a PItemCache', async () => {
    registry.registerCache(pItemCache);
    const retrievedCache = await registry.getCache(['test']);
    expect(retrievedCache).toBe(pItemCache);
  });

  it('should register and retrieve a CItemCache', async () => {
    registry.registerCache(cItemCache);
    const retrievedCache = await registry.getCache(['container', 'test']);
    expect(retrievedCache).toBe(cItemCache);
  });
});