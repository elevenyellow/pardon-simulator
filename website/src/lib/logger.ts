/**
 * Structured logging framework for TypeScript/Next.js
 * 
 * Provides environment-aware logging with proper levels and context.
 * Replaces scattered console.log statements with structured logging.
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  CRITICAL = 4,
}

export interface LogContext {
  [key: string]: any;
}

export interface LogEntry {
  timestamp: string;
  level: string;
  logger: string;
  message: string;
  context?: LogContext;
  error?: any;
}

class StructuredLogger {
  private name: string;
  private context: LogContext;
  private minLevel: LogLevel;

  constructor(name: string, context: LogContext = {}) {
    this.name = name;
    this.context = context;
    
    // Set log level from environment
    const envLevel = process.env.LOG_LEVEL?.toUpperCase() || 'INFO';
    this.minLevel = LogLevel[envLevel as keyof typeof LogLevel] ?? LogLevel.INFO;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.minLevel;
  }

  private formatLog(level: string, message: string, context?: LogContext, error?: any): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      logger: this.name,
      message,
      context: { ...this.context, ...context },
      error: error ? this.serializeError(error) : undefined,
    };
  }

  private serializeError(error: any): any {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack,
        ...(error as any), // Include any additional properties
      };
    }
    return error;
  }

  private write(logEntry: LogEntry): void {
    // In production, output JSON for log aggregation
    if (process.env.NODE_ENV === 'production') {
      console.log(JSON.stringify(logEntry));
    } else {
      // In development, use readable format
      const contextStr = logEntry.context && Object.keys(logEntry.context).length > 0
        ? ` ${JSON.stringify(logEntry.context)}`
        : '';
      const errorStr = logEntry.error
        ? `\n${logEntry.error.stack || JSON.stringify(logEntry.error)}`
        : '';
      console.log(`[${logEntry.level}] ${logEntry.logger}: ${logEntry.message}${contextStr}${errorStr}`);
    }
  }

  debug(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      this.write(this.formatLog('DEBUG', message, context));
    }
  }

  info(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.INFO)) {
      this.write(this.formatLog('INFO', message, context));
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.shouldLog(LogLevel.WARN)) {
      this.write(this.formatLog('WARN', message, context));
    }
  }

  error(message: string, error?: any, context?: LogContext): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      this.write(this.formatLog('ERROR', message, context, error));
    }
  }

  critical(message: string, error?: any, context?: LogContext): void {
    if (this.shouldLog(LogLevel.CRITICAL)) {
      this.write(this.formatLog('CRITICAL', message, context, error));
    }
  }
}

// Logger factory
const loggers = new Map<string, StructuredLogger>();

export function getLogger(name: string, context: LogContext = {}): StructuredLogger {
  const key = `${name}:${JSON.stringify(context)}`;
  
  if (!loggers.has(key)) {
    loggers.set(key, new StructuredLogger(name, context));
  }
  
  return loggers.get(key)!;
}

// Convenience function for creating loggers with request context
export function createRequestLogger(name: string, requestId?: string, userId?: string): StructuredLogger {
  return getLogger(name, {
    requestId,
    userId,
  });
}

// Default logger for quick usage
export const logger = getLogger('app');

