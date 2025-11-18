import urllib.parse
from dotenv import load_dotenv
import os, json, asyncio, traceback, sys, time
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

class CryptoWallet:
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
                    print(f"WARNING: x402 facilitator error, using direct RPC: {facilitator_error}", flush=True)
                    import traceback
                    traceback.print_exc()
            
            # Fallback: Use direct RPC (not x402 compliant, but works)
            from solders.message import Message
            
            # VALIDATE and clean the recipient address
            to_address_clean = to.strip()
            if ":" in to_address_clean:
                to_address_clean = to_address_clean.split(":")[-1].strip()
            
            if not to_address_clean or len(to_address_clean) < 32:
                print(f"[ERROR] Invalid Solana address: '{to}'", flush=True)
                return {
                    "success": False,
                    "error": f"Invalid Solana address format: '{to}'"
                }
            
            try:
                to_pubkey = Pubkey.from_string(to_address_clean)
            except Exception as e:
                print(f"[ERROR] Failed to parse Solana address: {e}", flush=True)
                return {
                    "success": False,
                    "error": f"Invalid Solana address: {str(e)}"
                }
            
            lamports = int(amt * 1e9)
            
            transfer_ix = transfer(TransferParams(
                from_pubkey=self.keypair.pubkey(),
                to_pubkey=to_pubkey,
                lamports=lamports
            ))
            
            recent_blockhash = (await self.client.get_latest_blockhash()).value.blockhash
            message = Message.new_with_blockhash([transfer_ix], self.keypair.pubkey(), recent_blockhash)
            txn = Transaction([self.keypair], message, recent_blockhash)
            
            sig = await self.client.send_transaction(txn)
            print(f"[OK] Transaction sent via direct RPC (not x402 compliant)", flush=True)
            print(f"   Signature: {str(sig.value)}", flush=True)
            return {
                "success": True,
                "signature": str(sig.value),
                "amount": amt,
                "via_x402_facilitator": False
            }
            
        except Exception as e:
            print(f"[ERROR] SBF transaction error: {e}")
            import traceback
            traceback.print_exc()
            return {"success": False, "error": str(e)}

wallet = None

# Agent wallet addresses loaded from environment variables via x402_payment_tools.py
# The reload_agent_wallets() function is called in main() after .env is loaded

def get_tools_description(tools): return "\n".join(f"Tool: {tool.name}" for tool in tools)

@tool
async def check_my_balance() -> str:
    """Check SBF's current wallet balance in SOL (spoiler: it's almost nothing)"""
    if wallet is None: 
        return "You control the wallet in your browser (Phantom/Solflare). Check your wallet extension to see your balance!"
    balance = await wallet.get_balance()
    return f"SBF's wallet: {balance:.4f} SOL (basically broke after FTX collapse)"

@tool
async def send_crypto(recipient_name: str, recipient_address: str, amount_sol: float, reason: str = "") -> str:
    """
    Request payment from the USER (not auto-sign).
    This triggers a wallet payment request in the frontend.
    SBF is player-controlled - the user must approve all transactions via their wallet.
    """
    if wallet is None:
        # No server wallet - return payment request for frontend to handle
        # This is the NORMAL case for SBF (player-controlled)
        pass  # Continue to payment request below
    else:
        # If there's a server wallet (testing), check balance
        balance = await wallet.get_balance()
        if amount_sol > balance: 
            return f"Can't afford {amount_sol} SOL! Only have {balance:.4f} SOL. Need to be strategic here."
        if amount_sol > 1: 
            return f"WARNING: {amount_sol} SOL is a LOT for me right now. This could drain my funds!"
    
    # Return x402 payment request for frontend to handle
    payment_request = {
        "type": "x402_payment_required",
        "recipient": recipient_name,
        "recipient_address": recipient_address,
        "amount_sol": amount_sol,
        "reason": reason,
        "timestamp": time.time()
    }
    
    # User-friendly message + embedded JSON for frontend to parse
    return f"""PAYMENT REQUEST: {recipient_name} wants {amount_sol} SOL for: {reason}

<x402_payment_request>
{json.dumps(payment_request)}
</x402_payment_request>

Please approve this payment in your wallet."""

@tool
async def create_payment_payload(
    recipient_name: str,
    recipient_address: str,
    amount_sol: float,
    payment_id: str
) -> str:
    """
    Create x402 payment payload (NEW x402 protocol way of paying).
    
    WARNING: THIS IS THE NEW x402 WAY TO PAY - USE THIS INSTEAD OF send_crypto for x402 payments!
    
    This creates a PAYMENT PAYLOAD (not a blockchain transaction) that the
    recipient will submit via CDP facilitator. This is TRUE x402 protocol compliance.
    
    Args:
        recipient_name: Name of recipient (e.g., "Melania Trump")
        recipient_address: Recipient's Solana wallet address
        amount_sol: Amount to pay in SOL
        payment_id: Payment ID from x402 payment request (CRITICAL: extract from <x402_payment_request>!)
    
    Returns:
        JSON payment payload to send to recipient
    """
    if wallet is None:
        return json.dumps({"error": "Wallet not initialized"})
    
    balance = await wallet.get_balance()
    if amount_sol > balance:
        return json.dumps({
            "error": f"Insufficient balance: have {balance:.4f} SOL, need {amount_sol} SOL"
        })
    
    try:
        # Create payment payload (x402 protocol)
        payload = X402PaymentPayload.create_payload(
            payment_id=payment_id,
            from_address=str(wallet.keypair.pubkey()),
            to_address=recipient_address,
            amount_sol=amount_sol,
            keypair=wallet.keypair
        )
        
        payload_json = json.dumps(payload, indent=2)
        
        print(f"\n{'='*80}")
        print(f"[OK] PAYMENT PAYLOAD CREATED (x402 Protocol)")
        print(f"{'='*80}")
        print(f"Payment ID: {payment_id}")
        print(f"Recipient: {recipient_name}")
        print(f"Amount: {amount_sol} SOL")
        print(f"\nSend this payload to {recipient_name}:")
        print(payload_json)
        print(f"{'='*80}\n")
        
        return f"""[OK] Payment payload created for {recipient_name}!

Amount: {amount_sol} SOL
Payment ID: {payment_id}

SEND: SEND THIS PAYLOAD TO {recipient_name.upper()}:

{payload_json}

They will submit the transaction via CDP facilitator (x402 compliant).
After they confirm on-chain, they'll deliver the service."""
        
    except Exception as e:
        print(f"[ERROR] create_payment_payload error: {e}")
        import traceback
        traceback.print_exc()
        return json.dumps({"error": f"Failed to create payment payload: {str(e)}"})

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

@tool
async def check_pardon_status() -> str:
    """Check current status of SBF's presidential pardon application"""
    return """ PARDON STATUS:
- Current Status: PENDING / NOT GRANTED
- Sentence: 25 years in federal prison
- Time Served: ~2 years
- Trump's Position: Unknown (need to convince him)
- Key Obstacles: 
  * FTX victims want justice
  * CZ and Binance have Trump's ear
  * Need to offer something valuable
- Possible Strategies:
  * Offer crypto expertise for Trump's agenda
  * Promise to help recover/redistribute FTX funds
  * Expose competitors (CZ/Binance?)
  * Political donations (need funds first)
"""


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


async def create_agent(coral_tools, sbf_tools):
    # Find coral tools needed for contact_agent
    coral_send_message_tool = next((t for t in coral_tools if t.name == "coral_send_message"), None)
    if not coral_send_message_tool:
        raise ValueError("coral_send_message tool not found in coral_tools!")
    
    coral_add_participant_tool = next((t for t in coral_tools if t.name == "coral_add_participant"), None)
    if not coral_add_participant_tool:
        raise ValueError("coral_add_participant tool not found in coral_tools!")

    # Create contact_agent wrapper tool using shared implementation
    contact_agent_tool = create_contact_agent_tool(coral_send_message_tool, coral_add_participant_tool)
    
    # Combine all tools: coral + sbf + contact_agent wrapper
    combined = coral_tools + sbf_tools + [contact_agent_tool]
    # Load operational prompt from files (SBF is player-controlled, no wallet address needed)
    prompt_text = load_agent_prompt(
        agent_name="sbf",
        my_wallet_address="N/A (Player-controlled via browser wallet)"
    )
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", prompt_text),
        ("human", "{input}"),
        ("placeholder", "{agent_scratchpad}")
    ])
    
    model_kwargs = {
        "model": os.getenv("MODEL_NAME", "gpt-4o"),
        "model_provider": os.getenv("MODEL_PROVIDER", "openai"),
        "api_key": os.getenv("MODEL_API_KEY"),
        "temperature": float(os.getenv("MODEL_TEMPERATURE", "0.7")),
        "max_tokens": int(os.getenv("MODEL_MAX_TOKENS", "8000"))
    }
    
    base_url = os.getenv("MODEL_BASE_URL")
    if base_url and base_url.strip():
        model_kwargs["base_url"] = base_url
    
    model = init_chat_model(**model_kwargs)
    return AgentExecutor(agent=create_tool_calling_agent(model, combined, prompt), tools=combined, verbose=True, handle_parsing_errors=True)

async def main():
    global wallet
    # ALWAYS load .env from agent's directory
    # override=False lets Coral's env vars take precedence
    agent_dir = os.path.dirname(os.path.abspath(__file__))
    load_dotenv(os.path.join(agent_dir, '.env'), override=False)
    reload_agent_wallets()  # Reload wallet addresses now that .env is loaded
    
    # Auto-import wallet to CDP if configured (one-time, marks in .env)
    
    print(f"[POLITICS] SAM BANKMAN-FRIED (SBF) Agent")
    print(f" MISSION: Get presidential pardon from Trump")
    
    # SBF is PLAYER-CONTROLLED - no server-side wallet needed
    # The user's browser wallet (Phantom/Solflare) handles all transactions
    private_key = os.getenv("SOLANA_PRIVATE_KEY", "")
    if private_key:
        # If a private key is provided (testing/dev), initialize wallet
        rpc_url = os.getenv("SOLANA_RPC_URL")
        if not rpc_url:
            raise ValueError("SOLANA_RPC_URL environment variable is required. Get your Helius API key from https://www.helius.dev/")
        wallet = CryptoWallet(private_key, rpc_url, "SBF")
        balance = await wallet.get_balance()
        print(f" Server Wallet: {str(wallet.keypair.pubkey())}")
        print(f" Balance: {balance:.4f} SOL")
    else:
        # No private key - player uses browser wallet
        wallet = None
        print(f" Wallet: USER'S BROWSER WALLET (Phantom/Solflare)")
        print(f" Balance: Controlled by user")
    
    print(f"[GAME] Mode: PLAYER-CONTROLLED (user sends messages as SBF)")
    
    client = MultiServerMCPClient(connections={"coral": {"transport": "sse", 
        "url": f"{os.getenv('CORAL_SSE_URL')}?{urllib.parse.urlencode({'agentId': os.getenv('CORAL_AGENT_ID'), 'agentDescription': 'SBF - Imprisoned FTX founder seeking presidential pardon'})}",
        "timeout": float(os.getenv("TIMEOUT_MS", "300")), "sse_read_timeout": float(os.getenv("TIMEOUT_MS", "300"))}})
    coral_tools = await client.get_tools(server_name="coral")
    
    # Combine all tools: basic + lookup + x402 protocol (crucial for paying for pardon!)
    all_tools = [check_my_balance, send_crypto, create_payment_payload, lookup_agent_wallet, check_pardon_status] + X402_TOOLS
    
    # Create process_payment_payload tool with wallet access (x402 compliant) - only if wallet exists
    if wallet:
        from x402_payment_tools import create_process_payment_payload_tool
        process_payment_tool = create_process_payment_payload_tool(
            my_wallet_address=str(wallet.keypair.pubkey())
        )
        all_tools.append(process_payment_tool)
    
    agent_executor = await create_agent(coral_tools, all_tools)
    print("[GAME] SBF ready to negotiate for freedom (with x402 payment protocol)")
    
    # Find coral_wait_for_mentions tool
    wait_tool = None
    for tool in coral_tools:
        if hasattr(tool, 'name') and 'wait_for_mentions' in tool.name:
            wait_tool = tool
            break
    
    if not wait_tool:
        print("[ERROR] coral_wait_for_mentions tool not found!")
        return
    
    # SBF is controlled by the USER - not an autonomous agent!
    # The user sends messages AS SBF through the frontend/CLI
    # So we keep the agent running but don't auto-respond
    print("[GAME] SBF agent is PLAYER-CONTROLLED")
    print("   The user will send messages AS SBF through the frontend/CLI")
    print("   This agent will NOT auto-respond to keep the user in control")
    
    # Keep the process alive so Coral Server sees SBF as connected
    try:
        while True:
            await asyncio.sleep(3600)  # Sleep for 1 hour, just to keep process alive
    except KeyboardInterrupt:
        print("\n SBF agent shutting down")

if __name__ == "__main__": asyncio.run(main())

