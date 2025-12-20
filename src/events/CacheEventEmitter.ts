import { ComKey, Item, ItemQuery, LocKey, LocKeyArray, PriKey } from "@fjell/types";
import {
  AnyCacheEvent,
  CacheEventListener,
  CacheSubscription,
  CacheSubscriptionOptions
} from "./CacheEventTypes";
import { normalizeKeyValue } from "../normalization";
import LibLogger from "../logger";

const logger = LibLogger.get('CacheEventEmitter');

/**
 * Internal subscription data
 */
interface InternalSubscription<
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
> {
  id: string;
  listener: CacheEventListener<V, S, L1, L2, L3, L4, L5>;
  listenerRef?: WeakRef<CacheEventListener<V, S, L1, L2, L3, L4, L5>>;
  options: CacheSubscriptionOptions<S, L1, L2, L3, L4, L5>;
  isActive: boolean;
  debounceTimer?: NodeJS.Timeout | null;
  lastEmitTime?: number;
  createdAt: number;
  lastAccessTime: number;
}

/**
 * Cache event emitter that manages subscriptions and event dispatching
 */
export class CacheEventEmitter<
  V extends Item<S, L1, L2, L3, L4, L5>,
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
> {
  private subscriptions = new Map<string, InternalSubscription<V, S, L1, L2, L3, L4, L5>>();
  private nextSubscriptionId = 1;
  private isDestroyed = false;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly CLEANUP_INTERVAL_MS = 30000; // 30 seconds
  private readonly MAX_INACTIVE_TIME_MS = 300000; // 5 minutes
  private readonly WEAK_REF_ENABLED = typeof WeakRef !== 'undefined';

  constructor() {
    this.startPeriodicCleanup();
  }

  /**
   * Start periodic cleanup of inactive subscriptions
   */
  private startPeriodicCleanup(): void {
    if (this.cleanupInterval) return;

    this.cleanupInterval = setInterval(() => {
      this.performPeriodicCleanup();
    }, this.CLEANUP_INTERVAL_MS);

    // Don't keep the process alive just for cleanup
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Perform periodic cleanup of inactive subscriptions
   */
  private performPeriodicCleanup(): void {
    if (this.isDestroyed) return;

    const now = Date.now();
    const toRemove: string[] = [];

    for (const [id, subscription] of this.subscriptions) {
      // Check if subscription is inactive for too long
      if (!subscription.isActive ||
        (now - subscription.lastAccessTime > this.MAX_INACTIVE_TIME_MS)) {
        toRemove.push(id);
        continue;
      }

      // Check if listener has been garbage collected (for weak references)
      if (this.WEAK_REF_ENABLED && subscription.listenerRef) {
        const listener = subscription.listenerRef.deref();
        if (!listener) {
          toRemove.push(id);
          continue;
        }
      }
    }

    // Remove inactive subscriptions
    toRemove.forEach(id => this.unsubscribe(id));
  }

  /**
   * Subscribe to cache events
   */
  public subscribe(
    listener: CacheEventListener<V, S, L1, L2, L3, L4, L5>,
    options: CacheSubscriptionOptions<S, L1, L2, L3, L4, L5> = {}
  ): CacheSubscription {
    if (this.isDestroyed) {
      throw new Error('Cannot subscribe to destroyed event emitter');
    }

    const id = `subscription_${this.nextSubscriptionId++}`;
    const now = Date.now();

    const subscription: InternalSubscription<V, S, L1, L2, L3, L4, L5> = {
      id,
      listener,
      listenerRef: this.WEAK_REF_ENABLED && options.useWeakRef !== false ?
        new WeakRef(listener) : undefined,
      options,
      isActive: true,
      createdAt: now,
      lastAccessTime: now
    };

    this.subscriptions.set(id, subscription);

    // Return public subscription interface
    return {
      id,
      unsubscribe: () => this.unsubscribe(id),
      isActive: () => {
        const sub = this.subscriptions.get(id);
        if (sub) {
          sub.lastAccessTime = Date.now();
        }
        return sub?.isActive ?? false;
      },
      getOptions: () => ({ ...options }) as CacheSubscriptionOptions<S, L1, L2, L3, L4, L5>
    };
  }

  /**
   * Unsubscribe from events
   */
  public unsubscribe(subscriptionId: string): boolean {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return false;
    }

    // Clear any pending debounce timer
    if (subscription.debounceTimer) {
      clearTimeout(subscription.debounceTimer);
      subscription.debounceTimer = null;
    }

    subscription.isActive = false;
    this.subscriptions.delete(subscriptionId);

    return true;
  }

  /**
   * Emit an event to all matching subscriptions
   */
  public emit(event: AnyCacheEvent<V, S, L1, L2, L3, L4, L5>): void {
    if (this.isDestroyed) {
      logger.debug('Event emission skipped - emitter is destroyed', {
        component: 'cache',
        subcomponent: 'CacheEventEmitter',
        eventType: event.type,
        suggestion: 'This is expected during cleanup. Ensure emitter is not used after destroy().'
      });
      return;
    }

    let emittedCount = 0;
    const totalSubscriptions = this.subscriptions.size;
    const activeSubscriptions = Array.from(this.subscriptions.values()).filter(s => s.isActive).length;
    
    for (const subscription of this.subscriptions.values()) {
      if (!subscription.isActive) {
        continue;
      }

      if (this.shouldEmitToSubscription(event, subscription)) {
        this.emitToSubscription(event, subscription);
        emittedCount++;
      }
    }
    
    logger.trace('Event emitted to subscriptions', {
      component: 'cache',
      subcomponent: 'CacheEventEmitter',
      eventType: event.type,
      eventSource: event.source,
      eventKey: 'key' in event ? JSON.stringify(event.key) : undefined,
      totalSubscriptions,
      activeSubscriptions,
      emittedCount,
      note: emittedCount === 0 ? 'No subscriptions matched this event' : undefined
    });
  }

  /**
   * Get count of active subscriptions
   */
  public getSubscriptionCount(): number {
    return Array.from(this.subscriptions.values()).filter(s => s.isActive).length;
  }

  /**
   * Get subscription details (for debugging)
   */
  public getSubscriptions(): Array<{ id: string; options: CacheSubscriptionOptions<S, L1, L2, L3, L4, L5> }> {
    return Array.from(this.subscriptions.values())
      .filter(s => s.isActive)
      .map(s => ({ id: s.id, options: { ...s.options } }));
  }

  /**
   * Destroy the event emitter and clean up all subscriptions
   */
  public destroy(): void {
    // Stop periodic cleanup
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Clear all debounce timers
    for (const subscription of this.subscriptions.values()) {
      if (subscription.debounceTimer) {
        clearTimeout(subscription.debounceTimer);
        subscription.debounceTimer = null;
      }
      subscription.isActive = false;
    }

    this.subscriptions.clear();
    this.isDestroyed = true;
  }

  /**
   * Check if an event should be emitted to a specific subscription
   */
  private shouldEmitToSubscription(
    event: AnyCacheEvent<V, S, L1, L2, L3, L4, L5>,
    subscription: InternalSubscription<V, S, L1, L2, L3, L4, L5>
  ): boolean {
    const { options } = subscription;

    // Filter by event type
    if (options.eventTypes && !options.eventTypes.includes(event.type)) {
      return false;
    }

    // Filter by specific keys
    if (options.keys && options.keys.length > 0) {
      if ('key' in event) {
        const eventKeyStr = this.normalizeKey(event.key);
        const matchesKey = options.keys.some(key =>
          this.normalizeKey(key) === eventKeyStr
        );
        if (!matchesKey) {
          return false;
        }
      } else if ('affectedKeys' in event) {
        const eventKeyStrs = event.affectedKeys.map(key => this.normalizeKey(key));
        const hasMatchingKey = options.keys.some(key =>
          eventKeyStrs.includes(this.normalizeKey(key))
        );
        if (!hasMatchingKey) {
          return false;
        }
      } else {
        // Event doesn't have keys, skip if subscription is key-specific
        return false;
      }
    }

    // Filter by locations
    if (options.locations && options.locations.length > 0) {
      if ('affectedLocations' in event && event.affectedLocations) {
        if (!this.locationsMatch(options.locations, event.affectedLocations)) {
          return false;
        }
      } else if ('locations' in event) {
        if (!this.locationsMatch(options.locations, event.locations)) {
          return false;
        }
      } else if ('key' in event) {
        // Check if the item key matches the location filter
        if (!this.keyMatchesLocations(event.key, options.locations)) {
          return false;
        }
      } else {
        // Event doesn't have location info, skip if subscription is location-specific
        return false;
      }
    }

    // Filter by query (this is more complex and approximate)
    if (options.query) {
      if ('query' in event) {
        if (!this.queriesMatch(options.query, event.query)) {
          return false;
        }
      } else {
        // For non-query events, we can't easily determine if they match a query filter
        // This could be enhanced with more sophisticated query matching
        return true;
      }
    }

    return true;
  }

  /**
   * Emit event to a specific subscription, handling debouncing
   */
  private emitToSubscription(
    event: AnyCacheEvent<V, S, L1, L2, L3, L4, L5>,
    subscription: InternalSubscription<V, S, L1, L2, L3, L4, L5>
  ): void {

    // Update last access time for cleanup purposes
    subscription.lastAccessTime = Date.now();

    // Get the listener, either directly or from weak reference
    let listener = subscription.listener;
    if (this.WEAK_REF_ENABLED && subscription.listenerRef) {
      const weakListener = subscription.listenerRef.deref();
      if (!weakListener) {
        // Listener has been garbage collected, mark as inactive
        subscription.isActive = false;
        return;
      }
      listener = weakListener;
    }

    if (!subscription.options.debounceMs) {
      // No debouncing, emit immediately
      try {
        listener(event);
      } catch (error) {
        this.handleListenerError(error, event, subscription);
      }
      return;
    }

    // Clear existing debounce timer
    if (subscription.debounceTimer) {
      clearTimeout(subscription.debounceTimer);
      subscription.debounceTimer = null;
    }

    // Set new debounce timer
    subscription.debounceTimer = setTimeout(() => {
      if (subscription.isActive) {
        // Re-check listener availability for weak references
        let currentListener = subscription.listener;
        if (this.WEAK_REF_ENABLED && subscription.listenerRef) {
          const weakListener = subscription.listenerRef.deref();
          if (!weakListener) {
            subscription.isActive = false;
            subscription.debounceTimer = null;
            return;
          }
          currentListener = weakListener;
        }

        try {
          currentListener(event);
          subscription.lastEmitTime = Date.now();
        } catch (error) {
          this.handleListenerError(error, event, subscription);
        }
      }
      // Clear the timer reference to allow garbage collection
      subscription.debounceTimer = null;
    }, subscription.options.debounceMs);
  }

  /**
   * Normalize a key for comparison
   */
  private normalizeKey(key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>): string {
    return JSON.stringify(key, (k, v) => {
      if (typeof v === 'string' || typeof v === 'number') {
        return normalizeKeyValue(v);
      }
      return v;
    });
  }

  /**
   * Normalize a location key for comparison
   */
  private normalizeLocKey(key: LocKey<L1 | L2 | L3 | L4 | L5>): string {
    return JSON.stringify(key, (k, v) => {
      if (typeof v === 'string' || typeof v === 'number') {
        return normalizeKeyValue(v);
      }
      return v;
    });
  }

  /**
   * Check if two location arrays match
   * Filter locations must be a prefix of event locations (in order)
   */
  private locationsMatch(
    filter: LocKeyArray<L1, L2, L3, L4, L5> | [],
    eventLocations: LocKeyArray<L1, L2, L3, L4, L5> | []
  ): boolean {
    // Empty filter only matches empty event locations
    if (filter.length === 0) {
      return eventLocations.length === 0;
    }

    // Filter cannot be longer than event locations
    if (filter.length > eventLocations.length) {
      return false;
    }

    // Check if filter locations are a prefix of event locations
    return filter.every((filterLoc, index) => {
      const eventLoc = eventLocations[index];
      // LocKey has different structure from ComKey/PriKey, so we need to normalize using their own properties
      return this.normalizeKey(filterLoc as any) === this.normalizeKey(eventLoc as any);
    });
  }

  /**
   * Check if a key matches location filters
   */
  private keyMatchesLocations(
    key: ComKey<S, L1, L2, L3, L4, L5> | PriKey<S>,
    filterLocations: LocKeyArray<L1, L2, L3, L4, L5> | []
  ): boolean {
    // If key is a ComKey, check if its locations match the filter
    if ('loc' in key && key.loc) {
      return this.locationsMatch(filterLocations, key.loc);
    }

    // PriKey doesn't have locations, so only matches if filter is empty
    return filterLocations.length === 0;
  }

  /**
   * Check if two queries match (improved comparison)
   */
  private queriesMatch(filterQuery: ItemQuery, eventQuery: ItemQuery): boolean {
    // Normalize queries for consistent comparison
    const normalize = (obj: any): any => {
      if (obj === null || typeof obj === 'undefined') return obj;
      if (typeof obj !== 'object') return obj;
      if (Array.isArray(obj)) return obj.map(normalize).sort();

      const sorted: any = {};
      Object.keys(obj).sort().forEach(key => {
        sorted[key] = normalize(obj[key]);
      });
      return sorted;
    };

    return JSON.stringify(normalize(filterQuery)) === JSON.stringify(normalize(eventQuery));
  }

  /**
   * Handle errors that occur in event listeners
   */
  private handleListenerError(
    error: unknown,
    event: AnyCacheEvent<V, S, L1, L2, L3, L4, L5>,
    subscription: InternalSubscription<V, S, L1, L2, L3, L4, L5>
  ): void {
    const errorObj = error instanceof Error ? error : new Error(String(error));

    const errorContext = {
      component: 'CacheEventEmitter',
      operation: 'event-listener',
      eventType: event.type,
      eventKey: 'key' in event ? JSON.stringify(event.key) : undefined,
      subscriptionId: subscription.id,
      errorType: errorObj.constructor.name,
      errorMessage: errorObj.message,
      suggestion: 'Review event listener implementation for errors. Consider adding error handling in the listener.',
      stack: errorObj.stack
    };

    if (subscription.options.onError) {
      try {
        subscription.options.onError(errorObj, event);
      } catch (handlerError: any) {
        // If the error handler itself throws, log both errors
        console.error('Error in cache event listener:', JSON.stringify(errorContext, null, 2));
        console.error('Original error:', errorObj);
        console.error('Error in error handler:', handlerError);
        console.error('Critical: Both the event listener and its error handler failed. Review error handling logic.');
      }
    } else {
      console.error('Error in cache event listener (no error handler configured):', JSON.stringify(errorContext, null, 2));
      console.error('Original error:', errorObj);
      console.error('Suggestion: Add an onError handler to your subscription to handle listener errors gracefully.');
    }
  }
}
