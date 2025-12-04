'use client';

import { useState, useEffect } from'react';
import { useWallet } from'@solana/wallet-adapter-react';
import Link from'next/link';
import { ArrowLeft, Trophy, TrendingUp, Award } from'lucide-react';

interface LeaderboardEntry {
  rank: number;
  username: string;
  walletAddress: string;
  score: number;
  prizeEligible: boolean;
}

interface LeaderboardData {
  success: boolean;
  weekId: string;
  weekDisplay: string;
  totalPlayers: number;
  prizeEligible: number;
  entries: LeaderboardEntry[];
}

export default function LeaderboardPage() {
  const { publicKey } = useWallet();
  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchLeaderboard();
    // Refresh every 30 seconds
    const interval = setInterval(fetchLeaderboard, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchLeaderboard = async () => {
    try {
      const response = await fetch('/api/leaderboard/current');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      setLeaderboard(data);
      setError(null);
    } catch (error: any) {
      console.error('Failed to fetch leaderboard:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const getRankDisplay = (rank: number): string => {
    return`#${rank}`;
  };

  const getPrizeAmount = (rank: number): string => {
    const prizePool = 10000;
    switch (rank) {
      case 1: return`${(prizePool * 0.5).toLocaleString()} PARDON`;
      case 2: return`${(prizePool * 0.2).toLocaleString()} PARDON`;
      case 3: return`${(prizePool * 0.1).toLocaleString()} PARDON`;
      case 4:
      case 5:
      case 6:
      case 7:
      case 8:
      case 9:
      case 10:
        return`${Math.floor((prizePool * 0.2) / 7).toLocaleString()} PARDON`;
      default: return'-';
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link 
                href="/"                className="text-gray-400 hover:text-white transition-colors"              >
                <ArrowLeft className="w-6 h-6"/>
              </Link>
              <div>
                <h1 className="text-3xl font-bold flex items-center">
                  <Trophy className="w-8 h-8 mr-3 text-yellow-500"/>
                  Leaderboard
                </h1>
                {leaderboard && (
                  <p className="text-gray-400 mt-1">{leaderboard.weekDisplay}</p>
                )}
              </div>
            </div>
            <div className="text-right">
              {leaderboard && (
                <>
                  <div className="text-2xl font-bold text-green-400">
                    10,000 PARDON
                  </div>
                  <div className="text-sm text-gray-400">
                    Prize Pool
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      {leaderboard && (
        <div className="bg-gray-800/50 border-b border-gray-700">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gray-800 rounded-lg p-4">
                <div className="flex items-center">
                  <TrendingUp className="w-5 h-5 text-blue-400 mr-2"/>
                  <div className="text-sm text-gray-400">Total Players</div>
                </div>
                <div className="text-2xl font-bold mt-1">{leaderboard.totalPlayers}</div>
              </div>
              <div className="bg-gray-800 rounded-lg p-4">
                <div className="flex items-center">
                  <Award className="w-5 h-5 text-green-400 mr-2"/>
                  <div className="text-sm text-gray-400">Prize Eligible</div>
                </div>
                <div className="text-2xl font-bold mt-1 text-green-400">
                  {leaderboard.prizeEligible}
                </div>
              </div>
              <div className="bg-gray-800 rounded-lg p-4">
                <div className="flex items-center">
                  <Trophy className="w-5 h-5 text-yellow-400 mr-2"/>
                  <div className="text-sm text-gray-400">Minimum Score</div>
                </div>
                <div className="text-2xl font-bold mt-1">80</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
            <p className="mt-4 text-gray-400">Loading leaderboard...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4 mb-6">
            <p className="text-red-400">Error loading leaderboard: {error}</p>
            <button
              onClick={fetchLeaderboard}
              className="mt-2 px-4 py-2 bg-red-500 hover:bg-red-600 rounded-lg text-sm font-medium transition-colors"            >
              Retry
            </button>
          </div>
        )}

        {leaderboard && leaderboard.entries.length === 0 && (
          <div className="text-center py-16">
            <Trophy className="w-20 h-20 text-gray-600 mx-auto mb-6"/>
            <h2 className="text-2xl font-semibold text-gray-300 mb-3">
              No Pardons Granted Yet
            </h2>
            <p className="text-gray-500 max-w-md mx-auto">
              Presidential pardons have not yet been awarded this week. 
              The competition is open for eligible participants.
            </p>
            <Link
              href="/"
              className="mt-8 inline-block px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
            >
              Enter the Competition
            </Link>
          </div>
        )}

        {leaderboard && leaderboard.entries.length > 0 && (
          <>
            {/* Leaderboard Table */}
            <div className="bg-gray-800 rounded-lg overflow-hidden shadow-xl">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-900 border-b border-gray-700">
                    <th className="text-left p-4 font-semibold">Rank</th>
                    <th className="text-left p-4 font-semibold">Player</th>
                    <th className="text-right p-4 font-semibold">Score</th>
                    <th className="text-right p-4 font-semibold">Prize</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.entries.map((entry) => {
                    const isCurrentUser = entry.walletAddress === publicKey?.toString();
                    const isPrizeEligible = entry.prizeEligible;
                    
                    return (
                      <tr 
                        key={entry.rank}
                        className={`border-b border-gray-700 hover:bg-gray-700/50 transition-colors ${
                          isCurrentUser ?'bg-blue-900/20':''                        }`}
                      >
                        {/* Rank */}
                        <td className="p-4">
                          <div className="flex items-center">
                            <span className="text-xl font-bold">
                              {getRankDisplay(entry.rank)}
                            </span>
                          </div>
                        </td>
                        
                        {/* Player */}
                        <td className="p-4">
                          <div className="flex items-center space-x-2">
                            <span className="font-medium">
                              {entry.username}
                            </span>
                            {isCurrentUser && (
                              <span className="px-2 py-1 bg-blue-600 rounded text-xs font-semibold">
                                YOU
                              </span>
                            )}
                            {isPrizeEligible && !isCurrentUser && (
                              <span className="text-green-400 text-sm">✓</span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 mt-1 font-mono">
                            {entry.walletAddress.slice(0, 4)}...{entry.walletAddress.slice(-4)}
                          </div>
                        </td>
                        
                        {/* Score */}
                        <td className="text-right p-4">
                          <div className={`text-xl font-bold ${
                            entry.score >= 80 ?'text-green-400':
                            entry.score >= 60 ?'text-yellow-400':
'text-gray-400'                          }`}>
                            {entry.score}
                          </div>
                          <div className="text-xs text-gray-500">
                            / 100
                          </div>
                        </td>
                        
                        {/* Prize */}
                        <td className="text-right p-4">
                          {isPrizeEligible ? (
                            <div className="text-green-400 font-semibold">
                              {getPrizeAmount(entry.rank)}
                            </div>
                          ) : (
                            <div className="text-gray-600">-</div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Prize Distribution Info */}
            <div className="mt-8 bg-gray-800 rounded-lg p-6">
              <h3 className="text-xl font-bold mb-4 flex items-center">
                <Trophy className="w-6 h-6 mr-2 text-yellow-500"/>
                Prize Distribution
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex justify-between items-center p-3 bg-gray-900 rounded">
                    <span> 1st Place</span>
                    <span className="font-semibold text-yellow-400">5,000 PARDON (50%)</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-gray-900 rounded">
                    <span> 2nd Place</span>
                    <span className="font-semibold text-gray-300">2,000 PARDON (20%)</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-gray-900 rounded">
                    <span> 3rd Place</span>
                    <span className="font-semibold text-orange-400">1,000 PARDON (10%)</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center p-3 bg-gray-900 rounded">
                    <span>🏅 4th-10th Place</span>
                    <span className="font-semibold text-blue-400">~285 PARDON each</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-gray-900 rounded">
                    <span> Minimum Score</span>
                    <span className="font-semibold text-green-400">80 points</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-gray-900 rounded">
                    <span>⏰ Reset</span>
                    <span className="font-semibold text-purple-400">Every Sunday 00:00 UTC</span>
                  </div>
                </div>
              </div>
              
              <div className="mt-6 p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                <h4 className="font-semibold text-blue-400 mb-2">How to Win</h4>
                <ul className="text-sm text-gray-300 space-y-1">
                  <li>• Reach a score of 80+ points to qualify for prizes</li>
                  <li>• Higher scores earn better rankings and larger prizes</li>
                  <li>• Play strategically: negotiate, pay for services, use intermediaries</li>
                  <li>• Weekly competition resets every Sunday at midnight UTC</li>
                </ul>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

