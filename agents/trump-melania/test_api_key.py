#!/usr/bin/env python3
"""
Quick test script to verify OpenAI API key works correctly.
This bypasses all agent logic and tests the API key directly.
"""
import os
from dotenv import load_dotenv
import sys

# Load .env file
agent_dir = os.path.dirname(os.path.abspath(__file__))
env_file = os.path.join(agent_dir, '.env')
print(f"Loading .env from: {env_file}")
print(f".env exists: {os.path.exists(env_file)}")
load_dotenv(env_file, override=False)

# Get API key
api_key = os.getenv("MODEL_API_KEY", "")
if not api_key:
    api_key = os.getenv("OPENAI_API_KEY", "")

if not api_key:
    print("ERROR: No API key found in MODEL_API_KEY or OPENAI_API_KEY")
    sys.exit(1)

# Mask API key for display
masked_key = f"{api_key[:8]}...{api_key[-4:]}" if len(api_key) > 12 else "***"
print(f"\nTesting API Key: {masked_key}")
print(f"Key length: {len(api_key)} characters")
print(f"Key starts with: {api_key[:7]}")

# Test with OpenAI directly
try:
    from openai import OpenAI
    
    client = OpenAI(api_key=api_key)
    print("\n✓ OpenAI client created successfully")
    
    # Try to make a simple API call
    print("\nTesting API call...")
    response = client.chat.completions.create(
        model="gpt-4o-mini",  # Use cheaper model for testing
        messages=[
            {"role": "user", "content": "Say 'API key works!'"}
        ],
        max_tokens=10
    )
    
    print(f"✓ API call successful!")
    print(f"Response: {response.choices[0].message.content}")
    print("\n✅ API KEY IS VALID AND WORKING!")
    
    # Check usage/billing info
    print("\n--- Checking your account info ---")
    # Note: OpenAI removed the /usage endpoint, so we can't check billing directly anymore
    print("API key is working. Check your usage at: https://platform.openai.com/usage")
    
except ImportError:
    print("\nERROR: openai package not installed")
    print("Install with: pip install openai")
    sys.exit(1)
except Exception as e:
    print(f"\n❌ API call FAILED!")
    print(f"Error type: {type(e).__name__}")
    print(f"Error message: {e}")
    
    if "429" in str(e):
        print("\n⚠️  This is a 429 rate limit / quota error")
        print("Possible causes:")
        print("1. You've exceeded your API usage quota")
        print("2. The API key doesn't have an active payment method")
        print("3. The API key is associated with a free tier that's exhausted")
        print("4. The API key is invalid or revoked")
        print("\nCheck your OpenAI account at: https://platform.openai.com/account/billing")
    elif "401" in str(e):
        print("\n⚠️  This is a 401 authentication error")
        print("The API key is invalid or has been revoked")
    
    sys.exit(1)


