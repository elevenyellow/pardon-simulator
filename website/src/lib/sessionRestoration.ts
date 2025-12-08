import { prisma } from '@/lib/prisma';
import fs from 'fs';
import path from 'path';

const CORAL_SERVER_URL = process.env.CORAL_SERVER_URL || 'http://localhost:5555';

interface ThreadData {
  coralThreadId: string;
  agentId: string;
  participants: string[];
  session: {
    coralSessionId: string;
  };
}

/**
 * Check if a thread exists in PostgreSQL
 */
export async function getThreadFromDB(coralThreadId: string): Promise<ThreadData | null> {
  try {
    const thread = await prisma.thread.findFirst({
      where: { coralThreadId },
      include: { 
        session: true,
        messages: {
          select: { senderId: true },
          distinct: ['senderId']
        }
      },
    });

    if (!thread) {
      return null;
    }

    // Get all unique participants from messages
    const participants = thread.messages.map(m => m.senderId);
    // Ensure the thread's agentId is included
    if (!participants.includes(thread.agentId)) {
      participants.push(thread.agentId);
    }
    // Ensure 'sbf' is included (the user)
    if (!participants.includes('sbf')) {
      participants.push('sbf');
    }

    return {
      coralThreadId: thread.coralThreadId,
      agentId: thread.agentId,
      participants,
      session: {
        coralSessionId: thread.session.coralSessionId,
      },
    };
  } catch (error) {
    console.error('Error fetching thread from DB:', error);
    return null;
  }
}

/**
 * Check if a Coral session exists in memory
 */
async function checkCoralSessionExists(coralSessionId: string): Promise<boolean> {
  try {
    const response = await fetch(
      `${CORAL_SERVER_URL}/api/v1/debug/thread/app/priv/${coralSessionId}/sbf`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadName: 'test',
          participantIds: ['sbf'],
        }),
      }
    );

    // If we get 404 on session not found, the session doesn't exist
    // If we get success or other error, the session exists
    return response.status !== 404 || !(await response.text()).includes('Session not found');
  } catch (error) {
    console.error('Error checking Coral session:', error);
    return false;
  }
}

/**
 * Restore a Coral session from configuration
 * Returns the restored session ID (which may differ from requested ID in non-dev mode)
 */
async function restoreCoralSessionInternal(coralSessionId: string): Promise<string | null> {
  try {
    console.log(`[Restoration] Restoring Coral session: ${coralSessionId}`);
    
    // Load session config from file system
    const configPath = path.join(process.cwd(), '../agents-session-configuration.json');
    const sessionConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    
    // Create session with specific ID via Coral Server
    const response = await fetch(`${CORAL_SERVER_URL}/api/v1/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...sessionConfig,
        sessionId: coralSessionId, // Request specific session ID
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Restoration] Failed to restore session:', errorText);
      return null;
    }

    const data = await response.json();
    const restoredSessionId = data.sessionId || data.id;
    
    console.log(`[Restoration] Session restored: ${restoredSessionId}`);
    
    // If Coral returned a different session ID (non-dev mode), update the database
    if (restoredSessionId !== coralSessionId) {
      console.log(`[Restoration] Coral returned different session ID (dev mode disabled), updating database...`);
      console.log(`[Restoration] Old ID: ${coralSessionId}, New ID: ${restoredSessionId}`);
      
      try {
        // Update all sessions with the old coral session ID to the new one
        const updateResult = await prisma.session.updateMany({
          where: { coralSessionId },
          data: { coralSessionId: restoredSessionId }
        });
        
        console.log(`[Restoration] Updated ${updateResult.count} session(s) with new Coral session ID`);
        
        // If we updated the session, restoration was successful
        if (updateResult.count > 0) {
          console.log(`[Restoration] Database updated successfully, returning new session ID`);
          return restoredSessionId;
        } else {
          console.error(`[Restoration] No sessions found to update with old session ID: ${coralSessionId}`);
          return null;
        }
      } catch (dbError) {
        console.error('[Restoration] Failed to update database with new session ID:', dbError);
        return null;
      }
    }
    
    // Session ID matched, restoration successful
    return restoredSessionId;
  } catch (error) {
    console.error('[Restoration] Error restoring session:', error);
    return null;
  }
}

/**
 * Restore a thread in Coral from database data
 */
async function restoreThreadInternal(
  coralSessionId: string,
  coralThreadId: string,
  agentId: string,
  participants: string[]
): Promise<boolean> {
  try {
    console.log(`[Restoration] Restoring thread: ${coralThreadId} in session ${coralSessionId}`);
    
    // CRITICAL FIX: Check if thread already exists in Coral before recreating it
    // This prevents wiping out existing thread messages
    try {
      const checkResponse = await fetch(
        `${CORAL_SERVER_URL}/api/v1/debug/thread/messages/app/priv/${coralSessionId}/${coralThreadId}`,
        { method: 'GET', headers: { 'Content-Type': 'application/json' } }
      );
      
      if (checkResponse.ok) {
        const existingMessages = await checkResponse.json();
        console.log(`[Restoration] Thread already exists in Coral with ${existingMessages?.messages?.length || 0} messages - skipping recreation`);
        return true; // Thread exists, no need to recreate
      }
    } catch (checkError) {
      console.log('[Restoration] Thread check failed, proceeding with creation:', checkError);
    }
    
    // Thread doesn't exist - create it via Coral Server debug API
    console.log('[Restoration] Thread not found in Coral, creating new thread...');
    const response = await fetch(
      `${CORAL_SERVER_URL}/api/v1/debug/thread/app/priv/${coralSessionId}/sbf`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadName: 'Pardon Simulator Chat',
          participantIds: participants,
          threadId: coralThreadId, // Try to use existing thread ID
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Restoration] Failed to restore thread:', errorText);
      return false;
    }

    const data = await response.json();
    console.log(`[Restoration] Thread restored: ${data.threadId || data.id}`);
    
    // CRITICAL: Restore message history from PostgreSQL to Coral memory
    // This ensures agents see full conversation context after reconnections
    await restoreMessagesToCoral(coralSessionId, coralThreadId);
    
    return true;
  } catch (error) {
    console.error('[Restoration] Error restoring thread:', error);
    return false;
  }
}

/**
 * Restore message history from PostgreSQL to Coral memory
 * Limits to last 100 messages for performance
 */
async function restoreMessagesToCoral(
  coralSessionId: string,
  coralThreadId: string
): Promise<void> {
  try {
    console.log(`[Restoration] Fetching message history for thread ${coralThreadId}`);
    
    // Check if messages already exist in Coral (avoid duplicates)
    try {
      const checkMessages = await fetch(
        `${CORAL_SERVER_URL}/api/v1/debug/thread/app/priv/${coralSessionId}/${coralThreadId}/messages`
      );
      if (checkMessages.ok) {
        const existingData = await checkMessages.json();
        const existingCount = (existingData.messages || []).length;
        if (existingCount > 0) {
          console.log(`[Restoration] Thread already has ${existingCount} messages in Coral - skipping restoration`);
          return;
        }
      }
    } catch (checkError) {
      console.log('[Restoration] Could not check existing messages, proceeding with restoration');
    }
    
    // Fetch last 100 messages from database (ordered oldest first)
    const messages = await prisma.message.findMany({
      where: { 
        thread: {
          coralThreadId: coralThreadId
        }
      },
      orderBy: { timestamp: 'asc' },
      take: 100,
      select: {
        senderId: true,
        content: true,
        mentions: true,
        timestamp: true,
      }
    });
    
    if (messages.length === 0) {
      console.log(`[Restoration] No messages to restore for thread ${coralThreadId}`);
      return;
    }
    
    console.log(`[Restoration] Restoring ${messages.length} messages to Coral memory...`);
    
    let successCount = 0;
    let failCount = 0;
    
    // Replay messages into Coral in order
    for (const msg of messages) {
      try {
        // Use Coral's sendMessage API to replay each message
        const replayResponse = await fetch(
          `${CORAL_SERVER_URL}/api/v1/debug/thread/sendMessage/app/priv/${coralSessionId}/${msg.senderId}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              threadId: coralThreadId,
              content: msg.content,
              mentions: msg.mentions || [],
            }),
          }
        );
        
        if (replayResponse.ok) {
          successCount++;
        } else {
          failCount++;
          console.warn(`[Restoration] Failed to restore message from ${msg.senderId}: ${replayResponse.status}`);
        }
      } catch (msgError) {
        failCount++;
        console.warn(`[Restoration] Error restoring message:`, msgError);
        // Continue with next message even if one fails
      }
    }
    
    console.log(`[Restoration] Message restoration complete: ${successCount} succeeded, ${failCount} failed`);
    
  } catch (error) {
    console.error('[Restoration] Error restoring messages:', error);
    // Don't throw - thread is created, just missing history
  }
}

/**
 * Main restoration function: restore session and thread if needed
 * Returns true if restoration was successful or not needed
 */
export async function restoreCoralSession(coralThreadId: string): Promise<boolean> {
  try {
    console.log(`[Restoration] Checking if restoration needed for thread: ${coralThreadId}`);
    
    // Get thread data from PostgreSQL
    const threadData = await getThreadFromDB(coralThreadId);
    if (!threadData) {
      console.log('[Restoration] Thread not found in database, cannot restore');
      return false;
    }

    let coralSessionId = threadData.session.coralSessionId;
    
    // Check if Coral session exists in memory
    const sessionExists = await checkCoralSessionExists(coralSessionId);
    
    if (!sessionExists) {
      console.log('[Restoration] Session not in memory, restoring...');
      const restoredSessionId = await restoreCoralSessionInternal(coralSessionId);
      if (!restoredSessionId) {
        console.error('[Restoration] Failed to restore session');
        return false;
      }
      // Use the restored session ID (may be different in non-dev mode)
      coralSessionId = restoredSessionId;
    } else {
      console.log('[Restoration] Session already exists in memory');
    }

    // Restore the thread (using potentially updated session ID)
    console.log('[Restoration] Restoring thread...');
    const threadRestored = await restoreThreadInternal(
      coralSessionId,
      threadData.coralThreadId,
      threadData.agentId,
      threadData.participants
    );

    if (threadRestored) {
      console.log('[Restoration] Restoration completed successfully');
    } else {
      console.error('[Restoration] Failed to restore thread');
    }

    return threadRestored;
  } catch (error) {
    console.error('[Restoration] Error during restoration:', error);
    return false;
  }
}

/**
 * Simpler version: just restore a thread for a known session
 */
export async function restoreThread(
  coralSessionId: string,
  coralThreadId: string,
  agentId: string
): Promise<boolean> {
  try {
    const threadData = await getThreadFromDB(coralThreadId);
    if (!threadData) {
      return false;
    }

    return await restoreThreadInternal(
      coralSessionId,
      coralThreadId,
      agentId,
      threadData.participants
    );
  } catch (error) {
    console.error('[Restoration] Error restoring thread:', error);
    return false;
  }
}

