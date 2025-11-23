"""
Payment-related scoring logic

Handles score updates and bonus calculations for premium service payments.
"""

import aiohttp
from typing import Optional


async def award_points_async(
    user_wallet: str,
    evaluation_score: float,
    reason: str,
    category: str,
    subcategory: Optional[str],
    agent_id: Optional[str],
    message_id: Optional[str],
    premium_service_amount: float,
    backend_url: str
) -> None:
    """
    Submit score update asynchronously (background task).
    
    This allows the agent to respond immediately without waiting for scoring.
    
    Args:
        user_wallet: User's Solana wallet address
        evaluation_score: Score evaluation (-3.0 to 3.0)
        reason: Explanation for score change
        category: Score category (payment, negotiation, etc.)
        subcategory: Optional subcategory
        agent_id: Agent awarding points
        message_id: Message ID that triggered score change
        premium_service_amount: USDC amount if premium service payment
        backend_url: Backend API URL
    """
    try:
        payload = {
            "userWallet": user_wallet,
            "delta": evaluation_score,
            "reason": reason,
            "category": category,
            "evaluationScore": evaluation_score,
        }
        
        if subcategory:
            payload["subcategory"] = subcategory
        if agent_id:
            payload["agentId"] = agent_id
        if message_id:
            payload["messageId"] = message_id
        if premium_service_amount > 0:
            payload["premiumServicePayment"] = premium_service_amount
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{backend_url}/api/scoring/update",
                json=payload,
                timeout=aiohttp.ClientTimeout(total=10)
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    print(f"✅ Score updated (async): {data['newScore']} (delta: {data.get('delta', evaluation_score)})")
                else:
                    error_text = await resp.text()
                    print(f"❌ Scoring API error {resp.status}: {error_text}")
    except Exception as e:
        print(f"❌ Exception in async scoring: {str(e)}")

