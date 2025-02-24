import { CItemApi, PItemApi } from '@fjell/client-api';
import { Item } from '@fjell/core';
import { CacheRegistry } from '@/CacheRegistry';
import { createCache } from '@/Cache';

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

describe('CacheRegistry', () => {
  let registry: CacheRegistry;

  const pItemApi = {
    all: jest.fn(),
    one: jest.fn(),
    action: jest.fn(),
    create: jest.fn(),
    remove: jest.fn(),
    update: jest.fn(),
    allAction: jest.fn(),
    get: jest.fn()
  } as unknown as jest.Mocked<PItemApi<Item<"test">, "test">>;

  const pItemCache = createCache<Item<'test'>, 'test'>(pItemApi, "test")

  const cItemApi = {
    all: jest.fn(),
    one: jest.fn(),
    action: jest.fn(),
    create: jest.fn(),
    remove: jest.fn(),
    update: jest.fn(),
    allAction: jest.fn(),
    get: jest.fn()
  } as unknown as jest.Mocked<CItemApi<Item<"container", "test">, "container", "test">>;

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