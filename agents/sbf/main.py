"""
SBF Agent - User Identity Proxy
This agent exists ONLY to satisfy Coral's requirement that all thread
participants be registered agents. It does NOT generate responses.
"""

import os
import sys
import asyncio

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from base_agent import BaseAgent


class SBFAgent(BaseAgent):
    """
    SBF Agent - User Identity Proxy (No Autonomous Behavior)
    
    Purpose:
    - Allows "sbf" to be a valid thread participant in Coral
    - Enables user messages to have senderId="sbf"
    - Does NOT generate any responses or take any actions
    
    Why it exists:
    - Coral requires all thread participants to be registered agents
    - Users send messages with senderId="sbf" 
    - Without this agent, Coral would reject user messages
    """
    
    def __init__(self):
        super().__init__(
            agent_id="sbf",
            agent_name="SBF (User)",
            agent_description="Player identity proxy - no autonomous behavior"
        )
    
    def get_agent_specific_tools(self):
        """
        SBF has no tools - it doesn't take actions.
        Returns empty list to prevent tool usage.
        """
        return []
    
    async def process_message(self, mentions_data, dynamic_content):
        """
        CRITICAL: SBF agent NEVER processes or responds to messages.
        
        It exists only to satisfy Coral's requirement that all thread
        participants be registered agents. This allows users to send
        messages with senderId="sbf".
        
        ALL messages are ignored - no responses generated.
        """
        message_payload = mentions_data["messages"][0]
        sender_id = message_payload["senderId"]
        content = message_payload["content"][:80]  # First 80 chars for logging
        
        # Log that we're ignoring the message
        print(f"[SBF-PROXY] Ignored message from '{sender_id}': {content}...")
        
        # Return None - no response ever
        return None


async def main():
    """Main entry point for SBF proxy agent."""
    print("=" * 60)
    print("🔵 SBF PROXY AGENT")
    print("   Purpose: User identity proxy for Coral threads")
    print("   Behavior: Does NOT generate responses")
    print("=" * 60)
    
    agent = SBFAgent()
    await agent.run()


if __name__ == "__main__":
    asyncio.run(main())
