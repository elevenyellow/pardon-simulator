"""
CZ (Changpeng Zhao) Agent - Binance founder, recently pardoned by Trump

This agent uses the BaseAgent class to eliminate code duplication.
Agent-specific logic is minimal - only personality and tools.
"""

import os
import sys
import asyncio
from typing import Optional

# Add parent directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from langchain_core.tools import tool
from base_agent import BaseAgent, AgentWallet


class CZAgent(BaseAgent):
    """CZ agent implementation with Binance-specific tools and personality."""
    
    def __init__(self):
        super().__init__(
            agent_id="cz",
            agent_name="CZ",
            agent_description="CZ - Binance founder, recently pardoned by Trump"
        )
    
    def get_agent_specific_tools(self):
        """Return CZ-specific tools loaded from tool-definitions.json."""
        # Get dynamic tools from JSON
        dynamic_tools = self.get_dynamic_tools()
        
        # Add lookup_agent_wallet tool (keeps wallet lookup logic in code for security)
        @tool
        async def lookup_agent_wallet(agent_name: str) -> str:
            """
            Look up another agent's Solana wallet address by their name.
            Use this BEFORE sending crypto to find their wallet address.
            
            Available agents: trump-donald, trump-melania, trump-eric, trump-donjr, trump-barron, sbf, cz
            """
            from x402_payment_tools import AGENT_WALLETS
            
            if agent_name in AGENT_WALLETS:
                address = AGENT_WALLETS[agent_name]
                return f"✅ {agent_name}'s wallet address: {address}"
            else:
                available = ", ".join(AGENT_WALLETS.keys())
                return f"❌ Unknown agent '{agent_name}'. Available: {available}"
        
        dynamic_tools.append(lookup_agent_wallet)
        return dynamic_tools


async def main():
    """Main entry point for CZ agent."""
    agent = CZAgent()
    await agent.run()


if __name__ == "__main__":
    asyncio.run(main())
