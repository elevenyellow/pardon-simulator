/**
 * Input Sanitization Utilities
 * 
 * Provides functions to sanitize user input and prevent XSS attacks.
 * Uses DOMPurify-like approach for HTML sanitization.
 */

/**
 * Escape HTML special characters to prevent XSS
 */
export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  };

  return text.replace(/[&<>"'/]/g, (char) => map[char]);
}

/**
 * Remove all HTML tags from input
 */
export function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '');
}

/**
 * Sanitize text input - removes HTML and escapes special characters
 */
export function sanitizeText(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }

  // Remove HTML tags first
  let sanitized = stripHtml(input);
  
  // Trim whitespace
  sanitized = sanitized.trim();
  
  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');
  
  return sanitized;
}

/**
 * Sanitize and validate wallet address
 */
export function sanitizeWalletAddress(address: string): string | null {
  if (typeof address !== 'string') {
    return null;
  }

  // Remove whitespace
  const cleaned = address.trim();

  // Validate Solana address format (base58, 32-44 chars)
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(cleaned)) {
    return null;
  }

  return cleaned;
}

/**
 * Sanitize transaction signature
 */
export function sanitizeSignature(signature: string): string | null {
  if (typeof signature !== 'string') {
    return null;
  }

  // Remove whitespace and newlines
  const cleaned = signature.trim().replace(/[\r\n\t]/g, '');

  // Validate Solana transaction signature format (base58, 87-88 chars)
  if (!/^[1-9A-HJ-NP-Za-km-z]{87,88}$/.test(cleaned)) {
    return null;
  }

  return cleaned;
}

/**
 * Sanitize message content
 * Removes potentially dangerous content while allowing basic text
 */
export function sanitizeMessage(message: string, options: {
  maxLength?: number;
  allowNewlines?: boolean;
  allowSpecialChars?: boolean;
} = {}): string {
  const {
    maxLength = 1000,
    allowNewlines = true,
    allowSpecialChars = true
  } = options;

  if (typeof message !== 'string') {
    return '';
  }

  // Remove HTML
  let sanitized = stripHtml(message);

  // Remove control characters except allowed ones
  if (allowNewlines) {
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  } else {
    sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
  }

  // Remove excessive whitespace
  sanitized = sanitized.replace(/\s+/g, ' ');

  // If special characters not allowed, keep only alphanumeric and basic punctuation
  if (!allowSpecialChars) {
    sanitized = sanitized.replace(/[^a-zA-Z0-9\s\.,!?;:'"()\-@#$%&*+=\[\]{}\/\\]/g, '');
  }

  // Trim
  sanitized = sanitized.trim();

  // Enforce max length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  return sanitized;
}

/**
 * Sanitize numeric input
 */
export function sanitizeNumber(input: any, options: {
  min?: number;
  max?: number;
  decimals?: number;
} = {}): number | null {
  const { min, max, decimals } = options;

  // Convert to number
  const num = parseFloat(input);

  // Check if valid number
  if (isNaN(num) || !isFinite(num)) {
    return null;
  }

  // Apply min/max constraints
  let sanitized = num;
  if (min !== undefined && sanitized < min) {
    return null;
  }
  if (max !== undefined && sanitized > max) {
    return null;
  }

  // Round to specified decimals
  if (decimals !== undefined) {
    sanitized = parseFloat(sanitized.toFixed(decimals));
  }

  return sanitized;
}

/**
 * Sanitize URL to prevent javascript: and data: URLs
 */
export function sanitizeUrl(url: string): string | null {
  if (typeof url !== 'string') {
    return null;
  }

  const cleaned = url.trim();

  // Block dangerous protocols
  const dangerousProtocols = ['javascript:', 'data:', 'vbscript:', 'file:'];
  const lowerUrl = cleaned.toLowerCase();
  
  if (dangerousProtocols.some(proto => lowerUrl.startsWith(proto))) {
    return null;
  }

  // Only allow http, https, and relative URLs
  if (!cleaned.startsWith('http://') && 
      !cleaned.startsWith('https://') && 
      !cleaned.startsWith('/')) {
    return null;
  }

  return cleaned;
}

/**
 * Sanitize JSON input
 * Parses and re-stringifies to ensure valid JSON and removes any functions
 */
export function sanitizeJson(input: string, maxDepth: number = 10): any | null {
  if (typeof input !== 'string') {
    return null;
  }

  try {
    const parsed = JSON.parse(input);
    
    // Check depth to prevent deeply nested objects
    if (!isValidDepth(parsed, maxDepth)) {
      return null;
    }

    // Remove any functions (shouldn't be in JSON but just in case)
    return JSON.parse(JSON.stringify(parsed));
  } catch (error) {
    return null;
  }
}

/**
 * Check if object depth is within limit
 */
function isValidDepth(obj: any, maxDepth: number, currentDepth: number = 0): boolean {
  if (currentDepth > maxDepth) {
    return false;
  }

  if (typeof obj !== 'object' || obj === null) {
    return true;
  }

  if (Array.isArray(obj)) {
    return obj.every(item => isValidDepth(item, maxDepth, currentDepth + 1));
  }

  return Object.values(obj).every(value => isValidDepth(value, maxDepth, currentDepth + 1));
}

/**
 * Sanitize object by applying sanitization to all string properties
 */
export function sanitizeObject<T extends Record<string, any>>(
  obj: T,
  sanitizers: Record<keyof T, (value: any) => any> = {}
): T {
  const sanitized: any = {};

  for (const [key, value] of Object.entries(obj)) {
    if (sanitizers[key as keyof T]) {
      // Use custom sanitizer if provided
      sanitized[key] = sanitizers[key as keyof T](value);
    } else if (typeof value === 'string') {
      // Default string sanitization
      sanitized[key] = sanitizeText(value);
    } else if (typeof value === 'number') {
      // Keep numbers as-is (validate separately if needed)
      sanitized[key] = value;
    } else if (typeof value === 'boolean') {
      // Keep booleans as-is
      sanitized[key] = value;
    } else if (value === null || value === undefined) {
      // Keep null/undefined
      sanitized[key] = value;
    } else if (Array.isArray(value)) {
      // Recursively sanitize arrays
      sanitized[key] = value.map(item => 
        typeof item === 'string' ? sanitizeText(item) : item
      );
    } else if (typeof value === 'object') {
      // Recursively sanitize objects
      sanitized[key] = sanitizeObject(value, sanitizers);
    } else {
      // For other types, convert to string and sanitize
      sanitized[key] = sanitizeText(String(value));
    }
  }

  return sanitized as T;
}

/**
 * Validate and sanitize scoring request
 */
export function sanitizeScoringRequest(data: any): {
  valid: boolean;
  sanitized?: any;
  error?: string;
} {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Invalid request data' };
  }

  const { userWallet, delta, reason, category, subcategory, agentId, messageId } = data;

  // Sanitize and validate wallet
  const sanitizedWallet = sanitizeWalletAddress(userWallet);
  if (!sanitizedWallet) {
    return { valid: false, error: 'Invalid wallet address' };
  }

  // Validate delta (must be a number)
  const sanitizedDelta = sanitizeNumber(delta, { min: -100, max: 100 });
  if (sanitizedDelta === null) {
    return { valid: false, error: 'Invalid delta value' };
  }

  // Sanitize reason
  const sanitizedReason = sanitizeMessage(reason, { maxLength: 200 });
  if (!sanitizedReason) {
    return { valid: false, error: 'Invalid or empty reason' };
  }

  // Validate category
  const validCategories = ['payment', 'negotiation', 'milestone', 'penalty'];
  if (!validCategories.includes(category)) {
    return { valid: false, error: 'Invalid category' };
  }

  return {
    valid: true,
    sanitized: {
      userWallet: sanitizedWallet,
      delta: sanitizedDelta,
      reason: sanitizedReason,
      category,
      subcategory: subcategory ? sanitizeText(subcategory) : undefined,
      agentId: agentId ? sanitizeText(agentId) : undefined,
      messageId: messageId ? sanitizeText(messageId) : undefined,
    }
  };
}

