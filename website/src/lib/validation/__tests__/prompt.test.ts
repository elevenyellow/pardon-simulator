/**
 * Tests for prompt validation
 */

import { validatePrompt, getCharacterCountInfo } from'../prompt';

describe('Prompt Validation', () => {
  describe('validatePrompt', () => {
    it('should accept valid prompts', () => {
      const result = validatePrompt('Hello, I want to negotiate.');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject empty prompts', () => {
      const result = validatePrompt('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should reject whitespace-only prompts', () => {
      const result = validatePrompt('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should reject prompts over 100 characters', () => {
      const longPrompt ='a'.repeat(101);
      const result = validatePrompt(longPrompt);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too long');
      expect(result.error).toContain('101/100');
    });

    it('should accept prompts exactly at 100 characters', () => {
      const prompt ='a'.repeat(100);
      const result = validatePrompt(prompt);
      expect(result.valid).toBe(true);
    });

    it('should reject non-English characters', () => {
      const nonEnglish ='Hello 你好 world';
      const result = validatePrompt(nonEnglish);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('English');
    });

    it('should accept all allowed punctuation', () => {
      const punctuation ='Hello, world! How are you? I\'m fine. Great; thanks.';
      const result = validatePrompt(punctuation);
      expect(result.valid).toBe(true);
    });

    it('should accept special characters', () => {
      const special ='Email@example.com, cost: $10, rating: 5/5, test #1, 100%';
      const result = validatePrompt(special);
      expect(result.valid).toBe(true);
    });

    it('should reject messages with less than 3 non-whitespace characters', () => {
      const result = validatePrompt('a');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too short');
    });

    it('should accept messages with exactly 3 non-whitespace characters', () => {
      const result = validatePrompt('abc');
      expect(result.valid).toBe(true);
    });
  });

  describe('getCharacterCountInfo', () => {
    it('should return correct count info for short text', () => {
      const info = getCharacterCountInfo('Hello');
      expect(info.count).toBe(5);
      expect(info.max).toBe(100);
      expect(info.percentage).toBe(5);
      expect(info.colorClass).toBe('text-gray-400');
    });

    it('should return yellow color for 80-94% capacity', () => {
      const text ='a'.repeat(85);
      const info = getCharacterCountInfo(text);
      expect(info.percentage).toBe(85);
      expect(info.colorClass).toBe('text-yellow-400');
    });

    it('should return red color for 95%+ capacity', () => {
      const text ='a'.repeat(98);
      const info = getCharacterCountInfo(text);
      expect(info.percentage).toBe(98);
      expect(info.colorClass).toBe('text-red-400');
    });

    it('should return green color for 60-79% capacity', () => {
      const text ='a'.repeat(70);
      const info = getCharacterCountInfo(text);
      expect(info.percentage).toBe(70);
      expect(info.colorClass).toBe('text-green-400');
    });
  });
});

