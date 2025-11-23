/**
 * Standardized error handling for Pardon Simulator
 * 
 * Provides consistent error classes and response formatting across the application.
 */

import { getLogger } from './logger';

const logger = getLogger('errors');

/**
 * Base error class for application errors
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly context?: Record<string, any>;

  constructor(
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    context?: Record<string, any>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.context = context;

    // Maintains proper stack trace
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation error (400)
 */
export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 400, true, context);
  }
}

/**
 * Authentication error (401)
 */
export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required', context?: Record<string, any>) {
    super(message, 401, true, context);
  }
}

/**
 * Authorization error (403)
 */
export class AuthorizationError extends AppError {
  constructor(message: string = 'Access denied', context?: Record<string, any>) {
    super(message, 403, true, context);
  }
}

/**
 * Not found error (404)
 */
export class NotFoundError extends AppError {
  constructor(resource: string, context?: Record<string, any>) {
    super(`${resource} not found`, 404, true, context);
  }
}

/**
 * Conflict error (409)
 */
export class ConflictError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 409, true, context);
  }
}

/**
 * Rate limit error (429)
 */
export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded', context?: Record<string, any>) {
    super(message, 429, true, context);
  }
}

/**
 * External service error (502/503)
 */
export class ExternalServiceError extends AppError {
  constructor(service: string, message: string, context?: Record<string, any>) {
    super(`${service} error: ${message}`, 502, true, context);
  }
}

/**
 * Standard error response format
 */
export interface ErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  timestamp: string;
  path?: string;
  context?: Record<string, any>;
}

/**
 * Format error for API response
 */
export function formatErrorResponse(
  error: Error | AppError,
  path?: string
): ErrorResponse {
  const isAppError = error instanceof AppError;

  const response: ErrorResponse = {
    error: error.name,
    message: error.message,
    statusCode: isAppError ? error.statusCode : 500,
    timestamp: new Date().toISOString(),
    path,
  };

  // Include context for app errors in development
  if (isAppError && process.env.NODE_ENV === 'development' && error.context) {
    response.context = error.context;
  }

  return response;
}

/**
 * Log error with appropriate level
 */
export function logError(error: Error | AppError, context?: Record<string, any>): void {
  const isAppError = error instanceof AppError;

  if (isAppError && error.isOperational) {
    // Operational errors are expected (validation, not found, etc.)
    logger.warn(error.message, {
      error: error.name,
      statusCode: error.statusCode,
      ...error.context,
      ...context,
    });
  } else {
    // Programming errors or unexpected failures
    logger.error(error.message, error, {
      stack: error.stack,
      ...context,
    });
  }
}

/**
 * Safe error handler for async routes
 */
export function asyncHandler(
  handler: (req: any, context?: any) => Promise<Response>
) {
  return async (req: any, context?: any): Promise<Response> => {
    try {
      return await handler(req, context);
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError(
        error instanceof Error ? error.message : 'Internal server error',
        500,
        false
      );

      logError(appError);

      return new Response(
        JSON.stringify(formatErrorResponse(appError, req.url)),
        {
          status: appError.statusCode,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  };
}

