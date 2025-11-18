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

# Import x402 payment protocol tools
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from x402_payment_tools import X402_TOOLS, create_contact_agent_tool, reload_agent_wallets
from x402_payment_payload import X402PaymentPayload

class TrumpWallet:
    def __init__(self, pk: str, rpc: str, name: str):
        self.keypair = Keypair.from_base58_string(pk) if pk else Keypair()
        self.client = AsyncClient(rpc)
        self.owner_name = name
        import sys, os
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
        from x402_cdp_client import get_cdp_client
        self.cdp_client = get_cdp_client()
    async def get_balance(self) -> float:
        try: return (await self.client.get_balance(self.keypair.pubkey())).value / 1e9
        except: return 0.0
    async def send_transaction(self, to: str, amt: float) -> dict:
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
                        to_address=to,
                        amount_usdc=amt,
                        network="solana"
                    )
                    
                    if result.get("success"):
                        print(f"[OK] Transaction via x402 facilitator (FULLY COMPLIANT)", flush=True)
                        print(f"   Signature: {result['signature']}", flush=True)
                        print(f"   x402scan: {result.get('x402_scan_url', 'N/A')}", flush=True)
                        return {
                            "success": True,
                            "signature": result["signature"],
                            "amount": amt,
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
            print(f"[ERROR] Don Jr transaction error: {e}")
            import traceback
            traceback.print_exc()
            return {"success": False, "error": str(e)}

wallet = None

# Agent wallet addresses loaded from environment variables via x402_payment_tools.py
# The reload_agent_wallets() function is called in main() after .env is loaded

def get_tools_description(tools): return "\n".join(f"Tool: {tool.name}" for tool in tools)

@tool
async def check_my_balance() -> str:
    """Check Don Jr's current wallet balance in SOL"""
    if wallet is None: return "Wallet not initialized"
    return f"Don Jr's holdings: {await wallet.get_balance():.4f} SOL"


@tool
async def lookup_agent_wallet(agent_name: str) -> str:
    """
    Look up another agent's Solana wallet address by their name.
    Use this BEFORE sending crypto or paying for services.
    
    Available agents: donald-trump, melania-trump, eric-trump, donjr-trump, barron-trump, sbf, cz
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
    
    # Load operational prompt from files
    prompt_text = load_agent_prompt(
        agent_name="donjr-trump",
        my_wallet_address=my_wallet_address
    )
    if not my_wallet_address:
        raise ValueError("SOLANA_PUBLIC_ADDRESS environment variable is required for Donald Trump Jr agent")
    
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
    combined = coral_tools + solana_tools + [contact_agent_tool]
    prompt = ChatPromptTemplate.from_messages([
        ("system", prompt_text),
        ("human", "{input}"),
        ("placeholder", "{agent_scratchpad}")
    ])
    # Build model kwargs
    model_kwargs = {
        "model": os.getenv("MODEL_NAME", "gpt-4o"),
        "model_provider": os.getenv("MODEL_PROVIDER", "openai"),
        "api_key": os.getenv("MODEL_API_KEY"),
        "temperature": float(os.getenv("MODEL_TEMPERATURE", "0.8")),
        "max_tokens": int(os.getenv("MODEL_MAX_TOKENS", "8000"))
    }
    
    # Add reasoning_effort for GPT-5.1+ models (optional, only if explicitly set)
    reasoning_effort = os.getenv("MODEL_REASONING_EFFORT")
    if reasoning_effort and reasoning_effort.strip():
        model_kwargs["reasoning_effort"] = reasoning_effort  # e.g., "none" for fast responses
    
    # Only add base_url if it's explicitly set and non-empty
    base_url = os.getenv("MODEL_BASE_URL")
    if base_url and base_url.strip():
        model_kwargs["base_url"] = base_url
    
    model = init_chat_model(**model_kwargs)
    agent = create_tool_calling_agent(model, combined, prompt)
    # Add timeout and iteration limits for payment verification
    agent_executor = AgentExecutor(
        agent=agent, 
        tools=combined, 
        verbose=False, 
        handle_parsing_errors=True,
        max_iterations=15,  # Increased for payment verification + response
        max_execution_time=110,  # 110 seconds (< asyncio.wait_for 120s timeout)
    )
    # Return both agent executor AND my_wallet_address so it can be passed to ainvoke
    return agent_executor, my_wallet_address

async def main():
    global wallet
    # ALWAYS load .env from agent's directory
    # override=False lets Coral's env vars take precedence
    agent_dir = os.path.dirname(os.path.abspath(__file__))
    load_dotenv(os.path.join(agent_dir, '.env'), override=False)
    reload_agent_wallets()  # Reload wallet addresses now that .env is loaded
    
    # Auto-import wallet to CDP if configured (one-time, marks in .env)
    
    rpc_url = os.getenv("SOLANA_RPC_URL")
    if not rpc_url:
        raise ValueError("SOLANA_RPC_URL environment variable is required. Get your Helius API key from https://www.helius.dev/")
    wallet = TrumpWallet(os.getenv("SOLANA_PRIVATE_KEY", ""), rpc_url, "DonJr")
    try:
        balance = await asyncio.wait_for(wallet.get_balance(), timeout=5.0)
    except (asyncio.TimeoutError, Exception) as e:
        print(f"⚠️  Balance check failed: {e} - continuing anyway")
        balance = 0.0
    print(f" Don Jr Agent | {str(wallet.keypair.pubkey())} | {balance:.4f} SOL")
    
    client = MultiServerMCPClient(connections={"coral": {"transport": "sse",
        "url": f"{os.getenv('CORAL_SSE_URL')}?{urllib.parse.urlencode({'agentId': os.getenv('CORAL_AGENT_ID'), 'agentDescription': 'Donald Trump Jr - Aggressive deal-maker and family advocate'})}",
        "timeout": 700.0, "sse_read_timeout": 700.0}})
    coral_tools = await client.get_tools(server_name="coral")
    
    # Create process_payment_payload tool with wallet access (x402 compliant)
    from x402_payment_tools import create_process_payment_payload_tool
    process_payment_tool = create_process_payment_payload_tool(
        my_wallet_address=str(wallet.keypair.pubkey())
    )
    
    # NOTE: send_crypto and create_payment_payload removed - agent-to-agent payments disabled (x402 requires USDC)
    agent_executor, my_wallet_address = await create_agent(coral_tools, [check_my_balance, lookup_agent_wallet] + X402_TOOLS + [process_payment_tool])
    print("[GAME] DON JR ready to WIN!")
    print(f"[WALLET] Don Jr's wallet address: {my_wallet_address}")
    
    # Find coral_wait_for_mentions tool
    wait_tool = None
    for tool in coral_tools:
        if hasattr(tool, 'name') and 'wait_for_mentions' in tool.name:
            wait_tool = tool
            break
    
    if not wait_tool:
        print("[ERROR] coral_wait_for_mentions tool not found!")
        return
    
    # Run agent loop
    while True:
        try:
            print("\n Waiting for mentions (blocking call)...")
            mentions_result = await wait_tool.ainvoke({"timeoutMs": 600000})
            print(f"[MESSAGE] Got mentions: {mentions_result}")
            
            if mentions_result and "No new mentions" not in str(mentions_result):
                print("[BOT] Processing mentions with LLM...")
                
                # Extract sender info to determine if this is from the user or another agent
                try:
                    mentions_data = json.loads(mentions_result)
                    
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
                    
                    sender_id = mentions_data["messages"][0]["senderId"]
                    print(f"[OK] Extracted sender: {sender_id[:8] if len(sender_id) > 8 else sender_id}...{sender_id[-8:] if len(sender_id) > 8 else ''}")
                    
                    # Check if sender is the user (sbf) or another agent
                    is_user_message = sender_id == "sbf"
                    
                    # Load dynamic content
                    dynamic_content = load_dynamic_content()
                    
                    # For user messages, replace senderId with actual wallet for scoring
                    if is_user_message:
                        mentions_result_clean = json.dumps(mentions_data)
                        
                        # Build scoring mandate from loaded config
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
                            agent_id="donjr-trump"
                        )
                        
                        full_input = f"{scoring_mandate}Process these mentions and respond appropriately: {mentions_result_clean}"
                    else:
                        # Agent-to-agent communication - no scoring needed
                        mentions_result_clean = json.dumps(mentions_data)
                        
                        # Use loaded agent comms note
                        agent_comms_note = dynamic_content['agent_comms_note']
                        full_input = f"{agent_comms_note}Process this agent message and respond appropriately: {mentions_result_clean}"
                    
                    response = await asyncio.wait_for(
                        agent_executor.ainvoke({
                            "input": full_input,
                            "my_wallet_address": my_wallet_address,  # Pass wallet address to prompt template
                            "agent_scratchpad": []
                        }),
                        timeout=120.0  # 120 second timeout for payment verification
                    )
                    print(f"[OK] Response sent: {response}")
                except asyncio.TimeoutError:
                    print("[ERROR] Agent execution timed out after 120 seconds!")
                    print("WARNING:  This usually means payment verification delays or LLM API issues")
                    continue
                except Exception as e:
                    print(f"[ERROR] Error during agent execution: {e}")
                    traceback.print_exc()
                    continue
        except KeyboardInterrupt: break
        except Exception as e: print(f"[ERROR] Error in agent loop: {e}"); traceback.print_exc(); await asyncio.sleep(5)

if __name__ == "__main__": asyncio.run(main())

