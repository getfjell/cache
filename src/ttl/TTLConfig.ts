/**
 * Enhanced TTL Configuration System
 *
 * Provides sophisticated TTL management with per-type configurations,
 * peak hours adjustments, and stale-while-revalidate patterns.
 */

export interface TTLConfig {
  /** Item-level TTL configuration */
  item: {
    /** Default TTL for all items (seconds) */
    default: number;
    /** Per-type TTL overrides (seconds) */
    byType?: Record<string, number>;
  };

  /** Query-level TTL configuration */
  query: {
    /** TTL for complete data sets (seconds) */
    complete: number;
    /** TTL for filtered/faceted results (seconds) */
    faceted: number;
    /** Per-facet type TTL overrides (seconds) */
    byFacet?: Record<string, number>;
  };

  /** Dynamic TTL adjustments */
  adjustments?: {
    /** Reduce TTL during peak usage hours */
    peakHours?: {
      /** Start hour (0-23) */
      start: number;
      /** End hour (0-23) */
      end: number;
      /** TTL multiplier during peak hours (e.g., 0.5 for half TTL) */
      multiplier: number;
    };
    /** Enable stale-while-revalidate pattern */
    staleWhileRevalidate?: boolean;
    /** Timezone for peak hours calculation (default: system timezone) */
    timezone?: string;
  };

  /** Cache warming configuration */
  warming?: {
    /** Enable automatic cache warming */
    enabled: boolean;
    /** Interval between warming cycles (milliseconds) */
    interval: number;
    /** Common queries to warm */
    queries: WarmingQuery[];
  };
}

/** Configuration for cache warming */
export interface WarmingQuery {
  /** Query parameters */
  params: any;
  /** Priority (1-10, higher = more important) */
  priority: number;
  /** TTL multiplier for warmed data (optional) */
  ttlMultiplier?: number;
}

/**
 * Default TTL configuration optimized for typical usage patterns
 */
export const defaultTTLConfig: TTLConfig = {
  item: {
    default: 3600, // 1 hour for most items
    byType: {
      // Frequently changing data gets shorter TTL
      'orderPhase': 1800,  // 30 minutes - order phases change often
      'orderStep': 1800,   // 30 minutes - order steps change often
      'orderStatus': 900,  // 15 minutes - status changes frequently

      // Relatively static data gets longer TTL
      'customer': 7200,    // 2 hours - customer data changes rarely
      'user': 7200,        // 2 hours - user data changes rarely
      'product': 14400,    // 4 hours - product data very stable
      'category': 21600,   // 6 hours - categories almost never change
    }
  },

  query: {
    complete: 300,  // 5 minutes for complete queries
    faceted: 60,    // 1 minute for filtered queries
    byFacet: {
      'report': 30,      // 30 seconds - reports need fresh data
      'search': 120,     // 2 minutes - search results can be cached longer
      'dashboard': 45,   // 45 seconds - dashboards need recent data
      'analytics': 180,  // 3 minutes - analytics can be slightly stale
      'export': 15,      // 15 seconds - exports need fresh data
    }
  },

  adjustments: {
    peakHours: {
      start: 9,         // 9 AM
      end: 17,          // 5 PM
      multiplier: 0.5   // Half TTL during business hours for fresher data
    },
    staleWhileRevalidate: true,
    timezone: 'system' // Use system timezone
  },

  warming: {
    enabled: false, // Disabled by default, enable per use case
    interval: 300000, // 5 minutes
    queries: [
      // Common queries to warm - customize per application
      { params: { limit: 20, status: 'active' }, priority: 1 },
      { params: { limit: 50, recent: true }, priority: 2 },
    ]
  }
};

/**
 * TTL configuration for high-traffic scenarios
 */
export const highTrafficTTLConfig: TTLConfig = {
  ...defaultTTLConfig,
  query: {
    complete: 180,  // 3 minutes (shorter for high traffic)
    faceted: 30,    // 30 seconds
    byFacet: {
      'report': 15,      // 15 seconds
      'search': 60,      // 1 minute
      'dashboard': 20,   // 20 seconds
      'analytics': 90,   // 1.5 minutes
    }
  },
  adjustments: {
    peakHours: {
      start: 8,         // Earlier peak
      end: 18,          // Later peak
      multiplier: 0.3   // Even shorter TTL during peaks
    },
    staleWhileRevalidate: true
  }
};

/**
 * TTL configuration for development/testing
 */
export const developmentTTLConfig: TTLConfig = {
  item: {
    default: 300,  // 5 minutes - short for development
    byType: {
      'orderPhase': 60,
      'orderStep': 60,
      'customer': 300,
      'user': 300,
    }
  },
  query: {
    complete: 30,   // 30 seconds
    faceted: 10,    // 10 seconds
    byFacet: {
      'report': 5,
      'search': 15,
    }
  },
  adjustments: {
    staleWhileRevalidate: false // Disable for predictable testing
  },
  warming: {
    enabled: false,
    interval: 60000, // 1 minute for faster development cycles
    queries: []
  }
};

/**
 * Validates TTL configuration for common issues
 */
export function validateTTLConfig(config: TTLConfig): string[] {
  const errors: string[] = [];

  // Validate item TTLs
  if (config.item.default <= 0) {
    errors.push('item.default must be positive');
  }

  // Validate query TTLs
  if (config.query.complete <= 0) {
    errors.push('query.complete must be positive');
  }
  if (config.query.faceted <= 0) {
    errors.push('query.faceted must be positive');
  }

  // Validate peak hours
  if (config.adjustments?.peakHours) {
    const { start, end, multiplier } = config.adjustments.peakHours;
    if (start < 0 || start > 23) {
      errors.push('peakHours.start must be between 0 and 23');
    }
    if (end < 0 || end > 23) {
      errors.push('peakHours.end must be between 0 and 23');
    }
    if (multiplier <= 0 || multiplier > 1) {
      errors.push('peakHours.multiplier must be between 0 and 1');
    }
  }

  // Validate warming configuration
  if (config.warming?.enabled && config.warming.interval <= 0) {
    errors.push('warming.interval must be positive when warming is enabled');
  }

  return errors;
}

/**
 * Creates a TTL config with sensible defaults merged with user overrides
 */
export function createTTLConfig(overrides: Partial<TTLConfig> = {}): TTLConfig {
  const config = JSON.parse(JSON.stringify(defaultTTLConfig)) as TTLConfig;
  
  // Deep merge overrides
  if (overrides.item) {
    config.item = { ...config.item, ...overrides.item };
    if (overrides.item.byType) {
      config.item.byType = { ...config.item.byType, ...overrides.item.byType };
    }
  }
  
  if (overrides.query) {
    config.query = { ...config.query, ...overrides.query };
    if (overrides.query.byFacet) {
      config.query.byFacet = { ...config.query.byFacet, ...overrides.query.byFacet };
    }
  }
  
  if (overrides.adjustments) {
    config.adjustments = { ...config.adjustments, ...overrides.adjustments };
  }
  
  if (overrides.warming) {
    config.warming = { ...config.warming, ...overrides.warming };
  }

  // Validate the final configuration
  const errors = validateTTLConfig(config);
  if (errors.length > 0) {
    throw new Error(`Invalid TTL configuration: ${errors.join(', ')}`);
  }

  return config;
}
