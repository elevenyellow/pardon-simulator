'use client';

import { Activity } from 'lucide-react';

export default function GameStatus() {
  return (
    <div className="bg-gradient-to-br from-gray-900 to-black rounded-2xl p-6 border-2 border-trump-gold shadow-2xl">
      <div className="flex items-center gap-3 mb-4">
        <Activity className="w-6 h-6 text-trump-gold" />
        <h2 className="text-2xl font-bold text-trump-gold">Mission Status</h2>
      </div>
      
      <div className="space-y-3">
        <div className="bg-black/50 p-3 rounded-lg border border-green-500/30">
          <div className="text-xs text-gray-400 mb-1">Your Status</div>
          <div className="text-white font-bold">🏛️ SBF - Imprisoned</div>
          <div className="text-xs text-gray-400 mt-1">Seeking pardon from Trump</div>
        </div>
      </div>
    </div>
  );
}

