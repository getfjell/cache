import { describe, expect, it } from 'vitest';
import { estimateValueSize, formatBytes, parseSizeString, validateSizeConfig } from '../../src/utils/CacheSize';

describe('CacheSize Edge Cases and Comprehensive Tests', () => {
  describe('parseSizeString edge cases', () => {
    it('should handle very large numbers', () => {
      expect(parseSizeString('999999999')).toBe(999999999);
      expect(parseSizeString('1TB')).toBe(1000000000000);
      expect(parseSizeString('1TiB')).toBe(1099511627776);
    });

    it('should handle very small decimal values', () => {
      expect(parseSizeString('0.1KB')).toBe(100);
      expect(parseSizeString('0.01MB')).toBe(10000);
      expect(parseSizeString('0.001GB')).toBe(1000000);
      expect(parseSizeString('0.5KiB')).toBe(512);
    });

    it('should handle various whitespace scenarios', () => {
      expect(parseSizeString('  100  ')).toBe(100);
      expect(parseSizeString('  1  KB  ')).toBe(1000);
      expect(parseSizeString('\t1MB\n')).toBe(1000000);
      expect(parseSizeString('  1.5   GiB  ')).toBe(1610612736);
    });

    it('should handle edge case units', () => {
      expect(parseSizeString('1b')).toBe(1);
      expect(parseSizeString('1byte')).toBe(1);
      expect(parseSizeString('1bytes')).toBe(1);
      expect(parseSizeString('1kilobyte')).toBe(1000);
      expect(parseSizeString('1kilobytes')).toBe(1000);
      expect(parseSizeString('1kibibyte')).toBe(1024);
      expect(parseSizeString('1kibibytes')).toBe(1024);
    });

    it('should throw for boundary invalid cases', () => {
      expect(() => parseSizeString('')).toThrow('Size string must be a non-empty string');
      expect(() => parseSizeString('   ')).toThrow('Invalid size format');
      expect(() => parseSizeString('abc')).toThrow('Invalid size format');
      expect(() => parseSizeString('1.2.3KB')).toThrow('Invalid size format');
      expect(() => parseSizeString('KB1')).toThrow('Invalid size format');
      expect(() => parseSizeString('1 2 KB')).toThrow('Invalid size format');
    });

    it('should throw for negative values in any format', () => {
      expect(() => parseSizeString('-1')).toThrow('Invalid size format');
      expect(() => parseSizeString('-1.5')).toThrow('Invalid size format');
      expect(() => parseSizeString('-100MB')).toThrow('Invalid size format');
    });

    it('should handle zero values', () => {
      expect(parseSizeString('0')).toBe(0);
      expect(parseSizeString('0.0')).toBe(0);
      expect(parseSizeString('0KB')).toBe(0);
      expect(parseSizeString('0.0MB')).toBe(0);
    });

    it('should handle mixed case comprehensively', () => {
      expect(parseSizeString('1Kb')).toBe(1000);
      expect(parseSizeString('1kB')).toBe(1000);
      expect(parseSizeString('1KB')).toBe(1000);
      expect(parseSizeString('1Mb')).toBe(1000000);
      expect(parseSizeString('1mB')).toBe(1000000);
      expect(parseSizeString('1MB')).toBe(1000000);
      expect(parseSizeString('1kib')).toBe(1024);
      expect(parseSizeString('1KIB')).toBe(1024);
      expect(parseSizeString('1KiB')).toBe(1024);
    });
  });

  describe('formatBytes edge cases', () => {
    it('should handle zero and boundary values', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(1)).toBe('1 B');
      expect(formatBytes(999)).toBe('999 B');
      expect(formatBytes(1000)).toBe('1 KB');
      expect(formatBytes(1023)).toBe('1.0 KB'); // Round to 1.0 KB
      expect(formatBytes(1024)).toBe('1.0 KB'); // Decimal mode
    });

    it('should handle binary mode boundary values', () => {
      expect(formatBytes(0, true)).toBe('0 B');
      expect(formatBytes(1, true)).toBe('1 B');
      expect(formatBytes(1023, true)).toBe('1023 B');
      expect(formatBytes(1024, true)).toBe('1 KiB');
      expect(formatBytes(1536, true)).toBe('1.5 KiB');
      expect(formatBytes(1048576, true)).toBe('1 MiB');
    });

    it('should handle very large numbers', () => {
      expect(formatBytes(1000000000000)).toBe('1 TB'); // 1 TB
      expect(formatBytes(1500000000000)).toBe('1.5 TB'); // 1.5 TB
      expect(formatBytes(1099511627776, true)).toBe('1 TiB'); // 1 TiB
      expect(formatBytes(1649267441664, true)).toBe('1.5 TiB'); // 1.5 TiB
    });

    it('should handle negative numbers', () => {
      expect(formatBytes(-100)).toBe('-100 B');
      expect(formatBytes(-1000)).toBe('-1000 B');
      expect(formatBytes(-1024, true)).toBe('-1024 B');
    });

    it('should handle decimal precision correctly', () => {
      expect(formatBytes(1500)).toBe('1.5 KB');
      expect(formatBytes(1100)).toBe('1.1 KB');
      expect(formatBytes(1010)).toBe('1.0 KB'); // Should round to 1.0
      expect(formatBytes(1536, true)).toBe('1.5 KiB');
      expect(formatBytes(1126, true)).toBe('1.1 KiB');
    });
  });

  describe('estimateValueSize comprehensive tests', () => {
    it('should handle null and undefined', () => {
      expect(estimateValueSize(null)).toBe(8);
      expect(estimateValueSize(void 0)).toBe(8);
    });

    it('should handle all primitive types', () => {
      expect(estimateValueSize(true)).toBe(4);
      expect(estimateValueSize(false)).toBe(4);
      expect(estimateValueSize(42)).toBe(8);
      expect(estimateValueSize(3.14159)).toBe(8);
      expect(estimateValueSize(0)).toBe(8);
      expect(estimateValueSize(-42)).toBe(8);
      expect(estimateValueSize(Number.MAX_SAFE_INTEGER)).toBe(8);
      expect(estimateValueSize(Number.MIN_SAFE_INTEGER)).toBe(8);
      expect(estimateValueSize(Infinity)).toBe(8);
      expect(estimateValueSize(-Infinity)).toBe(8);
      expect(estimateValueSize(NaN)).toBe(8);
    });

    it('should handle various string lengths and types', () => {
      expect(estimateValueSize('')).toBe(0);
      expect(estimateValueSize('a')).toBe(2);
      expect(estimateValueSize('hello')).toBe(10);
      expect(estimateValueSize('hello world')).toBe(22);
      expect(estimateValueSize('🚀')).toBe(4); // 2-char emoji counted as 2 chars, so 4 bytes
      expect(estimateValueSize('🚀🌟')).toBe(8); // 4 chars worth
    });

    it('should handle nested arrays', () => {
      expect(estimateValueSize([])).toBe(24);
      expect(estimateValueSize([1, 2, 3])).toBe(24 + 8 + 8 + 8);
      expect(estimateValueSize(['a', 'b'])).toBe(24 + 2 + 2);
      expect(estimateValueSize([[], []])).toBe(24 + 24 + 24); // Nested arrays
      expect(estimateValueSize([[1, 2], [3, 4]])).toBe(24 + (24 + 8 + 8) + (24 + 8 + 8));
    });

    it('should handle complex objects', () => {
      const simpleObj = { name: 'test', value: 42 };
      const size = estimateValueSize(simpleObj);
      expect(size).toBeGreaterThan(16); // At least object overhead
      expect(size).toBeGreaterThan(JSON.stringify(simpleObj).length);

      const complexObj = {
        id: 123,
        name: 'complex object',
        active: true,
        metadata: {
          created: new Date(),
          tags: ['tag1', 'tag2']
        }
      };
      const complexSize = estimateValueSize(complexObj);
      expect(complexSize).toBeGreaterThan(size);
      expect(complexSize).toBeGreaterThan(JSON.stringify(complexObj).length);
    });

    it('should handle circular references gracefully', () => {
      const circular: any = { name: 'circular' };
      circular.self = circular;
      circular.other = { ref: circular };

      expect(estimateValueSize(circular)).toBe(64); // Fallback size
    });

    it('should handle special object types', () => {
      expect(estimateValueSize(new Date())).toBeGreaterThan(16);
      expect(estimateValueSize(/regex/g)).toBeGreaterThan(16);
      expect(estimateValueSize(new Error('test'))).toBeGreaterThan(16);
    });

    it('should handle functions and symbols', () => {
      const func = function() { return 42; };
      expect(estimateValueSize(func)).toBe(32); // Default fallback

      const symbol = Symbol('test');
      expect(estimateValueSize(symbol)).toBe(32); // Default fallback
    });

    it('should handle mixed arrays with various types', () => {
      const mixedArray = [
        42,
        'hello',
        true,
        { name: 'object' },
        [1, 2, 3],
        null,
        void 0
      ];
      const size = estimateValueSize(mixedArray);
      const expectedSize = 24 + // Array overhead
        8 + // number
        10 + // string
        4 + // boolean
        estimateValueSize({ name: 'object' }) + // object
        estimateValueSize([1, 2, 3]) + // nested array
        8 + // null
        8; // undefined

      expect(size).toBeGreaterThan(expectedSize - 50); // Allow some variance
    });
  });

  describe('validateSizeConfig comprehensive tests', () => {
    it('should accept valid configurations', () => {
      expect(() => validateSizeConfig({})).not.toThrow();
      expect(() => validateSizeConfig({ maxItems: 1 })).not.toThrow();
      expect(() => validateSizeConfig({ maxItems: 100000 })).not.toThrow();
      expect(() => validateSizeConfig({ maxSizeBytes: '1' })).not.toThrow();
      expect(() => validateSizeConfig({ maxSizeBytes: '1KB' })).not.toThrow();
      expect(() => validateSizeConfig({ maxSizeBytes: '999TB' })).not.toThrow();
      expect(() => validateSizeConfig({
        maxItems: 1000,
        maxSizeBytes: '50MB'
      })).not.toThrow();
    });

    it('should reject invalid maxItems values', () => {
      expect(() => validateSizeConfig({ maxItems: 0 })).toThrow('maxItems must be a positive integer');
      expect(() => validateSizeConfig({ maxItems: -1 })).toThrow('maxItems must be a positive integer');
      expect(() => validateSizeConfig({ maxItems: -100 })).toThrow('maxItems must be a positive integer');
      expect(() => validateSizeConfig({ maxItems: 1.5 })).toThrow('maxItems must be a positive integer');
      expect(() => validateSizeConfig({ maxItems: 3.14159 })).toThrow('maxItems must be a positive integer');
      expect(() => validateSizeConfig({ maxItems: Infinity })).toThrow('maxItems must be a positive integer');
      expect(() => validateSizeConfig({ maxItems: -Infinity })).toThrow('maxItems must be a positive integer');
      expect(() => validateSizeConfig({ maxItems: NaN })).toThrow('maxItems must be a positive integer');
    });

    it('should reject invalid maxSizeBytes values', () => {
      expect(() => validateSizeConfig({ maxSizeBytes: '' })).toThrow('Invalid maxSizeBytes');
      expect(() => validateSizeConfig({ maxSizeBytes: '   ' })).toThrow('Invalid maxSizeBytes');
      expect(() => validateSizeConfig({ maxSizeBytes: 'invalid' })).toThrow('Invalid maxSizeBytes');
      expect(() => validateSizeConfig({ maxSizeBytes: '-1' })).toThrow('Invalid maxSizeBytes');
      expect(() => validateSizeConfig({ maxSizeBytes: '-100KB' })).toThrow('Invalid maxSizeBytes');
      expect(() => validateSizeConfig({ maxSizeBytes: '0' })).toThrow('maxSizeBytes must be positive');
      expect(() => validateSizeConfig({ maxSizeBytes: '0KB' })).toThrow('maxSizeBytes must be positive');
      expect(() => validateSizeConfig({ maxSizeBytes: '1XB' })).toThrow('Invalid maxSizeBytes');
    });

    it('should handle edge cases with both properties', () => {
      expect(() => validateSizeConfig({
        maxItems: 1,
        maxSizeBytes: '1'
      })).not.toThrow();

      expect(() => validateSizeConfig({
        maxItems: 0,
        maxSizeBytes: '1KB'
      })).toThrow('maxItems must be a positive integer');

      expect(() => validateSizeConfig({
        maxItems: 100,
        maxSizeBytes: '0'
      })).toThrow('maxSizeBytes must be positive');

      expect(() => validateSizeConfig({
        maxItems: -1,
        maxSizeBytes: '-1KB'
      })).toThrow('Invalid maxSizeBytes'); // First error that occurs
    });

    it('should handle undefined vs missing properties', () => {
      const config1 = { maxItems: void 0, maxSizeBytes: void 0 };
      expect(() => validateSizeConfig(config1)).not.toThrow();

      const config2 = {};
      expect(() => validateSizeConfig(config2)).not.toThrow();

      const config3 = { maxItems: void 0 };
      expect(() => validateSizeConfig(config3)).not.toThrow();

      const config4 = { maxSizeBytes: void 0 };
      expect(() => validateSizeConfig(config4)).not.toThrow();
    });
  });

  describe('integration tests', () => {
    it('should handle round-trip size parsing and formatting', () => {
      const sizes = ['1KB', '5MB', '2GB', '1KiB', '5MiB', '2GiB'];

      sizes.forEach(sizeStr => {
        const bytes = parseSizeString(sizeStr);
        expect(bytes).toBeGreaterThan(0);

        const formatted = formatBytes(bytes);
        expect(formatted).toBeTruthy();
        expect(formatted).toMatch(/^[\d.]+ [KMGT]i?B$/);
      });
    });

    it('should validate realistic cache configurations', () => {
      const configs = [
        { maxItems: 1000, maxSizeBytes: '10MB' },
        { maxItems: 50000, maxSizeBytes: '100MB' },
        { maxItems: 1, maxSizeBytes: '1KB' },
        { maxItems: 1000000, maxSizeBytes: '1GB' },
        { maxSizeBytes: '500KiB' },
        { maxItems: 10000 }
      ];

      configs.forEach(config => {
        expect(() => validateSizeConfig(config)).not.toThrow();
      });
    });

    it('should handle size estimation for realistic cache data', () => {
      const cacheEntries = [
        { id: 1, name: 'User 1', email: 'user1@example.com' },
        { id: 2, name: 'User 2', email: 'user2@example.com', metadata: { lastLogin: new Date() } },
        {
          id: 3,
          name: 'Complex User',
          profile: {
            settings: { theme: 'dark', notifications: true },
            history: [1, 2, 3, 4, 5]
          }
        }
      ];

      cacheEntries.forEach(entry => {
        const size = estimateValueSize(entry);
        expect(size).toBeGreaterThan(0);
        expect(size).toBeGreaterThan(JSON.stringify(entry).length);
      });
    });
  });
});
