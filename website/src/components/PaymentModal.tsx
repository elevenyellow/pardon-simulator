import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { 
  PublicKey
} from '@solana/web3.js';

interface PaymentRequest {
  type: 'x402_payment_required';
  recipient: string;
  recipient_address: string;
  amount_sol: number;
  amount_usdc?: number;
  service_type?: string;
  reason: string;
  timestamp: number;
  payment_id?: string;
}

interface VerificationResult {
  valid: boolean;
  signature: string;
  from: string;
  to: string;
  amount: number;
  timestamp?: number;
  slot?: number;
}

interface PaymentModalProps {
  paymentRequest: PaymentRequest | null;
  onClose: () => void;
  onPaymentComplete: (signature: string, verification?: VerificationResult) => void;
}

export default function PaymentModal({ 
  paymentRequest, 
  onClose, 
  onPaymentComplete 
}: PaymentModalProps) {
  const { publicKey, signMessage, signTransaction } = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!paymentRequest) return null;

  const handlePay = async () => {
    if (!publicKey || !signMessage) {
      setError('Please connect your wallet first');
      return;
    }

    if (!signTransaction) {
      setError('Wallet does not support transaction signing');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      console.log('\n' + '='.repeat(80));
      console.log('💰 X402 PAYMENT SUBMISSION (User → Backend → Facilitator)');
      console.log('='.repeat(80));
      console.log('From:', publicKey.toString());
      console.log('To:', paymentRequest.recipient_address);
      console.log('Amount:', paymentRequest.amount_usdc || paymentRequest.amount_sol, paymentRequest.amount_usdc ? 'USDC' : 'SOL');
      console.log('Service:', paymentRequest.service_type || paymentRequest.reason);

      // Step 1: Create and sign Solana USDC transaction
      console.log('\n🔐 Step 1: Creating Solana USDC transaction...');
      const { createUSDCTransaction } = await import('@/lib/x402-payload-client');
      const { Connection } = await import('@solana/web3.js');
      
      const connection = new Connection(
        process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
        'confirmed'
      );
      
      const signedTx = await createUSDCTransaction(
        `payment-${Date.now()}`,
        connection,
        publicKey,
        new PublicKey(paymentRequest.recipient_address),
        paymentRequest.amount_usdc || paymentRequest.amount_sol,
        signTransaction
      );

      console.log('✅ Transaction signed');

      // Step 2: Submit to backend (which will use facilitator)
      console.log('\n📤 Step 2: Submitting to backend facilitator endpoint...');
      const response = await fetch('/api/x402/user-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signedTransaction: signedTx,
          paymentRequest: {
            payment_id: paymentRequest.payment_id || signedTx.payment_id,
            recipient_address: paymentRequest.recipient_address,
            amount_usdc: paymentRequest.amount_usdc || paymentRequest.amount_sol,
            service_type: paymentRequest.service_type || 'service',
            reason: paymentRequest.reason,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Payment submission failed: ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Payment submission failed');
      }

      console.log('='.repeat(80));
      console.log('✅ PAYMENT SUBMITTED SUCCESSFULLY!');
      console.log('='.repeat(80));
      console.log('Transaction:', result.transaction);
      console.log('Network:', result.network);
      console.log('x402 Compliant:', result.x402Compliant);
      console.log('Via Facilitator:', result.submittedViaFacilitator);
      console.log('\n🔍 View transaction:');
      console.log('   x402scan:', result.x402ScanUrl);
      console.log('   Solana Explorer:', result.solanaExplorer);
      console.log('='.repeat(80));
      console.log('');

      // Step 3: Return transaction hash (NOT payload) to chat
      // The agent will verify this transaction hash via backend
      onPaymentComplete(result.transaction, {
        valid: true,
        signature: result.transaction,
        from: publicKey.toString(),
        to: paymentRequest.recipient_address,
        amount: paymentRequest.amount_usdc || paymentRequest.amount_sol,
      });
      
      onClose();
    } catch (err: any) {
      console.error('❌ Payment submission error:', err);
      setError(err.message || 'Payment submission failed');
    } finally {
      setLoading(false);
    }
  };

  const usdEstimate = (paymentRequest.amount_sol * 200).toFixed(2); // Rough estimate

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-2xl font-bold text-gray-900">💰 Payment Required</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            disabled={loading}
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          {/* Payment Details */}
          <div className="bg-gray-50 p-4 rounded-lg space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Service:</span>
              <span className="font-semibold text-gray-900">{paymentRequest.reason}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Provider:</span>
              <span className="font-semibold text-gray-900">{paymentRequest.recipient}</span>
            </div>
            <div className="flex justify-between items-center border-t pt-2 mt-2">
              <span className="text-gray-900 font-medium">Amount:</span>
              <div className="text-right">
                <div className="text-xl font-bold text-purple-600">
                  {paymentRequest.amount_sol} SOL
                </div>
                <div className="text-sm text-gray-500">
                  ≈ ${usdEstimate} USD
                </div>
              </div>
            </div>
          </div>

          {/* Recipient Address */}
          <div className="text-xs text-gray-500">
            <div className="font-medium mb-1">Recipient Address:</div>
            <div className="bg-gray-100 p-2 rounded font-mono break-all">
              {paymentRequest.recipient_address}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              <strong>Error:</strong> {error}
            </div>
          )}

          {/* Wallet Status */}
          {!publicKey && (
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded">
              ⚠️ Please connect your Solana wallet to continue
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-colors disabled:opacity-50"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              onClick={handlePay}
              disabled={loading || !publicKey}
              className="flex-1 px-4 py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <span className="inline-block animate-spin mr-2">⏳</span>
                  Processing...
                </>
              ) : (
                'Pay with Wallet'
              )}
            </button>
          </div>

          {/* Security Notice */}
          <div className="text-xs text-gray-500 text-center pt-2">
            🔐 Your wallet will prompt you to approve this transaction.
            Make sure you trust the recipient before proceeding.
          </div>
        </div>
      </div>
    </div>
  );
}

