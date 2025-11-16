import { useEffect, useState } from'react';

interface Payment {
  id: string;
  signature: string;
  fromWallet: string;
  toWallet: string;
  toAgent: string;
  amount: number;
  currency: string;
  serviceType: string;
  verified: boolean;
  createdAt: string;
  x402Registered: boolean;
  x402ScanUrl?: string;
  isAgentToAgent: boolean;
}

export default function PaymentHistory({ walletAddress }: { walletAddress: string }) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    if (!walletAddress) return;
    
    fetch(`/api/x402/history?wallet=${walletAddress}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setPayments(data.payments || []);
        } else {
          setError(data.error ||'Failed to fetch payment history');
        }
        setLoading(false);
      })
      .catch(err => {
        setError('Failed to load payment history');
        setLoading(false);
      });
  }, [walletAddress]);
  
  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
        {error}
      </div>
    );
  }
  
  if (payments.length === 0) {
    return (
      <div className="text-center p-8 text-gray-500">
        No payment history found
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">Payment History</h3>
      <div className="space-y-3">
        {payments.map(payment => (
          <div key={payment.id} className="border border-gray-200 rounded-lg p-4 hover:border-purple-300 transition-colors">
            <div className="flex justify-between items-start mb-2">
              <div>
                <div className="font-medium text-gray-900">
                  {payment.serviceType.replace(/_/g,'').replace(/\b\w/g, l => l.toUpperCase())}
                </div>
                <div className="text-sm text-gray-500">
                  {payment.fromWallet === walletAddress ?'To':'From'}: {payment.toAgent}
                </div>
                {payment.isAgentToAgent && (
                  <span className="inline-block text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded mt-1">
                    Agent-to-Agent
                  </span>
                )}
              </div>
              <div className="text-right">
                <div className="font-bold text-purple-600">
                  {payment.amount} {payment.currency}
                </div>
                <div className="text-xs text-gray-500">
                  {new Date(payment.createdAt).toLocaleDateString()}
                </div>
              </div>
            </div>
            
            <div className="flex gap-3 mt-3 text-xs">
              <a 
                href={`https://solscan.io/tx/${payment.signature}`}
                target="_blank"                rel="noopener noreferrer"                className="text-gray-600 hover:text-gray-900 hover:underline"              >
                View on Solscan →
              </a>
              
              {payment.x402ScanUrl && (
                <a 
                  href={payment.x402ScanUrl}
                  target="_blank"                  rel="noopener noreferrer"                  className="text-purple-600 hover:text-purple-800 hover:underline font-medium"                >
                  View on x402scan →
                </a>
              )}
              
              {!payment.x402Registered && (
                <span className="text-gray-400">
                  x402scan pending...
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

