# Memory Leak Prevention Fixes in @fjell/cache

## Overview

This document outlines the comprehensive memory leak prevention features implemented in the fjell-cache event system. These fixes address critical memory management issues that could cause applications to accumulate memory over time without proper cleanup.

## Fixed Memory Leak Issues

### 1. Static Timestamp State in CacheEventFactory ✅

**Problem**: The `CacheEventFactory` class used a static `lastTimestamp` variable that accumulated without cleanup, potentially causing memory issues in long-running applications.

**Solution**:
- Added automatic cleanup mechanisms with instance counting
- Implemented periodic cleanup that resets stale timestamp state
- Added `destroyInstance()` method to properly manage static state lifecycle
- Cleanup timer runs every 60 seconds and doesn't keep the process alive

**Files Modified**:
- `src/events/CacheEventFactory.ts`

**Key Features**:
```typescript
// Automatic cleanup when instances are destroyed
CacheEventFactory.destroyInstance();

// Periodic cleanup of stale state
private static performCleanup(): void {
  const now = Date.now();
  if (now - this.lastTimestamp > this.MAX_TIMESTAMP_AGE_MS) {
    this.lastTimestamp = 0;
  }
}
```

### 2. Weak References for Event Handlers ✅

**Problem**: Event handlers held strong references to listener functions, preventing garbage collection even when the listeners were no longer needed.

**Solution**:
- Implemented optional weak references for event listeners
- Automatic detection and cleanup of garbage-collected listeners
- Backwards compatible with fallback to strong references when WeakRef is not available

**Files Modified**:
- `src/events/CacheEventEmitter.ts`
- `src/events/CacheEventTypes.ts`

**Key Features**:
```typescript
// Weak reference support
listenerRef?: WeakRef<CacheEventListener<V, S, L1, L2, L3, L4, L5>>;

// Automatic cleanup
if (this.WEAK_REF_ENABLED && subscription.listenerRef) {
  const listener = subscription.listenerRef.deref();
  if (!listener) {
    subscription.isActive = false;
    return;
  }
}

// Configuration option
{ useWeakRef: true }
```

### 3. Automatic Subscription Cleanup with Timeouts ✅

**Problem**: Event subscriptions could remain active indefinitely without access, accumulating memory over time.

**Solution**:
- Added periodic cleanup of inactive subscriptions
- Track last access time for each subscription
- Automatic removal of subscriptions inactive for more than 5 minutes
- Cleanup runs every 30 seconds

**Files Modified**:
- `src/events/CacheEventEmitter.ts`

**Key Features**:
```typescript
// Track access times
createdAt: number;
lastAccessTime: number;

// Periodic cleanup
private performPeriodicCleanup(): void {
  const now = Date.now();
  if (now - subscription.lastAccessTime > this.MAX_INACTIVE_TIME_MS) {
    toRemove.push(id);
  }
}
```

### 4. Cache Destruction Mechanisms ✅

**Problem**: Cache instances lacked proper destruction methods, making it difficult to clean up resources when caches were no longer needed.

**Solution**:
- Added `destroy()` method to Cache interface and implementation
- Comprehensive cleanup of all associated resources
- Proper timer cleanup to prevent resource leaks
- Integration with CacheEventFactory instance counting

**Files Modified**:
- `src/Cache.ts`
- `src/Aggregator.ts`

**Key Features**:
```typescript
destroy(): void {
  // Clean up event emitter
  eventEmitter.destroy();

  // Clean up TTL manager
  if (ttlManager && typeof ttlManager.destroy === 'function') {
    ttlManager.destroy();
  }

  // Clean up cache map
  if (cacheMap && typeof (cacheMap as any).destroy === 'function') {
    (cacheMap as any).destroy();
  }

  // Notify CacheEventFactory
  CacheEventFactory.destroyInstance();
}
```

### 5. Enhanced Timer Management ✅

**Problem**: Debounce timers and cleanup intervals could accumulate without proper cleanup.

**Solution**:
- Comprehensive timer cleanup in all destruction paths
- Use of `timer.unref()` to prevent keeping Node.js process alive
- Proper cleanup of debounce timers when subscriptions are removed

**Files Modified**:
- `src/events/CacheEventEmitter.ts`
- `src/events/CacheEventFactory.ts`

**Key Features**:
```typescript
// Timer cleanup
if (subscription.debounceTimer) {
  clearTimeout(subscription.debounceTimer);
  subscription.debounceTimer = null;
}

// Non-blocking timers
if (this.cleanupInterval.unref) {
  this.cleanupInterval.unref();
}
```

## Configuration Options

### Event Subscription Options

```typescript
interface CacheSubscriptionOptions {
  /** Use weak references for the listener (default: true if WeakRef is available) */
  useWeakRef?: boolean;

  /** Debounce events by this many milliseconds */
  debounceMs?: number;

  /** Filter by event types */
  eventTypes?: CacheEventType[];

  /** Optional error handler for listener errors */
  onError?: (error: Error, event: any) => void;
}
```

### Usage Examples

```typescript
// Create cache with automatic cleanup
const cache = createCache(api, coordinate, registry, {
  cacheType: 'memory'
});

// Subscribe with weak references (default)
const subscription = cache.subscribe(
  (event) => console.log(event.type),
  {
    useWeakRef: true,  // Optional: defaults to true
    eventTypes: ['item_created', 'item_updated']
  }
);

// Proper cleanup when done
cache.destroy();
```

## Testing

Comprehensive integration tests have been added to verify the memory leak prevention features:

- `tests/examples/memory-leak-prevention.integration.test.ts`
- `examples/memory-leak-prevention-example.ts`

The tests verify:
- Static state cleanup in CacheEventFactory
- Weak reference functionality
- Subscription timeout cleanup
- Cache destruction mechanisms
- Timer cleanup

## Monitoring and Debugging

### Memory Usage Monitoring

```typescript
// Check active subscriptions
console.log(`Active subscriptions: ${cache.eventEmitter.getSubscriptionCount()}`);

// Get subscription details
const subscriptions = cache.eventEmitter.getSubscriptions();
console.log('Subscription details:', subscriptions);
```

### Performance Impact

- Cleanup operations run in the background and don't block application logic
- Timers are configured to not keep the Node.js process alive
- Weak references provide automatic memory management with zero performance overhead
- Periodic cleanup intervals are optimized for balance between memory usage and performance

## Migration Guide

### For Existing Applications

1. **No Breaking Changes**: All existing code will continue to work without modifications
2. **Opt-in Features**: Weak references and enhanced cleanup are enabled by default but can be disabled
3. **Recommended Actions**:
   - Add `cache.destroy()` calls when caches are no longer needed
   - Consider enabling weak references for better memory management
   - Monitor subscription counts in long-running applications

### Best Practices

1. **Always destroy caches**: Call `cache.destroy()` when done with a cache instance
2. **Use weak references**: Enable weak references for better automatic cleanup
3. **Monitor subscriptions**: Regularly check subscription counts in production
4. **Handle errors**: Provide error handlers for event listeners
5. **Avoid long-lived subscriptions**: Clean up subscriptions that are no longer needed

## Future Considerations

- Memory usage metrics and monitoring hooks
- Configurable cleanup intervals
- Enhanced debugging tools for memory leak detection
- Integration with application performance monitoring (APM) tools

---

## Summary

The memory leak prevention features provide comprehensive protection against common memory issues in event-driven cache systems:

- ✅ **Static state cleanup** prevents accumulation of factory state
- ✅ **Weak references** enable automatic garbage collection of listeners
- ✅ **Periodic cleanup** removes inactive subscriptions automatically
- ✅ **Resource destruction** provides comprehensive cleanup mechanisms
- ✅ **Timer management** prevents resource leaks from background timers

These features ensure that fjell-cache applications can run for extended periods without memory degradation, making the library suitable for production environments with high availability requirements.
