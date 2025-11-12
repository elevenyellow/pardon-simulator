'use client';

import { useState, useEffect, useRef } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { Send, Loader2 } from 'lucide-react';
import { PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { apiClient, PaymentRequest } from '@/lib/api-client';
import { Toast, ToastContainer, ToastType } from './Toast';
import { 
  cacheConversation, 
  loadCachedConversation, 
  clearWalletCache 
} from '@/lib/conversationCache';

interface Message {
  id: string;
  sender: string;
  senderId: string;  // Original agent ID (e.g., "donald-trump")
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
  type: 'score_update';
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
  
  // Score tracking state
  const [currentScore, setCurrentScore] = useState(0);
  const [scoreHistory, setScoreHistory] = useState<ScoreEntry[]>([]);
  const [userRank, setUserRank] = useState<number | null>(null);
  const lastScoreFetchRef = useRef<number>(0); // Track last fetched score to detect changes
  const isFetchingScoreRef = useRef<boolean>(false); // Prevent concurrent score fetches
  const processedMessageIdsRef = useRef<Set<string>>(new Set()); // Track processed messages to prevent duplicate toasts

  // Toast helper function
  const showToast = (message: string, type: ToastType = 'info') => {
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
        if (parsed.type === 'score_update') {
          return parsed;
        }
      }
    } catch (e) {
      console.error('Failed to parse score update:', e);
      console.log('Content that failed to parse:', content.substring(0, 500));
    }
    return null;
  };

  // Strip USER_WALLET prefix from message content (used for internal routing only)
  const stripWalletPrefix = (content: string): string => {
    return content.replace(/\[USER_WALLET:[1-9A-HJ-NP-Za-km-z]{32,44}]\s*/g, '');
  };

  // Strip score_update JSON from message content (it's displayed separately in the sidebar/toast)
  const stripScoreUpdate = (content: string): string => {
    // Remove the JSON score_update object from the message
    return content.replace(/\s*\{\"type\":\s*\"score_update\"[^\}]*\}\s*$/g, '').trim();
  };

  // Fetch current score from backend
  const fetchCurrentScore = async () => {
    if (!publicKey) {
      console.log('⚠️  [SCORE FETCH] No publicKey, skipping');
      return;
    }
    
    // Prevent concurrent fetches
    if (isFetchingScoreRef.current) {
      console.log('⏭️  [SCORE FETCH] Already fetching, skipping duplicate call');
      return;
    }
    
    isFetchingScoreRef.current = true;
    
    const wallet = publicKey.toString();
    console.log('🔍 [SCORE FETCH] Fetching score for wallet:', wallet.substring(0, 8) + '...');
    console.log('🔍 [SCORE FETCH] Current score state before fetch:', currentScore);
    
    try {
      const url = `/api/scoring/update?userWallet=${wallet}`;
      console.log('📡 [SCORE FETCH] GET', url);
      
      const response = await fetch(url);
      console.log('📥 [SCORE FETCH] API response:', response.status, response.statusText);
      
      if (response.ok) {
        const data = await response.json();
        console.log('📊 [SCORE FETCH] Score data received:', JSON.stringify(data, null, 2));
        
        if (data.currentScore !== undefined) {
          const oldScore = lastScoreFetchRef.current;
          const newScore = data.currentScore;
          
          console.log(`✅ [SCORE FETCH] Score change: ${oldScore} → ${newScore}`);
          console.log(`✅ [SCORE FETCH] Setting state with setCurrentScore(${newScore})`);
          
          lastScoreFetchRef.current = newScore;
          setCurrentScore(newScore);
          
          if (data.rank) {
            console.log(`✅ [SCORE FETCH] Setting rank: ${data.rank}`);
            setUserRank(data.rank);
          }
          
          // ✅ Update score history if there's a change
          if (newScore !== oldScore && oldScore !== 0) {
            const delta = newScore - oldScore;
            console.log(`📈 [SCORE FETCH] Adding to score history: delta=${delta}`);
            setScoreHistory(prev => [...prev, {
              delta: delta,
              reason: data.scoreHistory?.[0]?.reason || 'Score updated',
              timestamp: new Date(),
              currentScore: newScore
            }]);
            
            // Show toast for score change
            const deltaText = delta > 0 ? `+${delta}` : delta;
            showToast(`${deltaText} points`, delta > 0 ? 'success' : 'error');
          }
          
          // Force a small delay to ensure state has propagated
          setTimeout(() => {
            console.log(`🔍 [SCORE FETCH] Verification - currentScore state:`, currentScore);
            console.log(`🔍 [SCORE FETCH] Verification - lastScoreFetchRef.current:`, lastScoreFetchRef.current);
          }, 100);
        } else {
          console.warn('⚠️  [SCORE FETCH] Score data missing currentScore field');
        }
      } else {
        const errorText = await response.text();
        console.error('❌ [SCORE FETCH] API error:', response.status, errorText);
      }
    } catch (err) {
      console.error('❌ [SCORE FETCH] Failed to fetch score:', err);
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
          console.log(`📦 Loaded ${cached.length} cached messages from localStorage`);
          setMessages(cached);
        } else {
          // No cache, clear messages and let polling fetch from server
          console.log('📭 No cache, starting fresh');
          setMessages([{
            id: `welcome-${selectedAgent}`,
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

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }, [messages]);

  // Fetch initial score when wallet connected
  useEffect(() => {
    if (publicKey) {
      const currentWallet = publicKey.toString();
      const previousWallet = previousWalletRef.current;
      
      // If wallet changed (not just initial connection), clear the old wallet's cache
      if (previousWallet && previousWallet !== currentWallet) {
        console.log(`🔄 Wallet changed from ${previousWallet.substring(0, 8)}... to ${currentWallet.substring(0, 8)}...`);
        clearWalletCache(previousWallet);
        setMessages([]); // Clear displayed messages immediately
      }
      
      previousWalletRef.current = currentWallet;
      
      console.log('💼 [WALLET CONNECTED] Fetching initial score for wallet:', currentWallet.substring(0, 8) + '...');
      processedMessageIdsRef.current.clear(); // Clear processed messages on wallet change
      fetchCurrentScore();
    } else {
      // Wallet disconnected - clear the cache for security
      if (previousWalletRef.current) {
        console.log(`🔒 Wallet disconnected, clearing cache for ${previousWalletRef.current.substring(0, 8)}...`);
        clearWalletCache(previousWalletRef.current);
        previousWalletRef.current = null;
      }
      
      console.log('💼 [WALLET DISCONNECTED] Resetting score to 0');
      setCurrentScore(0);
      lastScoreFetchRef.current = 0;
      setMessages([]); // Clear messages
      processedMessageIdsRef.current.clear(); // Clear processed messages on disconnect
    }
  }, [publicKey]);

  // Watch for score updates in messages
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    console.log('👀 [MESSAGE WATCHER] Triggered, last message:', lastMessage?.id, 'isAgent:', lastMessage?.isAgent);
    console.log('👀 [MESSAGE WATCHER] Current score state:', currentScore);
    console.log('👀 [MESSAGE WATCHER] lastScoreFetchRef.current:', lastScoreFetchRef.current);
    
    if (lastMessage?.content && lastMessage.isAgent && lastMessage.id) {
      // Check if we've already processed this message
      if (processedMessageIdsRef.current.has(lastMessage.id)) {
        console.log('⏭️  [MESSAGE WATCHER] Message already processed, skipping:', lastMessage.id);
        return;
      }
      
      console.log('🤖 [MESSAGE WATCHER] Agent message detected, checking for score update...');
      const scoreUpdate = extractScoreUpdate(lastMessage.content);
      
      if (scoreUpdate) {
        console.log('✅ [MESSAGE WATCHER] Score embedded in message:', scoreUpdate);
        console.log('✅ [MESSAGE WATCHER] Setting currentScore to:', scoreUpdate.current_score);
        
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
        
        const deltaText = scoreUpdate.delta > 0 ? `+${scoreUpdate.delta}` : scoreUpdate.delta;
        showToast(`${deltaText} points: ${scoreUpdate.reason}`, scoreUpdate.delta > 0 ? 'success' : 'error');
      } else {
        // If no embedded score, fetch from API (agents may have updated score via award_points without embedding it)
        console.log('🔄 [MESSAGE WATCHER] No score embedded in agent message, fetching from API...');
        
        // Mark as processed to prevent repeated API calls
        processedMessageIdsRef.current.add(lastMessage.id);
        
        // Add a small delay to allow backend to finish processing
        setTimeout(() => {
          fetchCurrentScore();
        }, 500);
      }
    } else {
      console.log('⏭️  [MESSAGE WATCHER] Skipping score check (not an agent message or no ID)');
    }
  }, [messages]);

  const initializeSession = async () => {
    try {
      setLoading(true);
      const session = await apiClient.createSession();
      setSessionId(session.sessionId);
      console.log('✅ Session created:', session.sessionId);
    } catch (err) {
      console.error('❌ Session creation failed:', err);
      showToast('Failed to connect. Make sure the server is running.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const initializeThread = async () => {
    if (!sessionId) return;
    
    try {
      setLoading(true);
      console.log('🧵 Creating thread for:', selectedAgent);
      const thread = await apiClient.createThread(sessionId, selectedAgent);
      console.log('✅ Thread created:', thread.threadId);
      onThreadCreated(thread.threadId);
      
      // Only add welcome message if there are no existing messages (e.g., from cache)
      setMessages(prev => {
        if (prev.length > 0) {
          console.log('📦 Skipping welcome message, using cached messages:', prev.length);
          return prev;
        }
        
        // No cached messages, show welcome message
        return [{
          id: `welcome-${selectedAgent}`,
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
      console.error('❌ Thread creation failed:', err);
      showToast('Failed to create conversation thread', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Create a hash for message deduplication based on content and timing
  const createMessageHash = (senderId: string, content: string, timestamp: number) => {
    // Create hash from sender + content + timestamp (rounded to nearest 2 seconds for timing tolerance)
    const roundedTime = Math.floor(timestamp / 2000) * 2000;
    // Include more content for uniqueness, trim whitespace and normalize
    const normalizedContent = content.trim().substring(0, 200).replace(/\s+/g, ' ');
    return `${senderId}:${normalizedContent}:${roundedTime}`;
  };

  // Unified polling function that fetches and deduplicates messages
  const pollMessages = async () => {
    if (!threadId || !sessionId) return;
    
    try {
      const coralMessages = await apiClient.getMessages(sessionId, threadId);
      
      const allMessages = coralMessages
        // Filter out ONLY messages with x402 XML tags (the actual payment request)
        // Allow normal conversational messages that mention "402" to be displayed
        .filter((m: any) => {
          const content = m.content || '';
          return !content.includes('<x402_payment_request>');
        })
        .map((m: any) => {
          const isFromUser = m.senderId === 'sbf';
          const mentionsUser = m.mentions?.includes('sbf');
          const isIntermediary = !isFromUser && !mentionsUser;
          
          return {
            id: m.id,
            senderId: m.senderId,
            sender: isFromUser ? 'You (SBF)' : formatAgentName(m.senderId),
            content: m.content,
            timestamp: new Date(m.timestamp),
            isAgent: !isFromUser,
            mentions: m.mentions || [],
            isIntermediary
          };
        });
      
      console.log('📨 Polled messages from Coral:', allMessages.length, 'messages');
      console.log('   Message IDs:', allMessages.map(m => `${m.senderId}:${m.id.substring(0, 8)}`));
      
      // Deduplicate and merge messages
      setMessages(prev => {
        console.log('🔄 Current messages in state:', prev.length, 'messages');
        console.log('   State IDs:', prev.map(m => `${m.senderId}:${m.id.substring(0, 12)}`));
        
        // Build a content-based lookup for existing user messages
        // ✅ Strip wallet prefix for comparison to prevent duplicates
        const existingUserMessageContents = new Set(
          prev
            .filter(m => m.senderId === 'sbf')
            .map(m => stripWalletPrefix(m.content).trim())
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
          // ✅ Strip wallet prefix from Coral message for comparison
          if (m.senderId === 'sbf') {
            const strippedContent = stripWalletPrefix(m.content).trim();
            if (existingUserMessageContents.has(strippedContent)) {
              console.log('🔍 Found server version of optimistic message:', strippedContent.substring(0, 50));
              return false; // Don't add as "new" if we have optimistic version
            }
          }
          
          // Check hash-based deduplication for other messages
          const messageHash = createMessageHash(m.senderId, m.content, m.timestamp.getTime());
          return !existingHashes.has(messageHash);
        });
        
        // Handle payment confirmations: remove optimistic ones if real ones exist
        const hasRealPaymentConfirmation = allMessages.some(m =>
          m.senderId === 'sbf' && m.content.includes('Payment sent! Transaction signature:')
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
              serverMsg.senderId === 'sbf' &&
              serverMsg.content.trim() === prevMsg.content.trim()
            );
            
            if (serverVersion) {
              console.log('🔄 Replacing optimistic message with server version:', prevMsg.id, '→', serverVersion.id);
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
        
        console.log('✅ Final message order:', sorted.map(m => 
          `${m.senderId}:${m.id.substring(0, 12)}:${m.content.substring(0, 30)}`
        ));
        
        // ✅ Cache the updated conversation if any new messages were added
        if (newMessages.length > 0 && publicKey && threadId) {
          cacheConversation(publicKey.toString(), threadId, sorted, selectedAgent);
        }
        
        return sorted;
      });
    } catch (err) {
      console.error('❌ Poll error:', err);
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
    const messageContent = `@${selectedAgent} ${input}`;
    
    const userMessage: Message = {
      id: `optimistic-${Date.now()}`,
      senderId: 'sbf',
      sender: 'You (SBF)',
      content: messageContent,
      timestamp: new Date(),
      isAgent: false,
      mentions: [selectedAgent],
      isIntermediary: false
    };

    console.log('➕ Adding optimistic user message:', userMessage.id, messageContent.substring(0, 50));
    setMessages(prev => {
      const updated = [...prev, userMessage];
      
      // ✅ Cache the optimistic update
      if (publicKey && threadId) {
        cacheConversation(publicKey.toString(), threadId, updated, selectedAgent);
      }
      
      return updated;
    });
    setInput('');
    setLoading(true);

    // Stop polling while waiting for response
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    // Store the optimistic message ID for potential removal
    const optimisticMessageId = userMessage.id;
    let shouldRemoveOptimisticMessage = false;

    try {
      console.log('📤 Sending message to agent:', selectedAgent);
      
      const response = await apiClient.sendMessage({
        sessionId,
        threadId,
        content: messageContent,
        agentId: selectedAgent,
        userWallet: publicKey?.toString(),
      });

      // ✅ Check for HTTP 402 Payment Required (x402 protocol!)
      if (response.paymentRequired) {
        console.log('💰 HTTP 402 Payment Required detected!');
        console.log('Payment details:', response.paymentRequired);
        
        // Add agent's payment request message to chat (user-friendly version)
        const agentPaymentMessage: Message = {
          id: Date.now().toString(),
          senderId: selectedAgent,
          sender: formatAgentName(selectedAgent),
          content: `I can help you with that. My fee for ${response.paymentRequired.service_type?.replace('_', ' ')} is ${response.paymentRequired.amount_sol} SOL. Please approve the payment in your wallet to proceed.`,
          timestamp: new Date(),
          isAgent: true,
          mentions: ['sbf'],
          isIntermediary: false
        };
        setMessages(prev => [...prev, agentPaymentMessage]);
        
        // Show toast for payment request
        showToast(`Payment Required: ${response.paymentRequired.amount_sol} SOL for ${response.paymentRequired.service_type?.replace('_', ' ')}`, 'info');
        
        // Trigger wallet payment directly (no modal!)
        await handlePayment(response.paymentRequired);
        return;
      }

      console.log('✅ Message sent successfully');
      
    } catch (err: any) {
      console.error('❌ Send message error:', err);
      
      // Check if this is a validation error that should remove the optimistic message
      const errorMessage = err.message || 'Failed to send message';
      const isValidationError = errorMessage.includes('Non-English characters') || 
                                errorMessage.includes('exceeds 100 characters') ||
                                errorMessage.includes('Invalid message content');
      
      if (isValidationError) {
        console.log('🗑️ Removing invalid optimistic message:', optimisticMessageId);
        shouldRemoveOptimisticMessage = true;
        
        // Remove the optimistic message immediately
        setMessages(prev => prev.filter(m => m.id !== optimisticMessageId));
      }
      
      showToast(errorMessage, 'error');
    } finally {
      setLoading(false);
      
      // Only poll if message was valid (no validation error)
      if (!shouldRemoveOptimisticMessage && !pollIntervalRef.current && threadId && sessionId) {
        // Immediately poll to get agent response, then restart regular polling
        pollMessages().then(() => {
          if (!pollIntervalRef.current) {
            startPolling();
          }
        });
      } else if (shouldRemoveOptimisticMessage) {
        // For validation errors, just restart regular polling without immediate poll
        if (!pollIntervalRef.current && threadId && sessionId) {
          startPolling();
        }
      }
    }
  };

  const handlePayment = async (paymentReq: PaymentRequest) => {
    if (!connected || !publicKey) {
      showToast('Please connect your Solana wallet to make payments.', 'error');
      return;
    }

    try {
      console.log('\n' + '='.repeat(80));
      console.log('💰 X402 PAYMENT FLOW (User → Backend → Facilitator → Agent)');
      console.log('='.repeat(80));
      console.log(`Amount: ${paymentReq.amount_sol} SOL`);
      console.log(`Recipient: ${paymentReq.recipient} (${paymentReq.recipient_address})`);
      console.log(`Reason: ${paymentReq.reason}`);

      setLoading(true);

      const { createPaymentPayload } = await import('@/lib/x402-payload-client');
      
      if (!signMessage) {
        throw new Error('Wallet does not support message signing');
      }

      if (!signTransaction) {
        throw new Error('Wallet does not support transaction signing');
      }

      // Step 1: Create and sign Solana USDC transaction
      console.log('\n🔐 Step 1: Creating Solana USDC transaction...');
      showToast('Please sign the transaction in your wallet...', 'info');

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
        new PublicKey(paymentReq.recipient_address),
        paymentReq.amount_usdc || paymentReq.amount_sol || 0,
        signTransaction
      );

      console.log('✅ Transaction signed');

      // Step 2: Submit to backend (which uses facilitator)
      console.log('\n📤 Step 2: Submitting to backend facilitator endpoint...');
      showToast('Submitting payment via x402 facilitator...', 'info');

      const response = await fetch('/api/x402/user-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signedTransaction: signedTx,
          paymentRequest: {
            payment_id: paymentReq.payment_id || signedTx.payment_id,
            recipient_address: paymentReq.recipient_address,
            amount_usdc: paymentReq.amount_usdc || paymentReq.amount_sol || 0,
            service_type: paymentReq.service_type || 'service',
            reason: paymentReq.reason,
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
      console.log('x402 Compliant: YES');
      console.log('Via Facilitator: YES');
      console.log('x402scan:', result.x402ScanUrl);
      console.log('='.repeat(80));
      console.log('');

      showToast('Payment submitted successfully! Sending transaction to agent...', 'success');

      // Step 3: Send transaction hash to agent (NOT the payload!)
      const paymentConfirmationMessage: Message = {
        id: `payment-${Date.now()}`,
        senderId: 'sbf',
        sender: 'You (SBF)',
        content: `✅ Payment completed via x402 facilitator!\n\nTransaction: ${result.transaction}\n\nPlease verify this transaction and deliver the service.\n\n🔍 View on:\n- x402scan: ${result.x402ScanUrl}\n- Solana Explorer: ${result.solanaExplorer}`,
        timestamp: new Date(),
        isAgent: false,
        mentions: [selectedAgent],
        isIntermediary: false
      };
      
      setMessages(prev => [...prev, paymentConfirmationMessage]);
      
      // Send transaction hash to agent for verification
      if (sessionId && threadId) {
        console.log('📤 Step 3: Sending transaction hash to agent for verification...');
        await apiClient.sendMessage({
          sessionId,
          threadId,
          content: `✅ Payment completed via x402 facilitator!\n\nTransaction: ${result.transaction}\n\nPlease verify this transaction and deliver the service.`,
          agentId: selectedAgent,
          userWallet: publicKey?.toString(),
        });
        console.log('✅ Transaction hash sent to agent - agent will verify and deliver service');
        
        await pollMessages();
      }

    } catch (err: any) {
      console.error('❌ Payment error:', err);
      if (err.message?.includes('User rejected')) {
        showToast('Payment cancelled by user', 'error');
      } else {
        showToast(err.message || 'Payment failed. Please try again.', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const getWelcomeMessage = (agent: string): string => {
    const messages: Record<string, string> = {
      'donald-trump': "I'm Donald Trump, and I make the BEST deals. What can I do for you?",
      'melania-trump': "Hello, I'm Melania. How can I help you today?",
      'eric-trump': "Hey, I'm Eric. Let's talk business!",
      'donjr-trump': "Don Jr here. What's up?",
      'barron-trump': "Hi, I'm Barron. What do you need?",
      'cz': "Build.",
    };
    return messages[agent] || `Hello! I'm ${agent}.`;
  };

  const formatAgentName = (agentId: string): string => {
    return agentId
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const getAgentColor = (agentId: string): string => {
    const colors: Record<string, string> = {
      'donald-trump': 'bg-gradient-to-r from-red-900 to-red-800 border-red-700',
      'melania-trump': 'bg-gradient-to-r from-pink-900 to-pink-800 border-pink-700',
      'eric-trump': 'bg-gradient-to-r from-blue-900 to-blue-800 border-blue-700',
      'donjr-trump': 'bg-gradient-to-r from-orange-900 to-orange-800 border-orange-700',
      'barron-trump': 'bg-gradient-to-r from-purple-900 to-purple-800 border-purple-700',
      'cz': 'bg-gradient-to-r from-yellow-900 to-yellow-800 border-yellow-700',
    };
    return colors[agentId] || 'bg-gray-800 border-gray-700';
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

      <div className="flex w-full max-h-[400px] border-[3px] border-white/30 rounded-xl bg-black/80 backdrop-blur-sm relative mt-20 pixel-art"
        style={{
          boxShadow: '0 0 20px rgba(102, 182, 128, 0.3), inset 0 0 30px rgba(0, 0, 0, 0.5)'
        }}
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
                        💬 {formatAgentName(message.senderId)} → {mentionedAgent ? formatAgentName(mentionedAgent) : 'Agent'}
                      </span>
                    </div>
                    <div className="text-gray-300 font-pixel text-[15px] pl-2 whitespace-pre-wrap break-words leading-relaxed">
                      {stripWalletPrefix(message.content)}
                    </div>
                    <div className="font-pixel text-[12px] text-gray-500 mt-1 pl-2 opacity-50">
                      {message.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              );
            }
            
            // Regular user/agent messages
            const cleanContent = stripWalletPrefix(message.content);
            const mainContent = stripScoreUpdate(cleanContent);
            const scoreJson = cleanContent.match(/\s*(\{\"type\":\s*\"score_update\"[^\}]*\})\s*$/);
            
            return (
              <div
                key={message.id}
                className={`flex ${message.isAgent ? 'justify-start' : 'justify-end'}`}
              >
                <div
                  className={`max-w-[80%] p-3 rounded border ${
                    message.isAgent
                      ? 'bg-gray-800/80 text-white border-white/20'
                      : 'bg-[#66b680]/80 text-white border-[#66b680]'
                  }`}
                >
                  <div className="font-pixel text-[14px] mb-1 opacity-70">{message.sender}</div>
                  <div className="font-pixel text-[15px] whitespace-pre-wrap break-words leading-relaxed">
                    {mainContent}
                  </div>
                  {/* Development: Show score JSON in smaller font */}
                  {process.env.NODE_ENV === 'development' && scoreJson && (
                    <div className="mt-2 pt-2 border-t border-gray-600/30">
                      <div className="text-xs opacity-50 mb-1">🔧 Dev: Score Update</div>
                      <pre className="text-[15px] opacity-60 whitespace-pre-wrap break-all font-mono">
                        {scoreJson[1]}
                      </pre>
                    </div>
                  )}
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
            💳 Connect wallet for payments
          </div>
        )}
        
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && !loading && sendUserMessage()}
            placeholder={`Message...`}
            disabled={loading || !sessionId || !threadId}
            className="flex-1 bg-black/50 border-2 border-white/20 rounded px-3 py-2 text-white font-pixel text-[15px] placeholder-gray-500 focus:outline-none focus:border-[#66b680] disabled:opacity-50"
          />
          <button
            onClick={sendUserMessage}
            disabled={loading || !input.trim() || !sessionId || !threadId}
            className="bg-[#66b680] hover:bg-[#7ac694] text-white font-pixel text-[15px] py-2 px-4 border-2 border-[#4a8c60] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 pixel-art"
            style={{
              boxShadow: '0 3px 0 #3a6c48',
              textShadow: '1px 1px 0 #3a6c48'
            }}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
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
