/**
 * DEPRECATED: This file is no longer used!
 * 
 * All frontend-Coral communication now goes through Next.js API routes:
 * - /api/chat/session - Create session
 * - /api/chat/thread - Create thread
 * - /api/chat/send - Send message (with x402 payment support)
 * - /api/chat/messages - Get message history
 * 
 * See: src/lib/api-client.ts (the new API client)
 * 
 * This file kept for reference only.
 */

// DEPRECATED: Don't use NEXT_PUBLIC_ for sensitive URLs!
const BASE_URL = process.env.NEXT_PUBLIC_CORAL_SERVER_URL || 'http://localhost:5555';
const APPLICATION_ID = 'app';
const PRIVACY_KEY = 'debug';

export interface CoralMessage {
  id: string;
  threadId: string;
  senderId: string;
  content: string;
  mentions: string[];
  timestamp: string;
}

export interface CoralSession {
  sessionId: string;
  applicationId: string;
  agents: string[];
}

export interface CoralThread {
  threadId: string;
  sessionId: string;
  participants: string[];
  name?: string;
}

/**
 * Create a new Coral session with all agents
 * This loads the session config from the agents-session-configuration.json file
 */
export async function createSession(): Promise<CoralSession> {
  try {
    // Load the session configuration
    const configResponse = await fetch('/agents-session-configuration.json');
    if (!configResponse.ok) {
      throw new Error('Failed to load session configuration');
    }
    const sessionConfig = await configResponse.json();

    // Create session with full agent graph
    const response = await fetch(`${BASE_URL}/api/v1/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(sessionConfig),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create session: ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    console.log('✅ Session created:', data.sessionId);
    return data;
  } catch (error) {
    console.error('❌ Error creating session:', error);
    throw error;
  }
}

/**
 * Create a new thread in a session using debug API
 * This matches what the Python scripts do
 */
export async function createThread(
  sessionId: string,
  creatorAgent: string = 'sbf',
  participants: string[] = []
): Promise<CoralThread> {
  try {
    // Use the debug API endpoint like Python scripts
    const endpoint = `${BASE_URL}/api/v1/debug/thread/${APPLICATION_ID}/${PRIVACY_KEY}/${sessionId}/${creatorAgent}`;
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        threadName: 'Pardon Simulator Chat',
        participantIds: participants.length > 0 ? participants : undefined,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create thread: ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    console.log('✅ Thread created:', data.threadId);
    return {
      threadId: data.threadId || data.id,
      sessionId,
      participants: data.participants || participants,
      name: data.name,
    };
  } catch (error) {
    console.error('❌ Error creating thread:', error);
    throw error;
  }
}

/**
 * Send a message in a thread using debug API
 * Player sends as SBF (the player character)
 */
export async function sendMessage(
  sessionId: string,
  threadId: string,
  content: string,
  mentions: string[],
  senderAgent: string = 'sbf'
): Promise<void> {
  try {
    const endpoint = `${BASE_URL}/api/v1/debug/thread/sendMessage/${APPLICATION_ID}/${PRIVACY_KEY}/${sessionId}/${senderAgent}`;
    
    // Format message with @ mentions
    const mentionsStr = mentions.map(m => `@${m}`).join(' ');
    const formattedContent = `${mentionsStr} ${content}`;
    
    const payload = {
      threadId,
      content: formattedContent,
      mentions, // Array of agent IDs
    };

    console.log('📤 Sending message:', payload);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to send message: ${response.statusText} - ${errorText}`);
    }

    console.log('✅ Message sent successfully');
  } catch (error) {
    console.error('❌ Error sending message:', error);
    throw error;
  }
}

/**
 * Get messages from a thread
 */
export async function getMessages(
  sessionId: string,
  threadId: string
): Promise<CoralMessage[]> {
  try {
    const endpoint = `${BASE_URL}/api/v1/debug/thread/${APPLICATION_ID}/${PRIVACY_KEY}/${sessionId}/${threadId}/messages`;
    
    console.log('📥 Fetching messages from:', endpoint);
    
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Failed to get messages:', response.status, errorText);
      throw new Error(`Failed to get messages: ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    console.log('📬 Received messages:', data);
    return data.messages || [];
  } catch (error) {
    console.error('❌ Error getting messages:', error);
    return [];
  }
}

/**
 * List available agents in a session
 */
export async function listAgents(sessionId: string): Promise<string[]> {
  try {
    const endpoint = `${BASE_URL}/api/v1/sessions/${sessionId}/agents`;
    
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to list agents: ${response.statusText}`);
    }

    const data = await response.json();
    return data.agents || [];
  } catch (error) {
    console.error('❌ Error listing agents:', error);
    return [];
  }
}

/**
 * Poll for new messages (since we don't have SSE/WebSocket in frontend yet)
 */
export async function pollMessages(
  sessionId: string,
  threadId: string,
  lastMessageCount: number,
  callback: (messages: CoralMessage[]) => void,
  intervalMs: number = 2000
): Promise<NodeJS.Timeout> {
  const poll = async () => {
    const messages = await getMessages(sessionId, threadId);
    if (messages.length > lastMessageCount) {
      callback(messages);
    }
  };

  const intervalId = setInterval(poll, intervalMs);
  return intervalId;
}

