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
    
    Implementation:
    - Does NOT require SOLANA_PRIVATE_KEY (player uses browser wallet)
    - Does NOT require SOLANA_PUBLIC_ADDRESS (no wallet needed)
    - Overrides wallet/executor initialization to skip them
    - Base agent's safety checks prevent any message processing
    """
    
    def __init__(self):
        super().__init__(
            agent_id="sbf",
            agent_name="SBF (User)",
            agent_description="Player identity proxy - no autonomous behavior"
        )
    
    def get_agent_specific_tools(self):
        """SBF has no tools - returns empty list."""
        return []
    
    async def initialize_wallet(self) -> float:
        """
        Skip wallet initialization - player uses browser wallet.
        
        Returns:
            0.0 (no wallet balance)
        """
        print(f"[SBF-PROXY] Skipping wallet initialization - user controls wallet via browser", flush=True)
        self.wallet = None
        self.my_wallet_address = ""
        return 0.0
    
    async def create_agent_executor(self, coral_tools):
        """
        Skip executor creation - SBF doesn't process messages.
        
        Returns:
            Tuple of (None, "") - no executor, no wallet address
        """
        print(f"[SBF-PROXY] Skipping executor creation - no message processing", flush=True)
        return None, ""
    
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
