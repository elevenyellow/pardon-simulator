"""
Eric Trump Agent - Trump Organization executive, loyal son

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


class TrumpEricAgent(BaseAgent):
    """Eric Trump agent implementation with business-focused tools and personality."""
    
    def __init__(self):
        super().__init__(
            agent_id="trump-eric",
            agent_name="Eric Trump",
            agent_description="Eric Trump - Trump Organization executive, fiercely loyal son"
        )
    
    def get_agent_specific_tools(self):
        """Return Eric-specific tools loaded from tool-definitions.json."""
        return self.get_dynamic_tools()


async def main():
    """Main entry point for Eric Trump agent."""
    agent = TrumpEricAgent()
    await agent.run()


if __name__ == "__main__":
    asyncio.run(main())
