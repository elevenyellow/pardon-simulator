"""
SBF Agent - Sam Bankman-Fried, former FTX CEO seeking pardon

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


class SBFAgent(BaseAgent):
    """SBF agent implementation with plea/negotiation tools."""
    
    def __init__(self):
        super().__init__(
            agent_id="sbf",
            agent_name="SBF",
            agent_description="Sam Bankman-Fried - FTX founder, seeking presidential pardon"
        )
    
    def get_agent_specific_tools(self):
        """Return SBF-specific tools loaded from tool-definitions.json."""
        return self.get_dynamic_tools()


async def main():
    """Main entry point for SBF agent."""
    agent = SBFAgent()
    await agent.run()


if __name__ == "__main__":
    asyncio.run(main())
