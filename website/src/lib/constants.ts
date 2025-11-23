/**
 * Application Constants
 * Centralized constants to eliminate magic strings and improve maintainability
 */

/**
 * USER_SENDER_ID - The fixed identity of the player in the game
 * 
 * SECURITY NOTE:
 * - All user messages MUST have this senderId
 * - Backend enforces this to prevent impersonation attacks
 * - Agents use this to identify user messages for scoring
 * 
 * GAME DESIGN:
 * - User always plays as SBF (Sam Bankman-Fried)
 * - SBF is seeking a presidential pardon from Trump
 * - This is the player's fixed identity throughout the game
 */
export const USER_SENDER_ID = 'sbf' as const;

/**
 * Display name for the user in chat interface
 */
export const USER_SENDER_DISPLAY_NAME = 'You (SBF)' as const;

/**
 * Type-safe user sender ID type
 */
export type UserSenderId = typeof USER_SENDER_ID;

