/**
 * Wait for Agent Response Helper
 * Polls for agent responses with timeout
 */

import { TEST_CONFIG } from '../../../test.config';

export interface AgentResponse {
  id: string;
  senderId: string;
  sender: string;
  content: string;
  timestamp: Date;
  isAgent?: boolean;
  mentions?: string[];
}

export type WaitStatus = 'waiting' | 'acknowledged' | 'timeout';

function isAgentMessage(message: AgentResponse): boolean {
  if (typeof message.isAgent === 'boolean') {
    return message.isAgent;
  }

  // Coral messages do not currently include an isAgent flag.
  // Derive it the same way the ChatInterface does by checking the sender.
  const sender = message.senderId?.toLowerCase();
  return sender !== 'sbf' && sender !== 'system' && !!sender;
}

function ensureAgentFlag(message: AgentResponse): AgentResponse {
  if (message.isAgent === true) {
    return message;
  }

  return {
    ...message,
    isAgent: true,
  };
}

export interface WaitForResponseOptions {
  sessionId: string;
  threadId: string;
  agentId: string;
  timeout?: number;
  pollInterval?: number;
  lastMessageId?: string;
  baseUrl?: string; // For Node.js environment
  onStatusUpdate?: (status: WaitStatus) => void;
}

/**
 * Wait for agent to respond to a message
 */
export async function waitForAgentResponse(
  options: WaitForResponseOptions
): Promise<AgentResponse> {
  const {
    sessionId,
    threadId,
    agentId,
    timeout = TEST_CONFIG.timeouts.agentResponse,
    pollInterval = 1000, // 1 second
    lastMessageId,
    baseUrl = typeof window !== 'undefined' ? '' : `${TEST_CONFIG.endpoints.backend}`,
    onStatusUpdate,
  } = options;

  const startTime = Date.now();
  let attempts = 0;
  let lastMessageIdSeen: string | undefined;
  let lastPollError: unknown = null;
  let lastHttpStatus: number | undefined;
  let lastMessagesSnapshot: AgentResponse[] = [];

  onStatusUpdate?.('waiting');

  console.log('[TEST_HELPER] Waiting for agent response', {
    agentId,
    timeout,
    pollInterval,
  });

  while (Date.now() - startTime < timeout) {
    attempts++;
    
    // Log every 10th attempt to avoid spam
    if (attempts % 10 === 0) {
      console.log(`[WAIT_HELPER] Still waiting for ${agentId}...`, {
        attempts,
        elapsed: `${Math.floor((Date.now() - startTime) / 1000)}s`,
        lastMessageCount: lastMessagesSnapshot.length,
        threadId: threadId.slice(0, 8),
      });
    }
    
    try {
      // Poll for new messages
      const response = await fetch(`${baseUrl}/api/chat/messages?sessionId=${sessionId}&threadId=${threadId}`);
      
      if (!response.ok) {
        console.error('[TEST_HELPER] Failed to fetch messages:', response.statusText);
        lastHttpStatus = response.status;
        lastPollError = response.statusText;
        await sleep(pollInterval);
        continue;
      }

      const data = await response.json();
      const messages: AgentResponse[] = data.messages || [];
      lastMessagesSnapshot = messages.slice(-3);
      lastMessageIdSeen = messages[messages.length - 1]?.id || lastMessageIdSeen;

      // Find the first agent message after our last message
      const agentMessages = messages
        .filter((m: AgentResponse) => isAgentMessage(m) && m.senderId === agentId)
        .map(ensureAgentFlag);

      if (agentMessages.length > 0) {
        // If we have a lastMessageId, find the first message after it
        if (lastMessageId) {
          const lastIndex = messages.findIndex((m: AgentResponse) => m.id === lastMessageId);
          const newMessages = agentMessages.filter((message) => {
            const msgIndex = messages.findIndex((m: AgentResponse) => m.id === message.id);
            return msgIndex > lastIndex;
          });

          if (newMessages.length > 0) {
            console.log('[TEST_HELPER] Found new agent response', {
              agentId,
              attempts,
              elapsed: Date.now() - startTime,
            });
            return ensureAgentFlag(newMessages[0]);
          }
        } else {
          // Return the latest agent message
          console.log('[TEST_HELPER] Found agent response', {
            agentId,
            attempts,
            elapsed: Date.now() - startTime,
          });
          return ensureAgentFlag(agentMessages[agentMessages.length - 1]);
        }
      }

      // Wait before next poll
      await sleep(pollInterval);
    } catch (error) {
      console.error('[TEST_HELPER] Error polling for messages:', error);
      lastPollError = error;
      await sleep(pollInterval);
    }
  }

  onStatusUpdate?.('timeout');
  
  // Perform final diagnostics before throwing timeout error
  console.log('[WAIT_HELPER] Performing final diagnostics...');
  
  try {
    // Check if agent is still connected
    const agentsResp = await fetch(
      `${baseUrl}/api/sessions/${sessionId}/agents`
    );
    if (agentsResp.ok) {
      const agents = await agentsResp.json();
      console.log('[WAIT_HELPER] Connected agents:', agents.map((a: any) => a.id || a));
    }
    
    // Check thread status
    const threadResp = await fetch(
      `${TEST_CONFIG.endpoints.coral}/api/v1/debug/thread/app/priv/${sessionId}/${threadId}/messages`
    );
    if (threadResp.ok) {
      const data = await threadResp.json();
      console.log('[WAIT_HELPER] Thread message count:', data.messages?.length || 0);
    }
  } catch (diagError) {
    console.error('[WAIT_HELPER] Diagnostics failed:', diagError);
  }
  
  console.warn('[TEST_HELPER] Agent response timeout diagnostics', {
    agentId,
    threadId,
    attempts,
    elapsed: Date.now() - startTime,
    lastMessageIdSeen,
    lastHttpStatus,
    lastPollError: lastPollError instanceof Error ? lastPollError.message : lastPollError,
    lastMessagesSnapshot: lastMessagesSnapshot.map(msg => ({
      id: msg.id,
      senderId: msg.senderId,
      preview: msg.content?.slice(0, 120),
    })),
  });
  throw new Error(
    `Timeout waiting for agent response from ${agentId} after ${timeout}ms (${attempts} attempts)`
  );
}

/**
 * Wait for multiple agent responses
 */
export async function waitForMultipleResponses(
  options: WaitForResponseOptions,
  count: number
): Promise<AgentResponse[]> {
  const responses: AgentResponse[] = [];
  let lastMessageId = options.lastMessageId;

  for (let i = 0; i < count; i++) {
    const response = await waitForAgentResponse({
      ...options,
      lastMessageId,
      onStatusUpdate: options.onStatusUpdate,
    });
    responses.push(response);
    lastMessageId = response.id;
  }

  return responses;
}

/**
 * Wait for any agent to respond (not specific agent)
 */
export async function waitForAnyAgentResponse(
  sessionId: string,
  threadId: string,
  timeout: number = 30000,
  lastMessageId?: string,
  baseUrl: string = typeof window !== 'undefined' ? '' : `${TEST_CONFIG.endpoints.backend}`
): Promise<AgentResponse> {
  const startTime = Date.now();
  const pollInterval = 1000;

  console.log('[TEST_HELPER] Waiting for any agent response');

  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(`${baseUrl}/api/chat/messages?sessionId=${sessionId}&threadId=${threadId}`);
      
      if (!response.ok) {
        await sleep(pollInterval);
        continue;
      }

      const data = await response.json();
      const messages: AgentResponse[] = data.messages || [];

      const agentMessages = messages.filter((m: AgentResponse) => isAgentMessage(m));

      if (agentMessages.length > 0) {
        if (lastMessageId) {
          const lastIndex = messages.findIndex((m: AgentResponse) => m.id === lastMessageId);
          const newMessages = agentMessages.filter((_, index) => {
            const msgIndex = messages.findIndex((m: AgentResponse) => m.id === agentMessages[index].id);
            return msgIndex > lastIndex;
          });

          if (newMessages.length > 0) {
            return ensureAgentFlag(newMessages[0]);
          }
        } else {
          return ensureAgentFlag(agentMessages[agentMessages.length - 1]);
        }
      }

      await sleep(pollInterval);
    } catch (error) {
      console.error('[TEST_HELPER] Error polling for messages:', error);
      await sleep(pollInterval);
    }
  }

  throw new Error(`Timeout waiting for any agent response after ${timeout}ms`);
}

/**
 * Wait for agent response containing specific text
 */
export async function waitForResponseContaining(
  options: WaitForResponseOptions,
  searchText: string
): Promise<AgentResponse> {
  const response = await waitForAgentResponse(options);
  
  if (!response.content.toLowerCase().includes(searchText.toLowerCase())) {
    throw new Error(
      `Agent response does not contain "${searchText}". Got: ${response.content.slice(0, 200)}`
    );
  }

  return response;
}

/**
 * Helper to sleep
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

