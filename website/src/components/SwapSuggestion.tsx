/**
 * SwapSuggestion Component
 * 
 * Displays a user-friendly message when they don't have enough of the required token
 * and provides a link to Jupiter for swapping tokens.
 */

import React from 'react';

interface SwapSuggestionProps {
  requiredToken: string;  // Token name (e.g., 'TOKEN', 'PARDON')
  requiredAmount: number;
  userBalance: number;
  onClose?: () => void;
}

import { PAYMENT_TOKEN_MINT } from '@/config/tokens';

export function SwapSuggestion({ 
  requiredToken, 
  requiredAmount, 
  userBalance,
  onClose 
}: SwapSuggestionProps) {
  // Construct Jupiter swap URL - SOL to payment token
  const jupiterUrl = `https://jup.ag/swap?sell=So11111111111111111111111111111111111111112&buy=${PAYMENT_TOKEN_MINT}`;

  // Format balance for display
  const formattedBalance = userBalance.toFixed(requiredToken === 'SOL' ? 4 : 2);
  const formattedRequired = requiredAmount.toFixed(requiredToken === 'SOL' ? 4 : 2);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border-2 border-yellow-500/50 rounded-lg p-6 max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-yellow-500">
            Insufficient {requiredToken}
          </h3>
          {onClose && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white"
              aria-label="Close"
            >
              ✕
            </button>
          )}
        </div>

        {/* Balance Info */}
        <div className="space-y-3 mb-6">
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Your Balance:</span>
            <span className="text-white font-mono">
              {formattedBalance} {requiredToken}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Required:</span>
            <span className="text-yellow-500 font-mono font-bold">
              {formattedRequired} {requiredToken}
            </span>
          </div>
          <div className="flex justify-between items-center border-t border-gray-700 pt-3">
            <span className="text-gray-400">Shortfall:</span>
            <span className="text-red-400 font-mono">
              {(requiredAmount - userBalance).toFixed(requiredToken === 'SOL' ? 4 : 2)} {requiredToken}
            </span>
          </div>
        </div>

        {/* Instructions */}
        <p className="text-gray-300 text-sm mb-6">
          You need more {requiredToken} to complete this transaction. 
          You can swap SOL or other tokens for {requiredToken} on Jupiter.
        </p>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <a
            href={jupiterUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold py-3 px-4 rounded-lg transition-all text-center"
          >
            Swap on Jupiter →
          </a>
          {onClose && (
            <button
              onClick={onClose}
              className="px-4 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-all"
            >
              Cancel
            </button>
          )}
        </div>

        {/* Help Text */}
        <p className="text-gray-500 text-xs mt-4 text-center">
          Jupiter will open in a new tab. Return here after swapping.
        </p>
      </div>
    </div>
  );
}

export default SwapSuggestion;
