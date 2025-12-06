/**
 * Conditional logging utility that only logs in development mode
 * This ensures no debug information appears in production builds
 */

const isDevelopment = import.meta.env.DEV;

export const logger = {
  log: (...args: any[]) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },

  error: (...args: any[]) => {
    if (isDevelopment) {
      console.error(...args);
    }
  },

  warn: (...args: any[]) => {
    if (isDevelopment) {
      console.warn(...args);
    }
  },

  info: (...args: any[]) => {
    if (isDevelopment) {
      console.info(...args);
    }
  },

  debug: (...args: any[]) => {
    if (isDevelopment) {
      console.debug(...args);
    }
  },

  table: (data: any) => {
    if (isDevelopment) {
      console.table(data);
    }
  },

  group: (label?: string) => {
    if (isDevelopment) {
      console.group(label);
    }
  },

  groupEnd: () => {
    if (isDevelopment) {
      console.groupEnd();
    }
  }
};

// For critical production errors that should always be logged
export const criticalLogger = {
  error: (...args: any[]) => {
    // Always log critical errors, even in production
    console.error('[CRITICAL]', ...args);
  }
};