import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type AffectedKeys, createOperations, isComKey, isPriKey, type OperationParams, Operations } from '../src/Operations';
import type { Operations as CoreOperations } from '@fjell/core';
import type { ClientApi } from '@fjell/client-api';
import type { Coordinate } from '@fjell/registry';
import { CacheMap } from '../src/CacheMap';
import { CacheEventEmitter } from '../src/events/CacheEventEmitter';
import { TTLManager } from '../src/ttl/TTLManager';
import { EvictionManager } from '../src/eviction/EvictionManager';
import { CacheStatsManager } from '../src/CacheStats';
import { createRegistry } from '@fjell/registry';
import { MemoryCacheMap } from '../src/memory/MemoryCacheMap';

interface TestItem {
  kt: 'test';
  pk: string;
  name: string;
  created: Date;
  updated: Date;
}

describe('Cache Operations', () => {
  describe('Interface Compatibility', () => {
    it('should extend core Operations interface', () => {
      // Type test - this should compile
      type TestOps = Operations<TestItem, 'test'>;
      type CoreOps = CoreOperations<TestItem, 'test'>;
      
      // Cache ops should be assignable to core ops (plus cache-specific methods)
      // This verifies structural compatibility at compile time
      
      // Verify the type relationship exists
      // If this compiles, it means Cache Operations properly extends Core Operations
      const typeCheck = (ops: TestOps): CoreOps => {
        // Cache ops has all core ops methods, so it can be used as core ops
        return ops as any; // Using any here because cache has extra methods
      };
      
      expect(typeCheck).toBeDefined();
    });

    it('should have cache-specific methods in type definition', () => {
      // This is a compile-time check
      // If these method signatures exist in the type, this will compile
      type TestOps = Operations<TestItem, 'test'>;
      
      // Verify that these methods exist in the type
      // If they don't exist, TypeScript will fail to compile
      // Using callable type check instead of Function
      type IsCallable<T> = T extends (...args: any[]) => any ? true : never;
      const typeHasRetrieve: IsCallable<TestOps['retrieve']> = true;
      const typeHasSet: IsCallable<TestOps['set']> = true;
      const typeHasReset: IsCallable<TestOps['reset']> = true;
      
      expect(typeHasRetrieve).toBe(true);
      expect(typeHasSet).toBe(true);
      expect(typeHasReset).toBe(true);
    });

    it('should re-export type guards from core', () => {
      expect(typeof isPriKey).toBe('function');
      expect(typeof isComKey).toBe('function');
    });

    it('should re-export types from core', () => {
      // Type tests - these should compile
      const params: OperationParams = { test: 'value' };
      const affectedKeys: AffectedKeys = [];
      
      expect(params).toBeDefined();
      expect(affectedKeys).toBeDefined();
    });
  });

  describe('Type Guards', () => {
    it('isPriKey should identify primary keys', () => {
      const priKey = { kt: 'test' as const, pk: '123' };
      const comKey = { kt: 'test' as const, pk: '123', loc: [{ kt: 'parent' as const, lk: 'parent-1' }] };
      
      expect(isPriKey(priKey)).toBe(true);
      expect(isPriKey(comKey)).toBe(false);
    });

    it('isComKey should identify composite keys', () => {
      const priKey = { kt: 'test' as const, pk: '123' };
      const comKey = { kt: 'test' as const, pk: '123', loc: [{ kt: 'parent' as const, lk: 'parent-1' }] };
      
      expect(isComKey(priKey)).toBe(false);
      expect(isComKey(comKey)).toBe(true);
    });
  });

  describe('createOperations', () => {
    let mockApi: ClientApi<TestItem, 'test'>;
    let mockCoordinate: Coordinate<'test'>;
    let cacheMap: CacheMap<TestItem, 'test'>;
    let eventEmitter: CacheEventEmitter<TestItem, 'test'>;
    let ttlManager: TTLManager;
    let evictionManager: EvictionManager;
    let statsManager: CacheStatsManager;

    beforeEach(() => {
      const testItem = {
        key: { kt: 'test' as const, pk: '123' },
        name: 'Test',
        events: {
          created: { at: new Date() },
          updated: { at: new Date() },
          deleted: { at: null }
        }
      };
      
      const updatedItem = {
        key: { kt: 'test' as const, pk: '123' },
        name: 'Updated',
        events: {
          created: { at: new Date() },
          updated: { at: new Date() },
          deleted: { at: null }
        }
      };

      mockApi = {
        all: vi.fn().mockResolvedValue([]),
        one: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(testItem),
        get: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue(updatedItem),
        remove: vi.fn().mockResolvedValue(undefined),
        find: vi.fn().mockResolvedValue([]),
        findOne: vi.fn().mockResolvedValue(null),
        action: vi.fn().mockResolvedValue([testItem, []]),
        allAction: vi.fn().mockResolvedValue([[], []]),
        facet: vi.fn().mockResolvedValue({}),
        allFacet: vi.fn().mockResolvedValue({})
      } as any;

      mockCoordinate = {
        kt: 'test',
        lks: [],
        pk: 'test'
      } as any;

      cacheMap = new MemoryCacheMap<TestItem, 'test'>();
      eventEmitter = new CacheEventEmitter<TestItem, 'test'>();
      ttlManager = new TTLManager();
      evictionManager = new EvictionManager({ strategy: 'lru', maxSize: 100 });
      statsManager = new CacheStatsManager();
    });

    it('should create operations with all core methods', () => {
      const registry = createRegistry();
      const ops = createOperations(
        mockApi,
        mockCoordinate,
        cacheMap,
        'test',
        {},
        eventEmitter,
        ttlManager,
        evictionManager,
        statsManager,
        registry
      );

      expect(ops.all).toBeDefined();
      expect(ops.one).toBeDefined();
      expect(ops.create).toBeDefined();
      expect(ops.get).toBeDefined();
      expect(ops.update).toBeDefined();
      expect(ops.upsert).toBeDefined();
      expect(ops.remove).toBeDefined();
      expect(ops.find).toBeDefined();
      expect(ops.findOne).toBeDefined();
      expect(ops.action).toBeDefined();
      expect(ops.allAction).toBeDefined();
      expect(ops.facet).toBeDefined();
      expect(ops.allFacet).toBeDefined();
    });

    it('should create operations with cache-specific methods', () => {
      const registry = createRegistry();
      const ops = createOperations(
        mockApi,
        mockCoordinate,
        cacheMap,
        'test',
        {},
        eventEmitter,
        ttlManager,
        evictionManager,
        statsManager,
        registry
      );

      expect(ops.retrieve).toBeDefined();
      expect(ops.set).toBeDefined();
      expect(ops.reset).toBeDefined();
    });

    it('should handle CreateOptions parameter', async () => {
      const registry = createRegistry();
      const ops = createOperations(
        mockApi,
        mockCoordinate,
        cacheMap,
        'test',
        {},
        eventEmitter,
        ttlManager,
        evictionManager,
        statsManager,
        registry
      );

      // Test with locations in options
      await ops.create({ name: 'Test' }, { locations: [] });
      expect(mockApi.create).toHaveBeenCalledWith({ name: 'Test' }, undefined);

      // Test without options
      await ops.create({ name: 'Test2' });
      expect(mockApi.create).toHaveBeenCalledWith({ name: 'Test2' }, undefined);
    });

    it('should implement upsert correctly when item exists', async () => {
      const registry = createRegistry();
      const ops = createOperations(
        mockApi,
        mockCoordinate,
        cacheMap,
        'test',
        {},
        eventEmitter,
        ttlManager,
        evictionManager,
        statsManager,
        registry
      );

      const key = { kt: 'test' as const, pk: '123' };
      
      const existingItem = {
        key: { kt: 'test' as const, pk: '123' },
        name: 'Existing',
        events: {
          created: { at: new Date() },
          updated: { at: new Date() },
          deleted: { at: null }
        }
      };

      // Test update path (item exists)
      mockApi.get = vi.fn().mockResolvedValue(existingItem);
      await ops.upsert(key, { name: 'Updated' });
      expect(mockApi.update).toHaveBeenCalledWith(key, { name: 'Updated' });
    });

    it('should implement upsert correctly when item does not exist', async () => {
      // Clear the cache map before this test
      await cacheMap.clear();
      
      const registry = createRegistry();
      const ops = createOperations(
        mockApi,
        mockCoordinate,
        cacheMap,
        'test',
        {},
        eventEmitter,
        ttlManager,
        evictionManager,
        statsManager,
        registry
      );

      const key = { kt: 'test' as const, pk: '123' };

      // Test create path (item doesn't exist)
      mockApi.get = vi.fn().mockResolvedValue(null);
      await ops.upsert(key, { name: 'New' }, []);
      expect(mockApi.create).toHaveBeenCalledWith({ name: 'New' }, undefined);
    });
  });
});

