"""
Don Jr Agent - Political strategist, Trump's political heir

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


class TrumpDonJrAgent(BaseAgent):
    """Don Jr agent implementation with political strategy tools and personality."""
    
    def __init__(self):
        super().__init__(
            agent_id="trump-donjr",
            agent_name="Don Jr",
            agent_description="Donald Trump Jr - Political strategist, outspoken defender"
        )
    
    def get_agent_specific_tools(self):
        """Return Don Jr-specific tools loaded from tool-definitions.json."""
        return self.get_dynamic_tools()


async def main():
    """Main entry point for Don Jr agent."""
    agent = TrumpDonJrAgent()
    await agent.run()


if __name__ == "__main__":
    asyncio.run(main())
