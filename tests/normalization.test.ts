 
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createNormalizedHashFunction,
  isLocKeyArrayEqual,
  normalizeKeyValue,
  normalizeLocKeyItem
} from '../src/normalization';
import { ComKey, PriKey, UUID } from '@fjell/core';

describe('Normalization Utilities', () => {
  describe('normalizeKeyValue', () => {
    it('should convert numbers to strings', () => {
      expect(normalizeKeyValue(123)).toBe('123');
      expect(normalizeKeyValue(0)).toBe('0');
      expect(normalizeKeyValue(-456)).toBe('-456');
      expect(normalizeKeyValue(3.14)).toBe('3.14');
    });

    it('should keep strings as strings', () => {
      expect(normalizeKeyValue('hello')).toBe('hello');
      expect(normalizeKeyValue('123')).toBe('123');
      expect(normalizeKeyValue('')).toBe('');
      expect(normalizeKeyValue('test-key')).toBe('test-key');
    });

    it('should handle edge cases', () => {
      expect(normalizeKeyValue(NaN)).toBe('NaN');
      expect(normalizeKeyValue(Infinity)).toBe('Infinity');
      expect(normalizeKeyValue(-Infinity)).toBe('-Infinity');
    });
  });

  describe('createNormalizedHashFunction', () => {
    let hashFunction: (key: any) => string;

    beforeEach(() => {
      hashFunction = createNormalizedHashFunction();
    });

    describe('Primary Key Normalization', () => {
      it('should normalize string and number primary keys to same hash', () => {
        const stringKey: PriKey<'test'> = { kt: 'test', pk: '123' as UUID };
        const numberKey: PriKey<'test'> = { kt: 'test', pk: 123 as any };

        const stringHash = hashFunction(stringKey);
        const numberHash = hashFunction(numberKey);

        expect(stringHash).toBe(numberHash);
      });

      it('should handle different string primary keys differently', () => {
        const key1: PriKey<'test'> = { kt: 'test', pk: '123' as UUID };
        const key2: PriKey<'test'> = { kt: 'test', pk: '456' as UUID };

        const hash1 = hashFunction(key1);
        const hash2 = hashFunction(key2);

        expect(hash1).not.toBe(hash2);
      });

      it('should handle null primary keys', () => {
        const key: PriKey<'test'> = { kt: 'test', pk: null as any };

        expect(() => hashFunction(key)).not.toThrow();
        const hash = hashFunction(key);
        expect(typeof hash).toBe('string');
      });
    });

    describe('Composite Key Normalization', () => {
      it('should normalize string and number location keys to same hash', () => {
        const stringLocKey: ComKey<'test', 'container'> = {
          kt: 'test',
          pk: '1' as UUID,
          loc: [{ kt: 'container', lk: '456' as UUID }]
        };
        const numberLocKey: ComKey<'test', 'container'> = {
          kt: 'test',
          pk: '1' as UUID,
          loc: [{ kt: 'container', lk: 456 as any }]
        };

        const stringHash = hashFunction(stringLocKey);
        const numberHash = hashFunction(numberLocKey);

        expect(stringHash).toBe(numberHash);
      });

      it('should normalize primary key while keeping location keys', () => {
        const stringPkKey: ComKey<'test', 'container'> = {
          kt: 'test',
          pk: '123' as UUID,
          loc: [{ kt: 'container', lk: 'container1' as UUID }]
        };
        const numberPkKey: ComKey<'test', 'container'> = {
          kt: 'test',
          pk: 123 as any,
          loc: [{ kt: 'container', lk: 'container1' as UUID }]
        };

        const stringHash = hashFunction(stringPkKey);
        const numberHash = hashFunction(numberPkKey);

        expect(stringHash).toBe(numberHash);
      });

      it('should handle multiple location levels', () => {
        const key: ComKey<'test', 'container', 'subcategory'> = {
          kt: 'test',
          pk: '1' as UUID,
          loc: [
            { kt: 'container', lk: '456' as UUID },
            { kt: 'subcategory', lk: 789 as any }
          ]
        };

        expect(() => hashFunction(key)).not.toThrow();
        const hash = hashFunction(key);
        expect(typeof hash).toBe('string');
      });

      it('should handle empty location arrays', () => {
        const key: ComKey<'test', 'container'> = {
          kt: 'test',
          pk: '1' as UUID,
          loc: [] as any
        };

        expect(() => hashFunction(key)).not.toThrow();
        const hash = hashFunction(key);
        expect(typeof hash).toBe('string');
      });

      it('should handle null location keys', () => {
        const key: ComKey<'test', 'container'> = {
          kt: 'test',
          pk: '1' as UUID,
          loc: [{ kt: 'container', lk: null as any }]
        };

        expect(() => hashFunction(key)).not.toThrow();
        const hash = hashFunction(key);
        expect(typeof hash).toBe('string');
      });
    });

    describe('Edge Cases', () => {
      it('should handle non-object keys', () => {
        expect(() => hashFunction('string')).not.toThrow();
        expect(() => hashFunction(123)).not.toThrow();
        expect(() => hashFunction(null)).not.toThrow();
        expect(() => hashFunction(undefined)).not.toThrow();
      });

      it('should handle empty objects', () => {
        expect(() => hashFunction({})).not.toThrow();
        const hash = hashFunction({});
        expect(typeof hash).toBe('string');
      });

      it('should handle objects without pk or lk', () => {
        const obj = { kt: 'test', someOtherField: 'value' };
        expect(() => hashFunction(obj)).not.toThrow();
      });

      it('should produce consistent hashes for same input', () => {
        const key: PriKey<'test'> = { kt: 'test', pk: '123' as UUID };

        const hash1 = hashFunction(key);
        const hash2 = hashFunction(key);
        const hash3 = hashFunction(key);

        expect(hash1).toBe(hash2);
        expect(hash2).toBe(hash3);
      });

      it('should produce different hashes for different inputs', () => {
        const key1: PriKey<'test'> = { kt: 'test', pk: '123' as UUID };
        const key2: PriKey<'test'> = { kt: 'test', pk: '456' as UUID };

        const hash1 = hashFunction(key1);
        const hash2 = hashFunction(key2);

        expect(hash1).not.toBe(hash2);
      });
    });

    describe('Complex Normalization Scenarios', () => {
      it('should handle mixed string/number keys in same composite key', () => {
        const key: ComKey<'test', 'container', 'subcategory'> = {
          kt: 'test',
          pk: 123 as any, // number
          loc: [
            { kt: 'container', lk: '456' as UUID }, // string
            { kt: 'subcategory', lk: 789 as any } // number
          ]
        };

        const normalizedKey: ComKey<'test', 'container', 'subcategory'> = {
          kt: 'test',
          pk: '123' as UUID, // normalized to string
          loc: [
            { kt: 'container', lk: '456' as UUID }, // already string
            { kt: 'subcategory', lk: '789' as UUID } // normalized to string
          ]
        };

        const hash1 = hashFunction(key);
        const hash2 = hashFunction(normalizedKey);

        expect(hash1).toBe(hash2);
      });
    });
  });

  describe('normalizeLocKeyItem', () => {
    it('should normalize location key items with lk field', () => {
      const item = { kt: 'container', lk: 123 };
      const normalized = normalizeLocKeyItem(item);

      expect(normalized).toEqual({ kt: 'container', lk: '123' });
    });

    it('should not modify items without lk field', () => {
      const item = { kt: 'container', someOtherField: 'value' };
      const normalized = normalizeLocKeyItem(item);

      expect(normalized).toEqual(item);
    });

    it('should handle null lk values', () => {
      const item = { kt: 'container', lk: null };
      const normalized = normalizeLocKeyItem(item);

      expect(normalized).toEqual({ kt: 'container', lk: null });
    });

    it('should handle non-object items', () => {
      expect(normalizeLocKeyItem('string')).toBe('string');
      expect(normalizeLocKeyItem(123)).toBe(123);
      expect(normalizeLocKeyItem(null)).toBe(null);
      expect(normalizeLocKeyItem(undefined)).toBe(undefined);
    });

    it('should preserve other properties', () => {
      const item = { kt: 'container', lk: 123, extra: 'data', nested: { value: 'test' } };
      const normalized = normalizeLocKeyItem(item);

      expect(normalized).toEqual({
        kt: 'container',
        lk: '123',
        extra: 'data',
        nested: { value: 'test' }
      });
    });
  });

  describe('isLocKeyArrayEqual', () => {
    it('should return true for identical arrays', () => {
      const array1 = [
        { kt: 'container', lk: '123' },
        { kt: 'subcategory', lk: '456' }
      ];
      const array2 = [
        { kt: 'container', lk: '123' },
        { kt: 'subcategory', lk: '456' }
      ];

      expect(isLocKeyArrayEqual(array1, array2)).toBe(true);
    });

    it('should return true for arrays with normalized keys', () => {
      const array1 = [
        { kt: 'container', lk: '123' },
        { kt: 'subcategory', lk: 456 }
      ];
      const array2 = [
        { kt: 'container', lk: 123 },
        { kt: 'subcategory', lk: '456' }
      ];

      expect(isLocKeyArrayEqual(array1, array2)).toBe(true);
    });

    it('should return false for arrays with different lengths', () => {
      const array1 = [{ kt: 'container', lk: '123' }];
      const array2 = [
        { kt: 'container', lk: '123' },
        { kt: 'subcategory', lk: '456' }
      ];

      expect(isLocKeyArrayEqual(array1, array2)).toBe(false);
    });

    it('should return false for arrays with different keys', () => {
      const array1 = [{ kt: 'container', lk: '123' }];
      const array2 = [{ kt: 'container', lk: '456' }];

      expect(isLocKeyArrayEqual(array1, array2)).toBe(false);
    });

    it('should return false for arrays with different key types', () => {
      const array1 = [{ kt: 'container', lk: '123' }];
      const array2 = [{ kt: 'category', lk: '123' }];

      expect(isLocKeyArrayEqual(array1, array2)).toBe(false);
    });

    it('should return true for empty arrays', () => {
      expect(isLocKeyArrayEqual([], [])).toBe(true);
    });

    it('should handle arrays with null values', () => {
      const array1 = [{ kt: 'container', lk: null }];
      const array2 = [{ kt: 'container', lk: null }];

      expect(isLocKeyArrayEqual(array1, array2)).toBe(true);
    });

    it('should handle arrays with additional properties', () => {
      const array1 = [{ kt: 'container', lk: '123', extra: 'data1' }];
      const array2 = [{ kt: 'container', lk: '123', extra: 'data2' }];

      // Should be false because extra properties differ
      expect(isLocKeyArrayEqual(array1, array2)).toBe(false);
    });

    it('should handle complex nested scenarios', () => {
      const array1 = [
        { kt: 'org', lk: '1' },
        { kt: 'dept', lk: 2 },
        { kt: 'team', lk: '3' }
      ];
      const array2 = [
        { kt: 'org', lk: 1 },
        { kt: 'dept', lk: '2' },
        { kt: 'team', lk: 3 }
      ];

      expect(isLocKeyArrayEqual(array1, array2)).toBe(true);
    });

    describe('Performance and Edge Cases', () => {
      it('should handle large arrays efficiently', () => {
        const createLargeArray = (size: number, prefix: string) => {
          return Array.from({ length: size }, (_, i) => ({
            kt: `type${i}`,
            lk: `${prefix}${i}`
          }));
        };

        const array1 = createLargeArray(100, 'key');
        const array2 = createLargeArray(100, 'key');

        const startTime = Date.now();
        const result = isLocKeyArrayEqual(array1, array2);
        const duration = Date.now() - startTime;

        expect(result).toBe(true);
        expect(duration).toBeLessThan(100); // Should complete quickly
      });

      it('should short-circuit on length mismatch', () => {
        const array1 = [{ kt: 'container', lk: '123' }];
        const array2 = Array.from({ length: 1000 }, (_, i) => ({ kt: `type${i}`, lk: `key${i}` }));

        const startTime = Date.now();
        const result = isLocKeyArrayEqual(array1, array2);
        const duration = Date.now() - startTime;

        expect(result).toBe(false);
        expect(duration).toBeLessThan(10); // Should be very fast due to short-circuit
      });

      it('should handle arrays with circular references gracefully', () => {
        const item1: any = { kt: 'container', lk: '123' };
        const item2: any = { kt: 'container', lk: '123' };

        // Create circular references
        item1.self = item1;
        item2.self = item2;

        const array1 = [item1];
        const array2 = [item2];

        // This will throw due to JSON.stringify in normalization, which is expected behavior
        expect(() => isLocKeyArrayEqual(array1, array2)).toThrow('Maximum call stack size exceeded');
      });
    });
  });

  describe('Integration Tests', () => {
    it('should work together for complete key normalization workflow', () => {
      const hashFunction = createNormalizedHashFunction();

      // Create keys with mixed string/number values
      const key1: ComKey<'test', 'container', 'subcategory'> = {
        kt: 'test',
        pk: 123 as any,
        loc: [
          { kt: 'container', lk: '456' as UUID },
          { kt: 'subcategory', lk: 789 as any }
        ]
      };

      const key2: ComKey<'test', 'container', 'subcategory'> = {
        kt: 'test',
        pk: '123' as UUID,
        loc: [
          { kt: 'container', lk: 456 as any },
          { kt: 'subcategory', lk: '789' as UUID }
        ]
      };

      // Hash function should normalize both keys to the same hash
      const hash1 = hashFunction(key1);
      const hash2 = hashFunction(key2);
      expect(hash1).toBe(hash2);

      // Location array comparison should also work
      expect(isLocKeyArrayEqual(key1.loc, key2.loc)).toBe(true);

      // Individual location items should normalize correctly
      const normalizedItem1 = normalizeLocKeyItem(key1.loc[1]);
      const normalizedItem2 = normalizeLocKeyItem(key2.loc[1]);
      expect(JSON.stringify(normalizedItem1)).toBe(JSON.stringify(normalizedItem2));
    });

    it('should maintain consistency across multiple normalization calls', () => {
      const hashFunction = createNormalizedHashFunction();
      const key: PriKey<'test'> = { kt: 'test', pk: 123 as any };

      // Multiple calls should produce the same result
      const hashes = Array.from({ length: 10 }, () => hashFunction(key));
      const allSame = hashes.every(hash => hash === hashes[0]);
      expect(allSame).toBe(true);
    });

    it('should handle real-world usage patterns', () => {
      const hashFunction = createNormalizedHashFunction();

      // Simulate user IDs from different sources (database auto-increment vs UUID strings)
      const databaseKey: PriKey<'user'> = { kt: 'user', pk: 12345 as any };
      const stringKey: PriKey<'user'> = { kt: 'user', pk: '12345' as UUID };

      expect(hashFunction(databaseKey)).toBe(hashFunction(stringKey));

      // Simulate hierarchical data with mixed key types
      const orgKey: ComKey<'employee', 'department', 'company'> = {
        kt: 'employee',
        pk: 'emp-123' as UUID,
        loc: [
          { kt: 'department', lk: 42 as any }, // department ID from database
          { kt: 'company', lk: 'company-uuid-456' as UUID } // company UUID
        ]
      };

      const normalizedOrgKey: ComKey<'employee', 'department', 'company'> = {
        kt: 'employee',
        pk: 'emp-123' as UUID,
        loc: [
          { kt: 'department', lk: '42' as UUID }, // normalized to string
          { kt: 'company', lk: 'company-uuid-456' as UUID }
        ]
      };

      expect(hashFunction(orgKey)).toBe(hashFunction(normalizedOrgKey));
      expect(isLocKeyArrayEqual(orgKey.loc, normalizedOrgKey.loc)).toBe(true);
    });
  });
});
