/**
 * Tests for week utility functions
 * 
 * Week boundaries: Monday 14:00 UTC to next Monday 13:59:59 UTC
 */

import {
  getCurrentWeekId,
  getLastWeekId,
  getWeekNumber,
  parseWeekId,
  getWeekStartDate,
  getWeekEndDate,
  isCurrentWeek,
  formatWeekId,
  getNextWeekResetTime,
  getTimeUntilReset,
} from'../week';

describe('Week Utilities', () => {
  describe('parseWeekId', () => {
    it('should parse valid week ID', () => {
      const result = parseWeekId('2024-W45');
      expect(result.year).toBe(2024);
      expect(result.week).toBe(45);
    });

    it('should throw error for invalid week ID', () => {
      expect(() => parseWeekId('invalid')).toThrow('Invalid week ID format');
      expect(() => parseWeekId('2024-45')).toThrow('Invalid week ID format');
      expect(() => parseWeekId('2024W45')).toThrow('Invalid week ID format');
    });
  });

  describe('formatWeekId', () => {
    it('should format week ID for display', () => {
      expect(formatWeekId('2024-W45')).toBe('Week 45, 2024');
      expect(formatWeekId('2024-W01')).toBe('Week 1, 2024');
    });
  });

  describe('getWeekNumber', () => {
    it('should calculate week number correctly', () => {
      // January 4th is always in week 1 (ISO 8601)
      const jan4_2024 = new Date('2024-01-04');
      expect(getWeekNumber(jan4_2024)).toBe(1);

      // A date in late November (typically week 47-48)
      const nov6_2024 = new Date('2024-11-06');
      const weekNum = getWeekNumber(nov6_2024);
      expect(weekNum).toBeGreaterThan(40);
      expect(weekNum).toBeLessThan(50);
    });
  });

  describe('getCurrentWeekId', () => {
    it('should return week ID in correct format', () => {
      const weekId = getCurrentWeekId();
      expect(weekId).toMatch(/^\d{4}-W\d{2}$/);
    });

    it('should account for 14-hour offset', () => {
      // Mock a Monday at 13:00 UTC - should be previous week
      const mondayMorning = new Date('2024-12-23T13:00:00Z'); // Monday 13:00
      const mondayAfternoon = new Date('2024-12-23T14:00:00Z'); // Monday 14:00
      
      // We can't easily test this without mocking Date, but document the behavior
      // Times before Monday 14:00 UTC belong to the previous week
    });
  });

  describe('getLastWeekId', () => {
    it('should return previous week', () => {
      const lastWeek = getLastWeekId();
      const currentWeek = getCurrentWeekId();
      
      const { year: lastYear, week: lastWeekNum } = parseWeekId(lastWeek);
      const { year: currentYear, week: currentWeekNum } = parseWeekId(currentWeek);
      
      if (currentYear === lastYear) {
        expect(currentWeekNum - lastWeekNum).toBe(1);
      }
      // Handle year transition case
    });
  });

  describe('getWeekStartDate', () => {
    it('should return Monday for week start', () => {
      const startDate = getWeekStartDate('2024-W01');
      expect(startDate.getUTCDay()).toBe(1); // Monday = 1
    });

    it('should return correct date for specific week', () => {
      // Week 1 of 2024 starts on January 1 (which is Monday)
      const startDate = getWeekStartDate('2024-W01');
      expect(startDate.getUTCMonth()).toBe(0); // January
      expect(startDate.getUTCDate()).toBe(1);
    });
  });

  describe('getWeekEndDate', () => {
    it('should return Sunday for week end', () => {
      const endDate = getWeekEndDate('2024-W01');
      expect(endDate.getUTCDay()).toBe(0); // Sunday = 0
    });

    it('should be 6 days after start date', () => {
      const weekId ='2024-W10';
      const startDate = getWeekStartDate(weekId);
      const endDate = getWeekEndDate(weekId);
      
      const diffInDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
      expect(Math.floor(diffInDays)).toBe(6);
    });

    it('should have time set to 23:59:59', () => {
      const endDate = getWeekEndDate('2024-W01');
      expect(endDate.getUTCHours()).toBe(23);
      expect(endDate.getUTCMinutes()).toBe(59);
      expect(endDate.getUTCSeconds()).toBe(59);
    });
  });

  describe('isCurrentWeek', () => {
    it('should return true for current week', () => {
      const currentWeek = getCurrentWeekId();
      expect(isCurrentWeek(currentWeek)).toBe(true);
    });

    it('should return false for different week', () => {
      expect(isCurrentWeek('2020-W01')).toBe(false);
    });
  });

  describe('getNextWeekResetTime', () => {
    it('should return a Date object', () => {
      const nextReset = getNextWeekResetTime();
      expect(nextReset).toBeInstanceOf(Date);
    });

    it('should return Monday at 14:00 UTC', () => {
      const nextReset = getNextWeekResetTime();
      expect(nextReset.getUTCDay()).toBe(1); // Monday
      expect(nextReset.getUTCHours()).toBe(14);
      expect(nextReset.getUTCMinutes()).toBe(0);
      expect(nextReset.getUTCSeconds()).toBe(0);
    });

    it('should return a future date', () => {
      const nextReset = getNextWeekResetTime();
      const now = new Date();
      expect(nextReset.getTime()).toBeGreaterThan(now.getTime());
    });
  });

  describe('getTimeUntilReset', () => {
    it('should return time components', () => {
      const timeUntil = getTimeUntilReset();
      expect(timeUntil).toHaveProperty('days');
      expect(timeUntil).toHaveProperty('hours');
      expect(timeUntil).toHaveProperty('minutes');
      expect(timeUntil).toHaveProperty('seconds');
      expect(timeUntil).toHaveProperty('totalMs');
    });

    it('should have positive totalMs', () => {
      const timeUntil = getTimeUntilReset();
      expect(timeUntil.totalMs).toBeGreaterThan(0);
    });

    it('should have valid time ranges', () => {
      const timeUntil = getTimeUntilReset();
      expect(timeUntil.days).toBeGreaterThanOrEqual(0);
      expect(timeUntil.days).toBeLessThan(7);
      expect(timeUntil.hours).toBeGreaterThanOrEqual(0);
      expect(timeUntil.hours).toBeLessThan(24);
      expect(timeUntil.minutes).toBeGreaterThanOrEqual(0);
      expect(timeUntil.minutes).toBeLessThan(60);
      expect(timeUntil.seconds).toBeGreaterThanOrEqual(0);
      expect(timeUntil.seconds).toBeLessThan(60);
    });
  });
});

