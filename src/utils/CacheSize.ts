/**
 * Utility functions for parsing and managing cache sizes
 */

/**
 * Size unit multipliers (decimal and binary)
 */
const SIZE_UNITS: { [key: string]: number } = {
  // Decimal units (powers of 1000)
  'b': 1,
  'byte': 1,
  'bytes': 1,
  'kb': 1000,
  'kilobyte': 1000,
  'kilobytes': 1000,
  'mb': 1000 * 1000,
  'megabyte': 1000 * 1000,
  'megabytes': 1000 * 1000,
  'gb': 1000 * 1000 * 1000,
  'gigabyte': 1000 * 1000 * 1000,
  'gigabytes': 1000 * 1000 * 1000,
  'tb': 1000 * 1000 * 1000 * 1000,
  'terabyte': 1000 * 1000 * 1000 * 1000,
  'terabytes': 1000 * 1000 * 1000 * 1000,

  // Binary units (powers of 1024)
  'kib': 1024,
  'kibibyte': 1024,
  'kibibytes': 1024,
  'mib': 1024 * 1024,
  'mebibyte': 1024 * 1024,
  'mebibytes': 1024 * 1024,
  'gib': 1024 * 1024 * 1024,
  'gibibyte': 1024 * 1024 * 1024,
  'gibibytes': 1024 * 1024 * 1024,
  'tib': 1024 * 1024 * 1024 * 1024,
  'tebibyte': 1024 * 1024 * 1024 * 1024,
  'tebibytes': 1024 * 1024 * 1024 * 1024,
};

/**
 * Parse a size string and return the size in bytes
 *
 * @param sizeStr - Size string (e.g., '300', '3kb', '5MB', '2GiB')
 * @returns Size in bytes
 * @throws Error if the size string is invalid
 */
export function parseSizeString(sizeStr: string): number {
  if (!sizeStr || typeof sizeStr !== 'string') {
    throw new Error('Size string must be a non-empty string');
  }

  const trimmed = sizeStr.trim();

  // Handle pure numeric values (assume bytes)
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const bytes = parseFloat(trimmed);
    if (isNaN(bytes) || bytes < 0) {
      throw new Error(`Invalid size value: ${sizeStr}`);
    }
    return Math.floor(bytes);
  }

  // Parse with unit
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)$/);
  if (!match) {
    throw new Error(`Invalid size format: ${sizeStr}. Expected format: '100', '5KB', '10MB', etc.`);
  }

  const [, valueStr, unitStr] = match;
  const value = parseFloat(valueStr);
  const unit = unitStr.toLowerCase();

  if (isNaN(value) || value < 0) {
    throw new Error(`Invalid size value: ${valueStr}`);
  }

  const multiplier = SIZE_UNITS[unit];
  if (!(unit in SIZE_UNITS)) {
    const supportedUnits = Object.keys(SIZE_UNITS).filter(u => u.length <= 3).join(', ');
    throw new Error(`Unsupported size unit: ${unitStr}. Supported units: ${supportedUnits}`);
  }

  return Math.floor(value * multiplier);
}

/**
 * Format bytes as a human-readable string
 *
 * @param bytes - Size in bytes
 * @param binary - Use binary units (1024) instead of decimal (1000)
 * @returns Formatted size string
 */
export function formatBytes(bytes: number, binary: boolean = false): string {
  if (bytes === 0) return '0 B';
  if (bytes < 0) return `${bytes} B`;

  const k = binary ? 1024 : 1000;
  const sizes = binary
    ? ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB']
    : ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = bytes / Math.pow(k, i);

  // Show decimals only if needed
  const formatted = size % 1 === 0 ? size.toString() : size.toFixed(1);

  return `${formatted} ${sizes[i]}`;
}

/**
 * Estimate the serialized size of a value in bytes
 * This is an approximation for cache size calculations
 *
 * @param value - The value to estimate size for
 * @returns Estimated size in bytes
 */
import safeStringify from 'fast-safe-stringify';

export function estimateValueSize(value: any): number {
  if (value === null || typeof value === 'undefined') {
    return 8; // Approximate overhead
  }

  switch (typeof value) {
    case 'boolean':
      return 4;
    case 'number':
      return 8;
    case 'string':
      // UTF-8 encoding: most characters are 1 byte, some are 2-4 bytes
      // Use a simple approximation of 2 bytes per character for safety
      return value.length * 2;
    case 'object':
      if (Array.isArray(value)) {
        return value.reduce((total, item) => total + estimateValueSize(item), 24); // Array overhead
      }

      // Detect circular references explicitly to respect fallback behavior
      const hasCircularReference = (obj: unknown, ancestors: WeakSet<object> = new WeakSet(), checked: WeakSet<object> = new WeakSet()): boolean => {
        if (obj === null || typeof obj !== 'object') {
          return false;
        }

        const asObject = obj as object;

        if (checked.has(asObject)) {
          return false;
        }

        if (ancestors.has(asObject)) {
          return true;
        }

        ancestors.add(asObject);
        try {
          if (Array.isArray(asObject)) {
            for (const item of asObject) {
              if (hasCircularReference(item, ancestors, checked)) {
                return true;
              }
            }
          } else {
            for (const key of Object.keys(asObject as Record<string, unknown>)) {
              // Access value defensively in case of getters throwing
              let child: unknown;
              try {
                child = (asObject as Record<string, unknown>)[key as keyof typeof asObject];
              } catch {
                // Treat property access errors as non-fatal for traversal
                continue;
              }
              if (hasCircularReference(child, ancestors, checked)) {
                return true;
              }
            }
          }
        } finally {
          ancestors.delete(asObject);
          checked.add(asObject);
        }

        return false;
      };

      try {
        if (hasCircularReference(value)) {
          return 64;
        }
      } catch {
        return 64;
      }

      // For objects, estimate based on safe serialization that supports circular refs
      try {
        const jsonString = safeStringify(value);
        return jsonString.length * 2 + 16; // JSON string size + object overhead
      } catch {
        // Fallback for objects that can't be serialized
        return 64;
      }
    default:
      return 32; // Default fallback
  }
}

/**
 * Check if a size configuration is valid
 *
 * @param config - Size configuration to validate
 * @throws Error if configuration is invalid
 */
export function validateSizeConfig(config: { maxSizeBytes?: string; maxItems?: number }): void {
  if (typeof config.maxSizeBytes !== 'undefined') {
    try {
      const bytes = parseSizeString(config.maxSizeBytes);
      if (bytes <= 0) {
        throw new Error('maxSizeBytes must be positive');
      }
    } catch (error) {
      throw new Error(`Invalid maxSizeBytes: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  if (typeof config.maxItems !== 'undefined') {
    if (!Number.isInteger(config.maxItems) || config.maxItems <= 0) {
      throw new Error('maxItems must be a positive integer');
    }
  }
}
