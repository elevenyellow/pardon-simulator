"""
Premium service pricing and configuration

Handles loading and managing premium service pricing from JSON configuration.
"""

import os
import json
from typing import Dict, Union


def load_premium_services() -> Dict[str, Union[float, Dict]]:
    """
    Load premium services pricing from JSON file.
    
    Returns:
        Dictionary mapping service types to pricing (float or config dict)
    """
    try:
        services_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), "premium_services.json")
        with open(services_file, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        print("⚠️  Warning: premium_services.json not found. Using default pricing.")
        print("   Copy premium_services.example.json to premium_services.json")
        # Fallback to default pricing
        return {
            "insider_info": 0.0005,  # Exclusive insider information
        }
    except json.JSONDecodeError as e:
        print(f"⚠️  Warning: Invalid JSON in premium_services.json: {e}")
        print("   Using default pricing")
        return {
            "insider_info": 0.0005
        }


# Load premium services configuration
PREMIUM_SERVICES = load_premium_services()

