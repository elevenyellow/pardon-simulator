"""
Donald Trump Agent - 47th President of the United States

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


class TrumpDonaldAgent(BaseAgent):
    """Donald Trump agent implementation with presidential tools and personality."""
    
    def __init__(self):
        super().__init__(
            agent_id="trump-donald",
            agent_name="Donald Trump",
            agent_description="Donald Trump - 47th President, makes final pardon decisions"
        )
    
    def get_agent_specific_tools(self):
        """Return Trump-specific tools loaded from tool-definitions.json."""
        return self.get_dynamic_tools()


async def main():
    """Main entry point for Donald Trump agent."""
    agent = TrumpDonaldAgent()
    await agent.run()


if __name__ == "__main__":
    asyncio.run(main())
