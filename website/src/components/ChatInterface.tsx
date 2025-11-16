'use client';

import { useState, useEffect, useRef } from'react';
import { useWallet, useConnection } from'@solana/wallet-adapter-react';
import { Send, Loader2 } from'lucide-react';
import { PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from'@solana/web3.js';
import { apiClient, PaymentRequest } from'@/lib/api-client';
import { Toast, ToastContainer, ToastType } from'./Toast';
import { 
  cacheConversation, 
  loadCachedConversation, 
  clearWalletCache 
} from'@/lib/conversationCache';

interface Message {
  id: string;
  sender: string;
  senderId: string;  // Original agent ID (e.g.,"donald-trump")
  content: string;
  timestamp: Date;
  isAgent: boolean;
  mentions?: string[];  // Agent IDs mentioned in this message
  isIntermediary?: boolean;  // Is this part of agent-to-agent conversation?
}

interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
}

interface ScoreUpdate {
  type:'score_update';
  current_score: number;
  delta: number;
  reason: string;
  category: string;
  feedback?: string;
}

interface ScoreEntry {
  delta: number;
  reason: string;
  timestamp: Date;
  currentScore: number;
}

export default function ChatInterface({ 
  selectedAgent, 
  threadId, 
  onThreadCreated 
}: { 
  selectedAgent: string;
  threadId: string | null;
  onThreadCreated: (threadId: string) => void;
}) {
  const { publicKey, sendTransaction, signTransaction, connected, signMessage } = useWallet();
  const { connection } = useConnection();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [polling, setPolling] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const sessionInitializedRef = useRef(false);
  const previousWalletRef = useRef<string | null>(null); // Track wallet changes for cache clearing
  const previousMessageCountRef = useRef<number>(0); // Track message count to detect new messages
  
  // Score tracking state
  const [currentScore, setCurrentScore] = useState(0);
  const [scoreHistory, setScoreHistory] = useState<ScoreEntry[]>([]);
  const [userRank, setUserRank] = useState<number | null>(null);
  const lastScoreFetchRef = useRef<number>(0); // Track last fetched score to detect changes
  const isFetchingScoreRef = useRef<boolean>(false); // Prevent concurrent score fetches
  const processedMessageIdsRef = useRef<Set<string>>(new Set()); // Track processed messages to prevent duplicate toasts

  // Toast helper function
  const showToast = (message: string, type: ToastType ='info') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type }]);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  // Extract score update from agent message
  const extractScoreUpdate = (content: string): ScoreUpdate | null => {
    try {
      // Look for JSON score_update in message
      // Use a more permissive regex to capture nested braces in feedback
      const jsonMatch = content.match(/\{"type":\s*"score_update"[^}]*(?:"feedback":\s*"[^"]*")?[^}]*\}/);
      if (jsonMatch) {
        let jsonStr = jsonMatch[0];
        
        // Fix common JSON encoding issues from LLM responses:
        // 1. Replace invalid unicode escapes (e.g., \u001f504) with proper encoding
        // 2. Handle emojis that got mangled during serialization
        jsonStr = jsonStr.replace(/\\u([0-9a-fA-F]{4})([0-9]{1,3})/g, (match, hex, extra) => {
          // This catches cases like \u001f504 which should be a single emoji
          // Try to decode as UTF-16 surrogate pair or single character
          try {
            const codePoint = parseInt(hex, 16);
            // If it's a high surrogate (0xD800-0xDBFF), combine with next part
            if (codePoint >= 0xD800 && codePoint <= 0xDBFF && extra) {
              const fullCodePoint = ((codePoint - 0xD800) * 0x400) + parseInt(extra, 16) + 0x10000;
              return String.fromCodePoint(fullCodePoint);
            }
            return String.fromCharCode(codePoint) + extra;
          } catch {
            return match;
          }
        });
        
        // Try parsing
        const parsed = JSON.parse(jsonStr);
        if (parsed.type ==='score_update') {
          return parsed;
        }
      }
    } catch (e) {
      console.error('Failed to parse score update:', e);
      console.log('Content that failed to parse:', content.substring(0, 500));
    }
    return null;
  };

  // Strip all debug/internal markers from message content
  const stripDebugMarkers = (content: string): string => {
    return content
      // Remove USER_WALLET prefix (used for internal routing only)
      .replace(/\[USER_WALLET:[1-9A-HJ-NP-Za-km-z]{32,44}]\s*/g, '')
      // Remove PREMIUM_SERVICE_PAYMENT_COMPLETED marker
      .replace(/\[PREMIUM_SERVICE_PAYMENT_COMPLETED:\s*[^\]]+\]\s*/g, '')
      // Remove score_update JSON (displayed separately in toast)
      .replace(/\s*\{\"type\":\s*\"score_update\"[^\}]*\}\s*$/g, '')
      .trim();
  };

  // Extract x402 payment request from message content
  const extractPaymentRequest = (content: string): { request: PaymentRequest; cleanMessage: string } | null => {
    const match = content.match(/<x402_payment_request>([\s\S]*?)<\/x402_payment_request>/);
    if (match) {
      try {
        const jsonStr = match[1].trim();
        const parsed = JSON.parse(jsonStr);
        
        // Convert to PaymentRequest format expected by PaymentModal
        const paymentRequest: PaymentRequest = {
          type: 'x402_payment_required',
          recipient: parsed.recipient?.id || 'treasury',
          recipient_address: parsed.recipient_address || parsed.recipient?.address,
          amount_sol: 0,
          amount_usdc: parsed.amount_usdc || parseFloat(parsed.amount?.value || '0') / 1_000_000,
          service_type: parsed.service_type || 'premium_service',
          reason: parsed.reason || 'Premium service',
          timestamp: parsed.timestamp || Date.now(),
          payment_id: parsed.payment_id,
        };
        
        // Remove payment request XML from message, keep the surrounding text
        const cleanMessage = content.replace(/<x402_payment_request>[\s\S]*?<\/x402_payment_request>/g, '').trim();
        
        return { request: paymentRequest, cleanMessage };
      } catch (e) {
        console.error('Failed to parse payment request:', e);
      }
    }
    return null;
  };

  // Fetch current score from backend
  const fetchCurrentScore = async () => {
    if (!publicKey) {
      return;
    }
    
    // Prevent concurrent fetches
    if (isFetchingScoreRef.current) {
      return;
    }
    
    isFetchingScoreRef.current = true;
    
    const wallet = publicKey.toString();
    
    try {
      const url =`/api/scoring/update?userWallet=${wallet}`;
      
      const response = await fetch(url);
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.currentScore !== undefined) {
          const oldScore = lastScoreFetchRef.current;
          const newScore = data.currentScore;
          
          
          lastScoreFetchRef.current = newScore;
          setCurrentScore(newScore);
          
          if (data.rank) {
            setUserRank(data.rank);
          }
          
          //  Update score history if there's a change
          if (newScore !== oldScore && oldScore !== 0) {
            const delta = newScore - oldScore;
            setScoreHistory(prev => [...prev, {
              delta: delta,
              reason: data.scoreHistory?.[0]?.reason ||'Score updated',
              timestamp: new Date(),
              currentScore: newScore
            }]);
            
            // Show toast for score change
            const deltaText = delta > 0 ?`+${delta}`: delta;
            showToast(`${deltaText} points`, delta > 0 ?'success':'error');
          }
          
          // Force a small delay to ensure state has propagated
          setTimeout(() => {
          }, 100);
        } else {
          console.warn('[SCORE FETCH] Score data missing currentScore field');
        }
      } else {
        const errorText = await response.text();
        console.error('[SCORE FETCH] API error:', response.status, errorText);
      }
    } catch (err) {
      console.error('[SCORE FETCH] Failed to fetch score:', err);
    } finally {
      isFetchingScoreRef.current = false;
    }
  };

  // Initialize session
  useEffect(() => {
    if (!sessionId && !sessionInitializedRef.current) {
      sessionInitializedRef.current = true;
      initializeSession();
    }
  }, []);

  // Create thread when agent selected
  useEffect(() => {
    if (selectedAgent && sessionId && publicKey) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      setPolling(false);
      
      // Check if we already have a threadId for this agent
      if (threadId) {
        // Thread already exists, just load cached messages if available
        const walletAddress = publicKey.toString();
        const cached = loadCachedConversation(walletAddress, threadId);
        
        if (cached && cached.length > 0) {
          setMessages(cached);
        } else {
          // No cache, clear messages and let polling fetch from server
          setMessages([{
            id:`welcome-${selectedAgent}`,
            senderId: selectedAgent,
            sender: formatAgentName(selectedAgent),
            content: getWelcomeMessage(selectedAgent),
            timestamp: new Date(),
            isAgent: true,
            mentions: [],
            isIntermediary: false
          }]);
        }
      } else {
        // No thread yet, create a new one
        setMessages([]);
        initializeThread();
      }
    }
  }, [selectedAgent, sessionId, publicKey, threadId]);

  // Start polling when thread ready
  useEffect(() => {
    if (threadId && sessionId && !polling) {
      startPolling();
    }
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [threadId, sessionId]);

  // Auto-scroll only when new messages are added
  useEffect(() => {
    const currentMessageCount = messages.length;
    
    // Only scroll if message count increased (new messages added)
    if (currentMessageCount > previousMessageCountRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior:'smooth', block:'nearest', inline:'nearest'});
    }
    
    // Update the previous count
    previousMessageCountRef.current = currentMessageCount;
  }, [messages]);

  // Fetch initial score when wallet connected
  useEffect(() => {
    if (publicKey) {
      const currentWallet = publicKey.toString();
      const previousWallet = previousWalletRef.current;
      
      // If wallet changed (not just initial connection), clear the old wallet's cache
      if (previousWallet && previousWallet !== currentWallet) {
        clearWalletCache(previousWallet);
        setMessages([]); // Clear displayed messages immediately
      }
      
      previousWalletRef.current = currentWallet;
      
      processedMessageIdsRef.current.clear(); // Clear processed messages on wallet change
      fetchCurrentScore();
    } else {
      // Wallet disconnected - clear the cache for security
      if (previousWalletRef.current) {
        clearWalletCache(previousWalletRef.current);
        previousWalletRef.current = null;
      }
      
      setCurrentScore(0);
      lastScoreFetchRef.current = 0;
      setMessages([]); // Clear messages
      processedMessageIdsRef.current.clear(); // Clear processed messages on disconnect
    }
  }, [publicKey]);

  // Watch for score updates in messages
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    
    if (lastMessage?.content && lastMessage.isAgent && lastMessage.id) {
      // Check if we've already processed this message
      if (processedMessageIdsRef.current.has(lastMessage.id)) {
        return;
      }
      
      const scoreUpdate = extractScoreUpdate(lastMessage.content);
      
      if (scoreUpdate) {
        
        // Mark this message as processed BEFORE showing toast
        processedMessageIdsRef.current.add(lastMessage.id);
        
        lastScoreFetchRef.current = scoreUpdate.current_score;
        setCurrentScore(scoreUpdate.current_score);
        setScoreHistory(prev => [...prev, {
          delta: scoreUpdate.delta,
          reason: scoreUpdate.reason,
          timestamp: new Date(),
          currentScore: scoreUpdate.current_score
        }]);
        
        const deltaText = scoreUpdate.delta > 0 ?`+${scoreUpdate.delta}`: scoreUpdate.delta;
        showToast(`${deltaText} points: ${scoreUpdate.reason}`, scoreUpdate.delta > 0 ?'success':'error');
      } else {
        // If no embedded score, fetch from API (agents may have updated score via award_points without embedding it)
        
        // DON'T mark payment request messages as processed here - they need to trigger payment flow first
        const hasPaymentRequest = lastMessage.content.includes('<x402_payment_request>');
        if (!hasPaymentRequest) {
        // Mark as processed to prevent repeated API calls
        processedMessageIdsRef.current.add(lastMessage.id);
        }
        
        // Add a small delay to allow backend to finish processing
        setTimeout(() => {
          fetchCurrentScore();
        }, 500);
      }
    } else {
    }
  }, [messages]);

  const initializeSession = async () => {
    try {
      setLoading(true);
      const session = await apiClient.createSession();
      setSessionId(session.sessionId);
    } catch (err) {
      console.error('Session creation failed:', err);
      showToast('Failed to connect. Make sure the server is running.','error');
    } finally {
      setLoading(false);
    }
  };

  const initializeThread = async () => {
    if (!sessionId) return;
    
    try {
      setLoading(true);
      const thread = await apiClient.createThread(sessionId, selectedAgent);
      onThreadCreated(thread.threadId);
      
      // Only add welcome message if there are no existing messages (e.g., from cache)
      setMessages(prev => {
        if (prev.length > 0) {
          return prev;
        }
        
        // No cached messages, show welcome message
        return [{
          id:`welcome-${selectedAgent}`,
          senderId: selectedAgent,
          sender: formatAgentName(selectedAgent),
          content: getWelcomeMessage(selectedAgent),
          timestamp: new Date(),
          isAgent: true,
          mentions: [],
          isIntermediary: false
        }];
      });
    } catch (err) {
      console.error('Thread creation failed:', err);
      showToast('Failed to create conversation thread','error');
    } finally {
      setLoading(false);
    }
  };

  // Create a hash for message deduplication based on content and timing
  const createMessageHash = (senderId: string, content: string, timestamp: number) => {
    // Create hash from sender + content + timestamp (rounded to nearest 2 seconds for timing tolerance)
    const roundedTime = Math.floor(timestamp / 2000) * 2000;
    // Include more content for uniqueness, trim whitespace and normalize
    const normalizedContent = content.trim().substring(0, 200).replace(/\s+/g,'');
    return`${senderId}:${normalizedContent}:${roundedTime}`;
  };

  // Unified polling function that fetches and deduplicates messages
  const pollMessages = async () => {
    if (!threadId || !sessionId) return;
    
    try {
      const coralMessages = await apiClient.getMessages(sessionId, threadId);
      
      // Track if we found a new payment request that needs to be processed
      let pendingPaymentRequest: { request: PaymentRequest; messageId: string } | null = null;
      
      const allMessages = coralMessages
        .map((m: any) => {
          const isFromUser = m.senderId === 'sbf';
          const mentionsUser = m.mentions?.includes('sbf');
          const isIntermediary = !isFromUser && !mentionsUser;
          
          // Check for payment request in agent messages
          let content = m.content;
          if (m.content?.includes('<x402_payment_request>') && !isFromUser) {
            console.log('[Payment Detection] Found payment request in message:', m.id);
            const extracted = extractPaymentRequest(m.content);
            if (extracted) {
              console.log('[Payment Detection] Extracted payment request:', extracted.request);
              // Check if this is a new message we haven't processed yet
              const alreadyProcessed = processedMessageIdsRef.current.has(m.id);
              console.log('[Payment Detection] Already processed?', alreadyProcessed);
              if (!alreadyProcessed) {
                pendingPaymentRequest = { 
                  request: extracted.request, 
                  messageId: m.id 
                };
                console.log('[Payment Detection] Set pending payment request');
              }
              // Clean content for display
              content = extracted.cleanMessage;
            } else {
              console.error('[Payment Detection] Failed to extract payment request');
            }
          }
          
          return {
            id: m.id,
            senderId: m.senderId,
            sender: isFromUser ? 'You (SBF)' : formatAgentName(m.senderId),
            content: content,
            timestamp: new Date(m.timestamp),
            isAgent: !isFromUser,
            mentions: m.mentions || [],
            isIntermediary
          };
        });
      
      console.log('Message IDs:', allMessages.map(m =>`${m.senderId}:${m.id.substring(0, 8)}`));
      
      // Deduplicate and merge messages
      setMessages(prev => {
        console.log('State IDs:', prev.map(m =>`${m.senderId}:${m.id.substring(0, 12)}`));
        
        // Build a content-based lookup for existing user messages
        //  Strip debug markers for comparison to prevent duplicates
        const existingUserMessageContents = new Set(
          prev
            .filter(m => m.senderId ==='sbf')
            .map(m => stripDebugMarkers(m.content).trim())
        );
        
        const existingIds = new Set(prev.map(m => m.id));
        const existingHashes = new Set(prev.map(m => 
          createMessageHash(m.senderId, m.content, m.timestamp.getTime())
        ));
        
        // Filter out messages that are already displayed
        let newMessages = allMessages.filter(m => {
          // Already have this exact message ID
          if (existingIds.has(m.id)) return false;
          
          // For user messages, check if we have an optimistic version with same content
          //  Strip debug markers from Coral message for comparison
          if (m.senderId ==='sbf') {
            const strippedContent = stripDebugMarkers(m.content).trim();
            if (existingUserMessageContents.has(strippedContent)) {
              return false; // Don't add as"new"if we have optimistic version
            }
          }
          
          // Check hash-based deduplication for other messages
          const messageHash = createMessageHash(m.senderId, m.content, m.timestamp.getTime());
          return !existingHashes.has(messageHash);
        });
        
        // Handle payment confirmations: remove optimistic ones if real ones exist
        const hasRealPaymentConfirmation = allMessages.some(m =>
          m.senderId ==='sbf'&& m.content.includes('Payment sent! Transaction signature:')
        );
        
        let filteredPrev = hasRealPaymentConfirmation
          ? prev.filter(m => !m.id.startsWith('payment-'))
          : prev;
        
        // Replace optimistic user messages with server versions when they arrive
        const optimisticMessagesToReplace = new Set<string>();
        const serverVersionsToAdd: Message[] = [];
        
        // Find optimistic messages that have server versions
        filteredPrev.forEach(prevMsg => {
          if (prevMsg.id.startsWith('optimistic-')) {
            const serverVersion = allMessages.find(serverMsg => 
              serverMsg.senderId ==='sbf'&&
              serverMsg.content.trim() === prevMsg.content.trim()
            );
            
            if (serverVersion) {
              optimisticMessagesToReplace.add(prevMsg.id);
              serverVersionsToAdd.push(serverVersion);
            }
          }
        });
        
        // Remove optimistic messages that have server versions
        filteredPrev = filteredPrev.filter(prevMsg => 
          !optimisticMessagesToReplace.has(prevMsg.id)
        );
        
        // Add server versions of optimistic messages
        if (serverVersionsToAdd.length > 0) {
          filteredPrev = [...filteredPrev, ...serverVersionsToAdd];
        }
        
        // Return merged messages in chronological order
        if (newMessages.length === 0 && serverVersionsToAdd.length === 0) {
          return filteredPrev; // No changes needed
        }
        
        const merged = [...filteredPrev, ...newMessages];
        const sorted = merged.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        
        //  Cache the updated conversation if any new messages were added
        if (newMessages.length > 0 && publicKey && threadId) {
          cacheConversation(publicKey.toString(), threadId, sorted, selectedAgent);
        }
        
        return sorted;
      });

      // If we found a new payment request, trigger the payment flow
      console.log('[Payment Flow] Checking for pending payment request...');
      console.log('[Payment Flow] pendingPaymentRequest:', pendingPaymentRequest);
      console.log('[Payment Flow] publicKey:', publicKey?.toString());
      console.log('[Payment Flow] sessionId:', sessionId);
      console.log('[Payment Flow] threadId:', threadId);
      
      if (pendingPaymentRequest && publicKey && sessionId && threadId) {
        const { request, messageId } = pendingPaymentRequest;
        
        console.log(`[Payment Flow] Triggering payment flow for message ${messageId}`);
        
        // Mark this message as processed to prevent duplicate payment prompts
        processedMessageIdsRef.current.add(messageId);
        
        // Stop polling during payment
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        
        const amount = request.amount_usdc || request.amount_sol || 0;
        const currency = request.amount_usdc ? 'USDC' : 'SOL';
        const service = request.service_type?.replace(/_/g, ' ') || 'premium service';
        
        console.log(`[Premium Service] Payment request detected: ${amount} ${currency} for ${service}`);
        showToast(`Premium Service Available: ${amount} ${currency} for ${service}`, 'info');
        
        // Trigger payment flow
        setLoading(true);
        try {
          await handlePayment(
            request,
            `Premium service: ${service}`,
            sessionId,
            threadId,
            selectedAgent
          );
        } catch (error: any) {
          console.error('[Premium Service] Payment error:', error);
          showToast(error.message || 'Payment failed', 'error');
        } finally {
          setLoading(false);
          // Resume polling
          if (!pollIntervalRef.current) {
            startPolling();
          }
        }
      } else {
        console.log('[Payment Flow] Not triggering payment flow - missing requirements');
      }
    } catch (err: any) {
      // Check if this is a session not found error (server restart)
      if (err.code === 'SESSION_NOT_FOUND' || err.status === 410) {
        console.log('[Session Recovery] Session no longer exists, recreating...');
        
        // Stop polling
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        setPolling(false);
        
        // Clear all state
        setSessionId(null);
        setThreadId(null);
        setMessages([]);
        sessionInitializedRef.current = false;
        
        // Clear cache for current wallet
        if (publicKey) {
          clearWalletCache(publicKey.toString());
        }
        
        // Show user notification
        showToast('Server restarted. Reconnecting...', 'info');
        
        // Recreate session
        await initializeSession();
        
        return;
      }
      
      console.error('Poll error:', err);
    }
  };

  const startPolling = () => {
    if (!threadId || !sessionId) return;
    
    setPolling(true);
    pollIntervalRef.current = setInterval(pollMessages, 5000); // Poll every 5 seconds (reduced from 2s)
  };

  const sendUserMessage = async () => {
    if (!input.trim() || !sessionId || !threadId || !selectedAgent) return;

    // Capture input value before clearing it
    const messageContent =`@${selectedAgent} ${input}`;
    
    // Clear input immediately but DON'T show message yet - wait to see if payment is required
    setInput('');
    setLoading(true);

    // Stop polling while waiting for response
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    try {
      
      const response = await apiClient.sendMessage({
        sessionId,
        threadId,
        content: messageContent,
        agentId: selectedAgent,
        userWallet: publicKey?.toString(),
      });

      //  Check for HTTP 402 Payment Required (x402 protocol!)
      if (response.paymentRequired) {
        console.log('Payment details:', response.paymentRequired);
        
        // Don't show user message yet - handlePayment will show it after wallet confirmation
        
        const amount = response.paymentRequired.amount_usdc || response.paymentRequired.amount_sol;
        const currency = response.paymentRequired.amount_usdc ?'USDC':'SOL';
        const service = response.paymentRequired.service_type?.replace('_','') ||'this service';
        
        // Show toast for payment request
        showToast(`Payment Required: ${amount} ${currency} for ${service}`,'info');
        
        // Trigger wallet payment directly (no modal!)
        await handlePayment(
          response.paymentRequired,
          messageContent,
          sessionId,
          threadId,
          selectedAgent
        );
        return;
      }

      // No payment required - show optimistic message now
      const userMessage: Message = {
        id:`optimistic-${Date.now()}`,
        senderId:'sbf',
        sender:'You (SBF)',
        content: messageContent,
        timestamp: new Date(),
        isAgent: false,
        mentions: [selectedAgent],
        isIntermediary: false
      };

      setMessages(prev => {
        const updated = [...prev, userMessage];
        
        //  Cache the optimistic update
        if (publicKey && threadId) {
          cacheConversation(publicKey.toString(), threadId, updated, selectedAgent);
        }
        
        return updated;
      });
      
    } catch (err: any) {
      console.error('Send message error:', err);
      
      const errorMessage = err.message ||'Failed to send message';
      showToast(errorMessage,'error');
    } finally {
      setLoading(false);
      
      // Poll for agent response
      if (!pollIntervalRef.current && threadId && sessionId) {
        // Immediately poll to get agent response, then restart regular polling
        pollMessages().then(() => {
          if (!pollIntervalRef.current) {
            startPolling();
          }
        });
      }
    }
  };

  const handlePayment = async (
    paymentReq: PaymentRequest, 
    originalMessageContent: string,
    originalSessionId: string,
    originalThreadId: string,
    originalAgentId: string
  ) => {
    if (!connected || !publicKey) {
      showToast('Please connect your Solana wallet to make payments.','error');
      return;
    }

    try {
      const amount = paymentReq.amount_usdc || paymentReq.amount_sol || 0.01;
      const currency = paymentReq.amount_usdc ? 'USDC' : 'SOL';
      const isPremiumService = paymentReq.service_type && paymentReq.service_type !== 'message_fee';
      
      console.log(`[Payment] Amount: ${amount} ${currency}`);
      console.log(`[Payment] Recipient: ${paymentReq.recipient} (${paymentReq.recipient_address})`);
      console.log(`[Payment] Reason: ${paymentReq.reason}`);
      console.log(`[Payment] Service Type: ${paymentReq.service_type}`);
      console.log(`[Payment] Premium Service: ${isPremiumService}`);

      setLoading(true);

      // All USDC payments use the same flow: sign transaction, submit to facilitator
      if (currency === 'USDC') {
        if (!signTransaction) {
          throw new Error('Wallet does not support transaction signing');
        }

        showToast('Please sign the payment transaction in your wallet...','info');

        const { createUSDCTransaction } = await import('@/lib/x402-payload-client');
        const { PublicKey } = await import('@solana/web3.js');

        const signedTx = await createUSDCTransaction(
          `payment-${Date.now()}`,
          publicKey,
          new PublicKey(paymentReq.recipient_address),
          amount,
          signTransaction
        );

        console.log('[Payment] Transaction signed by user');

        // Build x402 payload to send to /api/chat/send
        const x402Payload = {
          x402Version: 1,
          scheme: 'exact',
          network: 'solana',
          payload: {
            transaction: signedTx.transaction_base64
          },
          paymentId: signedTx.payment_id,
          from: signedTx.from,
          to: signedTx.to,
          amount_usdc: amount
        };

      // Show user's message immediately after wallet signs payment
      const userMessage: Message = {
        id: `user-${Date.now()}`,
        senderId: 'sbf',
        sender: 'You (SBF)',
        content: originalMessageContent,
        timestamp: new Date(),
        isAgent: false,
        mentions: [originalAgentId],
        isIntermediary: false
      };

      setMessages(prev => [...prev, userMessage]);

      // Show loading indicator
      const loadingMessageId = `loading-${Date.now()}`;
      const loadingMessage: Message = {
        id: loadingMessageId,
        senderId: 'system',
        sender: 'System',
          content: '⏳ Processing payment and waiting for response...',
        timestamp: new Date(),
        isAgent: true,
        mentions: [],
        isIntermediary: false
      };

      setMessages(prev => [...prev, loadingMessage]);

        // Send to /api/chat/send with X-PAYMENT header
        // The middleware will verify and settle the payment via CDP facilitator
        showToast('Submitting payment...','info');

        // For premium services, send a notification message
        // For regular messages, send the original content
      const messageContent = isPremiumService
        ? `[PREMIUM_SERVICE_PAYMENT_COMPLETED] ${originalMessageContent}`.trim()
        : originalMessageContent;

      const retryResponse = await fetch('/api/chat/send', {
        method:'POST',
        headers: {
'Content-Type':'application/json',
'X-PAYMENT': JSON.stringify(x402Payload)  // x402 protocol header
        },
        body: JSON.stringify({
          sessionId: originalSessionId,
          threadId: originalThreadId,
          content: messageContent,
          agentId: originalAgentId,
          userWallet: publicKey?.toString(),
        }),
      });

      if (!retryResponse.ok && retryResponse.status !== 402) {
        const errorData = await retryResponse.json();
        throw new Error(errorData.error ||`Request failed: ${retryResponse.status}`);
      }

      const retryResult = await retryResponse.json();

      console.log('Payment verified and settled');
      console.log('Agent response received');

      showToast('Payment successful!','success');

      // Update messages with agent response
      if (retryResult.messages) {
        // Remove loading message
        setMessages(prev => prev.filter(m => m.id !== loadingMessageId));
        
        // Process agent messages
        const newAgentMessages = retryResult.messages
          .filter((m: any) => m.senderId !=='sbf')
          .map((m: any) => ({
            id: m.id ||`msg-${Date.now()}-${Math.random()}`,
            senderId: m.senderId,
            sender: formatAgentName(m.senderId),
            content: stripDebugMarkers(m.content),
            timestamp: new Date(m.timestamp || Date.now()),
            isAgent: true,
            mentions: m.mentions || [],
            isIntermediary: m.isIntermediary || false
          }));

        setMessages(prev => [...prev, ...newAgentMessages]);
        }
      } else {
        // SOL payments (not currently supported for CDP facilitator)
        throw new Error('SOL payments not currently supported. Please use USDC.');
      }

    } catch (err: any) {
      console.error('Payment error:', err);
      if (err.message?.includes('User rejected')) {
        showToast('Payment cancelled by user','error');
      } else {
        showToast(err.message ||'Payment failed. Please try again.','error');
      }
    } finally {
      setLoading(false);
    }
  };

  const getWelcomeMessage = (agent: string): string => {
    const messages: Record<string, string> = {
'donald-trump':"I'm Donald Trump, and I make the BEST deals. What can I do for you?",
'melania-trump':"Hello, I'm Melania. How can I help you today?",
'eric-trump':"Hey, I'm Eric. Let's talk business!",
'donjr-trump':"Don Jr here. What's up?",
'barron-trump':"Hi, I'm Barron. What do you need?",
'cz':"Build.",
    };
    return messages[agent] ||`Hello! I'm ${agent}.`;
  };

  const formatAgentName = (agentId: string): string => {
    return agentId
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
  };

  const getAgentColor = (agentId: string): string => {
    const colors: Record<string, string> = {
'donald-trump':'bg-gradient-to-r from-red-900 to-red-800 border-red-700',
'melania-trump':'bg-gradient-to-r from-pink-900 to-pink-800 border-pink-700',
'eric-trump':'bg-gradient-to-r from-blue-900 to-blue-800 border-blue-700',
'donjr-trump':'bg-gradient-to-r from-orange-900 to-orange-800 border-orange-700',
'barron-trump':'bg-gradient-to-r from-purple-900 to-purple-800 border-purple-700',
'cz':'bg-gradient-to-r from-yellow-900 to-yellow-800 border-yellow-700',
    };
    return colors[agentId] ||'bg-gray-800 border-gray-700';
  };

  return (
    <>
      {/* Toast Notifications */}
      <ToastContainer>
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            id={toast.id}
            message={toast.message}
            type={toast.type}
            onClose={() => removeToast(toast.id)}
            duration={5000}
          />
        ))}
      </ToastContainer>

      <div className="flex w-full max-h-[400px] border-[3px] border-white/30 rounded-xl bg-black/80 backdrop-blur-sm relative mt-20 pixel-art"        style={{
          boxShadow:'0 0 20px rgba(102, 182, 128, 0.3), inset 0 0 30px rgba(0, 0, 0, 0.5)'        }}
      >
        {/* Main Chat Area */}
        <div className="flex flex-col flex-1 min-w-0">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {messages.map((message) => {
            // Render intermediary messages differently
            if (message.isIntermediary) {
              const mentionedAgent = message.mentions?.[0];
              return (
                <div key={message.id} className="mx-4 my-1">
                  <div className="bg-gray-800/50 border-l-2 border-yellow-500 rounded p-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-yellow-400 font-pixel text-[14px]">
                        💬 {formatAgentName(message.senderId)} → {mentionedAgent ? formatAgentName(mentionedAgent) :'Agent'}
                      </span>
                    </div>
                    <div className="text-gray-300 font-pixel text-[15px] pl-2 whitespace-pre-wrap break-words leading-relaxed">
                      {stripDebugMarkers(message.content)}
                    </div>
                    <div className="font-pixel text-[12px] text-gray-500 mt-1 pl-2 opacity-50">
                      {message.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              );
            }
            
            // Regular user/agent messages
            const cleanContent = stripDebugMarkers(message.content);
            
            return (
              <div
                key={message.id}
                className={`flex ${message.isAgent ?'justify-start':'justify-end'}`}
              >
                <div
                  className={`max-w-[80%] p-3 rounded border ${
                    message.isAgent
                      ?'bg-gray-800/80 text-white border-white/20'                      :'bg-[#66b680]/80 text-white border-[#66b680]'                  }`}
                >
                  <div className="font-pixel text-[14px] mb-1 opacity-70">{message.sender}</div>
                  <div className="font-pixel text-[15px] whitespace-pre-wrap break-words leading-relaxed">
                    {cleanContent}
                  </div>
                  <div className="font-pixel text-[12px] opacity-50 mt-1">
                    {message.timestamp.toLocaleTimeString()}
                  </div>
                </div>
              </div>
            );
          })}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-white/20">
        {!connected && (
          <div className="mb-2 p-2 bg-yellow-900/20 border border-yellow-500/50 rounded font-pixel text-yellow-400 text-[8px]">
             Connect wallet for payments
          </div>
        )}
        
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key ==='Enter'&& !loading && sendUserMessage()}
            placeholder={loading ? "⏳ Agent is thinking..." : "Message..."}
            disabled={loading || !sessionId || !threadId}
            className="flex-1 bg-black/50 border-2 border-white/20 rounded px-3 py-2 text-white font-pixel text-[15px] placeholder-gray-500 focus:outline-none focus:border-[#66b680] disabled:opacity-50"
          />
          <button
            onClick={sendUserMessage}
            disabled={loading || !input.trim() || !sessionId || !threadId}
            className="bg-[#66b680] hover:bg-[#7ac694] text-white font-pixel text-[15px] py-2 px-4 border-2 border-[#4a8c60] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 pixel-art"            style={{
              boxShadow:'0 3px 0 #3a6c48',
              textShadow:'1px 1px 0 #3a6c48'            }}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin"/>
            ) : (
              <Send className="w-4 h-4"/>
            )}
            SEND
          </button>
        </div>
      </div>
        </div>
      </div>
    </>
  );
}
