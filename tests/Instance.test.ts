/* eslint-disable no-undefined */
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createInstance, isInstance } from '@/Instance';
import { createCoordinate, Registry } from '@fjell/registry';

// Mock the logger
vi.mock('@/logger', () => {
  const logger = {
    get: vi.fn().mockReturnThis(),
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
      get: () => logger,
    }
  }
});

// Mock the createCache function
vi.mock('@/Cache', () => ({
  createCache: vi.fn(),
}));

import { createCache } from '@/Cache';

describe('Instance', () => {
  const mockRegistry: Registry = { type: 'cache' } as Registry;
  const mockCoordinate = createCoordinate(['test', 'container'], []);

  const mockApi = {
    all: vi.fn(),
    one: vi.fn(),
    action: vi.fn(),
    allAction: vi.fn(),
    allFacet: vi.fn(),
    create: vi.fn(),
    get: vi.fn(),
    retrieve: vi.fn(),
    remove: vi.fn(),
    update: vi.fn(),
    facet: vi.fn(),
    find: vi.fn(),
    findOne: vi.fn(),
    reset: vi.fn(),
    set: vi.fn(),
  } as any;

  const mockCacheInstance = {
    coordinate: mockCoordinate,
    registry: mockRegistry,
    api: mockApi,
    cacheMap: {},
    operations: {
      all: vi.fn(),
      one: vi.fn(),
      action: vi.fn(),
      allAction: vi.fn(),
      allFacet: vi.fn(),
      create: vi.fn(),
      get: vi.fn(),
      retrieve: vi.fn(),
      remove: vi.fn(),
      update: vi.fn(),
      facet: vi.fn(),
      find: vi.fn(),
      findOne: vi.fn(),
      reset: vi.fn(),
      set: vi.fn(),
    }
  };

  describe('createInstance', () => {
    beforeEach(() => {
      vi.mocked(createCache).mockResolvedValue(mockCacheInstance as any);
    });

    test('should create instance with api, coordinate, and registry', async () => {
      const instance = await createInstance(mockRegistry, mockCoordinate, mockApi);

      expect(createCache).toHaveBeenCalledWith(mockApi, mockCoordinate, mockRegistry);
      expect(instance).toBe(mockCacheInstance);
    });

    test('should return instance with all required properties', async () => {
      const instance = await createInstance(mockRegistry, mockCoordinate, mockApi);

      expect(instance.coordinate).toBe(mockCoordinate);
      expect(instance.registry).toBe(mockRegistry);
      expect(instance.api).toBe(mockApi);
      expect(instance.cacheMap).toBeDefined();
      expect(instance.operations).toBeDefined();
    });

    test('should work with different coordinate types', async () => {
      const minimalCoordinate = createCoordinate(['minimal'], []);

      await createInstance(mockRegistry, minimalCoordinate, mockApi);

      expect(createCache).toHaveBeenCalledWith(mockApi, minimalCoordinate, mockRegistry);
    });
  });

  describe('isInstance', () => {
    test('should return true for valid instance', () => {
      const validInstance = {
        coordinate: mockCoordinate,
        registry: mockRegistry,
        api: mockApi,
        cacheMap: {},
        operations: {}
      };

      expect(isInstance(validInstance)).toBe(true);
    });

    test('should return false for object missing coordinate', () => {
      const invalidInstance = {
        registry: mockRegistry,
        api: mockApi,
        cacheMap: {},
        operations: {}
      };

      expect(isInstance(invalidInstance)).toBe(false);
    });

    test('should return false for object missing registry', () => {
      const invalidInstance = {
        coordinate: mockCoordinate,
        api: mockApi,
        cacheMap: {},
        operations: {}
      };

      expect(isInstance(invalidInstance)).toBe(false);
    });

    test('should return false for object missing api', () => {
      const invalidInstance = {
        coordinate: mockCoordinate,
        registry: mockRegistry,
        cacheMap: {},
        operations: {}
      };

      expect(isInstance(invalidInstance)).toBe(false);
    });

    test('should return false for object missing cacheMap', () => {
      const invalidInstance = {
        coordinate: mockCoordinate,
        registry: mockRegistry,
        api: mockApi,
        operations: {}
      };

      expect(isInstance(invalidInstance)).toBe(false);
    });

    test('should return false for object missing operations', () => {
      const invalidInstance = {
        coordinate: mockCoordinate,
        registry: mockRegistry,
        api: mockApi,
        cacheMap: {}
      };

      expect(isInstance(invalidInstance)).toBe(false);
    });

    test('should return false for null', () => {
      expect(isInstance(null)).toBe(false);
    });

    test('should return false for undefined', () => {
      expect(isInstance(undefined)).toBe(false);
    });

    test('should return false for non-object values', () => {
      expect(isInstance('not an instance')).toBe(false);
      expect(isInstance(123)).toBe(false);
      expect(isInstance(true)).toBe(false);
      expect(isInstance([])).toBe(false);
    });

    test('should return false for empty object', () => {
      expect(isInstance({})).toBe(false);
    });
  });
});
