/**
 * Conversation Cache Manager
 * 
 * Stores conversation history in localStorage with wallet address isolation.
 * Each wallet's conversations are completely separate for privacy/security.
 */

interface Message {
  id: string;
  sender: string;
  senderId: string;
  content: string;
  timestamp: Date;
  isAgent: boolean;
  mentions?: string[];
  isIntermediary?: boolean;
}

interface CachedConversation {
  messages: Message[];
  lastUpdated: number;
  agentId: string;
}

interface WalletCache {
  [threadId: string]: CachedConversation;
}

interface ConversationCache {
  [walletAddress: string]: WalletCache;
}

const CACHE_KEY = 'pardon_conversations';
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 1 week (matches game cycle)
const MAX_THREADS_PER_WALLET = 10; // Keep last 10 conversations per wallet
const MAX_WALLETS = 3; // Keep last 3 wallets to prevent unlimited growth

/**
 * Get the full cache from localStorage
 */
function getCache(): ConversationCache {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return {};
    
    const parsed = JSON.parse(cached);
    
    // Rehydrate Date objects
    Object.keys(parsed).forEach(wallet => {
      Object.keys(parsed[wallet]).forEach(thread => {
        parsed[wallet][thread].messages = parsed[wallet][thread].messages.map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp)
        }));
      });
    });
    
    return parsed;
  } catch (error) {
    console.warn('Failed to read conversation cache:', error);
    return {};
  }
}

/**
 * Save the full cache to localStorage
 */
function saveCache(cache: ConversationCache): void {
  try {
    // Cleanup: Keep only the most recent wallets
    const wallets = Object.keys(cache);
    if (wallets.length > MAX_WALLETS) {
      // Find the oldest wallet by looking at lastUpdated across all threads
      const walletTimestamps = wallets.map(wallet => {
        const threads = Object.values(cache[wallet]);
        const mostRecent = Math.max(...threads.map(t => t.lastUpdated));
        return { wallet, timestamp: mostRecent };
      });
      
      walletTimestamps.sort((a, b) => a.timestamp - b.timestamp);
      
      // Remove oldest wallets
      for (let i = 0; i < wallets.length - MAX_WALLETS; i++) {
        delete cache[walletTimestamps[i].wallet];
      }
    }
    
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.warn('Failed to save conversation cache:', error);
    
    // If quota exceeded, try clearing old data
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      console.warn('Storage quota exceeded, clearing old conversations...');
      clearOldConversations();
      
      // Try again with cleaned cache
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
      } catch (retryError) {
        console.error('Failed to save cache even after cleanup:', retryError);
      }
    }
  }
}

/**
 * Cache messages for a specific wallet and thread
 */
export function cacheConversation(
  walletAddress: string,
  threadId: string,
  messages: Message[],
  agentId: string
): void {
  if (!walletAddress || !threadId) return;
  
  const cache = getCache();
  
  // Initialize wallet cache if needed
  if (!cache[walletAddress]) {
    cache[walletAddress] = {};
  }
  
  // Cleanup: Keep only recent threads for this wallet
  const threads = Object.keys(cache[walletAddress]);
  if (threads.length >= MAX_THREADS_PER_WALLET) {
    // Sort by lastUpdated and remove oldest
    const sortedThreads = threads
      .map(tid => ({ 
        threadId: tid, 
        lastUpdated: cache[walletAddress][tid].lastUpdated 
      }))
      .sort((a, b) => a.lastUpdated - b.lastUpdated);
    
    // Remove oldest threads
    for (let i = 0; i < threads.length - MAX_THREADS_PER_WALLET + 1; i++) {
      delete cache[walletAddress][sortedThreads[i].threadId];
    }
  }
  
  // Save conversation
  cache[walletAddress][threadId] = {
    messages,
    lastUpdated: Date.now(),
    agentId
  };
  
  saveCache(cache);
  
  console.log(`💾 Cached ${messages.length} messages for wallet ${walletAddress.substring(0, 8)}... thread ${threadId.substring(0, 8)}...`);
}

/**
 * Load cached messages for a specific wallet and thread
 * Returns null if cache is expired or doesn't exist
 */
export function loadCachedConversation(
  walletAddress: string,
  threadId: string
): Message[] | null {
  if (!walletAddress || !threadId) return null;
  
  const cache = getCache();
  const walletCache = cache[walletAddress];
  
  if (!walletCache) {
    console.log(`📦 No cache found for wallet ${walletAddress.substring(0, 8)}...`);
    return null;
  }
  
  const conversation = walletCache[threadId];
  
  if (!conversation) {
    console.log(`📦 No cached conversation for thread ${threadId.substring(0, 8)}...`);
    return null;
  }
  
  // Check if cache is still fresh (within 1 week)
  const age = Date.now() - conversation.lastUpdated;
  if (age > CACHE_TTL) {
    const daysOld = Math.round(age / (24 * 60 * 60 * 1000));
    console.log(`📦 Cache expired for thread ${threadId.substring(0, 8)}... (${daysOld} days old)`);
    return null;
  }
  
  console.log(`📦 Loaded ${conversation.messages.length} cached messages for wallet ${walletAddress.substring(0, 8)}... thread ${threadId.substring(0, 8)}...`);
  return conversation.messages;
}

/**
 * Clear all cached conversations for a specific wallet
 * Call this when a wallet disconnects
 */
export function clearWalletCache(walletAddress: string): void {
  if (!walletAddress) return;
  
  const cache = getCache();
  
  if (cache[walletAddress]) {
    const threadCount = Object.keys(cache[walletAddress]).length;
    delete cache[walletAddress];
    saveCache(cache);
    console.log(`🗑️  Cleared ${threadCount} cached conversations for wallet ${walletAddress.substring(0, 8)}...`);
  }
}

/**
 * Clear all old conversations (older than TTL) across all wallets
 */
export function clearOldConversations(): void {
  const cache = getCache();
  const now = Date.now();
  let removedCount = 0;
  
  Object.keys(cache).forEach(wallet => {
    Object.keys(cache[wallet]).forEach(thread => {
      if (now - cache[wallet][thread].lastUpdated > CACHE_TTL) {
        delete cache[wallet][thread];
        removedCount++;
      }
    });
    
    // Remove wallet entry if empty
    if (Object.keys(cache[wallet]).length === 0) {
      delete cache[wallet];
    }
  });
  
  if (removedCount > 0) {
    saveCache(cache);
    console.log(`🗑️  Cleared ${removedCount} expired conversations`);
  }
}

/**
 * Clear entire conversation cache (nuclear option)
 */
export function clearAllCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
    console.log('🗑️  Cleared all conversation cache');
  } catch (error) {
    console.warn('Failed to clear cache:', error);
  }
}

/**
 * Get cache statistics (for debugging)
 */
export function getCacheStats(): {
  wallets: number;
  totalThreads: number;
  totalMessages: number;
  sizeKB: number;
} {
  const cache = getCache();
  const wallets = Object.keys(cache);
  
  let totalThreads = 0;
  let totalMessages = 0;
  
  wallets.forEach(wallet => {
    const threads = Object.keys(cache[wallet]);
    totalThreads += threads.length;
    threads.forEach(thread => {
      totalMessages += cache[wallet][thread].messages.length;
    });
  });
  
  const cacheString = localStorage.getItem(CACHE_KEY) || '';
  const sizeKB = Math.round((cacheString.length * 2) / 1024); // UTF-16 = 2 bytes per char
  
  return {
    wallets: wallets.length,
    totalThreads,
    totalMessages,
    sizeKB
  };
}

