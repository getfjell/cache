import { CItemApi, PItemApi } from '@fjell/client-api';
import { Item } from '@fjell/core';
import { CacheRegistry } from '@/CacheRegistry';
import { createCache } from '@/Cache';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';

describe('CacheRegistry', () => {
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

  const pItemCache = createCache<Item<'test'>, 'test'>(pItemApi, "test")

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

  const cItemCache = createCache<Item<'container', 'test'>, 'container', 'test'>(
    cItemApi, "container", pItemCache
  );

  beforeEach(() => {
    registry = CacheRegistry.getInstance();
  });

  it('should create a singleton instance', () => {
    const instance1 = CacheRegistry.getInstance();
    const instance2 = CacheRegistry.getInstance();
    expect(instance1).toBe(instance2);
  });

  it('should register and retrieve a PItemCache', () => {
    registry.registerCache(pItemCache);
    registry.markConfigured();
    const retrievedCache = registry.getCache(['test']);
    expect(retrievedCache).toBe(pItemCache);
  });

  it('should register and retrieve a CItemCache', () => {
    registry.registerCache(cItemCache);
    registry.markConfigured();
    const retrievedCache = registry.getCache(['container', 'test']);
    expect(retrievedCache).toBe(cItemCache);
  });

  it('should return true when isConfigured is called after markConfigured', () => {
    registry.markConfigured();
    expect(registry.isConfigured()).toBe(true);
  });

  it('should register fail to configure and throw an error', () => {
    const newRegistry = new CacheRegistry();
    newRegistry.registerCache(pItemCache);
    expect(() => newRegistry.getCache(['test'])).toThrow(new Error("CacheRegistry must be configured before use"));
  });
});