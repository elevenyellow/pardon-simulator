/**
 * Utility functions for week ID generation and manipulation
 */

/**
 * Get current week ID in format"YYYY-Www" * Example:"2024-W45" */
export function getCurrentWeekId(): string {
  const now = new Date();
  const year = now.getFullYear();
  const week = getWeekNumber(now);
  return`${year}-W${week.toString().padStart(2,'0')}`;
}

/**
 * Get last week's ID
 */
export function getLastWeekId(): string {
  const now = new Date();
  // Subtract 7 days
  now.setDate(now.getDate() - 7);
  const year = now.getFullYear();
  const week = getWeekNumber(now);
  return`${year}-W${week.toString().padStart(2,'0')}`;
}

/**
 * Get week number (ISO 8601 standard)
 * Week 1 is the first week with a Thursday
 */
export function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/**
 * Parse week ID to get year and week number
 */
export function parseWeekId(weekId: string): { year: number; week: number } {
  const match = weekId.match(/^(\d{4})-W(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid week ID format: ${weekId}`);
  }
  return {
    year: parseInt(match[1], 10),
    week: parseInt(match[2], 10),
  };
}

/**
 * Get start date of a week (Monday)
 */
export function getWeekStartDate(weekId: string): Date {
  const { year, week } = parseWeekId(weekId);
  
  // January 4th is always in week 1
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  const weekStart = new Date(jan4);
  weekStart.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1 + (week - 1) * 7);
  
  return weekStart;
}

/**
 * Get end date of a week (Sunday)
 */
export function getWeekEndDate(weekId: string): Date {
  const startDate = getWeekStartDate(weekId);
  const endDate = new Date(startDate);
  endDate.setUTCDate(startDate.getUTCDate() + 6);
  endDate.setUTCHours(23, 59, 59, 999);
  return endDate;
}

/**
 * Check if current time is in given week
 */
export function isCurrentWeek(weekId: string): boolean {
  return weekId === getCurrentWeekId();
}

/**
 * Format week ID for display
 * Example:"2024-W45"->"Week 45, 2024" */
export function formatWeekId(weekId: string): string {
  const { year, week } = parseWeekId(weekId);
  return`Week ${week}, ${year}`;
}

