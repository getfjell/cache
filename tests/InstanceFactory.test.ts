import { afterEach, beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { createInstanceFactory } from '@/InstanceFactory';
import { createCoordinate, Registry, RegistryHub } from '@fjell/registry';
import { Item } from '@fjell/core';
import { ClientApi } from '@fjell/client-api';

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

// Mock CacheMap
vi.mock('@/CacheMap', () => ({
  CacheMap: vi.fn().mockImplementation(() => ({
    get: vi.fn(),
    set: vi.fn(),
    has: vi.fn(),
    delete: vi.fn(),
    clear: vi.fn(),
    size: vi.fn(),
    keys: vi.fn(),
    values: vi.fn(),
    entries: vi.fn(),
    all: vi.fn(),
  }))
}));

// Mock Operations
vi.mock('@/Operations', () => ({
  createOperations: vi.fn().mockReturnValue({
    all: vi.fn(),
    one: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    action: vi.fn(),
    allAction: vi.fn(),
    allFacet: vi.fn(),
    facet: vi.fn(),
    find: vi.fn(),
    findOne: vi.fn(),
    reset: vi.fn(),
    retrieve: vi.fn(),
  })
}));

// Define test types to match the working patterns from other tests
type TestItem = Item<"test", "container">;

describe('InstanceFactory', () => {
  let mockApi: Mocked<ClientApi<TestItem, "test", "container">>;
  let mockRegistry: Mocked<Registry>;
  let mockRegistryHub: Mocked<RegistryHub>;
  let mockCoordinate: ReturnType<typeof createCoordinate<"test", "container">>;

  beforeEach(() => {
    // Setup mock API
    mockApi = {
      all: vi.fn(),
      one: vi.fn(),
      get: vi.fn(),
      set: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      action: vi.fn(),
      allAction: vi.fn(),
      allFacet: vi.fn(),
      facet: vi.fn(),
      find: vi.fn(),
      findOne: vi.fn(),
      reset: vi.fn(),
      retrieve: vi.fn(),
    } as unknown as Mocked<ClientApi<TestItem, "test", "container">>;

    // Setup mock registry
    mockRegistry = {
      type: 'test-registry',
      coordinate: vi.fn(),
      instanceFactory: vi.fn(),
    } as unknown as Mocked<Registry>;

    // Setup mock registry hub
    mockRegistryHub = {
      get: vi.fn(),
      set: vi.fn(),
      has: vi.fn(),
    } as unknown as Mocked<RegistryHub>;

    // Setup coordinate
    mockCoordinate = createCoordinate(['test', 'container'], []);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createInstanceFactory', () => {
    it('should create an instance factory function', () => {
      const factory = createInstanceFactory(mockApi);

      expect(factory).toBeInstanceOf(Function);
    });

    it('should return an instance factory that creates cache instances', () => {
      const factory = createInstanceFactory(mockApi);
      const context = { registry: mockRegistry, registryHub: mockRegistryHub };

      const instance = factory(mockCoordinate, context);

      expect(instance).toBeDefined();
      expect(instance.coordinate).toBe(mockCoordinate);
      expect(instance.registry).toBe(mockRegistry);
      expect((instance as any).api).toBe(mockApi);
      expect((instance as any).cacheMap).toBeDefined();
      expect((instance as any).operations).toBeDefined();
    });

    it('should create instances with the correct coordinate', () => {
      const factory = createInstanceFactory(mockApi);
      const context = { registry: mockRegistry };

      const instance = factory(mockCoordinate, context);

      expect(instance.coordinate).toBe(mockCoordinate);
      expect(instance.coordinate.kta).toEqual(['test', 'container']);
    });

    it('should create instances with the correct registry', () => {
      const factory = createInstanceFactory(mockApi);
      const context = { registry: mockRegistry };

      const instance = factory(mockCoordinate, context);

      expect(instance.registry).toBe(mockRegistry);
    });

    it('should create multiple instances with different coordinates', () => {
      const factory = createInstanceFactory(mockApi);
      const context = { registry: mockRegistry };
      const coordinate1 = createCoordinate(['test', 'container'], []);
      const coordinate2 = createCoordinate(['test', 'container'], []); // Change to same type as mockApi

      const instance1 = factory(coordinate1, context);
      const instance2 = factory(coordinate2, context);

      expect(instance1.coordinate).toBe(coordinate1);
      expect(instance2.coordinate).toBe(coordinate2);
      expect(instance1).not.toBe(instance2);
    });

    it('should create instances with operations', () => {
      const factory = createInstanceFactory(mockApi);
      const context = { registry: mockRegistry };

      const instance = factory(mockCoordinate, context);

      expect((instance as any).operations).toBeDefined();
      expect((instance as any).operations.all).toBeInstanceOf(Function);
      expect((instance as any).operations.get).toBeInstanceOf(Function);
      expect((instance as any).operations.set).toBeInstanceOf(Function);
    });

    it('should create instances with cache map', () => {
      const factory = createInstanceFactory(mockApi);
      const context = { registry: mockRegistry };

      const instance = factory(mockCoordinate, context);

      expect((instance as any).cacheMap).toBeDefined();
    });
  });
});
