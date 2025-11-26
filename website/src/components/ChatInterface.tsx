'use client';

import { useState, useEffect, useRef, memo } from'react';
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const sessionInitializedRef = useRef(false);
  const previousWalletRef = useRef<string | null>(null); // Track wallet changes for cache clearing
  const previousMessageCountRef = useRef<number>(0); // Track message count to detect new messages
  const loadingMessageIdRef = useRef<string | null>(null); // Track loading message to remove when agent responds
  const phoneDialRef = useRef<HTMLAudioElement | null>(null); // Phone sound for payment confirmation
  const lastUserMessageRef = useRef<string | null>(null); // Store the last user message for premium service payments
  
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
          http_status: 402,
          recipient: parsed.recipient?.id || 'treasury',
          recipient_address: parsed.recipient_address || parsed.recipient?.address,
          amount_sol: 0,
          amount_usdc: parsed.amount_usdc || parseFloat(parsed.amount?.value || '0') / 1_000_000,
          service_type: parsed.service_type || 'premium_service',
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

  // Replace polling with SSE
  useEffect(() => {
    if (threadId && sessionId && !eventSourceRef.current) {
      const eventSource = new EventSource(
        `/api/chat/stream?sessionId=${sessionId}&threadId=${threadId}`
      );
      eventSourceRef.current = eventSource;
      
      eventSource.onopen = () => {
        console.log('[SSE] Connected to message stream');
        setPolling(true);
      };
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[SSE Client] Received event:', data.type, data.messages?.length || 0, 'messages');
          
          if (data.type === 'messages' && data.messages) {
            // Track pending payment requests from agent messages
            let pendingPaymentRequest: { request: PaymentRequest; messageId: string } | null = null;
            
            const newMessages: Message[] = data.messages.map((m: any) => {
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
                  if (!alreadyProcessed && publicKey && sessionId && threadId) {
                    pendingPaymentRequest = { 
                      request: extracted.request, 
                      messageId: m.id 
                    };
                    console.log('[SSE] Detected new payment request:', extracted.request);
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
                console.log('[SSE] NEW agent response detected, removing system messages');
                console.log('[SSE] loadingMessageIdRef.current:', loadingMessageIdRef.current);
                finalMessages = merged.filter(m => m.senderId !== 'system');
                
                // Clear the loading ref and state
                loadingMessageIdRef.current = null;
                setLoading(false);
              }
              
              if (publicKey && threadId && trulyNew.length > 0) {
                cacheConversation(publicKey.toString(), threadId, finalMessages, selectedAgent);
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
          }
        } catch (e) {
          console.error('[SSE] Failed to parse message:', e);
        }
      };
      
      eventSource.onerror = (error) => {
        console.error('[SSE] Connection error, falling back to polling');
        eventSource.close();
        eventSourceRef.current = null;
        setPolling(false);
        
        if (!pollIntervalRef.current) {
          pollIntervalRef.current = setInterval(pollMessages, 1000);
        }
      };
    }
    
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [threadId, sessionId, publicKey, selectedAgent]);

  // Auto-scroll only when new messages are added
  useEffect(() => {
    const currentMessageCount = messages.length;
    
    // Only scroll if message count increased (new messages added)
    if (currentMessageCount > previousMessageCountRef.current) {
      // Use requestAnimationFrame to batch scroll operations and improve performance
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior:'smooth', block:'end'});
      });
    }
    
    // Update the previous count
    previousMessageCountRef.current = currentMessageCount;
  }, [messages.length]); // Only depend on length, not the entire array

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
            .filter(m => m.senderId === USER_SENDER_ID)
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
          if (m.senderId === USER_SENDER_ID) {
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
          m.senderId === USER_SENDER_ID && m.content.includes('Payment sent! Transaction signature:')
        );
        
        let filteredPrev = hasRealPaymentConfirmation
          ? prev.filter(m => !m.id.startsWith('payment-'))
          : prev;
        
        // Replace optimistic messages IN-PLACE to avoid reordering
        const updated = filteredPrev.map(prevMsg => {
          if (prevMsg.id.startsWith('optimistic-')) {
            const serverVersion = allMessages.find(serverMsg => 
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
        filteredPrev.forEach(prevMsg => {
          if (prevMsg.id.startsWith('optimistic-')) {
            const serverVersion = allMessages.find(serverMsg => 
              serverMsg.senderId === USER_SENDER_ID &&
              stripDebugMarkers(serverMsg.content).trim() === stripDebugMarkers(prevMsg.content).trim()
            );
            if (serverVersion) {
              replacedServerIds.add(serverVersion.id);
            }
          }
        });
        
        const trulyNew = newMessages.filter(m => !replacedServerIds.has(m.id));
        
        // Add new messages and sort only when necessary
        const merged = [...updated, ...trulyNew];
        const sorted = merged.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        
        // Final deduplication pass to ensure no duplicate IDs (React key constraint)
        const deduplicatedById = sorted.reduce((acc, msg) => {
          if (!acc.some(m => m.id === msg.id)) {
            acc.push(msg);
          }
          return acc;
        }, [] as Message[]);
        
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
          // We got a NEW agent response, so remove the loading message
          console.log('[Polling] NEW agent response detected, removing system messages');
          console.log('[Polling] loadingMessageIdRef.current:', loadingMessageIdRef.current);
          finalMessages = deduplicatedById.filter(m => m.senderId !== 'system');
          
          loadingMessageIdRef.current = null;
          setLoading(false);
        }
        
        //  Cache the updated conversation if any new messages were added
        if (trulyNew.length > 0 && publicKey && threadId) {
          cacheConversation(publicKey.toString(), threadId, finalMessages, selectedAgent);
        }
        
        return finalMessages;
      });

      // If we found a new payment request, trigger the payment flow
      console.log('[Payment Flow] Checking for pending payment request...');
      console.log('[Payment Flow] pendingPaymentRequest:', pendingPaymentRequest);
      console.log('[Payment Flow] publicKey:', publicKey?.toString());
      console.log('[Payment Flow] sessionId:', sessionId);
      console.log('[Payment Flow] threadId:', threadId);
      
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

  const sendUserMessage = async () => {
    if (!input.trim() || !sessionId || !threadId || !selectedAgent) return;

    // Capture input value before clearing it
    const messageContent =`@${selectedAgent} ${input}`;
    
    // Store the message content for potential premium service payments
    lastUserMessageRef.current = messageContent;
    
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
        
        //  Cache the optimistic update
        if (publicKey && threadId) {
          cacheConversation(publicKey.toString(), threadId, updated, selectedAgent);
        }
        
        return updated;
      });
      
      // Keep loading true - will be set to false when agent responds via SSE/polling
      
    } catch (err: any) {
      console.error('Send message error:', err);
      
      const errorMessage = err.message ||'Failed to send message';
      showToast(errorMessage,'error');
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

        // Show single payment required toast
        const serviceName = isPremiumService 
          ? paymentReq.service_type?.replace(/_/g, ' ') 
          : 'contacting agent';
        showToast(`Payment Required: ${amount} ${currency} for ${serviceName}`,'info');

        const { createUSDCTransaction } = await import('@/lib/x402-payload-client');
        const { PublicKey } = await import('@solana/web3.js');

        let signedTx;
        try {
          signedTx = await createUSDCTransaction(
            `payment-${Date.now()}`,
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
          amount_usdc: amount,
          service_type: paymentReq.service_type  // Include service type for backend marker
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
          ? { ...m, content: '⏳ The prison phone is transmitting the message...' }
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
        } else {
          // No agent messages yet - keep loading message and wait for SSE to deliver the response
          console.log('[Payment] No agent messages in backend response, waiting for SSE');
        }
      } else {
        // No messages in response (normal since backend returns immediately)
        // Loading message will be removed when SSE delivers the agent response
        console.log('[Payment] Backend returned successfully, waiting for agent response via SSE');
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
      
      // CRITICAL: Always reset loading state to unblock the UI
      setLoading(false);
      
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
            onClose={() => removeToast(toast.id)}
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
          {messages.map((message) => (
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
