/**
 * Input Validation Utilities for Admin Panel
 * Provides validation functions for various input types
 */

/**
 * Validate pagination parameters
 */
export function validatePagination(page: any, limit: any): {
  valid: boolean;
  page: number;
  limit: number;
  error?: string;
} {
  const parsedPage = parseInt(page);
  const parsedLimit = parseInt(limit);

  if (isNaN(parsedPage) || parsedPage < 1) {
    return { valid: false, page: 1, limit: 50, error: 'Invalid page number' };
  }

  if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
    return { valid: false, page: 1, limit: 50, error: 'Limit must be between 1 and 100' };
  }

  return { valid: true, page: parsedPage, limit: parsedLimit };
}

/**
 * Validate date range
 */
export function validateDateRange(fromDate: string | null, toDate: string | null): {
  valid: boolean;
  error?: string;
} {
  if (!fromDate && !toDate) {
    return { valid: true };
  }

  if (fromDate) {
    const from = new Date(fromDate);
    if (isNaN(from.getTime())) {
      return { valid: false, error: 'Invalid fromDate format' };
    }
  }

  if (toDate) {
    const to = new Date(toDate);
    if (isNaN(to.getTime())) {
      return { valid: false, error: 'Invalid toDate format' };
    }
  }

  if (fromDate && toDate) {
    const from = new Date(fromDate);
    const to = new Date(toDate);
    if (from > to) {
      return { valid: false, error: 'fromDate must be before toDate' };
    }
  }

  return { valid: true };
}

/**
 * Validate search query
 */
export function validateSearchQuery(query: string | null): {
  valid: boolean;
  sanitized: string;
  error?: string;
} {
  if (!query) {
    return { valid: true, sanitized: '' };
  }

  // Trim and limit length
  const trimmed = query.trim().substring(0, 500);

  // Check for SQL injection patterns (basic)
  const sqlPatterns = /(\bUNION\b|\bSELECT\b|\bDROP\b|\bDELETE\b|\bINSERT\b|\bUPDATE\b)/i;
  if (sqlPatterns.test(trimmed)) {
    return { valid: false, sanitized: '', error: 'Invalid search query' };
  }

  return { valid: true, sanitized: trimmed };
}

/**
 * Validate username
 */
export function validateUsername(username: string): {
  valid: boolean;
  error?: string;
} {
  if (!username || username.trim().length === 0) {
    return { valid: false, error: 'Username is required' };
  }

  const trimmed = username.trim();

  if (trimmed.length < 3 || trimmed.length > 50) {
    return { valid: false, error: 'Username must be between 3 and 50 characters' };
  }

  // Only allow alphanumeric, underscore, and hyphen
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return { valid: false, error: 'Username can only contain letters, numbers, underscore, and hyphen' };
  }

  return { valid: true };
}

/**
 * Validate password strength
 */
export function validatePassword(password: string): {
  valid: boolean;
  error?: string;
  strength?: 'weak' | 'medium' | 'strong';
} {
  if (!password || password.length < 12) {
    return { valid: false, error: 'Password must be at least 12 characters' };
  }

  if (password.length > 128) {
    return { valid: false, error: 'Password must be less than 128 characters' };
  }

  // Check password strength
  let strength: 'weak' | 'medium' | 'strong' = 'weak';
  let score = 0;

  if (/[a-z]/.test(password)) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  if (password.length >= 16) score++;

  if (score >= 4) strength = 'strong';
  else if (score >= 3) strength = 'medium';

  return { valid: true, strength };
}

/**
 * Validate sort parameters
 */
export function validateSort(sortBy: string | null, order: string | null, allowedFields: string[]): {
  valid: boolean;
  sortBy: string;
  order: 'asc' | 'desc';
  error?: string;
} {
  const defaultSort = allowedFields[0] || 'createdAt';
  const defaultOrder = 'desc';

  if (!sortBy) {
    return { valid: true, sortBy: defaultSort, order: defaultOrder };
  }

  if (!allowedFields.includes(sortBy)) {
    return { valid: false, sortBy: defaultSort, order: defaultOrder, error: `Invalid sort field: ${sortBy}` };
  }

  const validOrder = order === 'asc' || order === 'desc' ? order : defaultOrder;

  return { valid: true, sortBy, order: validOrder };
}

/**
 * Validate CUID/UUID format
 */
export function validateId(id: string): {
  valid: boolean;
  error?: string;
} {
  if (!id || id.trim().length === 0) {
    return { valid: false, error: 'ID is required' };
  }

  // Basic CUID/UUID validation
  if (!/^[a-zA-Z0-9_-]{20,50}$/.test(id)) {
    return { valid: false, error: 'Invalid ID format' };
  }

  return { valid: true };
}

