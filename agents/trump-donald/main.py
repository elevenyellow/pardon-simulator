import urllib.parse
from dotenv import load_dotenv
import os, json, asyncio, traceback, sys
from langchain.chat_models import init_chat_model
from langchain.prompts import ChatPromptTemplate
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain.agents import create_tool_calling_agent, AgentExecutor
from langchain_core.tools import tool
from solders.keypair import Keypair
from solders.pubkey import Pubkey
from solana.rpc.async_api import AsyncClient
from solders.transaction import Transaction
from solders.system_program import TransferParams, transfer
import base58

# Import x402 payment protocol tools
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from x402_payment_tools import X402_TOOLS, create_contact_agent_tool, reload_agent_wallets
from x402_payment_payload import X402PaymentPayload


# Solana wallet management
class TrumpWallet:
    def __init__(self, private_key_b58: str, rpc_url: str, owner_name: str):
        print(f"[DEBUG] TrumpWallet.__init__ starting", flush=True)
        self.keypair = Keypair.from_base58_string(private_key_b58) if private_key_b58 else Keypair()
        print(f"[DEBUG] Keypair created", flush=True)
        self.client = AsyncClient(rpc_url)
        print(f"[DEBUG] AsyncClient created", flush=True)
        self.owner_name = owner_name
        import sys, os
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
        from x402_cdp_client import get_cdp_client
        print(f"[DEBUG] About to call get_cdp_client()", flush=True)
        self.cdp_client = get_cdp_client()
        print(f"[DEBUG] TrumpWallet.__init__ completed", flush=True)
        
    async def get_balance(self) -> float:
        """Get wallet balance in SOL"""
        try:
            response = await self.client.get_balance(self.keypair.pubkey())
            lamports = response.value
            return lamports / 1e9  # Convert lamports to SOL
        except Exception as e:
            print(f"Error getting balance: {e}")
            return 0.0
    
    async def send_transaction(self, to_address: str, amount_sol: float) -> dict:
        """
        Send SOL transaction via x402 COMPLIANT CDP facilitator.
        
        This uses the official x402 facilitator settle() API for maximum compliance.
        """
        try:
            # Import x402 facilitator submission function
            sys.path.append(os.path.join(os.path.dirname(__file__), ".."))
            from x402_payment_tools import submit_payment_via_x402_facilitator
            
            # x402 facilitator submission is ENABLED by default for maximum compliance
            # Set USE_X402_FACILITATOR=false to disable and use direct RPC instead
            use_x402_facilitator = os.getenv("USE_X402_FACILITATOR", "true").lower() == "true"
            
            if use_x402_facilitator:
                try:
                    print(f"[INFO] Using x402 facilitator for transaction submission", flush=True)
                    
                    # Submit via x402 facilitator (TRUE x402 compliance - USDC)
                    result = await submit_payment_via_x402_facilitator(
                        from_keypair=self.keypair,
                        to_address=to_address,
                        amount_usdc=amount_sol,
                        network="solana"
                    )
                    
                    if result.get("success"):
                        print(f"[OK] Transaction via x402 facilitator (FULLY COMPLIANT)", flush=True)
                        print(f"   Signature: {result['signature']}", flush=True)
                        print(f"   x402scan: {result.get('x402_scan_url', 'N/A')}", flush=True)
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
                        print(f"WARNING: x402 facilitator submission failed: {result.get('error')}", flush=True)
                        print(f"   Falling back to direct RPC", flush=True)
                        
                except Exception as facilitator_error:
                    print(f"ERROR: x402 facilitator error: {facilitator_error}", flush=True)
                    import traceback
                    traceback.print_exc()
            
            # If x402 facilitator submission failed, return error
            # SOL fallback removed - x402 requires USDC
            return {
                "success": False,
                "error": "Payment failed. x402 payments require USDC. Please ensure sufficient USDC balance.",
                "reason": "x402_facilitator_required"
            }
        except Exception as e:
            print(f"[ERROR] Transaction error: {e}")
            import traceback
            traceback.print_exc()
            return {
                "success": False,
                "error": str(e)
            }

# Global wallet instance
wallet = None

# Agent wallet addresses loaded from environment variables via x402_payment_tools.py
# The reload_agent_wallets() function is called in main() after .env is loaded

def get_tools_description(tools):
    return "\n".join(
        f"Tool: {tool.name}, Schema: {json.dumps(tool.args).replace('{', '{{').replace('}', '}}')}"
        for tool in tools
    )


# Custom Solana tools for the agent
@tool
async def check_my_balance() -> str:
    """Check Donald Trump's current wallet balance in SOL"""
    if wallet is None:
        return "Wallet not initialized"
    balance = await wallet.get_balance()
    return f"Donald Trump's wallet balance: {balance:.4f} SOL (Address: {str(wallet.keypair.pubkey())})"



@tool
async def check_fortune_status() -> str:
    """Check the current fortune status and compare with family members"""
    if wallet is None:
        return "Wallet not initialized"
    
    balance = await wallet.get_balance()
    return f"Donald Trump's Empire: {balance:.4f} SOL | Wallet: {str(wallet.keypair.pubkey())} | Status: Making deals, accumulating wealth, winning bigly!"

@tool
async def lookup_agent_wallet(agent_name: str) -> str:
    """
    Look up another agent's Solana wallet address by their name.
    Use this BEFORE sending crypto to find their wallet address.
    
    Available agents: trump-donald, trump-melania, trump-eric, trump-donjr, trump-barron, sbf, cz
    """
    if agent_name in AGENT_WALLETS:
        address = AGENT_WALLETS[agent_name]
        return f"[OK] {agent_name}'s wallet address: {address}"
    else:
        available = ", ".join(AGENT_WALLETS.keys())
        return f"[ERROR] Unknown agent '{agent_name}'. Available: {available}"


def load_dynamic_content():
    """Load dynamic content from text files for scoring and agent communication"""
    agent_dir = os.path.dirname(os.path.abspath(__file__))
    shared_dir = os.path.join(os.path.dirname(agent_dir), "shared")
    
    # Load shared scoring mandate template
    with open(os.path.join(shared_dir, "scoring-mandate.txt"), 'r', encoding='utf-8') as f:
        scoring_mandate_template = f.read()
    
    # Load shared agent comms note
    with open(os.path.join(shared_dir, "agent-comms-note.txt"), 'r', encoding='utf-8') as f:
        agent_comms_note = f.read()
    
    # Load agent-specific scoring configuration
    with open(os.path.join(agent_dir, "scoring-config.txt"), 'r', encoding='utf-8') as f:
        scoring_config = f.read()
    
    return {
        'scoring_mandate_template': scoring_mandate_template,
        'agent_comms_note': agent_comms_note,
        'scoring_config': scoring_config
    }

def load_agent_prompt(**variables) -> str:
    """
    Load agent operational prompts (shared + agent-specific) and substitute variables.
    
    NOTE: Personality-public.txt is NOT loaded here - it's only for UI display.
    Only operational configuration is loaded into the LLM system prompt.
    
    Args:
        **variables: Variables to substitute in template (e.g., my_wallet_address="...")
    
    Returns:
        Formatted prompt string with variables substituted
    """
    agent_dir = os.path.dirname(os.path.abspath(__file__))
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
    
    # Combine: operational first (shared + specific)
    # Personality is NOT included - that's only for UI display via API
    combined = f"{operational_shared}\n\n{operational_specific}"
    
    # Substitute variables using format
    try:
        return combined.format(**variables)
    except KeyError as e:
        raise ValueError(f"Missing variable in prompt template: {e}")


async def create_agent(coral_tools, solana_tools):
    # Load wallet address from environment
    my_wallet_address = os.getenv("SOLANA_PUBLIC_ADDRESS", "")
    if not my_wallet_address:
        raise ValueError("SOLANA_PUBLIC_ADDRESS environment variable is required for Donald Trump agent")
    
    coral_tools_description = get_tools_description(coral_tools)
    solana_tools_description = get_tools_description(solana_tools)
    
    # Find coral tools needed for contact_agent
    coral_send_message_tool = next((t for t in coral_tools if t.name == "coral_send_message"), None)
    if not coral_send_message_tool:
        raise ValueError("coral_send_message tool not found in coral_tools!")
    
    coral_add_participant_tool = next((t for t in coral_tools if t.name == "coral_add_participant"), None)
    if not coral_add_participant_tool:
        raise ValueError("coral_add_participant tool not found in coral_tools!")

    # Create contact_agent wrapper tool using shared implementation
    contact_agent_tool = create_contact_agent_tool(coral_send_message_tool, coral_add_participant_tool)
    
    # Combine all tools: coral + solana + contact_agent wrapper
    combined_tools = coral_tools + solana_tools + [contact_agent_tool]
    
    # Load operational prompt from files
    prompt_text = load_agent_prompt(
        agent_name="donald-trump",
        my_wallet_address=my_wallet_address
    )
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", prompt_text),
        ("human", "{input}"),
        ("placeholder", "{agent_scratchpad}")
    ])

    # Build model kwargs - timeout is handled via request_timeout in OpenAI client
    model_kwargs = {
        "model": os.getenv("MODEL_NAME", "gpt-4o"),
        "model_provider": os.getenv("MODEL_PROVIDER", "openai"),
        "api_key": os.getenv("MODEL_API_KEY"),
        "temperature": float(os.getenv("MODEL_TEMPERATURE", "0.7")),
        "max_tokens": int(os.getenv("MODEL_MAX_TOKENS", "2000")),  # Reduced for faster responses while maintaining quality
    }
    
    # Add OpenAI-specific timeout configuration
    if model_kwargs["model_provider"] == "openai":
        model_kwargs["request_timeout"] = 30.0  # 30 second timeout for OpenAI API
    
    # Add reasoning_effort for GPT-5.1+ models (optional, only if explicitly set)
    reasoning_effort = os.getenv("MODEL_REASONING_EFFORT")
    if reasoning_effort and reasoning_effort.strip():
        model_kwargs["reasoning_effort"] = reasoning_effort  # e.g., "none" for fast responses
    
    # Only add base_url if it's explicitly set and non-empty
    base_url = os.getenv("MODEL_BASE_URL")
    if base_url and base_url.strip():
        model_kwargs["base_url"] = base_url
    
    model = init_chat_model(**model_kwargs)

    agent = create_tool_calling_agent(model, combined_tools, prompt)
    
    # Add timeout and iteration limits to handle system overload
    agent_executor = AgentExecutor(
        agent=agent, 
        tools=combined_tools, 
        verbose=False, 
        handle_parsing_errors=True,
        max_iterations=15,  # Increased from 10 to allow for payment verification + response
        max_execution_time=110,  # 110 seconds (needs to be < asyncio.wait_for 120s timeout)
    )
    # Return both agent executor AND my_wallet_address so it can be passed to ainvoke
    return agent_executor, my_wallet_address


async def main():
    global wallet
    
    try:
        print("=" * 60)
        print(" DONALD TRUMP AGENT INITIALIZING...")
        print("=" * 60)
        
        # ALWAYS load .env from agent's directory
        # override=False lets Coral's env vars take precedence (e.g., session-specific CORAL_SSE_URL)
        agent_dir = os.path.dirname(os.path.abspath(__file__))
        env_path = os.path.join(agent_dir, '.env')
        load_dotenv(env_path, override=False)  # Coral env vars override .env defaults
        print(f"[OK] Loaded .env file from {env_path}")
        
        # Reload agent wallet addresses now that .env is loaded
        reload_agent_wallets()
        print("[OK] Agent wallet addresses reloaded")
        
        # Auto-import wallet to CDP if configured (one-time, marks in .env)
        
        print(" Initializing Solana wallet...")
        # Initialize Solana wallet
        private_key = os.getenv("SOLANA_PRIVATE_KEY", "")
        print(f"   Private key length: {len(private_key)}")
        rpc_url = os.getenv("SOLANA_RPC_URL")
        if not rpc_url:
            raise ValueError("SOLANA_RPC_URL environment variable is required. Get your Helius API key from https://www.helius.dev/")
        print(f"   RPC URL: {rpc_url}")
        
        wallet = TrumpWallet(private_key, rpc_url, "Donald Trump")
        print("[OK] Wallet initialized")
        
        print(f" Wallet Address: {str(wallet.keypair.pubkey())}")
        # Skip balance check during initialization to avoid hanging - will check when needed
        try:
            balance = await asyncio.wait_for(wallet.get_balance(), timeout=5.0)
            print(f" Initial Balance: {balance:.4f} SOL")
        except asyncio.TimeoutError:
            print("⚠️  Balance check timed out (Helius RPC slow) - continuing anyway")
        except Exception as e:
            print(f"⚠️  Balance check failed: {e} - continuing anyway")
    except Exception as e:
        print(f"[ERROR] FATAL ERROR during initialization: {e}")
        traceback.print_exc()
        raise

    base_url = os.getenv("CORAL_SSE_URL")
    agentID = os.getenv("CORAL_AGENT_ID")

    coral_params = {
        "agentId": agentID,
        "agentDescription": "Donald Trump - Bold deal-maker with substantial crypto fortune. Makes tremendous deals. Willing to negotiate but always maximizes advantage."
    }

    query_string = urllib.parse.urlencode(coral_params)
    CORAL_SERVER_URL = f"{base_url}?{query_string}"
    print(f" Connecting to Coral Server: {CORAL_SERVER_URL}")

    # Set timeouts to match coral_wait_for_mentions timeout (600s) + buffer
    # This prevents httpx.ReadTimeout during long-polling
    timeout = 700.0  # 700 seconds = 11.6 minutes (longer than wait_for_mentions)
    client = MultiServerMCPClient(
        connections={
            "coral": {
                "transport": "sse",
                "url": CORAL_SERVER_URL,
                "timeout": timeout,
                "sse_read_timeout": timeout,
            },
        }
    )

    # Get tools (connection happens automatically)
    coral_tools = await client.get_tools(server_name="coral")
    print("[OK] Coral Connection Established")
    
    # Create process_payment_payload tool with wallet access (x402 compliant)
    from x402_payment_tools import create_process_payment_payload_tool
    process_payment_tool = create_process_payment_payload_tool(
        my_wallet_address=str(wallet.keypair.pubkey())
    )
    
    # Combine all tools: basic + lookup + x402 protocol + process_payment_tool
    # NOTE: send_crypto and create_payment_payload removed - agent-to-agent payments disabled (x402 requires USDC)
    solana_tools = [check_my_balance, check_fortune_status, lookup_agent_wallet] + X402_TOOLS + [process_payment_tool]
    
    print(f" Coral tools: {len(coral_tools)}, Solana tools: {len(solana_tools)}")

    agent_executor, my_wallet_address = await create_agent(coral_tools, solana_tools)
    
    print("[GAME] DONALD TRUMP is ready to make deals!")
    print(f"[WALLET] Donald's wallet address: {my_wallet_address}")
    print("=" * 60)
    
    # Find the coral_wait_for_mentions tool
    wait_tool = None
    for tool in coral_tools:
        if hasattr(tool, 'name') and 'wait_for_mentions' in tool.name:
            wait_tool = tool
            break
    
    if not wait_tool:
        print("[ERROR] coral_wait_for_mentions tool not found!")
        return
    
    # Run agent loop - wait for mentions and respond
    while True:
        try:
            print("\n Waiting for mentions (blocking call)...")
            # Call coral_wait_for_mentions directly to block until we get a mention
            # Use a 2 minute timeout (120000ms) to reduce idle wait time
            try:
                mentions_result = await wait_tool.ainvoke({"timeoutMs": 120000})
            except Exception as e:
                # Handle connection errors gracefully (httpx.ReadTimeout, McpError, etc.)
                error_msg = str(e)
                if "ReadTimeout" in error_msg or "Connection closed" in error_msg:
                    print("WARNING:  Connection timeout - this is normal during long waits. Retrying...")
                    await asyncio.sleep(2)
                    continue
                else:
                    # Unexpected error - log and retry
                    print(f"[ERROR] Error waiting for mentions: {error_msg}")
                    await asyncio.sleep(5)
                    continue
            
            print(f"[MESSAGE] Got mentions: {mentions_result}")
            
            # Now have the LLM process the mentions and respond
            if mentions_result and "No new mentions" not in str(mentions_result):
                print("[BOT] Processing mentions with LLM...")
                try:
                    # Use asyncio.wait_for to enforce a hard timeout
                    # 120 seconds allows for:
                    # - Payment verification: ~15s
                    # - LLM response generation: ~30s
                    # - Coral message sending: ~5s
                    # - Buffer: ~70s
                    # CRITICAL: Prepend scoring mandate to EVERY input
                    # Extract threadId and wallet address from mentions
                    mentions_data = json.loads(str(mentions_result))
                    
                    # Check for timeout or error responses
                    if mentions_data.get("result") == "error_timeout":
                        print("[TIMEOUT] Timeout waiting for mentions, retrying...")
                        continue
                    
                    if mentions_data.get("result") != "wait_for_mentions_success":
                        print(f"WARNING:  Unexpected result: {mentions_data.get('result')}, retrying...")
                        continue
                    
                    # Check if messages exist
                    if "messages" not in mentions_data or not mentions_data["messages"]:
                        print(" No messages in response, retrying...")
                        continue
                    
                    sender_id = mentions_data.get("messages", [{}])[0].get("senderId", "")
                    thread_id = mentions_data.get("messages", [{}])[0].get("threadId", "")
                    message_content = mentions_data.get("messages", [{}])[0].get("content", "")
                    
                    # Check if this is a user message or agent message
                    is_user_message = sender_id == "sbf"
                    
                    # Load dynamic content
                    dynamic_content = load_dynamic_content()
                    
                    if is_user_message:
                        # Extract user's ACTUAL wallet address from message
                        # Format: [USER_WALLET:6pF45ayWyPSFKV3WQLpNNhhkA8GMeeE6eE14NKgw4zug] @agent message
                        import re
                        wallet_match = re.search(r'\[USER_WALLET:([1-9A-HJ-NP-Za-km-z]{32,44})\]', message_content)
                        user_wallet = wallet_match.group(1) if wallet_match else "UNKNOWN_WALLET"
                        
                        if user_wallet == "UNKNOWN_WALLET":
                            print(f"WARNING:  WARNING: Could not extract wallet from message: {message_content[:100]}")
                        else:
                            print(f"[OK] Extracted user wallet: {user_wallet[:8]}...{user_wallet[-8:]}")
                        
                        # Strip wallet prefix from message content for LLM processing
                        clean_content = re.sub(r'\[USER_WALLET:[1-9A-HJ-NP-Za-km-z]{32,44}]\s*', '', message_content)
                        mentions_data["messages"][0]["content"] = clean_content
                        
                        # PAYMENT DETECTION: Check for payment completion marker
                        payment_match = re.search(
                            r'\[PREMIUM_SERVICE_PAYMENT_COMPLETED:\s*([A-Za-z0-9]{87,88})\]',
                            message_content
                        )
                        
                        payment_instruction = ""
                        if payment_match:
                            transaction_signature = payment_match.group(1)
                            service_type = "insider_info"  
                            amount_usdc = 0.0005
                            
                            print("="*80)
                            print(f"[PAYMENT FLOW START] Timestamp: {time.time()}")
                            print(f"[PAYMENT FLOW] Thread: {mentions_data['messages'][0].get('threadId', 'unknown')}")
                            print(f"[PAYMENT FLOW] User: {user_wallet}")
                            print(f"[PAYMENT FLOW] Message ID: {mentions_data['messages'][0].get('id', 'unknown')}")
                            print(f"[PAYMENT DETECTED] Signature: {transaction_signature[:16]}...{transaction_signature[-16:]}")
                            print(f"[PAYMENT DETECTED] Service Type: {service_type}")
                            print(f"[PAYMENT DETECTED] User Wallet: {user_wallet}")
                            print("="*80)
                            
                            payment_instruction = f"""
🚨 PAYMENT COMPLETION DETECTED 🚨

Transaction Signature: {transaction_signature}
User Wallet: {user_wallet}
Service Type: {service_type}
Amount: {amount_usdc} USDC

MANDATORY ACTIONS (Execute in THIS turn):

1. Call verify_payment_transaction() immediately:
   verify_payment_transaction(
       transaction_hash="{transaction_signature}",
       expected_from="{user_wallet}",
       expected_amount_usdc={amount_usdc},
       service_type="{service_type}"
   )

2. After verification succeeds, deliver the {service_type} service immediately

3. Respond to user with the delivered service content

DO NOT just acknowledge payment - DELIVER THE SERVICE NOW!

"""
                        
                        # KEEP senderId as "sbf" for proper routing
                        # Pass the wallet address separately in the prompt for scoring
                        # This ensures coral_send_message uses mentions=["sbf"] correctly
                        
                        # Update mentions_result with cleaned content
                        mentions_result_clean = json.dumps(mentions_data)
                        
                        # Build scoring mandate from loaded config
                        # Parse the scoring config to extract evaluation criteria and other sections
                        scoring_config_content = dynamic_content['scoring_config']
                        
                        # Extract sections from scoring config
                        import re
                        eval_criteria_match = re.search(r'## Evaluation Criteria\n(.+?)(?=\n## )', scoring_config_content, re.DOTALL)
                        score_guide_match = re.search(r'## Evaluation Score Guide[^\n]*\n(.+?)(?=\n## |\nNote:)', scoring_config_content, re.DOTALL)
                        routing_match = re.search(r'## Routing Instructions\n(.+?)$', scoring_config_content, re.DOTALL)
                        
                        evaluation_criteria = eval_criteria_match.group(1).strip() if eval_criteria_match else ""
                        evaluation_score_guide = score_guide_match.group(1).strip() if score_guide_match else ""
                        routing_instructions = routing_match.group(1).strip() if routing_match else ""
                        
                        # Format the scoring mandate template with agent-specific content
                        scoring_mandate = dynamic_content['scoring_mandate_template'].format(
                            evaluation_criteria=evaluation_criteria,
                            evaluation_score_guide=evaluation_score_guide,
                            routing_instructions=routing_instructions,
                            agent_id="donald-trump"
                        )
                        
                        # CRITICAL: Include the user's wallet address in the prompt for scoring
                        # The LLM needs to use this wallet address in award_points(), NOT the senderId
                        user_wallet_instruction = f"\n\n🎯 CRITICAL SCORING INSTRUCTION:\nThe user's ACTUAL wallet address is: {user_wallet}\nYou MUST use '{user_wallet}' as the user_wallet parameter in award_points().\nFor coral_send_message, use mentions=['sbf'] to reply to the user (NOT the wallet address).\n\n"
                        
                        # Prepend payment instruction if payment was detected
                        full_input = f"{payment_instruction}{scoring_mandate}{user_wallet_instruction}Process these mentions and respond appropriately: {mentions_result_clean}"
                    else:
                        # Agent-to-agent communication - no scoring needed
                        print(f"[OK] Extracted sender (agent): {sender_id}")
                        mentions_result_clean = json.dumps(mentions_data)
                        
                        # Use loaded agent comms note
                        agent_comms_note = dynamic_content['agent_comms_note']
                        full_input = f"{agent_comms_note}Process this agent message and respond appropriately: {mentions_result_clean}"
                    print(f" DEBUG: Input length: {len(full_input)}, starts with: {full_input[:100]}")
                    
                    # Execute with retry logic and exponential backoff
                    max_retries = 3
                    retry_delay = 2  # seconds
                    response = None
                    
                    for attempt in range(max_retries):
                        try:
                            print(f"[AGENT INVOKE] Attempt {attempt + 1}/{max_retries}")
                            
                            response = await asyncio.wait_for(
                                agent_executor.ainvoke({
                                    "input": full_input,
                                    "my_wallet_address": my_wallet_address,
                                    "agent_scratchpad": []
                                }),
                                timeout=120.0
                            )
                            
                            print(f"[OK] Response sent successfully on attempt {attempt + 1}")
                            print(f"[RESPONSE PREVIEW] {str(response)[:200]}...")
                            print(f"[DEBUG] Response output: {response.get('output', 'NO OUTPUT')}")
                            print(f"[DEBUG] Response intermediate_steps count: {len(response.get('intermediate_steps', []))}")
                            
                            # Log what tools were actually called
                            intermediate_steps = response.get('intermediate_steps', [])
                            for idx, (action, result) in enumerate(intermediate_steps):
                                tool_name = action.tool if hasattr(action, 'tool') else 'unknown'
                                print(f"[DEBUG]   Step {idx+1}: Called tool '{tool_name}', result preview: {str(result)[:100]}")
                            
                            # Log payment flow completion if this was a payment
                            if payment_match:
                                print("="*80)
                                print(f"[PAYMENT FLOW END] Service delivered successfully")
                                print(f"[PAYMENT FLOW] Response length: {len(str(response))}")
                                print("="*80)
                            
                            break
                            
                        except asyncio.TimeoutError:
                            print(f"[ERROR] Agent execution timed out on attempt {attempt + 1}/{max_retries}")
                            if attempt < max_retries - 1:
                                print(f"[RETRY] Waiting {retry_delay}s before retry...")
                                await asyncio.sleep(retry_delay)
                                retry_delay *= 2  # Exponential backoff
                            else:
                                print(f"[FATAL] All {max_retries} attempts failed due to timeout")
                                print(f"[FATAL] Message content: {message_content[:500]}")
                                print(f"[FATAL] User wallet: {user_wallet}")
                                if payment_match:
                                    print(f"[FATAL] Payment signature: {transaction_signature}")
                                
                        except Exception as e:
                            print(f"[ERROR] Agent execution error on attempt {attempt + 1}/{max_retries}: {e}")
                            traceback.print_exc()
                            if attempt < max_retries - 1:
                                print(f"[RETRY] Waiting {retry_delay}s before retry...")
                                await asyncio.sleep(retry_delay)
                                retry_delay *= 2
                            else:
                                print(f"[FATAL] All {max_retries} attempts failed")
                                print(f"[FATAL] Error type: {type(e).__name__}")
                                print(f"[FATAL] Error message: {str(e)}")
                    
                    if response is None:
                        print("[FATAL] No response after all retry attempts, continuing to next message")
                        continue
                        
                except Exception as e:
                    print(f"[ERROR] Error during message processing: {e}")
                    traceback.print_exc()
                    continue
            
        except KeyboardInterrupt:
            print("\n Agent stopped by user")
            break
        except Exception as e:
            print(f"[ERROR] Error in agent loop: {e}")
            traceback.print_exc()
            await asyncio.sleep(5)  # Brief pause before retrying


if __name__ == "__main__":
    asyncio.run(main())

