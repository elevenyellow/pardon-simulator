"""
Base Agent Class - Shared functionality for all Pardon Simulator agents

This module eliminates 4900+ lines of duplicated code across 7 agent main.py files
by extracting common patterns into reusable base classes.
"""

import urllib.parse
from dotenv import load_dotenv
import os
import json
import asyncio
import traceback
import sys
import time
import re
import requests
from typing import Dict, List, Optional, Tuple, Any, Callable
from abc import ABC, abstractmethod

from langchain.chat_models import init_chat_model
from langchain.prompts import ChatPromptTemplate
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain.agents import create_tool_calling_agent, AgentExecutor
from langchain_core.tools import tool, BaseTool
from solders.keypair import Keypair
from solders.pubkey import Pubkey
from solana.rpc.async_api import AsyncClient

# Add parent directory to path for imports
sys.path.append(os.path.dirname(__file__))
from x402_payment_tools import (
    X402_TOOLS,
    create_contact_agent_tool,
    reload_agent_wallets,
    AGENT_WALLETS,
    create_process_payment_payload_tool
)
from prompt_cache import get_dynamic_content
from executor_config import get_default_executor_limits, set_executor_invoke_timeout


class AgentWallet:
    """
    Unified wallet class for all agents.
    Handles Solana wallet operations and x402 facilitator integration.
    """
    
    def __init__(self, private_key_b58: str, rpc_url: str, owner_name: str):
        """
        Initialize agent wallet.
        
        Args:
            private_key_b58: Base58-encoded Solana private key
            rpc_url: Solana RPC endpoint URL
            owner_name: Human-readable owner name for logging
        """
        self.keypair = Keypair.from_base58_string(private_key_b58) if private_key_b58 else Keypair()
        self.client = AsyncClient(rpc_url)
        self.owner_name = owner_name
        
        # Import CDP client for x402 facilitator
        from x402_cdp_client import get_cdp_client
        self.cdp_client = get_cdp_client()
    
    async def get_balance(self) -> float:
        """Get wallet balance in SOL."""
        try:
            response = await self.client.get_balance(self.keypair.pubkey())
            return response.value / 1e9
        except Exception as e:
            print(f"Error getting balance: {e}")
            return 0.0
    
    async def send_transaction(self, to_address: str, amount_sol: float) -> Dict[str, Any]:
        """
        Send SOL transaction via x402 compliant CDP facilitator.
        
        Args:
            to_address: Recipient's Solana wallet address
            amount_sol: Amount in SOL (converted to USDC for x402)
        
        Returns:
            Transaction result dict with success status and signature
        """
        try:
            from x402_payment_tools import submit_payment_via_x402_facilitator
            
            use_x402_facilitator = os.getenv("USE_X402_FACILITATOR", "true").lower() == "true"
            
            if use_x402_facilitator:
                try:
                    print(f"[INFO] Using x402 facilitator for transaction submission", flush=True)
                    
                    result = await submit_payment_via_x402_facilitator(
                        from_keypair=self.keypair,
                        to_address=to_address,
                        amount_usdc=amount_sol,
                        network="solana"
                    )
                    
                    if result.get("success"):
                        print(f"[OK] Transaction via x402 facilitator", flush=True)
                        print(f"   Signature: {result['signature']}", flush=True)
                        return {
                            "success": True,
                            "signature": result["signature"],
                            "from": str(self.keypair.pubkey()),
                            "to": to_address,
                            "amount": amount_sol,
                            "via_x402_facilitator": True,
                            "x402_compliant": True,
                            "x402_scan_url": result.get("x402_scan_url")
                        }
                    else:
                        print(f"WARNING: x402 facilitator failed: {result.get('error')}", flush=True)
                        
                except Exception as facilitator_error:
                    print(f"ERROR: x402 facilitator error: {facilitator_error}", flush=True)
                    traceback.print_exc()
            
            # x402 requires USDC
            return {
                "success": False,
                "error": "Payment failed. x402 payments require USDC.",
                "reason": "x402_facilitator_required"
            }
            
        except Exception as e:
            print(f"[ERROR] Transaction error: {e}")
            traceback.print_exc()
            return {"success": False, "error": str(e)}


class BaseAgent(ABC):
    """
    Base class for all Pardon Simulator agents.
    
    Provides common functionality:
    - Environment initialization
    - Wallet management
    - Coral server connection
    - Agent executor creation
    - Message processing loop
    - Payment detection and handling
    - Error handling and retries
    """
    
    def __init__(self, agent_id: str, agent_name: str, agent_description: str):
        """
        Initialize base agent.
        
        Args:
            agent_id: Coral agent ID (e.g., "cz", "trump-donald")
            agent_name: Human-readable name (e.g., "CZ", "Donald Trump")
            agent_description: Short description for Coral registration
        """
        self.agent_id = agent_id
        self.agent_name = agent_name
        self.agent_description = agent_description
        self.wallet: Optional[AgentWallet] = None
        self.agent_executor: Optional[AgentExecutor] = None
        self.my_wallet_address: str = ""
        self.executor_limits = get_default_executor_limits()
    
    @abstractmethod
    def get_agent_specific_tools(self) -> List[BaseTool]:
        """
        Get agent-specific tools (e.g., check_my_balance, influence_trump_opinion).
        Must be implemented by each agent subclass.
        
        Returns:
            List of LangChain tools specific to this agent
        """
        pass
    
    def load_environment(self) -> None:
        """Load environment variables from agent's .env file."""
        agent_dir = os.path.dirname(os.path.abspath(sys.modules[self.__class__.__module__].__file__))
        load_dotenv(os.path.join(agent_dir, '.env'), override=False)
        reload_agent_wallets()
    
    def load_dynamic_content(self) -> Dict[str, str]:
        """Load cached scoring mandate and communication notes."""
        agent_dir = os.path.dirname(os.path.abspath(sys.modules[self.__class__.__module__].__file__))
        return get_dynamic_content(agent_dir, self.agent_id)
    
    def load_agent_prompt(self, **variables) -> str:
        """
        Load agent operational prompts (shared + agent-specific).
        
        Args:
            **variables: Variables to substitute in template
        
        Returns:
            Formatted prompt string
        """
        agent_dir = os.path.dirname(os.path.abspath(sys.modules[self.__class__.__module__].__file__))
        shared_dir = os.path.join(os.path.dirname(agent_dir), "shared")
        
        # Load shared operational template
        operational_shared_file = os.path.join(shared_dir, "operational-template.txt")
        if not os.path.exists(operational_shared_file):
            raise FileNotFoundError(f"Shared operational template not found: {operational_shared_file}")
        
        with open(operational_shared_file, 'r', encoding='utf-8') as f:
            operational_shared = f.read()
        
        # Load agent-specific operational additions
        operational_specific_file = os.path.join(agent_dir, "operational-private.txt")
        if not os.path.exists(operational_specific_file):
            raise FileNotFoundError(f"Agent operational file not found: {operational_specific_file}")
        
        with open(operational_specific_file, 'r', encoding='utf-8') as f:
            operational_specific = f.read()
        
        # Combine operational content
        combined = f"{operational_shared}\n\n{operational_specific}"
        
        # Substitute variables
        try:
            return combined.format(**variables)
        except KeyError as e:
            raise ValueError(f"Missing variable in prompt template: {e}")
    
    def load_tool_definitions(self) -> List[dict]:
        """
        Load tool definitions from agent's tool-definitions.json file.
        
        Returns:
            List of tool definition dictionaries (empty list if file missing or invalid)
        """
        agent_dir = os.path.dirname(os.path.abspath(sys.modules[self.__class__.__module__].__file__))
        tool_file = os.path.join(agent_dir, "tool-definitions.json")
        
        if not os.path.exists(tool_file):
            print(f"ℹ️  [{self.agent_id}] No tool-definitions.json found at {tool_file}")
            print(f"   Agent will have no dynamic tools (this is OK if tools are defined in code)")
            return []
        
        try:
            with open(tool_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                tools = data.get("tools", [])
                
                if not isinstance(tools, list):
                    print(f"❌ [{self.agent_id}] ERROR: 'tools' in {tool_file} must be a list, got {type(tools).__name__}")
                    return []
                
                print(f"✅ [{self.agent_id}] Loaded {len(tools)} tool definition(s) from {tool_file}")
                return tools
                
        except json.JSONDecodeError as e:
            print(f"❌ [{self.agent_id}] ERROR: Invalid JSON in {tool_file}")
            print(f"   Line {e.lineno}, Column {e.colno}: {e.msg}")
            print(f"   Agent will continue without dynamic tools")
            return []
        except Exception as e:
            print(f"❌ [{self.agent_id}] ERROR: Failed to load {tool_file}: {e}")
            print(f"   Agent will continue without dynamic tools")
            return []
    
    def create_dynamic_tool(self, tool_def: dict) -> Optional[BaseTool]:
        """
        Create a LangChain tool from a JSON tool definition.
        
        Args:
            tool_def: Dictionary containing tool name, description, parameters, and response
        
        Returns:
            A LangChain BaseTool instance, or None if creation failed
        """
        # Validate required fields
        tool_name = tool_def.get("name")
        if not tool_name:
            print(f"❌ [{self.agent_id}] ERROR: Tool definition missing 'name' field: {tool_def}")
            return None
        
        tool_description = tool_def.get("description")
        if not tool_description:
            print(f"❌ [{self.agent_id}] ERROR: Tool '{tool_name}' missing 'description' field")
            return None
        
        parameters = tool_def.get("parameters", {})
        
        # Validate that we have either response or response_template
        has_template = "response_template" in tool_def
        has_response = "response" in tool_def
        
        if not has_template and not has_response:
            print(f"❌ [{self.agent_id}] ERROR: Tool '{tool_name}' missing both 'response' and 'response_template'")
            return None
        
        # Create function signature dynamically based on parameters
        if parameters:
            # Tool with parameters - use response_template
            response_template = tool_def.get("response_template", "")
            
            if not response_template:
                print(f"❌ [{self.agent_id}] ERROR: Tool '{tool_name}' has parameters but no 'response_template'")
                return None
            
            # Validate template has placeholders for all parameters
            try:
                # Test format with dummy values
                test_kwargs = {param: "test" for param in parameters.keys()}
                response_template.format(**test_kwargs)
            except KeyError as e:
                print(f"⚠️  [{self.agent_id}] WARNING: Tool '{tool_name}' response_template missing placeholder for parameter: {e}")
            except Exception as e:
                print(f"❌ [{self.agent_id}] ERROR: Tool '{tool_name}' has invalid response_template: {e}")
                return None
            
            # Build function with keyword arguments
            async def dynamic_tool_func(**kwargs):
                try:
                    # Special handling for check_my_balance - inject actual balance
                    if tool_name == "check_my_balance":
                        if self.wallet is None:
                            return "Wallet not initialized"
                        balance = await self.wallet.get_balance()
                        return response_template.format(balance=balance, **kwargs)
                    
                    # For other tools, just format with provided parameters
                    return response_template.format(**kwargs)
                except KeyError as e:
                    error_msg = f"Tool '{tool_name}' template error: missing parameter {e}"
                    print(f"❌ [{self.agent_id}] {error_msg}")
                    return f"⚠️ Error: {error_msg}"
                except Exception as e:
                    error_msg = f"Tool '{tool_name}' execution error: {e}"
                    print(f"❌ [{self.agent_id}] {error_msg}")
                    return f"⚠️ Error: {error_msg}"
            
            # Set function metadata
            dynamic_tool_func.__name__ = tool_name
            dynamic_tool_func.__doc__ = tool_description
            
            # Add parameter annotations for LangChain
            annotations = {}
            for param_name, param_info in parameters.items():
                # Support type specification in config, default to string
                param_type = str
                if isinstance(param_info, dict):
                    type_name = param_info.get("type", "string")
                    if type_name == "int" or type_name == "integer":
                        param_type = int
                    elif type_name == "float" or type_name == "number":
                        param_type = float
                    elif type_name == "bool" or type_name == "boolean":
                        param_type = bool
                annotations[param_name] = param_type
            dynamic_tool_func.__annotations__ = annotations
            
        else:
            # Tool without parameters - use static response
            static_response = tool_def.get("response", "")
            
            if not static_response:
                print(f"❌ [{self.agent_id}] ERROR: Tool '{tool_name}' has no parameters but no 'response' field")
                return None
            
            async def dynamic_tool_func():
                try:
                    # Special handling for check_my_balance
                    if tool_name == "check_my_balance":
                        if self.wallet is None:
                            return "Wallet not initialized"
                        balance = await self.wallet.get_balance()
                        return static_response.format(balance=balance)
                    
                    return static_response
                except Exception as e:
                    error_msg = f"Tool '{tool_name}' execution error: {e}"
                    print(f"❌ [{self.agent_id}] {error_msg}")
                    return f"⚠️ Error: {error_msg}"
            
            dynamic_tool_func.__name__ = tool_name
            dynamic_tool_func.__doc__ = tool_description
        
        try:
            # Convert to LangChain tool
            return tool(dynamic_tool_func)
        except Exception as e:
            print(f"❌ [{self.agent_id}] ERROR: Failed to convert '{tool_name}' to LangChain tool: {e}")
            return None
    
    def get_dynamic_tools(self) -> List[BaseTool]:
        """
        Load and create all dynamic tools from tool-definitions.json.
        
        Returns:
            List of dynamically created LangChain tools (empty list if all fail)
        """
        tool_definitions = self.load_tool_definitions()
        
        if not tool_definitions:
            return []
        
        dynamic_tools = []
        failed_tools = []
        
        for i, tool_def in enumerate(tool_definitions):
            if not isinstance(tool_def, dict):
                print(f"❌ [{self.agent_id}] ERROR: Tool definition #{i+1} is not a dictionary, got {type(tool_def).__name__}")
                failed_tools.append(f"#{i+1}")
                continue
            
            tool_name = tool_def.get("name", f"unknown_tool_{i+1}")
            
            try:
                dynamic_tool = self.create_dynamic_tool(tool_def)
                if dynamic_tool is not None:
                    dynamic_tools.append(dynamic_tool)
                    print(f"   ✅ [{self.agent_id}] Tool '{tool_name}' created successfully")
                else:
                    failed_tools.append(tool_name)
            except KeyError as e:
                print(f"❌ [{self.agent_id}] ERROR: Tool '{tool_name}' missing required field: {e}")
                failed_tools.append(tool_name)
            except Exception as e:
                print(f"❌ [{self.agent_id}] ERROR: Failed to create tool '{tool_name}': {type(e).__name__}: {e}")
                print(f"   Tool definition: {tool_def}")
                failed_tools.append(tool_name)
        
        # Summary
        if dynamic_tools:
            print(f"✅ [{self.agent_id}] Successfully created {len(dynamic_tools)} dynamic tool(s)")
        
        if failed_tools:
            print(f"⚠️  [{self.agent_id}] Failed to create {len(failed_tools)} tool(s): {', '.join(failed_tools)}")
            print(f"   Agent will continue with {len(dynamic_tools)} working tool(s)")
        
        return dynamic_tools
    
    async def initialize_wallet(self) -> float:
        """
        Initialize agent wallet and return initial balance.
        
        Returns:
            Initial wallet balance in SOL
        """
        rpc_url = os.getenv("SOLANA_RPC_URL")
        if not rpc_url:
            raise ValueError("SOLANA_RPC_URL environment variable is required")
        
        # Try agent-specific key first (e.g., SOLANA_PRIVATE_KEY_CZ)
        # Fall back to generic SOLANA_PRIVATE_KEY if not found
        agent_key_var = f"SOLANA_PRIVATE_KEY_{self.agent_id.upper().replace('-', '_')}"
        private_key = os.getenv(agent_key_var) or os.getenv("SOLANA_PRIVATE_KEY", "")
        
        if not private_key:
            print(f"⚠️  Warning: No private key found for {agent_key_var} or SOLANA_PRIVATE_KEY", flush=True)
        
        print(f"[DEBUG] Creating AgentWallet...", flush=True)
        self.wallet = AgentWallet(
            private_key,
            rpc_url,
            self.agent_name
        )
        print(f"[DEBUG] AgentWallet created", flush=True)
        
        try:
            print(f"[DEBUG] Getting balance with 5s timeout...", flush=True)
            balance = await asyncio.wait_for(self.wallet.get_balance(), timeout=5.0)
            print(f"[DEBUG] Balance retrieved: {balance}", flush=True)
        except (asyncio.TimeoutError, Exception) as e:
            print(f"⚠️  Balance check failed: {e} - continuing anyway", flush=True)
            balance = 0.0
        
        self.my_wallet_address = str(self.wallet.keypair.pubkey())
        print(f"[DEBUG] Wallet address set: {self.my_wallet_address}", flush=True)
        return balance
    
    async def create_agent_executor(self, coral_tools: List[BaseTool]) -> Tuple[AgentExecutor, str]:
        """
        Create the agent executor with all tools and prompts.
        
        Args:
            coral_tools: Tools provided by Coral server
        
        Returns:
            Tuple of (AgentExecutor, wallet_address)
        """
        # Get wallet address from environment
        my_wallet_address = os.getenv("SOLANA_PUBLIC_ADDRESS", "")
        if not my_wallet_address:
            raise ValueError(f"SOLANA_PUBLIC_ADDRESS environment variable required for {self.agent_id}")
        
        # Find Coral tools for contact_agent wrapper
        coral_send_message_tool = next((t for t in coral_tools if t.name == "coral_send_message"), None)
        if not coral_send_message_tool:
            raise ValueError("coral_send_message tool not found!")
        
        coral_add_participant_tool = next((t for t in coral_tools if t.name == "coral_add_participant"), None)
        if not coral_add_participant_tool:
            raise ValueError("coral_add_participant tool not found!")
        
        # Create contact_agent wrapper with agent_id for automatic confirmation
        contact_agent_tool = create_contact_agent_tool(coral_send_message_tool, coral_add_participant_tool, self.agent_id)
        
        # Create process_payment_payload tool
        process_payment_tool = create_process_payment_payload_tool(my_wallet_address)
        
        # Combine all tools
        agent_specific_tools = self.get_agent_specific_tools()
        combined_tools = (
            coral_tools + 
            agent_specific_tools + 
            X402_TOOLS + 
            [contact_agent_tool, process_payment_tool]
        )
        
        # Load prompt
        prompt_text = self.load_agent_prompt(
            agent_name=self.agent_id,
            my_wallet_address=my_wallet_address
        )
        
        prompt = ChatPromptTemplate.from_messages([
            ("system", prompt_text),
            ("human", "{input}"),
            ("placeholder", "{agent_scratchpad}")
        ])
        
        # Model configuration
        model_kwargs = {
            "model": os.getenv("MODEL_NAME", "gpt-5.1"),
            "model_provider": os.getenv("MODEL_PROVIDER", "openai"),
            "api_key": os.getenv("MODEL_API_KEY"),
            "temperature": float(os.getenv("MODEL_TEMPERATURE", "0.7")),
            "max_tokens": int(os.getenv("MODEL_MAX_TOKENS", "2000"))
        }
        
        # Optional reasoning effort for advanced models
        reasoning_effort = os.getenv("MODEL_REASONING_EFFORT")
        if reasoning_effort and reasoning_effort.strip():
            model_kwargs["reasoning_effort"] = reasoning_effort
        
        base_url = os.getenv("MODEL_BASE_URL")
        if base_url and base_url.strip():
            model_kwargs["base_url"] = base_url
        
        model = init_chat_model(**model_kwargs)
        agent = create_tool_calling_agent(model, combined_tools, prompt)
        
        agent_executor = AgentExecutor(
            agent=agent,
            tools=combined_tools,
            verbose=True,  # TEMPORARY: Debug tool calling issues
            handle_parsing_errors=True,
            max_iterations=self.executor_limits["max_iterations"],
            max_execution_time=self.executor_limits["max_execution_time"],
            return_intermediate_steps=True,  # CRITICAL: Required for fallback logic to detect if coral_send_message was called
        )
        
        set_executor_invoke_timeout(agent_executor, self.executor_limits["invoke_timeout"])
        
        return agent_executor, my_wallet_address
    
    async def connect_to_coral_server(self) -> Tuple[MultiServerMCPClient, List[BaseTool], Optional[Dict[str, List[BaseTool]]]]:
        """
        Connect to Coral server and retrieve tools.
        Supports multi-session connections for production load distribution.
        
        Returns:
            Tuple of (MCP client, coral tools list, optional dict of all pool tools)
                - all_pool_tools is None for single-session mode
                - all_pool_tools is Dict[pool_name, tools] for multi-session mode
        """
        # Check for multi-session configuration (production pooling)
        coral_sessions_env = os.getenv('CORAL_SESSIONS')
        session_id_env = os.getenv('CORAL_SESSION_ID')
        
        if coral_sessions_env:
            # Multi-session mode: connect to all pools for production scaling
            session_ids = [s.strip() for s in coral_sessions_env.split(',')]
            print(f"[CORAL] 🌐 Multi-session mode: connecting to {len(session_ids)} pools")
            return await self.connect_to_multiple_sessions(session_ids)
        elif session_id_env:
            # Single session mode: for local testing
            print(f"[CORAL] 🔗 Single session mode: {session_id_env}")
            return await self.connect_to_single_session(session_id_env)
        else:
            # Production mode without explicit session (legacy)
            print("[CORAL] 🌐 Production mode (no explicit session)")
            return await self.connect_to_single_session(None)
    
    async def connect_to_single_session(self, session_id: Optional[str]) -> Tuple[MultiServerMCPClient, List[BaseTool], None]:
        """
        Connect to a single Coral session.
        
        CRITICAL: This returns a MultiServerMCPClient, but the agent MUST use
        client.session() to create a persistent session for all tool calls.
        Otherwise, each tool call creates a new SSE connection which causes
        agents to stop responding in production.
        
        Args:
            session_id: Optional session ID (None for production auto-session)
        
        Returns:
            Tuple of (MCP client, empty list (tools loaded in run()), None)
        """
        base_url = os.getenv('CORAL_SSE_URL')
        
        # Check if URL already has the complete SSE path from Coral Server
        # Coral format: /sse/v1/{app}/{priv}/{sessionId}/sse
        if session_id and base_url.endswith('/sse'):
            # URL already complete, don't append session_id again
            url = base_url
            coral_params = {
                'agentId': self.agent_id,
                'agentDescription': self.agent_description
            }
        elif session_id and '/sse/v1/' in base_url:
            # Append sessionId to path for /sse/v1/devmode/{app}/{priv}/{sessionId} format
            url = f"{base_url}/{session_id}"
            coral_params = {
                'agentId': self.agent_id,
                'agentDescription': self.agent_description
            }
        else:
            # Use query parameters for simple /sse endpoint
            coral_params = {
                'agentId': self.agent_id,
                'agentDescription': self.agent_description
            }
            if session_id:
                coral_params['sessionId'] = session_id
            url = f"{base_url}?{urllib.parse.urlencode(coral_params)}"
            coral_params = {}  # Already in URL
        
        # Add any remaining query params
        if coral_params:
            url = f"{url}?{urllib.parse.urlencode(coral_params)}"
        
        client = MultiServerMCPClient(connections={
            "coral": {
                "transport": "sse",
                "url": url,
                "timeout": 30.0,  # Connection establishment timeout
                "sse_read_timeout": 700.0  # Must be longer than wait_for_mentions max (600s)
            }
        })
        
        # Return client WITHOUT loading tools yet
        # Tools will be loaded in a persistent session context
        return client, [], None
    
    async def connect_to_multiple_sessions(self, session_ids: List[str]) -> Tuple[MultiServerMCPClient, List[BaseTool], Dict[str, List[BaseTool]]]:
        """
        Connect to multiple Coral sessions for load distribution.
        Each agent connects to all pools and responds to mentions in any of them.
        
        Args:
            session_ids: List of session IDs to connect to (e.g., ['pool-0', 'pool-1', ...])
        
        Returns:
            Tuple of (MCP client, coral tools from first pool, dict of all pool tools)
        """
        connections = {}
        base_url = os.getenv('CORAL_SSE_URL')
        
        for session_id in session_ids:
            # Format URL correctly based on endpoint type
            if '/sse/v1/' in base_url:
                # Append sessionId to path for /sse/v1/devmode/{app}/{priv}/{sessionId} format
                url = f"{base_url}/{session_id}"
                coral_params = {
                    'agentId': self.agent_id,
                    'agentDescription': self.agent_description
                }
            else:
                # Use query parameters for simple /sse endpoint
                coral_params = {
                    'agentId': self.agent_id,
                    'agentDescription': self.agent_description,
                    'sessionId': session_id
                }
                url = f"{base_url}?{urllib.parse.urlencode(coral_params)}"
                coral_params = {}  # Already in URL
            
            # Add any remaining query params
            if coral_params:
                url = f"{url}?{urllib.parse.urlencode(coral_params)}"
            
            # Create unique connection name for each pool
            connections[f"coral-{session_id}"] = {
                "transport": "sse",
                "url": url,
                "timeout": 30.0,  # Connection establishment timeout
                "sse_read_timeout": 700.0  # Must be longer than wait_for_mentions max (600s)
            }
            print(f"[CORAL]   → {session_id} @ {url}")
        
        # Create client with all connections
        client = MultiServerMCPClient(connections=connections)
        
        # Get tools from ALL pools and store them
        all_pool_tools = {}
        for session_id in session_ids:
            pool_name = f"coral-{session_id}"
            try:
                tools = await client.get_tools(server_name=pool_name)
                all_pool_tools[pool_name] = tools
                print(f"[CORAL]   ✓ {pool_name}: {len(tools)} tools loaded")
            except Exception as e:
                print(f"[CORAL]   ✗ {pool_name}: Failed - {e}")
                # Continue with other pools (partial OK strategy)
        
        # Return tools from first successful pool for backward compatibility
        if not all_pool_tools:
            raise RuntimeError("Failed to load tools from any pool")
        
        first_pool = f"coral-{session_ids[0]}"
        coral_tools = all_pool_tools.get(first_pool) or list(all_pool_tools.values())[0]
        
        print(f"[CORAL] ✅ Connected to {len(session_ids)} session pools ({len(all_pool_tools)} successful)")
        return client, coral_tools, all_pool_tools
    
    def extract_user_wallet(self, message_content: str) -> Optional[str]:
        """
        Extract user wallet address from message content.
        
        Args:
            message_content: Raw message content with wallet marker
        
        Returns:
            Wallet address or None if not found
        """
        wallet_match = re.search(r'\[USER_WALLET:([1-9A-HJ-NP-Za-km-z]{32,44})\]', message_content)
        return wallet_match.group(1) if wallet_match else None
    
    def detect_payment(self, message_content: str) -> Optional[Tuple[str, str, float, Optional[str]]]:
        """
        Detect payment completion marker in message.
        
        Args:
            message_content: Message content to scan
        
        Returns:
            Tuple of (transaction_signature, service_type, amount_usdc, payment_id) or None
        """
        # Enhanced marker format: [PREMIUM_SERVICE_PAYMENT_COMPLETED: tx|service|amount|payment_id]
        # payment_id is optional for backward compatibility
        payment_match = re.search(
            r'\[PREMIUM_SERVICE_PAYMENT_COMPLETED:\s*([A-Za-z0-9]{87,88})\|(\w+)\|([\d.]+)(?:\|([^\]]+))?\]',
            message_content
        )
        
        if payment_match:
            transaction_signature = payment_match.group(1)
            service_type = payment_match.group(2)
            amount_usdc = float(payment_match.group(3))
            payment_id = payment_match.group(4) if payment_match.group(4) else None
            print(f"[PAYMENT DETECTION] Enhanced marker: tx={transaction_signature[:8]}..., service={service_type}, amount={amount_usdc} USDC, payment_id={payment_id}")
            return (transaction_signature, service_type, amount_usdc, payment_id)
        
        # Fallback: old format without service info (for backwards compatibility)
        legacy_match = re.search(
            r'\[PREMIUM_SERVICE_PAYMENT_COMPLETED:\s*([A-Za-z0-9]{87,88})\]',
            message_content
        )
        
        if legacy_match:
            print("[WARNING] Legacy payment marker detected - cannot extract service type/amount")
            transaction_signature = legacy_match.group(1)
            # Try to extract from context or use safe defaults
            service_type = "unknown"
            amount_usdc = 0.0005  # Minimum default
            payment_id = None
            return (transaction_signature, service_type, amount_usdc, payment_id)
        
        return None
    
    def create_payment_instruction(
        self,
        transaction_signature: str,
        user_wallet: str,
        service_type: str,
        amount_usdc: float,
        payment_id: Optional[str] = None
    ) -> str:
        """Create explicit payment processing instruction for LLM."""
        payment_id_param = f',\n       payment_id="{payment_id}"' if payment_id else ''
        return f"""
🚨 PAYMENT COMPLETION DETECTED 🚨

Transaction Signature: {transaction_signature}
User Wallet: {user_wallet}
Service Type: {service_type}
Amount: {amount_usdc} USDC
Payment ID: {payment_id or 'N/A'}

MANDATORY ACTIONS (Execute in THIS turn):

1. Call verify_payment_transaction() immediately:
   verify_payment_transaction(
       transaction_hash="{transaction_signature}",
       expected_from="{user_wallet}",
       expected_amount_usdc={amount_usdc},
       service_type="{service_type}"{payment_id_param}
   )

2. After verification succeeds, deliver the {service_type} service immediately

3. Respond to user with the delivered service content

DO NOT just acknowledge payment - DELIVER THE SERVICE NOW!

"""
    
    def extract_session_id_from_url(self) -> Optional[str]:
        """
        Extract session ID from CORAL_SSE_URL or CORAL_SESSION_ID env var.
        
        Production URL format: http://localhost:5555/sse/v1/devmode/app/priv/production-main
        The session ID is the last path segment before query params.
        
        Returns:
            Session ID or None if not found
        """
        # First check explicit env var
        session_id = os.getenv('CORAL_SESSION_ID')
        if session_id:
            return session_id
        
        # Extract from CORAL_SSE_URL
        sse_url = os.getenv('CORAL_SSE_URL', '')
        if not sse_url:
            return None
        
        try:
            # Parse URL: http://localhost:5555/sse/v1/devmode/app/priv/production-main
            # Extract "production-main" from the path
            from urllib.parse import urlparse
            parsed = urlparse(sse_url)
            path_parts = parsed.path.strip('/').split('/')
            
            # Look for path pattern: /sse/v1/devmode/app/priv/{session_id}
            if 'sse' in path_parts and len(path_parts) >= 6:
                # Session ID is typically the last part of the path
                session_id = path_parts[-1]
                if session_id and session_id != 'sse':  # Validate it's not the endpoint
                    return session_id
        except Exception as e:
            print(f"[Context] Failed to parse session ID from URL: {e}", flush=True)
        
        return None
    
    def fetch_thread_history(self, thread_id: str, limit: int = 10) -> str:
        """
        Fetch recent thread history for conversation context.
        Returns formatted conversation history (last N messages).
        
        Args:
            thread_id: Thread ID to fetch messages from
            limit: Number of recent messages to include (default: 10)
        
        Returns:
            Formatted conversation history as a string
        """
        try:
            # Get session ID from environment
            session_id = self.extract_session_id_from_url()
            if not session_id:
                print(f"[Context] No session ID available - skipping history fetch", flush=True)
                return ""
            
            coral_server_url = os.getenv('CORAL_SERVER_URL', 'http://localhost:5555')
            url = f"{coral_server_url}/api/v1/debug/thread/app/priv/{session_id}/{thread_id}/messages"
            
            response = requests.get(url, timeout=2)
            
            if response.ok:
                data = response.json()
                messages = data.get('messages', [])
                
                if not messages:
                    return ""
                
                # Get last N messages (we'll exclude the current one being processed)
                # Take one extra to account for the current message
                recent_messages = messages[-(limit + 1):-1] if len(messages) > limit else messages[:-1] if len(messages) > 1 else []
                
                if not recent_messages:
                    return ""
                
                # Format as conversation
                formatted = []
                for msg in recent_messages:
                    sender = msg.get('senderId', 'unknown')
                    content = msg.get('content', '')
                    
                    # Clean up USER_WALLET markers
                    content = re.sub(r'\[USER_WALLET:[1-9A-HJ-NP-Za-km-z]{32,44}]\s*', '', content)
                    
                    # Clean up premium service payment markers
                    content = re.sub(r'\[PREMIUM_SERVICE_PAYMENT_COMPLETED\]', '', content)
                    
                    # Skip empty messages after cleaning
                    if not content.strip():
                        continue
                    
                    # Format sender name
                    if sender == 'sbf':
                        sender_name = "User (SBF)"
                    elif sender == self.agent_id:
                        sender_name = "You"
                    elif sender == 'system' or sender == 'prison':
                        sender_name = "System"
                    else:
                        # Format agent names nicely (e.g., "trump-donald" -> "Donald Trump")
                        sender_name = sender.replace('-', ' ').replace('trump ', '').title()
                        if 'trump' in sender:
                            sender_name = sender_name + " Trump"
                    
                    formatted.append(f"{sender_name}: {content.strip()}")
                
                if not formatted:
                    return ""
                
                return "\n".join(formatted)
            
            return ""
        
        except Exception as e:
            print(f"[Context] Failed to fetch thread history: {e}", flush=True)
            return ""
    
    async def process_message(
        self,
        mentions_data: Dict[str, Any],
        dynamic_content: Dict[str, str]
    ) -> Optional[Dict[str, Any]]:
        """
        Process a single message with retry logic.
        
        Args:
            mentions_data: Parsed mentions data from Coral
            dynamic_content: Dynamic content (scoring mandate, etc.)
        
        Returns:
            Response dict or None if all retries failed
        """
        # Import intermediary state utilities
        from utils.intermediary_state import check_intermediary_state, clear_intermediary_state
        
        message_payload = mentions_data["messages"][0]
        sender_id = message_payload["senderId"]
        message_content = message_payload["content"]
        thread_id = message_payload.get("threadId", "unknown")
        message_timestamp = message_payload.get("timestamp", 0)
        
        # CRITICAL SAFETY: SBF agent never generates responses
        # This prevents SBF from responding even if override fails
        if self.agent_id == "sbf":
            print(f"[SBF-PROXY] Blocking message processing - SBF is user proxy only")
            print(f"[SBF-PROXY] Ignoring mention from '{sender_id}'")
            return None
        
        # STALENESS CHECK: Ignore messages older than 5 minutes for non-user messages
        # This prevents agents from responding to out-of-context messages after container restarts
        if sender_id != "sbf" and message_timestamp:
            import time
            message_age_seconds = time.time() - (message_timestamp / 1000.0)  # Convert ms to seconds
            if message_age_seconds > 300:  # 5 minutes
                print(f"[MessageFilter] Ignoring stale message from {sender_id} (age: {message_age_seconds:.0f}s)")
                print(f"[MessageFilter] Message too old - likely from before container restart")
                return None
        
        # FIX ISSUE #2: Check if this agent is in intermediary mode
        # If we're waiting for a response from sender_id (after using contact_agent),
        # we should stay silent - the user can already see the response
        if sender_id != "sbf":
            intermediary_state = await check_intermediary_state(
                agent_id=self.agent_id,
                thread_id=thread_id,
                sender_id=sender_id
            )
            
            if intermediary_state:
                print(f"[IntermediaryMode] {self.agent_id} is waiting for {sender_id}'s response")
                print(f"[IntermediaryMode] Staying silent - user can see the message directly")
                print(f"[IntermediaryMode] Clearing intermediary state (job complete)")
                
                # Clear the state - the intermediary's job is done
                await clear_intermediary_state(self.agent_id, thread_id)
                
                # Don't invoke the agent - stay silent
                return None
        
        is_user_message = sender_id == "sbf"
        
        if is_user_message:
            # Extract user wallet
            user_wallet = self.extract_user_wallet(message_content)
            if not user_wallet:
                print(f"[SECURITY] Message from 'sbf' missing USER_WALLET marker")
                is_user_message = False
            
            if user_wallet:
                # Clean message content
                clean_content = re.sub(r'\[USER_WALLET:[1-9A-HJ-NP-Za-km-z]{32,44}]\s*', '', message_content)
                mentions_data["messages"][0]["content"] = clean_content
                
                # Detect payment
                payment_info = self.detect_payment(message_content)
                payment_instruction = ""
                
                if payment_info:
                    tx_sig, service_type, amount, payment_id = payment_info
                    payment_instruction = self.create_payment_instruction(
                        tx_sig, user_wallet, service_type, amount, payment_id
                    )
                else:
                    # NO PAYMENT DETECTED - Check if this is a connection_intro request!
                    # Add context-aware detection instruction
                    payment_instruction = f"""
🚨 CONNECTION_INTRO CHECK (Read Carefully - Context Matters!) 🚨

STEP 1: Is the user's CURRENT message asking you to contact another agent?

⚠️ IMPORTANT: Only trigger connection_intro if ALL conditions are met:
   a) User's CURRENT message explicitly asks you to contact/ask another agent
   b) The request is new and not already fulfilled
   c) User hasn't moved on to other topics since the request

DETECTION PATTERNS - User's CURRENT message must DIRECTLY ask:
- "Can you ask [agent]..." / "Would you ask [agent]..."
- "Ask [agent] about..." / "Contact [agent]..."
- "Talk to [agent] for me..." / "Reach out to [agent]..."
- "Get [agent]'s opinion..." / "Ping [agent]..."

❌ DO NOT TRIGGER if:
- The user already received a response from the requested agent
- The user is talking about other topics now
- You already provided the connection_intro service
- The message is just mentioning an agent (not asking you to contact them)
- The request is more than 2-3 messages old

✅ ONLY TRIGGER if:
- User's CURRENT message is clearly asking you to contact an agent RIGHT NOW
- No payment request was sent yet for this specific request
- The conversation hasn't moved on to other topics

WORKFLOW if connection_intro detected:
1. Parse: target_agent and question
2. IMMEDIATELY call request_premium_service(from_agent='sbf', to_agent='{self.agent_id}', service_type='connection_intro', details='...')
3. Send payment request XML to user
4. STOP - DO NOT contact agent yet - wait for payment!

Only after payment verified should you call contact_agent()!

"""
                
                # Fetch conversation history for context
                conversation_history = ""
                
                if thread_id != "unknown":
                    print(f"[Context] Fetching thread history for context (thread: {thread_id[:8]}...)", flush=True)
                    history_text = self.fetch_thread_history(thread_id, limit=10)
                    
                    if history_text:
                        conversation_history = f"""
═══════════════════════════════════════════════════════════════
📜 RECENT CONVERSATION HISTORY (Last 10 messages)
═══════════════════════════════════════════════════════════════

{history_text}

═══════════════════════════════════════════════════════════════
📨 CURRENT MESSAGE (respond to this)
═══════════════════════════════════════════════════════════════

"""
                        print(f"[Context] Added {len(history_text.split(chr(10)))} messages of context", flush=True)
                    else:
                        print(f"[Context] No history available (new conversation)", flush=True)
                
                # Build full input with scoring
                scoring_mandate = dynamic_content['scoring_mandate']
                user_wallet_instruction = (
                    f"\n\n🎯 CRITICAL SCORING INSTRUCTION:\n"
                    f"The user's ACTUAL wallet address is: {user_wallet}\n"
                    f"You MUST use '{user_wallet}' as the user_wallet parameter in award_points().\n"
                    f"For coral_send_message, use mentions=['sbf'] to reply.\n\n"
                )
                
                mentions_result_clean = json.dumps(mentions_data)
                full_input = (
                    f"{conversation_history}"  # ← Add history at the beginning
                    f"{payment_instruction}{scoring_mandate}{user_wallet_instruction}"
                    f"Process these mentions and respond appropriately: {mentions_result_clean}"
                )
            else:
                return None
        else:
            # Agent-to-agent communication
            # Fetch conversation history for agent-to-agent context too
            conversation_history = ""
            
            if thread_id != "unknown":
                print(f"[Context] Fetching thread history for agent-to-agent context (thread: {thread_id[:8]}...)", flush=True)
                history_text = self.fetch_thread_history(thread_id, limit=10)
                
                if history_text:
                    conversation_history = f"""
═══════════════════════════════════════════════════════════════
📜 RECENT CONVERSATION HISTORY (Last 10 messages)
═══════════════════════════════════════════════════════════════

{history_text}

═══════════════════════════════════════════════════════════════
📨 CURRENT MESSAGE (respond to this)
═══════════════════════════════════════════════════════════════

"""
                    print(f"[Context] Added {len(history_text.split(chr(10)))} messages of context", flush=True)
            
            agent_comms_note = dynamic_content['agent_comms_note']
            mentions_result_clean = json.dumps(mentions_data)
            full_input = f"{conversation_history}{agent_comms_note}Process this agent message: {mentions_result_clean}"
        
        # Execute with retry logic
        max_retries = 3
        retry_delay = 2
        
        for attempt in range(max_retries):
            try:
                invoke_timeout = getattr(self.agent_executor, "invoke_timeout", self.executor_limits["invoke_timeout"])
                response = await asyncio.wait_for(
                    self.agent_executor.ainvoke({
                        "input": full_input,
                        "my_wallet_address": self.my_wallet_address,
                        "agent_scratchpad": []
                    }),
                    timeout=invoke_timeout
                )
                
                # DEBUG: Check what the agent actually did
                print(f"[DEBUG] Agent response type: {type(response)}", flush=True)
                print(f"[DEBUG] Agent response keys: {response.keys() if isinstance(response, dict) else 'not a dict'}", flush=True)
                
                # FIX ISSUE #1: Check if contact_agent was called
                # If yes, suppress the LLM's final output since contact_agent already sent confirmation
                contact_agent_called = False
                send_message_called = False
                has_intermediate_steps = False
                
                if isinstance(response, dict):
                    if 'output' in response:
                        print(f"[DEBUG] Output: {response['output'][:200] if len(response['output']) > 200 else response['output']}", flush=True)
                    if 'intermediate_steps' in response:
                        steps = response['intermediate_steps']
                        has_intermediate_steps = len(steps) > 0
                        print(f"[DEBUG] Tool calls made: {len(steps)}", flush=True)
                        for i, (action, result) in enumerate(steps):
                            tool_name = getattr(action, 'tool', 'unknown')
                            print(f"[DEBUG]   Step {i+1}: {tool_name}", flush=True)
                            
                            # Track important tool calls
                            if 'contact_agent' in tool_name.lower():
                                contact_agent_called = True
                                # CRITICAL FIX: contact_agent internally calls coral_send_message,
                                # so we must mark send_message_called = True to prevent fallback
                                send_message_called = True
                                print(f"[DEBUG] ✅ contact_agent was called - will suppress duplicate confirmation and disable fallback")
                            if 'send_message' in tool_name.lower() and 'coral' in tool_name.lower():
                                send_message_called = True
                                print(f"[DEBUG] ✅ coral_send_message was detected in intermediate_steps")
                
                # NOTE: We used to suppress LLM output if contact_agent was called because
                # contact_agent sent its own confirmation. Now contact_agent does NOT send
                # a confirmation - the LLM handles it via coral_send_message. So no suppression needed.
                
                # FIX #2: Fallback - if LLM generated output but didn't call coral_send_message, send it automatically
                # This prevents silent failures where agent thinks but doesn't speak
                # IMPORTANT: Only trigger if we have intermediate_steps and can confidently say send_message wasn't called
                # If intermediate_steps is missing/empty, the execution might have failed - don't send duplicate
                # CRITICAL: Wrap in try-except to prevent fallback failures from triggering agent retries
                try:
                    if not send_message_called and has_intermediate_steps and isinstance(response, dict) and response.get('output'):
                        output_text = response['output'].strip()
                        if output_text:  # Only if there's actual content
                            print(f"[Fallback] ⚠️  LLM generated output but didn't call coral_send_message - using fallback")
                            thread_id = mentions_data.get("messages", [{}])[0].get("threadId")
                            
                            # Find the coral_send_message tool
                            send_message_tool = None
                            for tool in self.agent_executor.tools:
                                if hasattr(tool, 'name') and 'coral_send_message' in tool.name:
                                    send_message_tool = tool
                                    break
                            
                            if thread_id and send_message_tool:
                                try:
                                    await send_message_tool.ainvoke({
                                        "threadId": thread_id,
                                        "content": output_text,
                                        "mentions": ["sbf"] if is_user_message else [sender_id]
                                    })
                                    print(f"[Fallback] ✅ Response auto-sent via fallback mechanism")
                                except Exception as e:
                                    print(f"[Fallback] ❌ Failed to auto-send response: {e}")
                                    traceback.print_exc()
                            else:
                                if not thread_id:
                                    print(f"[Fallback] ⚠️  Cannot auto-send: no threadId in mentions_data")
                                if not send_message_tool:
                                    print(f"[Fallback] ⚠️  Cannot auto-send: coral_send_message tool not found")
                    elif not send_message_called and not has_intermediate_steps and isinstance(response, dict) and response.get('output'):
                        # Execution may have failed/restarted - don't use fallback to avoid duplicates
                        print(f"[Fallback] ⚠️  Output exists but no intermediate_steps - possible execution error, skipping fallback to avoid duplicates")
                except Exception as fallback_error:
                    # Fallback mechanism failed - log but don't propagate
                    # The agent execution itself was successful, so don't trigger retries
                    print(f"[Fallback] ❌ CRITICAL: Fallback mechanism encountered error: {fallback_error}")
                    traceback.print_exc()
                    print(f"[Fallback] Agent execution was successful but message may not have been sent")
                
                print(f"[OK] Response processed successfully on attempt {attempt + 1}", flush=True)
                return response
                
            except asyncio.TimeoutError:
                print(f"[ERROR] Timeout on attempt {attempt + 1}/{max_retries}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(retry_delay)
                    retry_delay *= 2
                    
            except Exception as e:
                print(f"[ERROR] Execution error on attempt {attempt + 1}: {e}")
                traceback.print_exc()
                if attempt < max_retries - 1:
                    await asyncio.sleep(retry_delay)
                    retry_delay *= 2
        
        return None
    
    async def run_agent_loop(self, wait_tool: BaseTool) -> None:
        """
        Main agent loop - wait for mentions and process them.
        
        Args:
            wait_tool: Coral wait_for_mentions tool
        """
        wait_start_time = None
        dynamic_content = self.load_dynamic_content()
        
        while True:
            try:
                wait_start_time = time.time()
                # Use 10-minute timeout (server's maximum is 600000ms = 10 minutes)
                mentions_result = await wait_tool.ainvoke({"timeoutMs": 600000})
                
                if mentions_result and "No new mentions" not in str(mentions_result):
                    try:
                        mentions_data = json.loads(mentions_result)
                        
                        # Check for timeout or error
                        if mentions_data.get("result") == "error_timeout":
                            if wait_start_time and (time.time() - wait_start_time) < 5.0:
                                # SSE connection broken - attempt reconnect instead of crashing
                                print("=" * 80)
                                print(f"[ERROR] SSE CONNECTION BROKEN - ATTEMPTING RECONNECT")
                                print("=" * 80)
                                print(f"   Waiting 10 seconds before reconnecting...")
                                await asyncio.sleep(10)
                                print(f"   Continuing loop - will attempt to reconnect")
                                print("=" * 80)
                                # Continue loop and let Coral client reconnect automatically
                            continue
                        
                        if mentions_data.get("result") != "wait_for_mentions_success":
                            await asyncio.sleep(2)
                            continue
                        
                        if "messages" not in mentions_data or not mentions_data["messages"]:
                            await asyncio.sleep(2)
                            continue
                        
                        # Process message
                        response = await self.process_message(mentions_data, dynamic_content)
                        
                        if response is None:
                            # This is expected for proxy agents like SBF that don't generate responses
                            # print("[DEBUG] process_message returned None - continuing loop")
                            continue
                            
                    except Exception as e:
                        print(f"[ERROR] Error during message processing: {e}")
                        traceback.print_exc()
                        continue
                        
            except KeyboardInterrupt:
                break
            except Exception as e:
                print(f"[ERROR] Error in agent loop: {e}")
                traceback.print_exc()
                await asyncio.sleep(5)
    
    async def run(self) -> None:
        """
        Main entry point - initialize and run the agent.
        
        CRITICAL: This method now has comprehensive exception handling to prevent
        silent crashes that cause Docker restarts and "already registered" warnings.
        """
        try:
            # Load environment
            print(f"[STARTUP] Loading environment for {self.agent_id}...", flush=True)
            self.load_environment()
            
            # Initialize wallet
            print(f"[STARTUP] Initializing wallet...", flush=True)
            balance = await self.initialize_wallet()
            print(f"🤖 {self.agent_name.upper()} Agent", flush=True)
            print(f"   Wallet: {self.my_wallet_address}", flush=True)
            print(f"   Balance: {balance:.4f} SOL", flush=True)
            
            # Connect to Coral server
            print(f"[STARTUP] Connecting to Coral server...", flush=True)
            client, _, all_pool_tools = await self.connect_to_coral_server()
            
            # Check if multi-pool mode
            if all_pool_tools:
                # Multi-pool mode: spawn a listener for each pool
                print(f"[CORAL] 🔀 Multi-pool mode: listening to {len(all_pool_tools)} pools")
                await self.run_multi_pool_loops(client, all_pool_tools)
            else:
                # Single-pool mode with PERSISTENT SESSION
                # This is critical for production stability - each tool call must
                # reuse the same SSE connection rather than creating new ones
                print(f"[STARTUP] Opening persistent Coral session...", flush=True)
                
                # Import load_mcp_tools
                from langchain_mcp_adapters.tools import load_mcp_tools
                
                # Open persistent session - this must stay alive for agent's entire lifetime
                async with client.session("coral") as session:
                    print(f"[STARTUP] ✅ Persistent session established")
                    
                    # Load tools from persistent session
                    print(f"[STARTUP] Loading Coral tools from persistent session...")
                    coral_tools = await load_mcp_tools(session)
                    print(f"[STARTUP] ✅ Loaded {len(coral_tools)} Coral tools")
                    
                    # Create agent executor
                    print(f"[STARTUP] Creating agent executor...")
                    self.agent_executor, self.my_wallet_address = await self.create_agent_executor(coral_tools)
                    print(f"[READY] {self.agent_name} ready for interactions")
                    
                    # Find wait_for_mentions tool
                    wait_tool = next((t for t in coral_tools if hasattr(t, 'name') and 'wait_for_mentions' in t.name), None)
                    if not wait_tool:
                        raise ValueError("coral_wait_for_mentions tool not found!")
                    
                    # Run agent loop (session stays alive throughout)
                    print(f"[STARTUP] Starting agent loop with persistent session...")
                    await self.run_agent_loop(wait_tool)
                
        except KeyboardInterrupt:
            print(f"\n[SHUTDOWN] {self.agent_name} ({self.agent_id}) shutting down gracefully...")
            raise
            
        except Exception as e:
            print("\n" + "=" * 80)
            print(f"[FATAL] UNHANDLED EXCEPTION IN AGENT")
            print("=" * 80)
            print(f"Agent: {self.agent_name} ({self.agent_id})")
            print(f"Error: {type(e).__name__}: {e}")
            print(f"")
            traceback.print_exc()
            print("=" * 80)
            print(f"⚠️  Agent process will exit. Docker will restart the container.")
            print("=" * 80)
            sys.exit(1)
    
    async def run_multi_pool_loops(self, client: MultiServerMCPClient, all_pool_tools: Dict[str, List[BaseTool]]):
        """Run concurrent listeners for multiple Coral session pools."""
        print(f"[CORAL] Starting {len(all_pool_tools)} concurrent pool listeners...")
        
        # Load dynamic content once (shared across all pools)
        dynamic_content = self.load_dynamic_content()
        
        tasks = []
        successful_pools = 0
        
        for pool_name, pool_tools in all_pool_tools.items():
            try:
                # Create agent executor for this pool
                agent_executor, wallet_address = await self.create_agent_executor(pool_tools)
                
                # Find wait_for_mentions tool
                wait_tool = next((t for t in pool_tools if hasattr(t, 'name') and 'wait_for_mentions' in t.name), None)
                if not wait_tool:
                    print(f"[WARNING] No wait_for_mentions tool for {pool_name}, skipping")
                    continue
                
                # Spawn listener task
                task = asyncio.create_task(
                    self._run_pool_listener(pool_name, wait_tool, agent_executor, wallet_address, dynamic_content)
                )
                tasks.append(task)
                successful_pools += 1
                print(f"[CORAL]   ✓ {pool_name} listener started")
                
            except Exception as e:
                print(f"[ERROR] Failed to create listener for {pool_name}: {e}")
                # Continue with other pools (partial OK)
        
        if successful_pools == 0:
            raise RuntimeError("No pool listeners could be started!")
        
        print(f"[CORAL] 🎧 Listening to {successful_pools} pools concurrently")
        print(f"[READY] {self.agent_name} ready for interactions across all pools")
        
        # Wait for all listeners (they run indefinitely)
        # Use return_exceptions=True to prevent one crash from killing others
        await asyncio.gather(*tasks, return_exceptions=True)
    
    async def _run_pool_listener(self, pool_name: str, wait_tool: BaseTool, agent_executor, wallet_address: str, dynamic_content: Dict[str, str]):
        """Listen for mentions in a specific pool."""
        print(f"[{pool_name}] 🎧 Listener active")
        
        # Pool-specific state
        wait_start_time = None
        
        while True:
            try:
                wait_start_time = time.time()
                # Use 10-minute timeout (server's maximum is 600000ms = 10 minutes)
                mentions_result = await wait_tool.ainvoke({"timeoutMs": 600000})
                
                if mentions_result and "No new mentions" not in str(mentions_result):
                    try:
                        mentions_data = json.loads(mentions_result)
                        
                        # Check for timeout or error
                        if mentions_data.get("result") == "error_timeout":
                            if wait_start_time and (time.time() - wait_start_time) < 5.0:
                                print(f"[{pool_name}] ⚠️  SSE connection broken")
                                # Don't exit - continue with other pools
                                await asyncio.sleep(5)
                            continue
                        
                        if mentions_data.get("result") != "wait_for_mentions_success":
                            await asyncio.sleep(2)
                            continue
                        
                        if "messages" not in mentions_data or not mentions_data["messages"]:
                            await asyncio.sleep(2)
                            continue
                        
                        # Process message using pool-specific executor
                        await self._process_pool_message(pool_name, mentions_data, dynamic_content, agent_executor, wallet_address)
                        
                    except Exception as e:
                        print(f"[{pool_name}] ⚠️  Error processing message: {e}")
                        traceback.print_exc()
                        await asyncio.sleep(2)
                        
            except KeyboardInterrupt:
                print(f"[{pool_name}] Shutting down")
                break
            except Exception as e:
                print(f"[{pool_name}] ⚠️  Listener error: {e}")
                traceback.print_exc()
                await asyncio.sleep(5)  # Brief pause before retrying
                # Continue loop - don't exit (continue with other pools strategy)
    
    async def _process_pool_message(self, pool_name: str, mentions_data: Dict[str, Any], dynamic_content: Dict[str, str], agent_executor, wallet_address: str):
        """Process a message from a specific pool using pool-specific executor."""
        message_payload = mentions_data["messages"][0]
        sender_id = message_payload["senderId"]
        message_content = message_payload["content"]
        thread_id = message_payload.get("threadId", "unknown")
        
        # CRITICAL SAFETY: SBF agent never generates responses
        # This prevents SBF from responding even if override fails
        if self.agent_id == "sbf":
            print(f"[{pool_name}] [SBF-PROXY] Blocking message processing - SBF is user proxy only")
            print(f"[{pool_name}] [SBF-PROXY] Ignoring mention from '{sender_id}'")
            return None
        
        is_user_message = sender_id == "sbf"
        
        if is_user_message:
            # Extract user wallet
            user_wallet = self.extract_user_wallet(message_content)
            if not user_wallet:
                print(f"[{pool_name}] Message from 'sbf' missing USER_WALLET marker")
                return
            
            # Clean message content
            clean_content = re.sub(r'\[USER_WALLET:[1-9A-HJ-NP-Za-km-z]{32,44}]\s*', '', message_content)
            mentions_data["messages"][0]["content"] = clean_content
            
            # Detect payment
            payment_info = self.detect_payment(message_content)
            payment_instruction = ""
            
            if payment_info:
                tx_sig, service_type, amount = payment_info
                payment_instruction = self.create_payment_instruction(tx_sig, user_wallet, service_type, amount)
            else:
                # NO PAYMENT DETECTED - Check if this is a connection_intro request!
                # Add prominent detection instruction
                payment_instruction = """
🚨 FIRST CHECK: IS THIS A CONNECTION_INTRO REQUEST? 🚨

Before doing ANYTHING else, check if the user is asking you to contact another agent!

DETECTION PATTERNS - If user message contains ANY of:
- "Can you ask [agent]..."
- "Would you ask [agent]..."
- "Ask [agent] about..."
- "Contact [agent]..."
- "Talk to [agent] for me..."
- "Get [agent]'s opinion..."
- "Find out what [agent] thinks..."
- "Reach out to [agent]..."
- "Ping [agent]..."

→ THIS IS A connection_intro REQUEST (0.002 USDC)
→ YOU MUST CHARGE BEFORE CONTACTING ANYONE!

MANDATORY WORKFLOW if connection_intro detected:
1. Parse: target_agent and question
2. IMMEDIATELY call request_premium_service(from_agent='sbf', to_agent='{agent_name}', service_type='connection_intro', details='...')
3. Send payment request XML to user
4. STOP - DO NOT contact agent yet - wait for payment!

Only after payment verified should you call contact_agent()!

"""
            
            # Fetch conversation history for context
            conversation_history = ""
            
            if thread_id != "unknown":
                print(f"[{pool_name}] [Context] Fetching thread history (thread: {thread_id[:8]}...)", flush=True)
                history_text = self.fetch_thread_history(thread_id, limit=10)
                
                if history_text:
                    conversation_history = f"""
═══════════════════════════════════════════════════════════════
📜 RECENT CONVERSATION HISTORY (Last 10 messages)
═══════════════════════════════════════════════════════════════

{history_text}

═══════════════════════════════════════════════════════════════
📨 CURRENT MESSAGE (respond to this)
═══════════════════════════════════════════════════════════════

"""
                    print(f"[{pool_name}] [Context] Added {len(history_text.split(chr(10)))} messages of context", flush=True)
            
            # Build full input with scoring
            scoring_mandate = dynamic_content['scoring_mandate']
            user_wallet_instruction = (
                f"\n\n🎯 CRITICAL SCORING INSTRUCTION:\n"
                f"The user's ACTUAL wallet address is: {user_wallet}\n"
                f"You MUST use '{user_wallet}' as the user_wallet parameter in award_points().\n"
                f"For coral_send_message, use mentions=['sbf'] to reply.\n\n"
            )
            
            mentions_result_clean = json.dumps(mentions_data)
            full_input = f"{conversation_history}{payment_instruction}{scoring_mandate}{user_wallet_instruction}Process these mentions and respond appropriately: {mentions_result_clean}"
        else:
            # Agent-to-agent communication
            # Fetch conversation history for agent-to-agent context too
            conversation_history = ""
            
            if thread_id != "unknown":
                print(f"[{pool_name}] [Context] Fetching thread history for agent-to-agent (thread: {thread_id[:8]}...)", flush=True)
                history_text = self.fetch_thread_history(thread_id, limit=10)
                
                if history_text:
                    conversation_history = f"""
═══════════════════════════════════════════════════════════════
📜 RECENT CONVERSATION HISTORY (Last 10 messages)
═══════════════════════════════════════════════════════════════

{history_text}

═══════════════════════════════════════════════════════════════
📨 CURRENT MESSAGE (respond to this)
═══════════════════════════════════════════════════════════════

"""
                    print(f"[{pool_name}] [Context] Added {len(history_text.split(chr(10)))} messages of context", flush=True)
            
            agent_comms_note = dynamic_content['agent_comms_note']
            mentions_result_clean = json.dumps(mentions_data)
            full_input = f"{conversation_history}{agent_comms_note}Process this agent message: {mentions_result_clean}"
        
        # Execute with retry logic using pool-specific executor
        max_retries = 3
        retry_delay = 2
        
        for attempt in range(max_retries):
            try:
                invoke_timeout = getattr(agent_executor, "invoke_timeout", self.executor_limits["invoke_timeout"])
                response = await asyncio.wait_for(
                    agent_executor.ainvoke({
                        "input": full_input,
                        "my_wallet_address": wallet_address,
                        "agent_scratchpad": []
                    }),
                    timeout=invoke_timeout
                )
                
                # DEBUG: Check what the agent actually did
                print(f"[{pool_name}] [DEBUG] Agent response type: {type(response)}", flush=True)
                print(f"[{pool_name}] [DEBUG] Agent response keys: {response.keys() if isinstance(response, dict) else 'not a dict'}", flush=True)
                
                # Track which tools were called
                contact_agent_called = False
                send_message_called = False
                has_intermediate_steps = False
                
                if isinstance(response, dict):
                    if 'output' in response:
                        print(f"[{pool_name}] [DEBUG] Output: {response['output'][:200] if len(response['output']) > 200 else response['output']}", flush=True)
                    if 'intermediate_steps' in response:
                        steps = response['intermediate_steps']
                        has_intermediate_steps = len(steps) > 0
                        print(f"[{pool_name}] [DEBUG] Tool calls made: {len(steps)}", flush=True)
                        for i, (action, result) in enumerate(steps):
                            tool_name = getattr(action, 'tool', 'unknown')
                            print(f"[{pool_name}] [DEBUG]   Step {i+1}: {tool_name}", flush=True)
                            
                            # Track important tool calls
                            if 'contact_agent' in tool_name.lower():
                                contact_agent_called = True
                                # CRITICAL FIX: contact_agent internally calls coral_send_message,
                                # so we must mark send_message_called = True to prevent fallback
                                send_message_called = True
                                print(f"[{pool_name}] ✅ contact_agent was called - will suppress duplicate confirmation and disable fallback")
                            if 'send_message' in tool_name.lower() and 'coral' in tool_name.lower():
                                send_message_called = True
                                print(f"[{pool_name}] ✅ coral_send_message was detected in intermediate_steps")
                
                # NOTE: We used to suppress LLM output if contact_agent was called because
                # contact_agent sent its own confirmation. Now contact_agent does NOT send
                # a confirmation - the LLM handles it via coral_send_message. So no suppression needed.
                
                # FIX #2: Fallback - if LLM generated output but didn't call coral_send_message, send it automatically
                # This prevents silent failures where agent thinks but doesn't speak
                # IMPORTANT: Only trigger if we have intermediate_steps and can confidently say send_message wasn't called
                # If intermediate_steps is missing/empty, the execution might have failed - don't send duplicate
                # CRITICAL: Wrap in try-except to prevent fallback failures from triggering agent retries
                try:
                    if not send_message_called and has_intermediate_steps and isinstance(response, dict) and response.get('output'):
                        output_text = response['output'].strip()
                        if output_text:  # Only if there's actual content
                            print(f"[{pool_name}] ⚠️  LLM generated output but didn't call coral_send_message - using fallback")
                            thread_id = mentions_data.get("messages", [{}])[0].get("threadId")
                            
                            # Find the coral_send_message tool
                            send_message_tool = None
                            for tool in self.agent_executor.tools:
                                if hasattr(tool, 'name') and 'coral_send_message' in tool.name:
                                    send_message_tool = tool
                                    break
                            
                            if thread_id and send_message_tool:
                                try:
                                    await send_message_tool.ainvoke({
                                        "threadId": thread_id,
                                        "content": output_text,
                                        "mentions": ["sbf"] if is_user_message else [sender_id]
                                    })
                                    print(f"[{pool_name}] ✅ Response auto-sent via fallback mechanism")
                                except Exception as e:
                                    print(f"[{pool_name}] ❌ Failed to auto-send response: {e}")
                                    traceback.print_exc()
                            else:
                                if not thread_id:
                                    print(f"[{pool_name}] ⚠️  Cannot auto-send: no threadId in mentions_data")
                                if not send_message_tool:
                                    print(f"[{pool_name}] ⚠️  Cannot auto-send: coral_send_message tool not found")
                    elif not send_message_called and not has_intermediate_steps and isinstance(response, dict) and response.get('output'):
                        # Execution may have failed/restarted - don't use fallback to avoid duplicates
                        print(f"[{pool_name}] ⚠️  Output exists but no intermediate_steps - possible execution error, skipping fallback to avoid duplicates")
                except Exception as fallback_error:
                    # Fallback mechanism failed - log but don't propagate
                    # The agent execution itself was successful, so don't trigger retries
                    print(f"[{pool_name}] ❌ CRITICAL: Fallback mechanism encountered error: {fallback_error}")
                    traceback.print_exc()
                    print(f"[{pool_name}] Agent execution was successful but message may not have been sent")
                
                print(f"[{pool_name}] ✓ Response processed successfully", flush=True)
                return response
                
            except asyncio.TimeoutError:
                print(f"[{pool_name}] ⚠️  Timeout on attempt {attempt + 1}/{max_retries}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(retry_delay)
                    retry_delay *= 2
                    
            except Exception as e:
                print(f"[{pool_name}] ⚠️  Execution error on attempt {attempt + 1}: {e}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(retry_delay)
                    retry_delay *= 2
        
        print(f"[{pool_name}] ❌ All retry attempts failed")
        return None

