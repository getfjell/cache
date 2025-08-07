import { describe, expect, it } from 'vitest';
import { estimateValueSize, formatBytes, parseSizeString, validateSizeConfig } from '../../src/utils/CacheSize';

describe('CacheSize utilities', () => {
  describe('parseSizeString', () => {
    it('should parse plain numbers as bytes', () => {
      expect(parseSizeString('100')).toBe(100);
      expect(parseSizeString('1024')).toBe(1024);
      expect(parseSizeString('0')).toBe(0);
    });

    it('should parse decimal units correctly', () => {
      expect(parseSizeString('1KB')).toBe(1000);
      expect(parseSizeString('5MB')).toBe(5 * 1000 * 1000);
      expect(parseSizeString('2GB')).toBe(2 * 1000 * 1000 * 1000);
      expect(parseSizeString('1TB')).toBe(1000 * 1000 * 1000 * 1000);
    });

    it('should parse binary units correctly', () => {
      expect(parseSizeString('1KiB')).toBe(1024);
      expect(parseSizeString('5MiB')).toBe(5 * 1024 * 1024);
      expect(parseSizeString('2GiB')).toBe(2 * 1024 * 1024 * 1024);
      expect(parseSizeString('1TiB')).toBe(1024 * 1024 * 1024 * 1024);
    });

    it('should handle case insensitive units', () => {
      expect(parseSizeString('1kb')).toBe(1000);
      expect(parseSizeString('1Kb')).toBe(1000);
      expect(parseSizeString('1kB')).toBe(1000);
      expect(parseSizeString('1KiB')).toBe(1024);
      expect(parseSizeString('1kib')).toBe(1024);
    });

    it('should handle decimal values', () => {
      expect(parseSizeString('1.5KB')).toBe(1500);
      expect(parseSizeString('2.5MB')).toBe(2500000);
      expect(parseSizeString('0.5KiB')).toBe(512);
    });

    it('should handle whitespace', () => {
      expect(parseSizeString(' 1KB ')).toBe(1000);
      expect(parseSizeString('1 KB')).toBe(1000);
      expect(parseSizeString(' 1 KB ')).toBe(1000);
    });

    it('should throw for invalid formats', () => {
      expect(() => parseSizeString('')).toThrow('Size string must be a non-empty string');
      expect(() => parseSizeString('invalid')).toThrow('Invalid size format');
      expect(() => parseSizeString('1XB')).toThrow('Unsupported size unit');
      expect(() => parseSizeString('-1KB')).toThrow('Invalid size format');
    });
  });

  describe('formatBytes', () => {
    it('should format bytes in decimal units by default', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(500)).toBe('500 B');
      expect(formatBytes(1000)).toBe('1 KB');
      expect(formatBytes(1500)).toBe('1.5 KB');
      expect(formatBytes(1000000)).toBe('1 MB');
      expect(formatBytes(1000000000)).toBe('1 GB');
    });

    it('should format bytes in binary units when requested', () => {
      expect(formatBytes(0, true)).toBe('0 B');
      expect(formatBytes(512, true)).toBe('512 B');
      expect(formatBytes(1024, true)).toBe('1 KiB');
      expect(formatBytes(1536, true)).toBe('1.5 KiB');
      expect(formatBytes(1048576, true)).toBe('1 MiB');
      expect(formatBytes(1073741824, true)).toBe('1 GiB');
    });

    it('should handle negative values', () => {
      expect(formatBytes(-100)).toBe('-100 B');
    });
  });

  describe('estimateValueSize', () => {
    it('should estimate primitive types correctly', () => {
      expect(estimateValueSize(null)).toBe(8);
      expect(estimateValueSize(void 0)).toBe(8);
      expect(estimateValueSize(true)).toBe(4);
      expect(estimateValueSize(false)).toBe(4);
      expect(estimateValueSize(42)).toBe(8);
      expect(estimateValueSize(3.14)).toBe(8);
    });

    it('should estimate string sizes', () => {
      expect(estimateValueSize('')).toBe(0);
      expect(estimateValueSize('hello')).toBe(10); // 5 chars * 2 bytes
      expect(estimateValueSize('test string')).toBe(22); // 11 chars * 2 bytes
    });

    it('should estimate array sizes', () => {
      expect(estimateValueSize([])).toBe(24); // Array overhead
      expect(estimateValueSize([1, 2, 3])).toBe(24 + 8 + 8 + 8); // Array + 3 numbers
      expect(estimateValueSize(['a', 'b'])).toBe(24 + 2 + 2); // Array + 2 chars
    });

    it('should estimate object sizes via JSON serialization', () => {
      const obj = { name: 'test', value: 42 };
      const size = estimateValueSize(obj);
      expect(size).toBeGreaterThan(16); // At least object overhead
      expect(size).toBeGreaterThan(JSON.stringify(obj).length); // Should include overhead
    });

    it('should handle non-serializable objects', () => {
      const circular: any = {};
      circular.self = circular;
      expect(estimateValueSize(circular)).toBe(64); // Fallback size
    });
  });

  describe('validateSizeConfig', () => {
    it('should validate correct configurations', () => {
      expect(() => validateSizeConfig({})).not.toThrow();
      expect(() => validateSizeConfig({ maxItems: 100 })).not.toThrow();
      expect(() => validateSizeConfig({ maxSizeBytes: '1MB' })).not.toThrow();
      expect(() => validateSizeConfig({
        maxItems: 100,
        maxSizeBytes: '1MB'
      })).not.toThrow();
    });

    it('should reject invalid maxItems', () => {
      expect(() => validateSizeConfig({ maxItems: 0 })).toThrow('maxItems must be a positive integer');
      expect(() => validateSizeConfig({ maxItems: -1 })).toThrow('maxItems must be a positive integer');
      expect(() => validateSizeConfig({ maxItems: 1.5 })).toThrow('maxItems must be a positive integer');
    });

    it('should reject invalid maxSizeBytes', () => {
      expect(() => validateSizeConfig({ maxSizeBytes: '' })).toThrow('Invalid maxSizeBytes');
      expect(() => validateSizeConfig({ maxSizeBytes: 'invalid' })).toThrow('Invalid maxSizeBytes');
      expect(() => validateSizeConfig({ maxSizeBytes: '0' })).toThrow('maxSizeBytes must be positive');
      expect(() => validateSizeConfig({ maxSizeBytes: '-1MB' })).toThrow('Invalid maxSizeBytes');
    });
  });
});
