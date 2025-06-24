import { CItemApi, PItemApi } from '@fjell/client-api';
import { Item } from '@fjell/core';
import { CacheRegistry } from '@/CacheRegistry';
import { createCache } from '@/Cache';
import { beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';

// Mock the logger to avoid logging during tests
vi.mock('../src/logger', () => {
  const mockLogger = {
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
  };
  
  return {
    default: {
      get: vi.fn().mockReturnValue(mockLogger),
    }
  }
});

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
    await registry.registerCache(pItemCache);
    const retrievedCache = registry.getCache(['test']);
    expect(retrievedCache).toBe(pItemCache);
  });

  it('should register and retrieve a CItemCache', async () => {
    await registry.registerCache(cItemCache);
    const retrievedCache = registry.getCache(['container', 'test']);
    expect(retrievedCache).toBe(cItemCache);
  });

  it('should overwrite existing cache when registering same cache type', async () => {
    await registry.registerCache(pItemCache);
    
    // Create another cache with same key types
    const anotherPItemCache = await createCache<Item<'test'>, 'test'>(pItemApi, "test");
    
    await registry.registerCache(anotherPItemCache);
    const retrievedCache = registry.getCache(['test']);
    
    expect(retrievedCache).toBe(anotherPItemCache);
    expect(retrievedCache).not.toBe(pItemCache);
  });

  it('should return undefined when cache is not found', () => {
    const retrievedCache = registry.getCache(['nonexistent']);
    expect(retrievedCache).toBeUndefined();
  });

  it('should handle registerCache errors', async () => {
    // Create a mock cache that will cause JSON.stringify to throw
    const problematicCache = {
      pkTypes: null, // This will cause issues
    } as any;

    // Mock JSON.stringify to throw an error
    const originalStringify = JSON.stringify;
    vi.spyOn(JSON, 'stringify').mockImplementationOnce(() => {
      throw new Error('JSON.stringify failed');
    });

    await expect(registry.registerCache(problematicCache))
      .rejects
      .toThrow('JSON.stringify failed');

    // Restore original stringify
    JSON.stringify = originalStringify;
  });

  it('should print registered caches when no caches exist', () => {
    // Create a new registry that's empty
    const emptyRegistry = new CacheRegistry();
    
    // This should not throw and should handle empty registry
    expect(() => emptyRegistry.printRegisteredCaches()).not.toThrow();
  });

  it('should print registered caches when caches exist', async () => {
    await registry.registerCache(pItemCache);
    await registry.registerCache(cItemCache);
    
    // This should not throw and should handle printing caches
    expect(() => registry.printRegisteredCaches()).not.toThrow();
  });

  it('should handle multiple cache registrations and retrievals', async () => {
    await registry.registerCache(pItemCache);
    await registry.registerCache(cItemCache);
    
    expect(registry.getCache(['test'])).toBe(pItemCache);
    expect(registry.getCache(['container', 'test'])).toBe(cItemCache);
    expect(registry.getCache(['nonexistent'])).toBeUndefined();
  });

  it('should handle edge case of empty key types array', () => {
    const retrievedCache = registry.getCache([]);
    expect(retrievedCache).toBeUndefined();
  });
});