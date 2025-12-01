'use client';

import { useState, useEffect, useRef, memo, useCallback, useMemo } from'react';
import { useWallet, useConnection } from'@solana/wallet-adapter-react';
import { Send, Loader2 } from'lucide-react';
import { PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from'@solana/web3.js';
import { apiClient, PaymentRequest } from'@/lib/api-client';
import { Toast, ToastContainer, ToastType } from'./Toast';
import ReactMarkdown from'react-markdown';
import remarkGfm from'remark-gfm';
import { USER_SENDER_ID, USER_SENDER_DISPLAY_NAME } from'@/lib/constants';

interface Message {
  id: string;
  sender: string;
  senderId: string;  // Original agent ID (e.g.,"trump-donald")
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

// Debug flag for SSE logging
const DEBUG_SSE = process.env.NODE_ENV === 'development';

// Memoized message component to prevent unnecessary re-renders
const MessageItem = memo(({ 
  message, 
  formatAgentName, 
  stripDebugMarkers 
}: { 
  message: Message; 
  formatAgentName: (agentId: string) => string;
  stripDebugMarkers: (content: string) => string;
}) => {
  // Render intermediary messages differently
  if (message.isIntermediary) {
    // Filter out wallet addresses from mentions
    const mentionedAgent = message.mentions?.find(m => !m.match(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/));
    return (
      <div className="mx-4 my-1">
        <div className="bg-gray-800/50 border-l-2 border-yellow-500 rounded p-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-yellow-400 font-pixel text-[14px]">
              💬 {formatAgentName(message.senderId)} → {mentionedAgent ? formatAgentName(mentionedAgent) :'Agent'}
            </span>
          </div>
          <div className="text-gray-300 font-pixel text-[15px] pl-2 break-words leading-relaxed markdown-content">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                strong: ({children}) => <span className="font-bold text-yellow-300">{children}</span>,
                em: ({children}) => <span className="italic opacity-90">{children}</span>,
                h1: ({children}) => <h1 className="text-[17px] font-bold my-2 text-yellow-300">{children}</h1>,
                h2: ({children}) => <h2 className="text-[16px] font-bold my-1 text-yellow-300">{children}</h2>,
                h3: ({children}) => <h3 className="text-[15px] font-bold my-1">{children}</h3>,
                ol: ({children}) => <ol className="list-decimal ml-5 my-2 space-y-1">{children}</ol>,
                ul: ({children}) => <ul className="list-disc ml-5 my-2 space-y-1">{children}</ul>,
                li: ({children}) => <li className="ml-1">{children}</li>,
                p: ({children}) => <p className="my-1">{children}</p>,
                a: ({children, href}) => <a href={href} className="text-[#66b680] underline hover:text-[#7ac694]" target="_blank" rel="noopener noreferrer">{children}</a>,
                code: ({children}) => <code className="bg-black/40 px-1 py-0.5 rounded text-[#7ac694]">{children}</code>,
                pre: ({children}) => <pre className="bg-black/40 p-2 rounded my-2 overflow-x-auto">{children}</pre>,
              }}
            >
              {stripDebugMarkers(message.content)}
            </ReactMarkdown>
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
  
  // Check if this is a system loading message that needs a shaking emoji
  const isProcessingPayment = cleanContent.includes('Processing payment...');
  const isPrisonPhone = cleanContent.includes('The prison phone is transmitting');
  const hasShakingEmoji = isProcessingPayment || isPrisonPhone;
  
  // Extract emoji and text for shaking messages
  let emojiToShake = '';
  let textWithoutEmoji = cleanContent;
  
  if (hasShakingEmoji) {
    if (isProcessingPayment) {
      emojiToShake = '⏳';
      textWithoutEmoji = cleanContent.replace('⏳', '').trim();
    } else if (isPrisonPhone) {
      emojiToShake = '📞';
      textWithoutEmoji = cleanContent.replace('📞', '').trim();
    }
  }
  
  return (
    <div
      className={`flex ${message.isAgent ?'justify-start':'justify-end'}`}
    >
      <div
        className={`max-w-[95%] sm:max-w-[85%] md:max-w-[80%] p-2 sm:p-3 rounded border ${
          message.isAgent
            ?'bg-gray-800/80 text-white border-white/20'            :'bg-[#66b680]/80 text-white border-[#66b680]'        }`}
      >
        <div className="font-pixel text-[12px] sm:text-[14px] mb-1 opacity-70">{message.sender}</div>
        <div className="font-pixel text-[13px] sm:text-[15px] break-words leading-relaxed markdown-content">
          {hasShakingEmoji ? (
            <div className="my-1">
              <span className="emoji-shake">{emojiToShake}</span> {textWithoutEmoji}
            </div>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                strong: ({children}) => <span className="font-bold text-yellow-300">{children}</span>,
                em: ({children}) => <span className="italic opacity-90">{children}</span>,
                h1: ({children}) => <h1 className="text-[17px] font-bold my-2 text-yellow-300">{children}</h1>,
                h2: ({children}) => <h2 className="text-[16px] font-bold my-1 text-yellow-300">{children}</h2>,
                h3: ({children}) => <h3 className="text-[15px] font-bold my-1">{children}</h3>,
                ol: ({children}) => <ol className="list-decimal ml-5 my-2 space-y-1">{children}</ol>,
                ul: ({children}) => <ul className="list-disc ml-5 my-2 space-y-1">{children}</ul>,
                li: ({children}) => <li className="ml-1">{children}</li>,
                p: ({children}) => <p className="my-1">{children}</p>,
                a: ({children, href}) => <a href={href} className="text-[#66b680] underline hover:text-[#7ac694]" target="_blank" rel="noopener noreferrer">{children}</a>,
                code: ({children}) => <code className="bg-black/40 px-1 py-0.5 rounded text-[#7ac694]">{children}</code>,
                pre: ({children}) => <pre className="bg-black/40 p-2 rounded my-2 overflow-x-auto">{children}</pre>,
              }}
            >
              {cleanContent}
            </ReactMarkdown>
          )}
        </div>
        <div className="font-pixel text-[10px] sm:text-[12px] opacity-50 mt-1">
          {message.timestamp.toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
});

MessageItem.displayName = 'MessageItem';

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
  const [shouldPoll, setShouldPoll] = useState(false); // Control whether to actively poll for messages
  const [sseReconnectTrigger, setSseReconnectTrigger] = useState(0); // Force SSE reconnection
  const lastReconnectTimeRef = useRef<number>(0); // Prevent rapid reconnections
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const autoStopTimerRef = useRef<NodeJS.Timeout | null>(null); // Timer to auto-stop polling
  const sessionInitializedRef = useRef(false);
  const previousWalletRef = useRef<string | null>(null); // Track wallet changes for cache clearing
  const previousMessageCountRef = useRef<number>(0); // Track message count to detect new messages
  const loadingMessageIdRef = useRef<string | null>(null); // Track loading message to remove when agent responds
  const phoneDialRef = useRef<HTMLAudioElement | null>(null); // Phone sound for payment confirmation
  const lastUserMessageRef = useRef<string | null>(null); // Store the last user message for premium service payments
  const consecutiveEmptyPollsRef = useRef<number>(0); // Track empty polls to auto-stop interval polling
  const seenMessageIdsRef = useRef<Set<string>>(new Set()); // Global deduplication across all handlers
  
  // Score tracking state
  const [currentScore, setCurrentScore] = useState(0);
  const [scoreHistory, setScoreHistory] = useState<ScoreEntry[]>([]);
  const [userRank, setUserRank] = useState<number | null>(null);
  const lastScoreFetchRef = useRef<number>(0); // Track last fetched score to detect changes
  const isFetchingScoreRef = useRef<boolean>(false); // Prevent concurrent score fetches
  const processedMessageIdsRef = useRef<Set<string>>(new Set()); // Track processed messages to prevent duplicate toasts

  // Toast helper function
  const showToast = useCallback((message: string, type: ToastType ='info') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  // Helper to check if conversation has recent activity
  const hasRecentActivity = (msgs: Message[]): boolean => {
    if (msgs.length === 0) return false;
    const lastMessage = msgs[msgs.length - 1];
    const timeSinceLastMessage = Date.now() - lastMessage.timestamp.getTime();
    // Consider "recent" as last 2 minutes (120 seconds)
    const isRecent = timeSinceLastMessage < 120000;
    if (isRecent) {
      console.log(`[Polling] Recent activity detected: last message ${Math.floor(timeSinceLastMessage / 1000)}s ago`);
    }
    return isRecent;
  };

  // Extract score update from agent message
  const extractScoreUpdate = (content: string): ScoreUpdate | null => {
    try {
      // First try JSON format
      const jsonMatch = content.match(/\{"type":\s*"score_update"[^}]*(?:"feedback":\s*"[^"]*")?[^}]*\}/);
      if (jsonMatch) {
        let jsonStr = jsonMatch[0];
        
        // Fix common JSON encoding issues from LLM responses:
        jsonStr = jsonStr.replace(/\\u([0-9a-fA-F]{4})([0-9]{1,3})/g, (match, hex, extra) => {
          try {
            const codePoint = parseInt(hex, 16);
            if (codePoint >= 0xD800 && codePoint <= 0xDBFF && extra) {
              const fullCodePoint = ((codePoint - 0xD800) * 0x400) + parseInt(extra, 16) + 0x10000;
              return String.fromCodePoint(fullCodePoint);
            }
            return String.fromCharCode(codePoint) + extra;
          } catch {
            return match;
          }
        });
        
        const parsed = JSON.parse(jsonStr);
        if (parsed.type ==='score_update') {
          return parsed;
        }
      }
      
      // Try text format: "Score Update: \n- Current Score: X\n- Reason: Y"
      const textMatch = content.match(/Score Update:\s*\n-\s*Current Score:\s*([\d.]+)\s*\n-\s*Reason:\s*([^\n]+)/i);
      if (textMatch) {
        const currentScore = parseFloat(textMatch[1]);
        const reason = textMatch[2].trim();
        
        // We don't have the previous score, so we can't calculate delta
        // We'll need to fetch it or infer from context
        return {
          type: 'score_update',
          current_score: currentScore,
          delta: 0, // Will be calculated later
          reason: reason,
          category: 'unknown' // Category not available in text format
        };
      }
    } catch (e) {
      console.error('Failed to parse score update:', e);
    }
    return null;
  };

  // Strip all debug/internal markers from message content
  const stripDebugMarkers = (content: string): string => {
    return content
      // Remove USER_WALLET prefix (used for internal routing only)
      .replace(/\[USER_WALLET:[1-9A-HJ-NP-Za-km-z]{32,44}]\s*/g, '')
      // Remove PREMIUM_SERVICE_PAYMENT_COMPLETED marker (with or without transaction info)
      .replace(/\[PREMIUM_SERVICE_PAYMENT_COMPLETED(?::\s*[^\]]+)?\]\s*/g, '')
      // Remove score_update markers (both JSON and bracket format)
      .replace(/\[score_update:\s*[^\]]+\]\s*/gi, '')
      .replace(/\s*\{\"type\":\s*\"score_update\"[^\}]*\}\s*$/g, '')
      // Remove multi-line Score Update section
      .replace(/\n{1,2}Score Update:\s*\n-\s*Current Score:.*?\n-\s*Reason:.*?(?=\n\n|\n[A-Z]|$)/gs, '')
      // Remove debug scoring information lines (with optional double newlines)
      .replace(/\n{1,2}Current Score:.*?(?=\n|$)/gs, '')
      .replace(/\n{1,2}Pro Tip:.*?(?=\n|$)/gs, '')
      .replace(/\n{1,2}Feedback:.*?(?=\n|$)/gs, '')
      // Remove "Your (current) score is (now)..." feedback sentences and paragraphs
      .replace(/\n*Your (?:current )?score is (?:now )?[\d.]+[,.]?\s*[^\n]*(?:\n(?![A-Z])[^\n]*)*\./gs, '')
      // Remove standalone sentences about score/points at end of paragraphs
      .replace(/\s+Your (?:current )?score is (?:now )?[\d.]+[,.]?\s*[^\n.]*\./g, '')
      // Remove @mentions at the start of messages (e.g., "@sbf " or "@trump-donald ")
      .replace(/^@[a-z0-9-]+\s+/i, '')
      .trim();
  };

  // Check if a payment has been completed by looking for payment metadata
  const isPaymentCompleted = (paymentId: string | undefined, allMessages: any[]): boolean => {
    if (!paymentId) return false;
    
    // First check structured metadata (preferred, server-authoritative)
    for (const msg of allMessages) {
      if (msg.metadata?.paymentId === paymentId && msg.metadata?.paymentCompleted === true) {
        console.log(`[Payment Check] Found completed payment in metadata: ${paymentId}`);
        return true;
      }
    }
    
    // Fallback: check content markers for backward compatibility with existing messages
    for (const msg of allMessages) {
      if (msg.content?.includes('[PREMIUM_SERVICE_PAYMENT_COMPLETED') && msg.content?.includes(paymentId)) {
        console.log(`[Payment Check] Found completion marker in content for payment_id: ${paymentId}`);
        return true;
      }
    }
    
    return false;
  };

  // Extract x402 payment request from message content
  const extractPaymentRequest = (content: string): { request: PaymentRequest; cleanMessage: string } | null => {
    const match = content.match(/<x402_payment_request>([\s\S]*?)<\/x402_payment_request>/);
    if (match) {
      try {
        const jsonStr = match[1].trim();
        const parsed = JSON.parse(jsonStr);
        
        // Extract service_type - try multiple sources
        let service_type = parsed.service_type || parsed.metadata?.service || 'premium_service';
        
        // Fallback: extract from payment_id if missing
        // payment_id format: wht-{agent_normalized}-{service_type}-{timestamp}
        //   OR for connection_intro: wht-{agent_normalized}-{service_type}-{target_normalized}-{timestamp}
        // Note: agent names use underscores in payment_id (trump_donald, not trump-donald)
        // This makes parsing unambiguous since we use "-" as delimiter
        if (service_type === 'premium_service' && parsed.payment_id) {
          // Split on "-" and extract service_type (always 3rd element, index 2)
          // Example: wht-trump_donald-strategy_advice-1764590430
          // Parts: ["wht", "trump_donald", "strategy_advice", "1764590430"]
          // Or: wht-trump_donald-connection_intro-trump_barron-1764590430
          // Parts: ["wht", "trump_donald", "connection_intro", "trump_barron", "1764590430"]
          const parts = parsed.payment_id.split('-');
          if (parts.length >= 4 && parts[0] === 'wht') {
            service_type = parts[2];
            console.log(`[Payment Request] Extracted service_type from payment_id: ${service_type}`);
          }
        }
        
        // Convert to PaymentRequest format expected by PaymentModal
        const paymentRequest: PaymentRequest = {
          type: 'x402_payment_required',
          http_status: 402,
          recipient: parsed.recipient?.id || 'treasury',
          recipient_address: parsed.recipient_address || parsed.recipient?.address,
          amount_sol: 0,
          amount_usdc: parsed.amount_usdc || parseFloat(parsed.amount?.value || '0') / 1_000_000,
          service_type: service_type,
          reason: parsed.reason || 'Premium service',
          timestamp: parsed.timestamp || Date.now(),
          payment_id: parsed.payment_id,
          blockchain: 'solana',
          network: 'mainnet-beta',
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
            const reason = data.scoreHistory?.[0]?.reason || 'Score updated';
            
            setScoreHistory(prev => [...prev, {
              delta: delta,
              reason: reason,
              timestamp: new Date(),
              currentScore: newScore
            }]);
            
            // Show toast for score change with reason
            const deltaText = delta > 0 ?`+${delta.toFixed(1)}`: delta.toFixed(1);
            showToast(`${deltaText} points: ${reason}`, delta > 0 ?'success':'error');
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

  // Initialize phone dial audio
  useEffect(() => {
    if (typeof window !== 'undefined') {
      phoneDialRef.current = new Audio('/assets/Phone Dial and Ring Sound.mp4');
      phoneDialRef.current.volume = 0.6;
    }

    return () => {
      // Cleanup audio on unmount
      if (phoneDialRef.current) {
        phoneDialRef.current.pause();
        phoneDialRef.current = null;
      }
    };
  }, []);

  // Initialize session (runs when wallet connects or changes)
  useEffect(() => {
    if (!sessionId && !sessionInitializedRef.current && publicKey) {
      sessionInitializedRef.current = true;
      initializeSession();
    }
  }, [sessionId, publicKey]);

  // Create thread when agent selected
  useEffect(() => {
    if (selectedAgent && sessionId && publicKey) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      setPolling(false);
      
      // CRITICAL: Clear ALL state when switching agents
      // This prevents stale payment requests and duplicate messages across agents
      processedMessageIdsRef.current.clear();
      seenMessageIdsRef.current.clear();  // ← Clear message dedup tracker
      lastUserMessageRef.current = null;
      console.log('[Agent Switch] Cleared all state (payment IDs, seen message IDs, last message) for fresh agent session');
      
      // Check if we already have a threadId for this agent
      if (threadId) {
        // Thread already exists, ALWAYS fetch from server (no cache to avoid race conditions)
        console.log('[Thread Load] Fetching conversation history from server...');
        
        // CRITICAL: Disable polling during initial load to prevent race condition
        // SSE might deliver same messages before API fetch completes → duplicates
        setShouldPoll(false);
        
        // Show loading state
        setLoading(true);
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
        
        // Fetch message history from server (with wallet auth)
        apiClient.getMessages(sessionId, threadId, publicKey?.toString())
          .then(coralMessages => {
            if (coralMessages.length > 0) {
              console.log(`[Thread Load] Loaded ${coralMessages.length} messages from server`);
              
              // CRITICAL: Mark ALL message IDs as seen IMMEDIATELY to prevent race with SSE/polling
              // This must happen BEFORE any formatting or state updates
              coralMessages.forEach((m: any) => {
                const id = m.id || `msg-${m.timestamp}`;
                seenMessageIdsRef.current.add(id);
              });
              console.log(`[Thread Load] Marked ${coralMessages.length} message IDs as seen to prevent duplicates`);
              
              const formattedMessages = coralMessages.map((m: any) => {
                const isFromUser = m.senderId === USER_SENDER_ID;
                
                // Clean payment request markers from agent messages
                let content = m.content;
                if (m.content?.includes('<x402_payment_request>') && !isFromUser) {
                  const extracted = extractPaymentRequest(m.content);
                  if (extracted) {
                    content = extracted.cleanMessage;
                  }
                }
                
                return {
                  id: m.id || `msg-${m.timestamp}`,
                  senderId: m.senderId,
                  sender: formatAgentName(m.senderId),
                  content: stripDebugMarkers(content),
                  timestamp: new Date(m.timestamp),
                  isAgent: m.senderId !== USER_SENDER_ID,
                  mentions: m.mentions || [],
                  isIntermediary: m.isIntermediary || false
                };
              });
              
              setMessages(formattedMessages);
            }
            setLoading(false);
            
            // DON'T re-enable polling for existing conversations
            // Polling will be enabled when user sends a message (waiting for reply)
            console.log('[Thread Load] Initial load complete, polling will start when user sends message');
          })
          .catch(error => {
            console.error('[Thread Load] Error fetching conversation history:', error);
            setLoading(false);
            // Keep welcome message on error
            // Polling will be enabled when user sends a message
          });
      } else {
        // No thread yet, create a new one
        setMessages([]);
        initializeThread();
      }
    }
  }, [selectedAgent, sessionId, publicKey, threadId]);

  // Replace polling with SSE
  useEffect(() => {
    if (!threadId || !sessionId || !shouldPoll) {
      console.log('[SSE] Skipping - missing requirements or polling disabled');
      return;
    }
    
    let reconnectTimer: NodeJS.Timeout | null = null;
    let fallbackTimer: NodeJS.Timeout | null = null;
    let isCancelled = false;
    
    const createConnection = () => {
      if (isCancelled) return;
      
      console.log('[SSE] Creating new connection (trigger:', sseReconnectTrigger, ')');
      const eventSource = new EventSource(
        `/api/chat/stream?sessionId=${sessionId}&threadId=${threadId}`
      );
      eventSourceRef.current = eventSource;
      setupEventSource(eventSource);
      
      // SAFETY NET: If SSE doesn't connect within 5 seconds, start interval polling
      fallbackTimer = setTimeout(() => {
        if (!eventSourceRef.current || eventSourceRef.current.readyState !== EventSource.OPEN) {
          console.log('[SSE] Connection timeout - starting interval polling as fallback');
          if (!pollIntervalRef.current) {
            consecutiveEmptyPollsRef.current = 0;
            pollIntervalRef.current = setInterval(pollMessages, 1000);
          }
        }
      }, 5000);
    };
    
    // If connection exists, close it and wait before reconnecting
    if (eventSourceRef.current) {
      console.log('[SSE] Closing existing connection before reconnect');
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      
      // Wait 1 second for server to cleanup (increased from 500ms)
      reconnectTimer = setTimeout(createConnection, 1000);
    } else {
      // No existing connection, create immediately
      createConnection();
    }
    
    // Cleanup function
    return () => {
      isCancelled = true;
      
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
      }
      
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      
      if (autoStopTimerRef.current) {
        clearTimeout(autoStopTimerRef.current);
        autoStopTimerRef.current = null;
      }
    };
    
    function setupEventSource(eventSource: EventSource) {
      
      eventSource.onopen = () => {
        if (DEBUG_SSE) console.log('[SSE] Connected to message stream');
        setPolling(true);
        
        // Clear fallback timer since SSE connected successfully
        if (fallbackTimer) {
          clearTimeout(fallbackTimer);
          fallbackTimer = null;
        }
        
        // Stop interval polling since SSE is now active
        if (pollIntervalRef.current) {
          console.log('[SSE] Connected - stopping interval polling fallback');
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      };
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (DEBUG_SSE) console.log('[SSE Client] Received event:', data.type, data.messages?.length || 0, 'messages');
          
          if (data.type === 'messages' && data.messages) {
            // Track pending payment requests from agent messages
            let pendingPaymentRequest: { request: PaymentRequest; messageId: string } | null = null;
            
            // GLOBAL DEDUPLICATION: Filter messages we've already seen
            console.log('[SSE] Checking', data.messages.length, 'messages against', seenMessageIdsRef.current.size, 'seen IDs');
            const unseenMessages = data.messages.filter((m: any) => {
              const isSeen = seenMessageIdsRef.current.has(m.id);
              if (isSeen) {
                console.log('[SSE] ✋ Filtering out already seen:', m.id.substring(0, 16));
                return false; // Already processed
              }
              console.log('[SSE] ✅ New message:', m.id.substring(0, 16), m.senderId);
              return true;
            });
            
            if (unseenMessages.length === 0) {
              return; // No new messages
            }
            
            // Mark as seen
            unseenMessages.forEach((m: any) => seenMessageIdsRef.current.add(m.id));
            
            const newMessages: Message[] = unseenMessages.map((m: any) => {
              const isFromUser = m.senderId === USER_SENDER_ID;
              const mentionsUser = m.mentions?.includes(USER_SENDER_ID);
              const isIntermediary = !isFromUser && !mentionsUser;
              
              // Check for payment request in agent messages and clean content
              let content = m.content;
              if (m.content?.includes('<x402_payment_request>') && !isFromUser) {
                const extracted = extractPaymentRequest(m.content);
                if (extracted) {
                  content = extracted.cleanMessage;
                  
                  // Check if this is a new message we haven't processed yet
                  const alreadyProcessed = processedMessageIdsRef.current.has(m.id);
                  const paymentAlreadyCompleted = isPaymentCompleted(extracted.request.payment_id, data.messages);
                  
                  if (!alreadyProcessed && !paymentAlreadyCompleted && publicKey && sessionId && threadId) {
                    pendingPaymentRequest = { 
                      request: extracted.request, 
                      messageId: m.id 
                    };
                    console.log('[SSE] Detected new payment request:', extracted.request);
                  } else if (paymentAlreadyCompleted) {
                    console.log('[SSE] Skipping payment request - already completed:', extracted.request.payment_id);
                    // Mark as processed to prevent future checks
                    processedMessageIdsRef.current.add(m.id);
                  }
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
            
            console.log('[SSE] Processing', newMessages.length, 'new messages');
            
            setMessages(prev => {
              const existingIds = new Set(prev.map(m => m.id));
              const uniqueNew = newMessages.filter(m => !existingIds.has(m.id));
              
              // Replace optimistic messages IN-PLACE to avoid reordering
              const updated = prev.map(prevMsg => {
                if (prevMsg.id.startsWith('optimistic-')) {
                  const serverVersion = newMessages.find(serverMsg => 
                    serverMsg.senderId === USER_SENDER_ID &&
                    stripDebugMarkers(serverMsg.content).trim() === stripDebugMarkers(prevMsg.content).trim()
                  );
                  
                  if (serverVersion) {
                    // Replace in-place, preserving timestamp to maintain position
                    return {
                      ...serverVersion,
                      timestamp: prevMsg.timestamp
                    };
                  }
                }
                return prevMsg;
              });
              
              // Filter out server versions that were used for replacement
              const replacedServerIds = new Set<string>();
              prev.forEach(prevMsg => {
                if (prevMsg.id.startsWith('optimistic-')) {
                  const serverVersion = newMessages.find(serverMsg => 
                    serverMsg.senderId === USER_SENDER_ID &&
                    stripDebugMarkers(serverMsg.content).trim() === stripDebugMarkers(prevMsg.content).trim()
                  );
                  if (serverVersion) {
                    replacedServerIds.add(serverVersion.id);
                  }
                }
              });
              
              const trulyNew = uniqueNew.filter(m => !replacedServerIds.has(m.id));
              
              // Merge with the new messages
              const merged = [...updated, ...trulyNew];
              
              // SMART CLEANUP: Only remove loading message if we received a NEW agent response
              // Check if there are any truly new agent messages (not system, not loading)
              const newAgentMessages = trulyNew.filter(m => 
                m.isAgent && 
                m.senderId !== 'system' && 
                !m.id.startsWith('loading-')
              );
              
              let finalMessages = merged;
              if (newAgentMessages.length > 0) {
                // We got a NEW agent response, so remove the loading message
                if (DEBUG_SSE) {
                  console.log('[SSE] NEW agent response detected, removing system messages');
                  console.log('[SSE] loadingMessageIdRef.current:', loadingMessageIdRef.current);
                }
                finalMessages = merged.filter(m => m.senderId !== 'system');
                
                // Clear the loading ref and state
                loadingMessageIdRef.current = null;
                setLoading(false);
              }
              
              return finalMessages;
            });
            
            // Trigger payment flow if we detected a payment request
            // Now we can use finalMessages directly since it was calculated synchronously
            if (pendingPaymentRequest && publicKey && sessionId && threadId) {
              const { request, messageId }: { request: PaymentRequest; messageId: string } = pendingPaymentRequest;
              
              console.log(`[SSE] Triggering payment flow for message ${messageId}`);
              
              // Mark this message as processed
              processedMessageIdsRef.current.add(messageId);
              
              const amount = request.amount_usdc || request.amount_sol || 0;
              const currency = request.amount_usdc ? 'USDC' : 'SOL';
              const service = request.service_type?.replace(/_/g, ' ') || 'premium service';
              
              console.log(`[SSE Premium Service] Payment request detected: ${amount} ${currency} for ${service}`);
              
              // Use the stored user message from the ref
              const originalMessageContent = lastUserMessageRef.current || `Premium service: ${service}`;
              
              console.log('[SSE] Using original message content from ref:', originalMessageContent);
              
              // Trigger payment flow
              setLoading(true);
              handlePayment(
                request,
                originalMessageContent,  // ✅ FIXED - Pass actual user message
                sessionId,
                threadId,
                selectedAgent
              ).catch((error: any) => {
                console.error('[SSE Premium Service] Payment error:', error);
                showToast(error.message || 'Payment failed', 'error');
                setLoading(false); // Only clear loading on error
              });
              // Note: loading stays true until agent response arrives via SSE
            }
            
            // Auto-stop polling after receiving final agent responses
            // Check for final agent messages (not intermediary, not system)
            const finalAgentMessages = data.messages.filter((m: any) => {
              const isFromUser = m.senderId === USER_SENDER_ID;
              const mentionsUser = m.mentions?.includes(USER_SENDER_ID);
              const isIntermediary = !isFromUser && !mentionsUser;
              return !isFromUser && !isIntermediary && m.senderId !== 'system';
            });
            
            if (finalAgentMessages.length > 0) {
              console.log(`[SSE] Received ${finalAgentMessages.length} final agent message(s), scheduling auto-stop`);
              
              // Clear any existing timer
              if (autoStopTimerRef.current) {
                clearTimeout(autoStopTimerRef.current);
              }
              
              // Set timer to stop polling after 3 minutes (covers 105s agent timeout + multi-agent chains)
              autoStopTimerRef.current = setTimeout(() => {
                console.log('[SSE] Auto-stopping polling - 3 minutes elapsed since last agent response');
                setShouldPoll(false);
                if (eventSourceRef.current) {
                  eventSourceRef.current.close();
                  eventSourceRef.current = null;
                  setPolling(false);
                }
              }, 180000); // 3 minutes = 180000ms
            }
          }
        } catch (e) {
          console.error('[SSE] Failed to parse message:', e);
        }
      };
      
      eventSource.onerror = (error) => {
        console.error('[SSE] Connection error, falling back to interval polling');
        eventSource.close();
        eventSourceRef.current = null;
        setPolling(false);
        
        if (!pollIntervalRef.current) {
          consecutiveEmptyPollsRef.current = 0; // Reset counter for new polling session
          pollIntervalRef.current = setInterval(pollMessages, 1000);
        }
      };
    }
  }, [threadId, sessionId, publicKey, selectedAgent, shouldPoll, sseReconnectTrigger]);

  // 🔄 Page Visibility API: Handle browser focus loss and regain
  // This ensures messages aren't missed when user switches tabs/apps
  useEffect(() => {
    if (!threadId || !sessionId) return;

    const handleVisibilityChange = async () => {
      if (!document.hidden) {
        // Page became visible again - user returned to tab
        console.log('[Visibility] Page became visible - forcing message poll');
        
        // Force immediate poll to catch any missed messages
        try {
          const coralMessages = await apiClient.getMessages(sessionId, threadId, publicKey?.toString());
          
          // CRITICAL: Mark ALL as seen IMMEDIATELY to prevent race with SSE/polling
          coralMessages.forEach((m: any) => seenMessageIdsRef.current.add(m.id));
          
          // Check for truly new messages by ID using functional setState to avoid stale closure
          setMessages(prev => {
            const existingIds = new Set(prev.map(m => m.id));
            const newCoralMessages = coralMessages.filter((m: any) => !existingIds.has(m.id));
            
            if (newCoralMessages.length === 0) {
              console.log('[Visibility] No new messages found');
              return prev; // No changes
            }
            
            console.log(`[Visibility] Found ${newCoralMessages.length} new message(s) - updating immediately`);
            
            // CRITICAL FIX: Actually update the messages instead of waiting for SSE
            const newMessages: Message[] = newCoralMessages.map((m: any) => {
              const isFromUser = m.senderId === USER_SENDER_ID;
              const mentionsUser = m.mentions?.includes(USER_SENDER_ID);
              const isIntermediary = !isFromUser && !mentionsUser;
              
              // Clean payment request markers from agent messages
              let content = m.content;
              if (m.content?.includes('<x402_payment_request>') && !isFromUser) {
                const extracted = extractPaymentRequest(m.content);
                if (extracted) {
                  content = extracted.cleanMessage;
                }
              }
              
              return {
                id: m.id,
                senderId: m.senderId,
                sender: isFromUser ? 'You (SBF)' : formatAgentName(m.senderId),
                content: stripDebugMarkers(content),
                timestamp: new Date(m.timestamp),
                isAgent: !isFromUser,
                mentions: m.mentions || [],
                isIntermediary
              };
            });
            
            // Build final messages
            const uniqueNew = newMessages.filter(m => !existingIds.has(m.id));
            
            // If we got new agent messages, remove loading message
            const newAgentMessages = uniqueNew.filter(m => 
              m.isAgent && 
              m.senderId !== 'system' && 
              !m.id.startsWith('loading-')
            );
            
            let finalMessages = [...prev, ...uniqueNew];
            if (newAgentMessages.length > 0) {
              console.log('[Visibility] Received agent response, removing loading message');
              finalMessages = finalMessages.filter(m => m.senderId !== 'system');
              loadingMessageIdRef.current = null;
              setLoading(false);
            }
            
            console.log('[Visibility] Messages updated directly, skipping SSE reconnection');
            return finalMessages;
          });
        } catch (error) {
          console.error('[Visibility] Error polling for messages:', error);
        }
      } else {
        // Page became hidden - user switched away
        console.log('[Visibility] Page hidden - connection may be throttled');
      }
    };

    // Add visibility change listener
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [threadId, sessionId, shouldPoll, messages.length]);

  // **FINAL DEDUPLICATION SAFETY NET**: Ensure no duplicate message IDs ever reach the render
  // This catches any edge cases from race conditions between SSE, polling, visibility handlers, etc.
  const dedupedMessages = useMemo(() => {
    const seen = new Set<string>();
    const unique: Message[] = [];
    
    for (const msg of messages) {
      if (!seen.has(msg.id)) {
        seen.add(msg.id);
        unique.push(msg);
      } else {
        console.warn('[FINAL DEDUP] Caught duplicate message at render:', msg.id.substring(0, 16), '- preventing UI duplicate');
      }
    }
    
    return unique;
  }, [messages]);

  // Auto-scroll only when new messages are added
  useEffect(() => {
    const currentMessageCount = dedupedMessages.length;
    
    // Only scroll if message count increased (new messages added)
    if (currentMessageCount > previousMessageCountRef.current) {
      // Use requestAnimationFrame to batch scroll operations and improve performance
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior:'smooth', block:'end'});
      });
    }
    
    // Update the previous count
    previousMessageCountRef.current = currentMessageCount;
  }, [dedupedMessages.length]); // Only depend on length, not the entire array

  // Fetch initial score when wallet connected
  useEffect(() => {
    if (publicKey) {
      const currentWallet = publicKey.toString();
      const previousWallet = previousWalletRef.current;
      
      // If wallet changed (not just initial connection), clear messages
      if (previousWallet && previousWallet !== currentWallet) {
        setMessages([]); // Clear displayed messages immediately
        
        // CRITICAL FIX: Reset session when wallet changes
        // The old session belongs to the previous wallet, so we need a new one
        setSessionId(null);
        sessionInitializedRef.current = false; // Allow re-initialization
        console.log('[Wallet Change] Wallet changed, session will be recreated for new wallet');
      }
      
      previousWalletRef.current = currentWallet;
      
      processedMessageIdsRef.current.clear(); // Clear processed messages on wallet change
      fetchCurrentScore();
    } else {
      // Wallet disconnected
      if (previousWalletRef.current) {
        previousWalletRef.current = null;
      }
      
      setCurrentScore(0);
      lastScoreFetchRef.current = 0;
      setMessages([]); // Clear messages
      setSessionId(null); // Clear session
      sessionInitializedRef.current = false; // Allow re-initialization
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
        
        // Calculate delta if not provided
        let delta = scoreUpdate.delta;
        if (delta === 0 && lastScoreFetchRef.current > 0) {
          delta = scoreUpdate.current_score - lastScoreFetchRef.current;
        }
        
        lastScoreFetchRef.current = scoreUpdate.current_score;
        setCurrentScore(scoreUpdate.current_score);
        setScoreHistory(prev => [...prev, {
          delta: delta,
          reason: scoreUpdate.reason,
          timestamp: new Date(),
          currentScore: scoreUpdate.current_score
        }]);
        
        const deltaText = delta > 0 ?`+${delta.toFixed(1)}`: delta.toFixed(1);
        showToast(`${deltaText} points: ${scoreUpdate.reason}`, delta > 0 ?'success':'error');
      } else {
        // If no embedded score, fetch from API (agents may have updated score via award_points without embedding it)
        
        // DON'T mark payment request messages as processed here - they need to trigger payment flow first
        const hasPaymentRequest = lastMessage.content.includes('<x402_payment_request>');
        if (!hasPaymentRequest) {
          // Mark as processed to prevent repeated API calls
          processedMessageIdsRef.current.add(lastMessage.id);
          
          // Fetch score from API since agent didn't embed it in message
          // (scoring-mandate.txt line 53 tells agents NOT to include score_update in messages)
          if (publicKey && !isFetchingScoreRef.current) {
            // Small delay to ensure backend has processed the score update
            setTimeout(() => {
              fetchCurrentScore();
            }, 1500); // 1.5 second delay to ensure agent has updated score via award_points
          }
        }
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
      const thread = await apiClient.createThread(sessionId, selectedAgent, publicKey?.toString());
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

  // Helper to trigger SSE reconnection with rate limiting
  const triggerSSEReconnection = () => {
    const now = Date.now();
    const timeSinceLastReconnect = now - lastReconnectTimeRef.current;
    
    // Prevent reconnections more frequent than once per 2 seconds
    if (timeSinceLastReconnect < 2000) {
      console.log('[SSE] Skipping reconnection - too soon since last attempt (', timeSinceLastReconnect, 'ms ago)');
      return;
    }
    
    console.log('[SSE] Triggering reconnection');
    lastReconnectTimeRef.current = now;
    setShouldPoll(true);
    setSseReconnectTrigger(prev => prev + 1);
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
      const coralMessages = await apiClient.getMessages(sessionId, threadId, publicKey?.toString());
      
      // CRITICAL: Mark ALL as seen IMMEDIATELY (before any processing) to prevent race with other polling/SSE
      coralMessages.forEach((m: any) => seenMessageIdsRef.current.add(m.id));
      
      // Track if we found a new payment request that needs to be processed
      let pendingPaymentRequest: { request: PaymentRequest; messageId: string } | null = null;
      
      const allMessages: Message[] = coralMessages
        .map((m: any) => {
          const isFromUser = m.senderId === USER_SENDER_ID;
          const mentionsUser = m.mentions?.includes(USER_SENDER_ID);
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
              const paymentAlreadyCompleted = isPaymentCompleted(extracted.request.payment_id, coralMessages);
              console.log('[Payment Detection] Already processed?', alreadyProcessed);
              console.log('[Payment Detection] Payment completed?', paymentAlreadyCompleted);
              
              if (!alreadyProcessed && !paymentAlreadyCompleted) {
                pendingPaymentRequest = { 
                  request: extracted.request, 
                  messageId: m.id 
                };
                console.log('[Payment Detection] Set pending payment request');
              } else if (paymentAlreadyCompleted) {
                console.log('[Payment Detection] Skipping payment request - already completed:', extracted.request.payment_id);
                // Mark as processed to prevent future checks
                processedMessageIdsRef.current.add(m.id);
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
      
      if (DEBUG_SSE) {
        console.log('Message IDs:', allMessages.map(m =>`${m.senderId}:${m.id.substring(0, 8)}`));
      }
      
      // Track initial message count to detect if we got new messages
      const initialMessageCount = messages.length;
      let hasNewMessages = false;
      
      // Use functional setState to get CURRENT state and avoid stale closure
      setMessages(prev => {
        // Check which messages are truly new (not in CURRENT state)
        // Note: All messages were already marked as seen to prevent race conditions with SSE
        const existingIds = new Set(prev.map(m => m.id));
        const newMessages = allMessages.filter(m => !existingIds.has(m.id));
        
        if (newMessages.length === 0) {
          console.log('[Polling] No new messages (all already in state)');
          return prev; // No changes
        }
        
        console.log('[Polling] Processing', newMessages.length, 'truly new messages');
        
        // STEP 2: Handle optimistic user messages (replace with server versions)
        const hasRealPaymentConfirmation = allMessages.some(m =>
          m.senderId === USER_SENDER_ID && m.content.includes('Payment sent! Transaction signature:')
        );
        
        let filteredPrev = hasRealPaymentConfirmation
          ? prev.filter(m => !m.id.startsWith('payment-'))
          : prev;
        
        // STEP 3: Replace optimistic messages with server versions
        const replacedOptimisticIds = new Set<string>();
        const updated = filteredPrev.map(prevMsg => {
          if (prevMsg.id.startsWith('optimistic-')) {
            const serverVersion = newMessages.find(serverMsg => 
              serverMsg.senderId === USER_SENDER_ID &&
              stripDebugMarkers(serverMsg.content).trim() === stripDebugMarkers(prevMsg.content).trim()
            );
            
            if (serverVersion) {
              replacedOptimisticIds.add(serverVersion.id);
              // Replace optimistic with server version, keeping optimistic timestamp
              return {
                ...serverVersion,
                timestamp: prevMsg.timestamp
              };
            }
          }
          return prevMsg;
        });
        
        // STEP 4: Add only truly new messages (not used for optimistic replacement)
        const trulyNew = newMessages.filter(m => !replacedOptimisticIds.has(m.id));
        
        console.log('[Dedup] Truly new (not optimistic replacements):', trulyNew.length);
        
        // Track if we got new messages (for auto-stop logic)
        hasNewMessages = trulyNew.length > 0;
        
        // STEP 5: Merge and sort
        const merged = [...updated, ...trulyNew];
        const sorted = merged.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        
        // STEP 6: FINAL safety deduplication by ID
        const seen = new Set<string>();
        const deduplicatedById = sorted.filter(msg => {
          if (seen.has(msg.id)) {
            console.log('[Dedup] ⚠️ FINAL DEDUP caught duplicate:', msg.id.substring(0, 12));
            return false;
          }
          seen.add(msg.id);
          return true;
        });
        
        // SMART CLEANUP: Only remove loading message if we received a NEW agent response
        // Check if there are any new agent messages (not in previous state)
        const previousIds = new Set(messages.map(m => m.id));
        const newAgentMessages = deduplicatedById.filter(m => 
          m.isAgent && 
          m.senderId !== 'system' && 
          !m.id.startsWith('loading-') &&
          !previousIds.has(m.id)
        );
        
        let finalMessages = deduplicatedById;
        if (newAgentMessages.length > 0) {
          // We got a NEW agent response, so remove ONLY loading messages (not error messages)
          if (DEBUG_SSE) {
            console.log('[Polling] NEW agent response detected, removing loading messages');
            console.log('[Polling] loadingMessageIdRef.current:', loadingMessageIdRef.current);
          }
          finalMessages = deduplicatedById.filter(m => 
            // Keep everything except:
            // 1. System loading messages (⏳)
            // 2. The specific loading message we're tracking
            !(m.senderId === 'system' && (
              m.id.startsWith('loading-') || 
              m.content.startsWith('⏳') ||
              m.id === loadingMessageIdRef.current
            ))
          );
          
          loadingMessageIdRef.current = null;
          setLoading(false);
        }
        
        return finalMessages;
      });

      // Auto-stop interval polling if no new messages for a while
      if (hasNewMessages) {
        consecutiveEmptyPollsRef.current = 0; // Reset counter on new messages
      } else {
        consecutiveEmptyPollsRef.current++;
        
        // Auto-stop interval polling after 60 consecutive empty polls (1 minute)
        if (consecutiveEmptyPollsRef.current >= 60 && pollIntervalRef.current) {
          console.log('[Polling] No new messages for 60 polls, stopping interval polling');
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      }
      
      // If we found a new payment request, trigger the payment flow
      if (DEBUG_SSE) {
        console.log('[Payment Flow] Checking for pending payment request...');
        console.log('[Payment Flow] pendingPaymentRequest:', pendingPaymentRequest);
      }
      
      if (pendingPaymentRequest && publicKey && sessionId && threadId) {
        const { request, messageId }: { request: PaymentRequest; messageId: string } = pendingPaymentRequest;
        
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
        
        // Use the stored user message from the ref
        const originalMessageContent = lastUserMessageRef.current || `Premium service: ${service}`;
        
        console.log('[Payment Flow] Using original message content from ref:', originalMessageContent);
        
        // Trigger payment flow (toast will be shown in handlePayment)
        setLoading(true);
        try {
          await handlePayment(
            request,
            originalMessageContent,  // ✅ FIXED - Pass actual user message
            sessionId,
            threadId,
            selectedAgent
          );
          // Note: loading stays true until agent response arrives via SSE/polling
        } catch (error: any) {
          console.error('[Premium Service] Payment error:', error);
          showToast(error.message || 'Payment failed', 'error');
          setLoading(false); // Only clear loading on error
        }
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
        setMessages([]);
        sessionInitializedRef.current = false;
        
        // Show user notification
        showToast('Server restarted. Reconnecting...', 'info');
        
        // Recreate session
        await initializeSession();
        
        return;
      }
      
      console.error('Poll error:', err);
    }
  };

  const sendUserMessage = async () => {
    if (!input.trim() || !sessionId || !threadId || !selectedAgent) return;

    // Capture input value before clearing it
    const messageContent =`@${selectedAgent} ${input}`;
    
    // Store the message content for potential premium service payments
    lastUserMessageRef.current = messageContent;
    
    // Clear input immediately but DON'T show message yet - wait to see if payment is required
    setInput('');
    setLoading(true);
    
    // CRITICAL: We just sent a message, so we MUST poll for the reply
    console.log('[Polling] Message sent - enabling SSE/polling to receive reply');
    
    // Try SSE first (preferred method)
    triggerSSEReconnection();
    
    // Safety net: If SSE doesn't connect within 3 seconds, start interval polling as fallback
    const pollFallbackTimer = setTimeout(() => {
      if (!eventSourceRef.current || eventSourceRef.current.readyState !== EventSource.OPEN) {
        if (!pollIntervalRef.current) {
          console.log('[Polling] SSE not connected after message send, starting interval polling fallback');
          consecutiveEmptyPollsRef.current = 0;
          pollIntervalRef.current = setInterval(pollMessages, 1000);
        }
      }
    }, 3000);

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
        
        // Trigger wallet payment directly (no modal!)
        // Toast will be shown in handlePayment
        try {
          await handlePayment(
            response.paymentRequired,
            messageContent,
            sessionId,
            threadId,
            selectedAgent
          );
        } catch (paymentError: any) {
          console.error('Payment error in sendUserMessage:', paymentError);
          showToast(paymentError.message || 'Payment failed', 'error');
          setLoading(false);
        }
        return;
      }

      // No payment required - show optimistic message now
      const userMessage: Message = {
        id:`optimistic-${Date.now()}`,
        senderId: USER_SENDER_ID,
        sender: USER_SENDER_DISPLAY_NAME,
        content: messageContent,
        timestamp: new Date(),
        isAgent: false,
        mentions: [selectedAgent],
        isIntermediary: false
      };

      setMessages(prev => {
        const updated = [...prev, userMessage];
        
        return updated;
      });
      
      // Keep loading true - will be set to false when agent responds via SSE/polling
      
      // SAFETY NET: Poll for messages after 5 seconds to catch any that SSE might have missed
      // This handles race conditions during SSE reconnection
      const currentThreadId = threadId;
      const currentSessionId = sessionId;
      const currentWallet = publicKey?.toString();
      setTimeout(async () => {
        if (currentSessionId && currentThreadId) {
          console.log('[Safety Net] Polling for any missed messages after 5s');
          try {
            const coralMessages = await apiClient.getMessages(currentSessionId, currentThreadId, currentWallet);
            
            // Use setMessages with prev to get current state
            setMessages(prev => {
              const currentMessageIds = new Set(prev.map(m => m.id));
              const missedMessages = coralMessages.filter(m => !currentMessageIds.has(m.id));
              
              if (missedMessages.length > 0) {
                console.warn(`[Safety Net] Found ${missedMessages.length} missed message(s)! Recovering...`);
                
                // Process missed messages same as SSE
                const recoveredMessages: Message[] = missedMessages.map(m => {
                  const isFromUser = m.senderId === USER_SENDER_ID;
                  
                  // Clean payment request markers from agent messages
                  let content = m.content;
                  if (m.content?.includes('<x402_payment_request>') && !isFromUser) {
                    const extracted = extractPaymentRequest(m.content);
                    if (extracted) {
                      content = extracted.cleanMessage;
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
                    isIntermediary: false
                  };
                });
                
                return [...prev, ...recoveredMessages];
              }
              
              return prev;
            });
          } catch (error) {
            console.error('[Safety Net] Failed to poll for missed messages:', error);
          }
        }
      }, 5000);
      
    } catch (err: any) {
      console.error('Send message error:', err);
      
      // Check if this is a payment processor error
      if (err.isPaymentProcessorError) {
        // Show the error as a message in the chat (prison phone style)
        const systemErrorMessage: Message = {
          id: `system-error-${Date.now()}`,
          senderId: 'system',
          sender: 'Prison Phone System',
          content: '📞 The prison payphone experienced technical difficulties processing your call. The payment system is temporarily unavailable. Please try again in a few moments.',
          timestamp: new Date(),
          isAgent: true,
          mentions: [USER_SENDER_ID],
          isIntermediary: false
        };
        
        setMessages(prev => [...prev, systemErrorMessage]);
        
        // Also show a toast for immediate feedback
        showToast('Payment system temporarily unavailable', 'error');
      } else {
        // Regular error - just show toast
        const errorMessage = err.message ||'Failed to send message';
        showToast(errorMessage,'error');
      }
      
      setLoading(false); // Only clear loading on error
    }
    // Note: loading stays true until agent response arrives via SSE/polling
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
      setLoading(false);
      return;
    }

    try {
      const amount = paymentReq.amount_usdc || paymentReq.amount_sol || 0.05;
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

        // Show single payment required toast
        const serviceName = isPremiumService 
          ? paymentReq.service_type?.replace(/_/g, ' ') 
          : 'contacting agent';
        showToast(`Payment Required: ${amount} ${currency} for ${serviceName}`,'info');

        const { createUSDCTransaction } = await import('@/lib/x402-payload-client');
        const { PublicKey } = await import('@solana/web3.js');

        let signedTx;
        try {
          // Use the payment_id from the payment request if available, otherwise generate one
          const paymentId = paymentReq.payment_id || `payment-${Date.now()}`;
          console.log('[Payment] Using payment_id:', paymentId);
          
          signedTx = await createUSDCTransaction(
            paymentId,
            publicKey,
            new PublicKey(paymentReq.recipient_address),
            amount,
            signTransaction
          );
        } catch (signError: any) {
          // Handle specific wallet extension errors
          if (signError.message?.includes('Extension context invalidated') || 
              signError.message?.includes('context invalidated')) {
            throw new Error('Wallet extension needs to be refreshed. Please reload the page and try again.');
          }
          // Re-throw other errors to be handled by outer catch
          throw signError;
        }

        console.log('[Payment] Transaction signed by user');
        
        // Enhanced logging for payment flow debugging
        console.log('[Payment Flow] Payment submitted successfully');
        console.log('[Payment Flow] Transaction:', signedTx.payment_id);
        console.log('[Payment Flow] Amount:', amount, 'USDC');
        console.log('[Payment Flow] Service:', paymentReq.service_type);
        console.log('[Payment Flow] Agent:', originalAgentId);
        
        // Add timestamp for debugging
        const paymentTimestamp = new Date().toISOString();
        console.log('[Payment Flow] Completion timestamp:', paymentTimestamp);

        // Build x402 payload to send to /api/chat/send
        // Include the original payment_id from the request to help backend match the service
        const x402Payload = {
          x402Version: 1,
          scheme: 'exact',
          network: 'solana',
          payload: {
            transaction: signedTx.transaction_base64
          },
          paymentId: signedTx.payment_id,  // This is from the payment request
          from: signedTx.from,
          to: signedTx.to,
          amount_usdc: amount,
          service_type: paymentReq.service_type,  // Include service type for backend marker
          payment_id: paymentReq.payment_id  // Also include original payment_id for better matching
        };

      // Show user's message and loading indicator together to avoid timing/ordering issues
      const userMessageTimestamp = new Date();
      
      // For premium services, show a payment confirmation message to user
      // This same content will be saved to database (avoiding duplicate original message)
      const displayContent = isPremiumService
        ? `Payment for premium service: ${paymentReq.service_type?.replace(/_/g, ' ')}`
        : originalMessageContent;
      
      const userMessage: Message = {
        id: `optimistic-${Date.now()}`,
        senderId: USER_SENDER_ID,
        sender: USER_SENDER_DISPLAY_NAME,
        content: displayContent,
        timestamp: userMessageTimestamp,
        isAgent: false,
        mentions: [originalAgentId],
        isIntermediary: false
      };

      // Show loading indicator (timestamp slightly after user message to ensure proper ordering)
      const loadingMessageId = `loading-${Date.now()}`;
      loadingMessageIdRef.current = loadingMessageId; // Store so we can remove it later
      const loadingMessage: Message = {
        id: loadingMessageId,
        senderId: 'system',
        sender: 'System',
        content: '⏳ Processing payment...',
        timestamp: new Date(userMessageTimestamp.getTime() + 1), // 1ms after user message
        isAgent: true,
        mentions: [],
        isIntermediary: false
      };

      // Add both messages in a single update to prevent race conditions
      setMessages(prev => [...prev, userMessage, loadingMessage]);

        // Send to /api/chat/send with X-PAYMENT header
        // The middleware will verify and settle the payment via CDP facilitator
        
        // Send the SAME content as what we're displaying to the user
        // For premium services: payment confirmation (original message already sent in step 1)
        // For message_fee: the actual message (first time sending)
      const messageContent = displayContent;
      
      // Log message being sent to agent for debugging
      console.log('[Payment Flow] Message to agent:', messageContent.substring(0, 200));
      console.log('[Payment Flow] Is premium service:', isPremiumService);

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
        
        // Handle transaction expiration with user-friendly message
        if (errorData.code === 'TRANSACTION_EXPIRED') {
          throw new Error('Payment processing took too long. Please try again.');
        }
        
        // Check if this is a payment processor error (503)
        if (retryResponse.status === 503 && errorData.retryable) {
          const error: any = new Error(errorData.error ||`Request failed: ${retryResponse.status}`);
          error.isPaymentProcessorError = true;
          error.details = errorData.details;
          error.retryable = errorData.retryable;
          throw error;
        }
        
        throw new Error(errorData.error ||`Request failed: ${retryResponse.status}`);
      }

      const retryResult = await retryResponse.json();

      console.log('[Payment] Payment verified and settled');
      console.log('[Payment] Message sent to agent, waiting for response...');

      showToast('Payment successful!','success');
      
      // Only clear the stored user message if this was a premium service payment
      // For regular message fees, keep it so premium service requests can use it
      if (isPremiumService) {
        lastUserMessageRef.current = null;
      }

      // Update loading message to "The prison phone is transmitting the message..." and play phone sound
      setMessages(prev => prev.map(m => 
        m.id === loadingMessageId 
          ? { ...m, content: '📞 The prison phone is transmitting the message...' }
          : m
      ));

      // Play phone dial sound
      if (phoneDialRef.current) {
        phoneDialRef.current.currentTime = 0; // Reset to start
        phoneDialRef.current.play().catch(err => {
          console.warn('Could not play phone sound:', err);
        });
      }

      // Update messages with agent response if provided (otherwise SSE will handle it)
      let receivedAgentResponse = false;
      
      if (retryResult.messages) {
        // Process agent messages
        const newAgentMessages = retryResult.messages
          .filter((m: any) => m.senderId !== USER_SENDER_ID)
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

        // Only remove loading message if we received actual agent messages
        if (newAgentMessages.length > 0) {
          console.log('[Payment] Received agent messages from backend, removing loading message');
          setMessages(prev => {
            const withoutLoading = prev.filter(m => m.id !== loadingMessageId);
            return [...withoutLoading, ...newAgentMessages];
          });
          
          loadingMessageIdRef.current = null; // Clear the ref
          setLoading(false); // Stop loading now that we have the response
          receivedAgentResponse = true;
        }
      }
      
      // CRITICAL: If we didn't get the agent response yet, we MUST poll for it
      if (!receivedAgentResponse) {
        console.log('[Payment] Waiting for agent response - enabling SSE/polling');
        
        // Try SSE first (preferred method)
        triggerSSEReconnection();
        
        // Safety net: If SSE doesn't connect within 3 seconds, start interval polling as fallback
        setTimeout(() => {
          if (!eventSourceRef.current || eventSourceRef.current.readyState !== EventSource.OPEN) {
            if (!pollIntervalRef.current) {
              console.log('[Payment] SSE not connected, starting interval polling fallback');
              consecutiveEmptyPollsRef.current = 0;
              pollIntervalRef.current = setInterval(pollMessages, 1000);
            }
          }
        }, 3000);
      }
      } else {
        // SOL payments (not currently supported for CDP facilitator)
        throw new Error('SOL payments not currently supported. Please use USDC.');
      }

    } catch (err: any) {
      // Enhanced error logging for payment flow
      console.error('[Payment Flow] Error:', err);
      console.error('[Payment Flow] Stack:', err.stack);
      console.error('[Payment Flow] Error details:', {
        message: err.message,
        name: err.name,
        cause: err.cause
      });
      
      // Log to backend for monitoring
      fetch('/api/log-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'payment_processing_error',
          message: err.message,
          stack: err.stack,
          context: {
            agent: originalAgentId,
            threadId: originalThreadId,
            serviceType: paymentReq.service_type,
            timestamp: new Date().toISOString(),
            amount: paymentReq.amount_usdc || paymentReq.amount_sol,
            currency: paymentReq.amount_usdc ? 'USDC' : 'SOL'
          }
        })
      }).catch(console.error);
      
      // Only clear the stored user message on error if this was a premium service
      // For regular message fees, keep it so retries can use it
      const isPremiumService = paymentReq.service_type && paymentReq.service_type !== 'message_fee';
      if (isPremiumService) {
        lastUserMessageRef.current = null;
      }
      
      // Check if this is a payment processor error
      if (err.isPaymentProcessorError) {
        // Show the error as a message in the chat (prison phone style)
        const systemErrorMessage: Message = {
          id: `system-error-${Date.now()}`,
          senderId: 'system',
          sender: 'Prison Phone System',
          content: '📞 The prison payphone experienced technical difficulties processing your call. The payment system is temporarily unavailable. Your payment was not completed. Please try again in a few moments.',
          timestamp: new Date(),
          isAgent: true,
          mentions: [USER_SENDER_ID],
          isIntermediary: false
        };
        
        // Remove loading messages and add error message
        setMessages(prev => {
          const withoutLoading = prev.filter(m => 
            m.id !== loadingMessageIdRef.current && 
            m.senderId !== 'system' &&
            (!m.id.startsWith('optimistic-') || !m.content.includes('Payment for premium service'))
          );
          return [...withoutLoading, systemErrorMessage];
        });
        loadingMessageIdRef.current = null;
        
        // Also show a toast for immediate feedback
        showToast('Payment system temporarily unavailable', 'error');
      } else {
        // Remove ALL system/loading messages and optimistic payment messages on error
        if (loadingMessageIdRef.current) {
          setMessages(prev => prev.filter(m => 
            m.id !== loadingMessageIdRef.current && 
            m.senderId !== 'system' &&
            !m.id.startsWith('optimistic-') ||
            (m.id.startsWith('optimistic-') && !m.content.includes('Payment for premium service'))
          ));
          loadingMessageIdRef.current = null;
        }
        
        // Show user-friendly error message
        if (err.message?.includes('User rejected') || err.message?.includes('rejected the request')) {
          showToast('Payment cancelled by user','error');
        } else if (err.message?.includes('Extension context invalidated') || 
                   err.message?.includes('context invalidated')) {
          showToast('Wallet extension error. Please reload the page and try again.','error');
        } else {
          showToast(err.message ||'Payment failed. Please try again.','error');
        }
      }
      
      // CRITICAL: Always reset loading state to unblock the UI
      setLoading(false);
    }
  };

  const getWelcomeMessage = (agent: string): string => {
    const messages: Record<string, string> = {
'trump-donald':"I'm Donald Trump, and I make the BEST deals. What can I do for you?",
'trump-melania':"Hello, I'm Melania. How can I help you today?",
'trump-eric':"Hey, I'm Eric. Let's talk business!",
'trump-donjr':"Don Jr here. What's up?",
'trump-barron':"Hi, I'm Barron. What do you need?",
'cz':"Build.",
    };
    return messages[agent] ||`Hello! I'm ${agent}.`;
  };

  const formatAgentName = (agentId: string): string => {
    // Special handling for CZ
    if (agentId === 'cz') {
      return 'CZ';
    }
    
    // For Trump family members, format as "FirstName Trump" (e.g., "Melania Trump")
    if (agentId.startsWith('trump-')) {
      const firstName = agentId.split('-')[1];
      
      // Special cases
      if (firstName === 'donald') {
        return 'Donald Trump';
      }
      if (firstName === 'donjr') {
        return 'Donald Trump Jr';
      }
      
      // For others like Melania, Eric, Barron - use "FirstName Trump"
      const formattedFirstName = firstName.charAt(0).toUpperCase() + firstName.slice(1);
      return `${formattedFirstName} Trump`;
    }
    
    // Fallback for other agents
    return agentId
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const getAgentColor = (agentId: string): string => {
    const colors: Record<string, string> = {
'trump-donald':'bg-gradient-to-r from-red-900 to-red-800 border-red-700',
'trump-melania':'bg-gradient-to-r from-pink-900 to-pink-800 border-pink-700',
'trump-eric':'bg-gradient-to-r from-blue-900 to-blue-800 border-blue-700',
'trump-donjr':'bg-gradient-to-r from-orange-900 to-orange-800 border-orange-700',
'trump-barron':'bg-gradient-to-r from-purple-900 to-purple-800 border-purple-700',
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
            onClose={removeToast}
            duration={5000}
          />
        ))}
      </ToastContainer>

      <div className="flex w-full max-h-[400px] md:max-h-[450px] border-[3px] border-white/30 rounded-xl bg-black/80 backdrop-blur-sm relative mt-6 pixel-art"        style={{
          boxShadow:'0 0 20px rgba(102, 182, 128, 0.3), inset 0 0 30px rgba(0, 0, 0, 0.5)'        }}
      >
        {/* Main Chat Area */}
        <div className="flex flex-col flex-1 min-w-0">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {dedupedMessages.map((message: Message) => (
            <MessageItem 
              key={message.id} 
              message={message} 
              formatAgentName={formatAgentName}
              stripDebugMarkers={stripDebugMarkers}
            />
          ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-2 sm:p-3 border-t border-white/20">
        {!connected && (
          <div className="mb-2 p-2 bg-yellow-900/20 border border-yellow-500/50 rounded font-pixel text-yellow-400 text-[8px] sm:text-[9px]">
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
            className="flex-1 bg-black/50 border-2 border-white/20 rounded px-2 sm:px-3 py-2 text-white font-pixel text-[13px] sm:text-[15px] placeholder-gray-500 focus:outline-none focus:border-[#66b680] disabled:opacity-50"
          />
          <button
            onClick={sendUserMessage}
            disabled={loading || !input.trim() || !sessionId || !threadId}
            className="bg-[#66b680] hover:bg-[#7ac694] text-white font-pixel text-[13px] sm:text-[15px] py-2 px-3 sm:px-4 border-2 border-[#4a8c60] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 sm:gap-2 pixel-art"            style={{
              boxShadow:'0 3px 0 #3a6c48',
              textShadow:'1px 1px 0 #3a6c48'            }}
          >
            {loading ? (
              <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 animate-spin"/>
            ) : (
              <Send className="w-3 h-3 sm:w-4 sm:h-4"/>
            )}
            <span className="hidden sm:inline">SEND</span>
          </button>
        </div>
      </div>
        </div>
      </div>
    </>
  );
}
