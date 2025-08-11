/**
 * A proper Storage API mock that behaves like real browser storage
 */
export class StorageMock implements Storage {
  private data: Map<string, string> = new Map();

  get length(): number {
    return this.data.size;
  }

  key(index: number): string | null {
    if (index < 0 || index >= this.data.size) {
      return null;
    }
    const keys = Array.from(this.data.keys());
    return keys[index] || null;
  }

  getItem(key: string): string | null {
    return this.data.get(key) || null;
  }

  setItem(key: string, value: string): void {
    // Real sessionStorage throws on quota exceeded
    // For testing, we'll simulate a 5MB limit
    const totalSize = this.calculateTotalSize() + key.length + value.length;
    if (totalSize > 5 * 1024 * 1024) {
      const error = new DOMException('QuotaExceededError', 'QuotaExceededError');
      throw error;
    }
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  clear(): void {
    this.data.clear();
  }

  private calculateTotalSize(): number {
    let size = 0;
    for (const [key, value] of this.data.entries()) {
      size += key.length + value.length;
    }
    return size;
  }

  // Helper method for tests only - not part of Storage API
  __reset(): void {
    this.data.clear();
  }
}

// Create a singleton instance for sessionStorage
export const sessionStorageMock = new StorageMock();

// Create a singleton instance for localStorage
export const localStorageMock = new StorageMock();
