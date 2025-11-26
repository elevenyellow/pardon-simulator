"""
Intermediary State Management for Connection Intro Premium Service

Tracks when an agent is in "intermediary mode" - waiting for a response after using
contact_agent() to reach another agent on behalf of the user.

This enables programmatic control to:
1. Suppress duplicate confirmations (Issue #1)
2. Skip agent invocation when contacted agent responds (Issue #2)
"""

import aiohttp
import os
import time
from typing import Optional, Dict

# In-memory cache for fast lookups (backed by backend database)
_intermediary_cache: Dict[str, Dict] = {}

# State expires after 10 minutes (prevents stale state)
STATE_EXPIRY_SECONDS = 600

async def set_intermediary_state(
    agent_id: str,
    thread_id: str,
    target_agent: str,
    purpose: str = "connection_intro"
) -> bool:
    """
    Store intermediary state when an agent contacts another agent on behalf of user.
    
    Args:
        agent_id: The intermediary agent (e.g., "trump-barron")
        thread_id: The thread ID where this is happening
        target_agent: The agent being contacted (e.g., "cz")
        purpose: Purpose of contact (default: "connection_intro")
    
    Returns:
        True if stored successfully
    """
    cache_key = f"{agent_id}:{thread_id}"
    state = {
        "agent_id": agent_id,
        "thread_id": thread_id,
        "target_agent": target_agent,
        "purpose": purpose,
        "timestamp": time.time(),
        "expires_at": time.time() + STATE_EXPIRY_SECONDS
    }
    
    # Store in cache immediately
    _intermediary_cache[cache_key] = state
    print(f"[IntermediaryState] Set: {agent_id} waiting for {target_agent} in thread {thread_id[:8]}")
    
    # Persist to backend (non-blocking, best-effort)
    try:
        api_url = os.getenv('BACKEND_API_URL', 'http://localhost:3000')
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f'{api_url}/api/agent/intermediary-state',
                json=state,
                timeout=aiohttp.ClientTimeout(total=3)
            ) as resp:
                if resp.status in (200, 201):
                    print(f"[IntermediaryState] Persisted to backend")
                    return True
                else:
                    print(f"[IntermediaryState] Backend store failed: {resp.status}")
    except Exception as e:
        print(f"[IntermediaryState] Backend store error (using cache): {e}")
    
    return True  # Cache is sufficient


async def check_intermediary_state(
    agent_id: str,
    thread_id: str,
    sender_id: str
) -> Optional[Dict]:
    """
    Check if this agent is in intermediary mode waiting for response from sender.
    
    Args:
        agent_id: The agent receiving the message (e.g., "trump-barron")
        thread_id: The thread ID
        sender_id: Who sent the message (e.g., "cz")
    
    Returns:
        State dict if agent is waiting for this sender, None otherwise
    """
    cache_key = f"{agent_id}:{thread_id}"
    
    # Check cache first
    if cache_key in _intermediary_cache:
        state = _intermediary_cache[cache_key]
        
        # Check if expired
        if time.time() > state.get("expires_at", 0):
            print(f"[IntermediaryState] Expired state for {cache_key}, clearing")
            del _intermediary_cache[cache_key]
            return None
        
        # Check if sender matches target_agent
        if state.get("target_agent") == sender_id:
            print(f"[IntermediaryState] Match! {agent_id} is waiting for {sender_id}")
            return state
        
        return None
    
    # If not in cache, try backend (for cross-instance consistency)
    try:
        api_url = os.getenv('BACKEND_API_URL', 'http://localhost:3000')
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f'{api_url}/api/agent/intermediary-state/{agent_id}/{thread_id}',
                timeout=aiohttp.ClientTimeout(total=2)
            ) as resp:
                if resp.status == 200:
                    state = await resp.json()
                    
                    # Check if sender matches and not expired
                    if (state.get("target_agent") == sender_id and 
                        time.time() <= state.get("expires_at", 0)):
                        # Update cache
                        _intermediary_cache[cache_key] = state
                        print(f"[IntermediaryState] Match from backend! {agent_id} waiting for {sender_id}")
                        return state
    except Exception as e:
        # Backend unavailable, cache-only mode
        pass
    
    return None


async def clear_intermediary_state(agent_id: str, thread_id: str) -> bool:
    """
    Clear intermediary state (e.g., after response received).
    
    Args:
        agent_id: The intermediary agent
        thread_id: The thread ID
    
    Returns:
        True if cleared successfully
    """
    cache_key = f"{agent_id}:{thread_id}"
    
    if cache_key in _intermediary_cache:
        del _intermediary_cache[cache_key]
        print(f"[IntermediaryState] Cleared: {cache_key}")
    
    # Clear from backend (best-effort)
    try:
        api_url = os.getenv('BACKEND_API_URL', 'http://localhost:3000')
        async with aiohttp.ClientSession() as session:
            async with session.delete(
                f'{api_url}/api/agent/intermediary-state/{agent_id}/{thread_id}',
                timeout=aiohttp.ClientTimeout(total=2)
            ) as resp:
                return resp.status in (200, 204)
    except Exception as e:
        print(f"[IntermediaryState] Backend clear error (cache cleared): {e}")
    
    return True


def check_contact_agent_called(response: Dict) -> bool:
    """
    Check if contact_agent tool was called in this agent response.
    
    Args:
        response: Agent executor response dict with 'intermediate_steps'
    
    Returns:
        True if contact_agent was called
    """
    if not isinstance(response, dict):
        return False
    
    intermediate_steps = response.get('intermediate_steps', [])
    
    for step in intermediate_steps:
        if len(step) >= 2:
            action, result = step[0], step[1]
            tool_name = getattr(action, 'tool', '').lower()
            if 'contact_agent' in tool_name:
                return True
    
    return False

