import { beforeAll, vi } from 'vitest'

beforeAll(() => {
  // Enable source maps for better error reporting
  process.env.NODE_OPTIONS = '--enable-source-maps'

  // Increase stack trace limit for better error reporting
  Error.stackTraceLimit = 50

  // Mock browser globals for browser cache tests
  if (typeof globalThis.window === 'undefined') {
    // Mock window object
    globalThis.window = {} as any;

    // Mock localStorage
    const createStorageMock = () => {
      const storeWrapper = { data: {} as Record<string, string> };

      const getItem = vi.fn((key: string) => storeWrapper.data[key] || null);
      const setItem = vi.fn((key: string, value: string) => {
        storeWrapper.data[key] = value;
      });
      const removeItem = vi.fn((key: string) => {
        delete storeWrapper.data[key];
      });
      const clear = vi.fn(() => {
        storeWrapper.data = {};
      });
      const key = vi.fn((index: number) => Object.keys(storeWrapper.data)[index] || null);

      return {
        getItem,
        setItem,
        removeItem,
        clear,
        key,
        get length() {
          return Object.keys(storeWrapper.data).length;
        },
        // Add store property for direct access (for testing purposes)
        get store() {
          return storeWrapper.data;
        },
        set store(newStore: Record<string, string>) {
          storeWrapper.data = newStore;
        },
        // Add a method to reset the store for testing
        __resetStore() {
          storeWrapper.data = {};
        }
      };
    };

    globalThis.window.localStorage = createStorageMock();
    globalThis.window.sessionStorage = createStorageMock();

    // Also assign to global scope for direct access
    globalThis.localStorage = globalThis.window.localStorage;
    globalThis.sessionStorage = globalThis.window.sessionStorage;

    // Mock IndexedDB
    let mockStorage = new Map<string, any>();

    // Create function to reset storage for test isolation
    (globalThis as any).__resetMockIndexedDBStorage = () => {
      mockStorage = new Map<string, any>();
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
    globalThis.Storage = function Storage() {} as any;
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
