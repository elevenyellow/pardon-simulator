/**
 * Utility functions for week ID generation and manipulation
 * 
 * Week boundaries: Monday 14:00 UTC to next Monday 13:59:59 UTC
 * This aligns with the weekly reset cron job schedule
 */

/**
 * Get current week ID in format"YYYY-Www" * Example:"2024-W45" * 
 * Week boundaries are Monday 14:00 UTC to next Monday 13:59:59 UTC
 */
export function getCurrentWeekId(): string {
  const now = new Date();
  // Subtract 14 hours to align week boundaries to Monday 14:00 UTC
  // This means times before 14:00 on Monday are still part of the previous week
  const adjustedDate = new Date(now.getTime() - (14 * 60 * 60 * 1000));
  const year = adjustedDate.getFullYear();
  const week = getWeekNumber(adjustedDate);
  return`${year}-W${week.toString().padStart(2,'0')}`;
}

/**
 * Get last week's ID
 */
export function getLastWeekId(): string {
  const now = new Date();
  // Subtract 14 hours for week boundary, then subtract 7 days
  const adjustedDate = new Date(now.getTime() - (14 * 60 * 60 * 1000) - (7 * 24 * 60 * 60 * 1000));
  const year = adjustedDate.getFullYear();
  const week = getWeekNumber(adjustedDate);
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

/**
 * Get the next Monday 14:00 UTC (when the week resets)
 */
export function getNextWeekResetTime(): Date {
  const now = new Date();
  const currentDay = now.getUTCDay(); // 0 = Sunday, 1 = Monday, etc.
  const currentHour = now.getUTCHours();
  
  let daysUntilMonday: number;
  
  if (currentDay === 1) {
    // It's Monday
    if (currentHour < 14) {
      // Before 14:00, reset is today
      daysUntilMonday = 0;
    } else {
      // After 14:00, reset is next Monday
      daysUntilMonday = 7;
    }
  } else if (currentDay === 0) {
    // Sunday, reset is tomorrow (Monday)
    daysUntilMonday = 1;
  } else {
    // Tuesday-Saturday
    daysUntilMonday = (8 - currentDay) % 7;
  }
  
  const nextReset = new Date(now);
  nextReset.setUTCDate(now.getUTCDate() + daysUntilMonday);
  nextReset.setUTCHours(14, 0, 0, 0);
  
  return nextReset;
}

/**
 * Get time remaining until next week reset
 * Returns object with days, hours, minutes, seconds
 */
export function getTimeUntilReset(): {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
} {
  const now = new Date();
  const nextReset = getNextWeekResetTime();
  const totalMs = nextReset.getTime() - now.getTime();
  
  const days = Math.floor(totalMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((totalMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((totalMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((totalMs % (1000 * 60)) / 1000);
  
  return { days, hours, minutes, seconds, totalMs };
}

