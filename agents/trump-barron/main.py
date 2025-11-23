"""
Barron Trump Agent - Tech-savvy youngest son, crypto native

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


class TrumpBarronAgent(BaseAgent):
    """Barron Trump agent implementation with tech/crypto expertise."""
    
    def __init__(self):
        super().__init__(
            agent_id="trump-barron",
            agent_name="Barron Trump",
            agent_description="Barron Trump - Tech-savvy youngest son, crypto native"
        )
    
    def get_agent_specific_tools(self):
        """Return Barron-specific tools loaded from tool-definitions.json."""
        return self.get_dynamic_tools()


async def main():
    """Main entry point for Barron Trump agent."""
    agent = TrumpBarronAgent()
    await agent.run()


if __name__ == "__main__":
    asyncio.run(main())
