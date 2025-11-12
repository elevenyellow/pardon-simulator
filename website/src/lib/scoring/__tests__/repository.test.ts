/**
 * Tests for scoring repository
 * Note: These tests require a test database setup
 */

import { scoringRepository, ScoringRepository } from '../repository';
import { prisma } from '@/lib/prisma';

// Mock Prisma
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    session: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    score: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(prisma)),
  },
}));

describe('ScoringRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('addScore', () => {
    it('should add score and update session', async () => {
      const mockSession = { id: 'session1', currentScore: 50 };
      const mockScore = {
        id: 'score1',
        delta: 10,
        currentScore: 60,
        reason: 'Test payment',
        category: 'payment',
        timestamp: new Date(),
      };

      (prisma.session.findUnique as jest.Mock).mockResolvedValue(mockSession);
      (prisma.score.create as jest.Mock).mockResolvedValue(mockScore);
      (prisma.session.update as jest.Mock).mockResolvedValue({ ...mockSession, currentScore: 60 });

      const result = await scoringRepository.addScore({
        userId: 'user1',
        sessionId: 'session1',
        delta: 10,
        reason: 'Test payment',
        category: 'payment',
      });

      expect(result.newScore).toBe(60);
      expect(result.scoreRecord.delta).toBe(10);
      expect(prisma.session.update).toHaveBeenCalledWith({
        where: { id: 'session1' },
        data: { currentScore: 60 },
      });
    });

    it('should cap score at 100', async () => {
      const mockSession = { id: 'session1', currentScore: 95 };
      (prisma.session.findUnique as jest.Mock).mockResolvedValue(mockSession);
      (prisma.score.create as jest.Mock).mockResolvedValue({
        id: 'score1',
        delta: 10,
        currentScore: 100,
        reason: 'Test',
        category: 'payment',
        timestamp: new Date(),
      });

      const result = await scoringRepository.addScore({
        userId: 'user1',
        sessionId: 'session1',
        delta: 10,
        reason: 'Test',
        category: 'payment',
      });

      expect(result.newScore).toBe(100);
    });

    it('should not allow negative scores', async () => {
      const mockSession = { id: 'session1', currentScore: 5 };
      (prisma.session.findUnique as jest.Mock).mockResolvedValue(mockSession);
      (prisma.score.create as jest.Mock).mockResolvedValue({
        id: 'score1',
        delta: -10,
        currentScore: 0,
        reason: 'Penalty',
        category: 'penalty',
        timestamp: new Date(),
      });

      const result = await scoringRepository.addScore({
        userId: 'user1',
        sessionId: 'session1',
        delta: -10,
        reason: 'Penalty',
        category: 'penalty',
      });

      expect(result.newScore).toBe(0);
    });

    it('should throw error if session not found', async () => {
      (prisma.session.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        scoringRepository.addScore({
          userId: 'user1',
          sessionId: 'nonexistent',
          delta: 10,
          reason: 'Test',
          category: 'payment',
        })
      ).rejects.toThrow('Session not found');
    });
  });

  describe('getLeaderboard', () => {
    it('should return sorted sessions by score', async () => {
      const mockSessions = [
        {
          id: 'session1',
          currentScore: 90,
          user: { id: 'user1', username: 'Player1', walletAddress: 'wallet1' },
        },
        {
          id: 'session2',
          currentScore: 80,
          user: { id: 'user2', username: 'Player2', walletAddress: 'wallet2' },
        },
      ];

      (prisma.session.findMany as jest.Mock).mockResolvedValue(mockSessions);

      const result = await scoringRepository.getLeaderboard('2024-W45', 100);

      expect(result).toHaveLength(2);
      expect(result[0].currentScore).toBe(90);
      expect(result[1].currentScore).toBe(80);
      expect(prisma.session.findMany).toHaveBeenCalledWith({
        where: { weekId: '2024-W45' },
        orderBy: { currentScore: 'desc' },
        take: 100,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              walletAddress: true,
            },
          },
        },
      });
    });
  });

  describe('getUserRank', () => {
    it('should return correct rank', async () => {
      (prisma.session.findFirst as jest.Mock).mockResolvedValue({
        id: 'session1',
        currentScore: 75,
      });
      (prisma.session.count as jest.Mock).mockResolvedValue(3); // 3 sessions with higher score

      const rank = await scoringRepository.getUserRank('user1', '2024-W45');

      expect(rank).toBe(4); // 3 higher + 1 = rank 4
    });

    it('should return null if no session found', async () => {
      (prisma.session.findFirst as jest.Mock).mockResolvedValue(null);

      const rank = await scoringRepository.getUserRank('user1', '2024-W45');

      expect(rank).toBeNull();
    });
  });

  describe('getOrCreateUserSession', () => {
    it('should create new user and session if none exist', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user.create as jest.Mock).mockResolvedValue({
        id: 'user1',
        walletAddress: 'wallet1',
        username: 'Player_wallet',
      });
      (prisma.session.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.session.create as jest.Mock).mockResolvedValue({
        id: 'session1',
        userId: 'user1',
        weekId: '2024-W45',
        currentScore: 0,
      });

      const result = await scoringRepository.getOrCreateUserSession(
        'wallet1',
        '2024-W45'
      );

      expect(result.userId).toBe('user1');
      expect(result.sessionId).toBe('session1');
      expect(result.currentScore).toBe(0);
      expect(prisma.user.create).toHaveBeenCalled();
      expect(prisma.session.create).toHaveBeenCalled();
    });

    it('should return existing user and session', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user1',
        walletAddress: 'wallet1',
      });
      (prisma.session.findFirst as jest.Mock).mockResolvedValue({
        id: 'session1',
        userId: 'user1',
        weekId: '2024-W45',
        currentScore: 50,
      });

      const result = await scoringRepository.getOrCreateUserSession(
        'wallet1',
        '2024-W45'
      );

      expect(result.currentScore).toBe(50);
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.session.create).not.toHaveBeenCalled();
    });
  });
});

