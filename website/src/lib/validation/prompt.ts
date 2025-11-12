/**
 * Prompt validation utilities for anti-cheat
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate user prompt against anti-cheat rules
 * - Maximum 100 characters
 * - English characters only (A-Z, a-z, 0-9, punctuation, spaces)
 * - Minimum 3 non-whitespace characters
 */
export function validatePrompt(text: string): ValidationResult {
  // Empty check
  if (!text || text.trim().length === 0) {
    return {
      valid: false,
      error: "Message cannot be empty"
    };
  }
  
  // Length check (100 characters max)
  if (text.length > 100) {
    return {
      valid: false,
      error: `Message too long (${text.length}/100 characters)`
    };
  }
  
  // Minimum content check
  const nonWhitespaceCount = text.replace(/\s/g, '').length;
  if (nonWhitespaceCount < 3) {
    return {
      valid: false,
      error: "Message too short (minimum 3 characters)"
    };
  }
  
  // English-only check (allow A-Z, a-z, 0-9, and common punctuation)
  const englishRegex = /^[a-zA-Z0-9\s\.,!?;:'"()\-@#$%&*+=\[\]{}\/\\]+$/;
  if (!englishRegex.test(text)) {
    return {
      valid: false,
      error: "English characters only (A-Z, 0-9, punctuation allowed)"
    };
  }
  
  return { valid: true };
}

/**
 * Get character count with visual indicator
 */
export function getCharacterCountInfo(text: string): {
  count: number;
  max: number;
  percentage: number;
  colorClass: string;
} {
  const count = text.length;
  const max = 100;
  const percentage = (count / max) * 100;
  
  let colorClass = 'text-gray-400'; // < 80%
  if (percentage >= 95) {
    colorClass = 'text-red-400'; // 95-100%
  } else if (percentage >= 80) {
    colorClass = 'text-yellow-400'; // 80-95%
  } else if (percentage >= 60) {
    colorClass = 'text-green-400'; // 60-80%
  }
  
  return { count, max, percentage, colorClass };
}

