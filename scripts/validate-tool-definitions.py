#!/usr/bin/env python3
"""
Validate tool-definitions.json files for all agents.

This script checks tool definitions for common errors before deployment.
Run this before uploading configs to S3 to catch issues early.

Usage:
    python scripts/validate-tool-definitions.py                # Check all agents
    python scripts/validate-tool-definitions.py sbf            # Check specific agent
    python scripts/validate-tool-definitions.py sbf cz         # Check multiple agents
"""

import json
import os
import sys
from pathlib import Path

# Colors for terminal output
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
BLUE = "\033[94m"
RESET = "\033[0m"

def validate_tool_definition(tool_def, agent_id, tool_index):
    """Validate a single tool definition."""
    errors = []
    warnings = []
    
    # Check if it's a dictionary
    if not isinstance(tool_def, dict):
        errors.append(f"Tool #{tool_index + 1} is not a dictionary, got {type(tool_def).__name__}")
        return errors, warnings
    
    # Check required fields
    tool_name = tool_def.get("name")
    if not tool_name:
        errors.append(f"Tool #{tool_index + 1} missing 'name' field")
        return errors, warnings
    
    if not tool_def.get("description"):
        errors.append(f"Tool '{tool_name}' missing 'description' field")
    
    # Check response fields
    has_response = "response" in tool_def
    has_template = "response_template" in tool_def
    
    if not has_response and not has_template:
        errors.append(f"Tool '{tool_name}' must have either 'response' or 'response_template'")
    
    # Check parameters
    parameters = tool_def.get("parameters", {})
    
    if parameters and not isinstance(parameters, dict):
        errors.append(f"Tool '{tool_name}' parameters must be a dictionary")
        return errors, warnings
    
    # If has parameters, must have response_template
    if parameters and not has_template:
        errors.append(f"Tool '{tool_name}' has parameters but no 'response_template'")
    
    # If has response_template, validate placeholders
    if has_template:
        template = tool_def.get("response_template", "")
        
        # Extract placeholders from template
        import re
        placeholders = set(re.findall(r'\{(\w+)\}', template))
        param_names = set(parameters.keys())
        
        # Special placeholder for balance
        if "balance" in placeholders:
            if tool_name != "check_my_balance":
                warnings.append(f"Tool '{tool_name}' uses {{balance}} placeholder but is not named 'check_my_balance'")
            placeholders.discard("balance")
        
        # Check for missing parameters
        missing = placeholders - param_names
        if missing:
            errors.append(f"Tool '{tool_name}' template has placeholders without parameters: {missing}")
        
        # Check for unused parameters
        unused = param_names - placeholders
        if unused:
            warnings.append(f"Tool '{tool_name}' has parameters not used in template: {unused}")
    
    # Validate parameter types
    for param_name, param_info in parameters.items():
        if isinstance(param_info, dict):
            param_type = param_info.get("type", "string")
            valid_types = ["string", "str", "int", "integer", "float", "number", "bool", "boolean"]
            if param_type not in valid_types:
                warnings.append(f"Tool '{tool_name}' parameter '{param_name}' has unknown type: {param_type}")
            
            if not param_info.get("description"):
                warnings.append(f"Tool '{tool_name}' parameter '{param_name}' missing description")
    
    return errors, warnings

def validate_agent_tools(agent_id):
    """Validate tool definitions for a single agent."""
    agent_dir = Path("agents") / agent_id
    tool_file = agent_dir / "tool-definitions.json"
    
    print(f"\n{BLUE}Validating {agent_id}...{RESET}")
    
    if not tool_file.exists():
        print(f"  {YELLOW}ℹ️  No tool-definitions.json found (OK if tools defined in code){RESET}")
        return True
    
    # Load and parse JSON
    try:
        with open(tool_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        print(f"  {RED}❌ Invalid JSON: Line {e.lineno}, Column {e.colno}: {e.msg}{RESET}")
        return False
    except Exception as e:
        print(f"  {RED}❌ Failed to read file: {e}{RESET}")
        return False
    
    # Check tools list
    tools = data.get("tools")
    if tools is None:
        print(f"  {RED}❌ Missing 'tools' key in JSON{RESET}")
        return False
    
    if not isinstance(tools, list):
        print(f"  {RED}❌ 'tools' must be a list, got {type(tools).__name__}{RESET}")
        return False
    
    if not tools:
        print(f"  {YELLOW}⚠️  No tools defined (empty list){RESET}")
        return True
    
    print(f"  Found {len(tools)} tool definition(s)")
    
    # Validate each tool
    all_errors = []
    all_warnings = []
    
    for i, tool_def in enumerate(tools):
        errors, warnings = validate_tool_definition(tool_def, agent_id, i)
        all_errors.extend(errors)
        all_warnings.extend(warnings)
        
        # Safe name extraction (tool_def might not be a dict)
        if isinstance(tool_def, dict):
            tool_name = tool_def.get("name", f"tool #{i + 1}")
        else:
            tool_name = f"tool #{i + 1}"
        
        if not errors:
            print(f"    {GREEN}✅ {tool_name}{RESET}")
        else:
            print(f"    {RED}❌ {tool_name}{RESET}")
    
    # Print errors and warnings
    if all_errors:
        print(f"\n  {RED}Errors:{RESET}")
        for error in all_errors:
            print(f"    {RED}• {error}{RESET}")
    
    if all_warnings:
        print(f"\n  {YELLOW}Warnings:{RESET}")
        for warning in all_warnings:
            print(f"    {YELLOW}• {warning}{RESET}")
    
    # Summary
    if all_errors:
        print(f"\n  {RED}❌ Validation FAILED with {len(all_errors)} error(s){RESET}")
        return False
    elif all_warnings:
        print(f"\n  {YELLOW}⚠️  Validation passed with {len(all_warnings)} warning(s){RESET}")
        return True
    else:
        print(f"\n  {GREEN}✅ Validation passed!{RESET}")
        return True

def main():
    """Main validation function."""
    print(f"{BLUE}{'='*60}")
    print("Tool Definitions Validator")
    print(f"{'='*60}{RESET}")
    
    # Determine which agents to check
    if len(sys.argv) > 1:
        agents = sys.argv[1:]
    else:
        # Default: check all agents
        agents_dir = Path("agents")
        agents = [
            d.name for d in agents_dir.iterdir()
            if d.is_dir() and not d.name.startswith('.') and d.name != 'shared' and d.name != 'payment'
        ]
    
    print(f"Checking {len(agents)} agent(s): {', '.join(agents)}")
    
    # Validate each agent
    results = {}
    for agent_id in agents:
        results[agent_id] = validate_agent_tools(agent_id)
    
    # Final summary
    print(f"\n{BLUE}{'='*60}")
    print("Summary")
    print(f"{'='*60}{RESET}")
    
    passed = sum(1 for v in results.values() if v)
    failed = len(results) - passed
    
    for agent_id, success in results.items():
        status = f"{GREEN}✅ PASS{RESET}" if success else f"{RED}❌ FAIL{RESET}"
        print(f"  {agent_id:<20} {status}")
    
    print(f"\n{passed} passed, {failed} failed")
    
    if failed > 0:
        print(f"\n{RED}❌ Validation failed. Fix errors before uploading to S3.{RESET}")
        sys.exit(1)
    else:
        print(f"\n{GREEN}✅ All validations passed! Safe to upload to S3.{RESET}")
        sys.exit(0)

if __name__ == "__main__":
    main()

