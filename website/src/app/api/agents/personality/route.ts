import { NextRequest, NextResponse } from'next/server';
import fs from'fs';
import path from'path';

/**
 * GET /api/agents/personality?agent={agentName}
 * 
 * Returns personality-public.txt content for the requested agent.
 * This endpoint NEVER returns operational-private.txt content.
 * 
 * Example: /api/agents/personality?agent=cz
 */
export async function GET(request: NextRequest) {
  try {
    // Get agent name from query params
    const { searchParams } = new URL(request.url);
    const agentParam = searchParams.get('agent');
    
    if (!agentParam) {
      return NextResponse.json(
        { error:'Missing agent parameter'},
        { status: 400 }
      );
    }
    
    // Validate agent name (security: prevent path traversal)
    const validAgents = [
'cz',
'trump-donald',
'trump-melania',
'trump-eric',
'trump-donjr',
'trump-barron',
'sbf'    ];
    
    if (!validAgents.includes(agentParam)) {
      return NextResponse.json(
        { error:`Invalid agent name. Valid agents: ${validAgents.join(',')}`},
        { status: 400 }
      );
    }
    
    // Map agent param to directory name
    const agentDirMap: Record<string, string> = {
'cz':'cz',
'trump-donald':'trump-donald',
'trump-melania':'trump-melania',
'trump-eric':'trump-eric',
'trump-donjr':'trump-donjr',
'trump-barron':'trump-barron',
'sbf':'sbf'    };
    
    const agentDir = agentDirMap[agentParam];
    
    // Construct path to personality-public.txt
    // This is safe because we validated the agent name above
    const agentsPath = path.join(process.cwd(),'..','agents', agentDir,'personality-public.txt');
    
    // Check if file exists
    if (!fs.existsSync(agentsPath)) {
      return NextResponse.json(
        { error:`Personality file not found for agent: ${agentParam}`},
        { status: 404 }
      );
    }
    
    // Read personality file
    const personalityContent = fs.readFileSync(agentsPath,'utf-8');
    
    // Extract agent name and title from first lines
    const lines = personalityContent.split('\n');
    const firstLine = lines[0] ||'';
    
    // Parse"You are NAME - TITLE"format
    const match = firstLine.match(/You are (.+?) - (.+)/);
    const name = match ? match[1].trim() : agentParam;
    const title = match ? match[2].trim() :'';
    
    // Get avatar path (if it exists in public folder)
    const avatarPath =`/avatars/${agentParam}.png`;
    
    // Return personality data
    return NextResponse.json({
      agent: agentParam,
      name,
      title,
      personality: personalityContent,
      avatar: avatarPath
    }, {
      headers: {
'Cache-Control':'public, max-age=3600, s-maxage=3600',  // Cache for 1 hour
      }
    });
    
  } catch (error) {
    console.error('Error fetching agent personality:', error);
    return NextResponse.json(
      { error:'Internal server error'},
      { status: 500 }
    );
  }
}

/**
 * GET /api/agents/personality/list
 * 
 * Returns list of all available agents with basic info
 */
export async function OPTIONS(request: NextRequest) {
  const agents = [
    { id:'trump-donald', name:'Donald Trump', title:'President of the United States'},
    { id:'trump-melania', name:'Melania Trump', title:'First Lady'},
    { id:'trump-eric', name:'Eric Trump', title:'Executive VP, Trump Organization'},
    { id:'trump-donjr', name:'Donald Trump Jr', title:'Political Activist'},
    { id:'trump-barron', name:'Barron Trump', title:'Crypto Prodigy'},
    { id:'cz', name:'Changpeng Zhao (CZ)', title:'Binance Founder'},
    { id:'sbf', name:'Sam Bankman-Fried (SBF)', title:'Former FTX CEO'}
  ];
  
  return NextResponse.json({ agents }, {
    headers: {
'Cache-Control':'public, max-age=3600, s-maxage=3600',
    }
  });
}

