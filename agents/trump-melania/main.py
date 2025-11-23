"""
Melania Trump Agent - First Lady, strategic advisor

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


class TrumpMelaniaAgent(BaseAgent):
    """Melania Trump agent implementation with First Lady tools and personality."""
    
    def __init__(self):
        super().__init__(
            agent_id="trump-melania",
            agent_name="Melania Trump",
            agent_description="Melania Trump - First Lady, strategic advisor, image consultant"
        )
    
    def get_agent_specific_tools(self):
        """Return Melania-specific tools loaded from tool-definitions.json."""
        return self.get_dynamic_tools()


async def main():
    """Main entry point for Melania Trump agent."""
    agent = TrumpMelaniaAgent()
    await agent.run()


if __name__ == "__main__":
    asyncio.run(main())
