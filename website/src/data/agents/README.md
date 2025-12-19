# Agent Personality Data

This directory contains agent personality descriptions used by the `/api/agents/personality` endpoint.

## Files

Each agent has a corresponding `.txt` file:
- `cz.txt` - Changpeng Zhao (CZ)
- `sbf.txt` - Sam Bankman-Fried (SBF)
- `trump-donald.txt` - Donald Trump
- `trump-melania.txt` - Melania Trump
- `trump-eric.txt` - Eric Trump
- `trump-donjr.txt` - Don Jr Trump
- `trump-barron.txt` - Barron Trump

## Format

Each file follows the format:
```
NAME - TITLE

Description text...
```

The API extracts:
- **Name**: From the first line (e.g., "CHANGPENG ZHAO (CZ)")
- **Title**: From the first line after the dash (e.g., "Founder and Former CEO of Binance")
- **Full personality**: The entire file content

## Source

These files are duplicated from `/agents/{agent-name}/personality-public.txt` for:
1. **Deployment simplicity** - They're part of the website codebase and deploy automatically
2. **API-specific versions** - Can be customized for public API responses without affecting agent behavior
3. **No external dependencies** - No need to fetch from S3 or read from parent directories

## Updating

When you update an agent's personality:
1. Update the main file: `/agents/{agent-name}/personality-public.txt` (for agent behavior)
2. Copy to here if you want the API to reflect the change: `/website/src/data/agents/{agent-name}.txt`

Or edit these files directly if you only want to change what the API returns.
