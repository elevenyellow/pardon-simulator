import { NextResponse } from 'next/server';

const CORAL_SERVER_URL = process.env.CORAL_SERVER_URL || 'http://localhost:5555';

/**
 * Health check endpoint to verify Coral Server connectivity
 * Use this to monitor if the Coral instance we're hitting is healthy
 */
export async function GET() {
  try {
    const response = await fetch(`${CORAL_SERVER_URL}/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000) // 5s timeout
    });

    if (!response.ok) {
      return NextResponse.json(
        { 
          status: 'unhealthy', 
          error: `Coral Server returned ${response.status}`,
          coralUrl: CORAL_SERVER_URL
        },
        { status: 503 }
      );
    }

    const data = await response.json();
    
    return NextResponse.json({
      status: 'healthy',
      coralServer: {
        url: CORAL_SERVER_URL,
        health: data,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error: any) {
    return NextResponse.json(
      { 
        status: 'error', 
        error: error.message,
        coralUrl: CORAL_SERVER_URL,
        timestamp: new Date().toISOString()
      },
      { status: 503 }
    );
  }
}

