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
 */
async function restoreCoralSessionInternal(coralSessionId: string): Promise<boolean> {
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
      return false;
    }

    const data = await response.json();
    const restoredSessionId = data.sessionId || data.id;
    
    console.log(`[Restoration] Session restored: ${restoredSessionId}`);
    return restoredSessionId === coralSessionId;
  } catch (error) {
    console.error('[Restoration] Error restoring session:', error);
    return false;
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
    
    // Create thread via Coral Server debug API
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
    return true;
  } catch (error) {
    console.error('[Restoration] Error restoring thread:', error);
    return false;
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

    const coralSessionId = threadData.session.coralSessionId;
    
    // Check if Coral session exists in memory
    const sessionExists = await checkCoralSessionExists(coralSessionId);
    
    if (!sessionExists) {
      console.log('[Restoration] Session not in memory, restoring...');
      const sessionRestored = await restoreCoralSessionInternal(coralSessionId);
      if (!sessionRestored) {
        console.error('[Restoration] Failed to restore session');
        return false;
      }
    } else {
      console.log('[Restoration] Session already exists in memory');
    }

    // Restore the thread
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

