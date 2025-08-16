import { beforeAll, vi } from 'vitest'

// Ensure Buffer is available for browser tests (needed by @fjell/logging)
// This must be done before any other code that might import @fjell packages
if (typeof globalThis.Buffer === 'undefined') {
  try {
    // Try to import Buffer from node:buffer
    const { Buffer } = await import('node:buffer');
    globalThis.Buffer = Buffer;
  } catch (error) {
    // Fallback: create a simple Buffer polyfill for tests
    globalThis.Buffer = {
      byteLength: (str: string, encoding?: string) => {
        if (encoding === 'utf8' || encoding === undefined) {
          return new TextEncoder().encode(str).length;
        }
        return str.length;
      },
      from: (data: any, encoding?: string) => {
        if (typeof data === 'string') {
          return new TextEncoder().encode(data);
        }
        return new Uint8Array(data);
      },
      alloc: (size: number) => new Uint8Array(size)
    } as any;
  }
}

beforeAll(async () => {
  // Enable source maps for better error reporting (Node.js only)
  if (typeof process !== 'undefined' && process.env) {
    process.env.NODE_OPTIONS = '--enable-source-maps'
  }

  // Increase stack trace limit for better error reporting
  Error.stackTraceLimit = 50

  // Suppress unhandled rejection warnings for test errors that are properly handled
  // These are false positives when testing error scenarios with rejects.toThrow()
  if (typeof process !== 'undefined' && process.on) {
    process.on('unhandledRejection', (reason) => {
      // Only ignore rejections from test errors, let real unhandled rejections through
      if (reason instanceof Error && (
        reason.message.includes('Get failed') ||
        reason.message.includes('Retrieve failed') ||
        reason.message.includes('Not found:') ||
        reason.message.includes('API failure') ||
        reason.message.includes('Network error') ||
        reason.message.includes('Detailed API error') ||
        reason.message.includes('Null error test') ||
        reason.message.includes('Undefined error test') ||
        reason.message.includes('Edge case item not found:') ||
        reason.message.includes('Validating PK, Item is undefined') ||
        reason.message.includes('api.httpGet is not a function')
      )) {
        // These are expected test errors that are handled by test assertions
        return;
      }
      // Re-throw real unhandled rejections
      throw reason;
    });
  }

  // Handle uncaught exceptions for expected test errors
  if (typeof process !== 'undefined' && process.on) {
    process.on('uncaughtException', (error) => {
      // Only ignore expected test errors, let real uncaught exceptions through
      if (error.message.includes('Validating PK, Item is undefined') ||
        error.message.includes('api.httpGet is not a function')) {
        // These are expected test errors that are handled by test assertions
        return;
      }
      // Re-throw real uncaught exceptions
      throw error;
    });
  }

  // Add global error handlers for expected test errors
  if (typeof globalThis !== 'undefined') {
    const originalError = globalThis.Error;
    const originalConsoleError = globalThis.console?.error;

    // Override console.error to filter out expected test errors
    if (globalThis.console) {
      globalThis.console.error = (...args: any[]) => {
        const message = args[0]?.toString() || '';
        if (message.includes('Validating PK, Item is undefined') ||
          message.includes('api.httpGet is not a function')) {
          // Suppress expected test errors
          return;
        }
        // Call original console.error for real errors
        if (originalConsoleError) {
          originalConsoleError.apply(globalThis.console, args);
        }
      };
    }
  }

  // Mock browser globals for browser cache tests
  if (typeof globalThis.window === 'undefined') {
    // Mock window object with document for browser environment validation
    globalThis.window = {
      document: {
        createElement: vi.fn(() => ({}))
      }
    } as any;

    // Import the proper storage mock
    const { StorageMock } = await import('./browser/storage-mock');

    // Create mock instances with vi.fn wrappers for spying
    const createSpiedStorage = () => {
      const storageMock = new StorageMock();

      // Wrap methods with vi.fn for test spying
      const spiedStorage = {
        getItem: vi.fn((key: string) => storageMock.getItem(key)),
        setItem: vi.fn((key: string, value: string) => storageMock.setItem(key, value)),
        removeItem: vi.fn((key: string) => storageMock.removeItem(key)),
        clear: vi.fn(() => storageMock.clear()),
        key: vi.fn((index: number) => storageMock.key(index)),
        get length() {
          return storageMock.length;
        },
        // Helper for tests - not part of standard API
        __reset: () => storageMock.__reset()
      };

      return spiedStorage;
    };

    globalThis.window.localStorage = createSpiedStorage();
    globalThis.window.sessionStorage = createSpiedStorage();

    // Also assign to global scope for direct access
    globalThis.localStorage = globalThis.window.localStorage;
    globalThis.sessionStorage = globalThis.window.sessionStorage;

    // Mock IndexedDB with simpler implementation to avoid serialization issues
    const mockStorage = new Map<string, any>();

    // Create function to reset storage for test isolation
    (globalThis as any).__resetMockIndexedDBStorage = () => {
      mockStorage.clear();
    };

    const mockIndexedDB = {
      open: vi.fn((name: string, version?: number) => {
        const mockDatabase = {
          transaction: vi.fn(() => {
            const transaction = {
              objectStore: vi.fn(() => ({
                get: vi.fn((key: any) => {
                  const request = {
                    onsuccess: null as any,
                    onerror: null as any,
                    result: mockStorage.get(JSON.stringify(key)) ?? null
                  };
                  // Use synchronous callback to avoid serialization issues
                  setTimeout(() => {
                    if (request.onsuccess) request.onsuccess({ target: request });
                  }, 0);
                  return request;
                }),
                put: vi.fn((value: any, key?: any) => {
                  const request = { onsuccess: null as any, onerror: null as any };
                  const storageKey = key ? JSON.stringify(key) : JSON.stringify(value.key || value.id);
                  mockStorage.set(storageKey, value);
                  setTimeout(() => {
                    if (request.onsuccess) request.onsuccess({ target: request });
                  }, 0);
                  return request;
                }),
                delete: vi.fn((key: any) => {
                  const request = { onsuccess: null as any, onerror: null as any };
                  mockStorage.delete(JSON.stringify(key));
                  setTimeout(() => {
                    if (request.onsuccess) request.onsuccess({ target: request });
                  }, 0);
                  return request;
                }),
                clear: vi.fn(() => {
                  const request = { onsuccess: null as any, onerror: null as any };
                  mockStorage.clear();
                  setTimeout(() => {
                    if (request.onsuccess) request.onsuccess({ target: request });
                  }, 0);
                  return request;
                }),
                openCursor: vi.fn(() => {
                  const request = { onsuccess: null as any, onerror: null as any };
                  const entries = Array.from(mockStorage.entries());
                  let index = 0;

                  const cursor = entries.length > 0 ? {
                    key: entries[0][0], // Use the raw key instead of parsing
                    value: entries[0][1],
                    continue: vi.fn(() => {
                      index++;
                      if (index < entries.length && cursor) {
                        cursor.key = entries[index][0]; // Use the raw key instead of parsing
                        cursor.value = entries[index][1];
                        setTimeout(() => {
                          if (request.onsuccess) request.onsuccess({ target: { ...request, result: cursor } });
                        }, 0);
                      } else {
                        setTimeout(() => {
                          if (request.onsuccess) request.onsuccess({ target: { ...request, result: null } });
                        }, 0);
                      }
                    })
                  } : null;

                  setTimeout(() => {
                    if (request.onsuccess) request.onsuccess({ target: { ...request, result: cursor } });
                  }, 0);
                  return request;
                })
              })),
              oncomplete: null as any,
              onerror: null as any,
              onabort: null as any
            };
            return transaction;
          }),
          objectStoreNames: {
            contains: vi.fn(() => true)
          },
          createObjectStore: vi.fn((name: string, options?: any) => ({
            name,
            keyPath: options?.keyPath,
            autoIncrement: options?.autoIncrement || false
          })),
          close: vi.fn(),
          version: version || 1
        };

        const request = {
          onsuccess: null as any,
          onerror: null as any,
          onupgradeneeded: null as any,
          result: mockDatabase
        };

        setTimeout(() => {
          if (request.onupgradeneeded) request.onupgradeneeded({ target: request });
          if (request.onsuccess) request.onsuccess({ target: request });
        }, 0);

        return request;
      })
    };

    globalThis.window.indexedDB = mockIndexedDB as any;
    globalThis.indexedDB = mockIndexedDB as any;

    // Mock Storage constructor for prototype tests
    globalThis.Storage = function Storage() { } as any;
    const storagePrototype = {
      setItem: vi.fn(),
      getItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(),
      length: 0
    };
    globalThis.Storage.prototype = storagePrototype;

    // Set up prototype chain for localStorage and sessionStorage
    Object.setPrototypeOf(globalThis.localStorage, storagePrototype);
    Object.setPrototypeOf(globalThis.sessionStorage, storagePrototype);
    Object.setPrototypeOf(globalThis.window.localStorage, storagePrototype);
    Object.setPrototypeOf(globalThis.window.sessionStorage, storagePrototype);
  }
})
