import { afterEach, beforeEach, describe, expect, it, type Mocked, vi } from 'vitest';
import { createInstanceFactory } from '@/InstanceFactory';
import { Cache } from '@/Cache';
import { createInstance } from '@/Instance';
import { Coordinate, createCoordinate, Registry, RegistryHub } from '@fjell/registry';
import { Item } from '@fjell/core';

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

// Mock the createInstance function from Instance module
vi.mock('@/Instance', async () => {
  const actual = await vi.importActual('@/Instance');
  return {
    ...actual,
    createInstance: vi.fn(),
  };
});

// Define test types to match the working patterns from other tests
type TestItem = Item<"test", "container">;

describe('InstanceFactory', () => {
  let mockCache: Mocked<Cache<TestItem, "test", "container">>;
  let mockRegistry: Mocked<Registry>;
  let mockRegistryHub: Mocked<RegistryHub>;
  let mockCoordinate: Coordinate<"test", "container">;
  let mockInstance: any;

  beforeEach(() => {
    // Setup mock cache
    mockCache = {
      all: vi.fn(),
      one: vi.fn(),
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn(),
      size: vi.fn(),
      has: vi.fn(),
      keys: vi.fn(),
      values: vi.fn(),
      entries: vi.fn(),
    } as unknown as Mocked<Cache<TestItem, "test", "container">>;

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

    // Setup mock coordinate using createCoordinate - match the cache type structure
    mockCoordinate = createCoordinate(['test', 'container'], []);

    // Setup mock instance
    mockInstance = {
      coordinate: mockCoordinate,
      registry: mockRegistry,
      cache: mockCache,
    };

    // Setup createInstance mock
    const createInstanceMock = vi.mocked(createInstance);
    createInstanceMock.mockReturnValue(mockInstance);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createInstanceFactory', () => {
    it('should return a function that matches the BaseInstanceFactory signature', () => {
      const factory = createInstanceFactory(mockCache);

      expect(typeof factory).toBe('function');
      expect(factory.length).toBe(2); // Should accept coordinate and context parameters
    });

    it('should create and return an instance when the factory function is called', () => {
      const factory = createInstanceFactory(mockCache);
      const context = { registry: mockRegistry, registryHub: mockRegistryHub };

      const result = factory(mockCoordinate, context);

      const createInstanceMock = vi.mocked(createInstance);
      expect(createInstanceMock).toHaveBeenCalledWith(mockRegistry, mockCoordinate, mockCache);
      expect(result).toBe(mockInstance);
    });

    it('should create and return an instance when called without registryHub', () => {
      const factory = createInstanceFactory(mockCache);
      const context = { registry: mockRegistry };

      const result = factory(mockCoordinate, context);

      const createInstanceMock = vi.mocked(createInstance);
      expect(createInstanceMock).toHaveBeenCalledWith(mockRegistry, mockCoordinate, mockCache);
      expect(result).toBe(mockInstance);
    });

    it('should log debug information when creating an instance', async () => {
      const factory = createInstanceFactory(mockCache);
      const context = { registry: mockRegistry, registryHub: mockRegistryHub };

      factory(mockCoordinate, context);

      // The logger.debug call should have been made with the correct parameters
      const loggerModule = vi.mocked(await import('../src/logger'));
      const mockLogger = loggerModule.default.get();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Creating cache instance",
        {
          coordinate: mockCoordinate,
          registry: mockRegistry,
          cache: mockCache
        }
      );
    });

    it('should work with different generic types', () => {
      // Create a cache with a different type structure
      type DifferentItem = Item<"user">;
      const differentCache = mockCache as unknown as Cache<DifferentItem, "user">;
      const differentCoordinate = createCoordinate(['user'], []);

      const factory = createInstanceFactory(differentCache);
      const context = { registry: mockRegistry };

      factory(differentCoordinate, context);

      const createInstanceMock = vi.mocked(createInstance);
      expect(createInstanceMock).toHaveBeenCalledWith(mockRegistry, differentCoordinate, differentCache);
    });

    it('should handle edge case with minimal generic types', () => {
      // Use simple primary type only
      type SimpleItem = Item<"simple">;
      const simpleCache = mockCache as unknown as Cache<SimpleItem, "simple">;
      const simpleCoordinate = createCoordinate(['simple'], []);

      const factory = createInstanceFactory(simpleCache);
      const context = { registry: mockRegistry };

      const result = factory(simpleCoordinate, context);

      const createInstanceMock = vi.mocked(createInstance);
      expect(createInstanceMock).toHaveBeenCalledWith(mockRegistry, simpleCoordinate, simpleCache);
      expect(result).toBe(mockInstance);
    });

    it('should maintain type safety for the returned instance', () => {
      const factory = createInstanceFactory(mockCache);
      const context = { registry: mockRegistry };

      const result = factory(mockCoordinate, context);

      // Type assertion to verify the result has the correct interface
      expect(result).toHaveProperty('coordinate');
      expect(result).toHaveProperty('registry');
      // Note: The actual Instance interface from @fjell/registry may not have cache property
      // but our mocked instance does have it for testing purposes
      expect(result).toBe(mockInstance);
    });
  });

  describe('InstanceFactory type', () => {
    it('should properly type the factory function signature', () => {
      const factory = createInstanceFactory(mockCache);

      // This test mainly verifies TypeScript compilation
      expect(typeof factory).toBe('function');
    });
  });
});
