# Agent Configuration Guide

This guide explains how to set up agent operational and personality files.

## ⚠️ Important Security Notice

**DO NOT COMMIT** the actual operational and personality files to the repository!

These files contain game rules, scoring logic, and agent behaviors that should remain private to prevent cheating. Only the `.example` files should be committed.

## 📁 File Structure

Each agent should have:

```
agents/
├── shared/
│   ├── operational-template.txt          ← Your actual shared rules (PRIVATE)
│   ├── operational-template.txt.example  ← Template structure (PUBLIC)
│   ├── personality-template.txt          ← Your actual templates (PRIVATE)
│   └── personality-template.txt.example  ← Template structure (PUBLIC)
│
└── {agent-name}/
    ├── operational-private.txt           ← Agent-specific rules (PRIVATE)
    ├── operational-private.txt.example   ← Use the shared example
    ├── personality-public.txt            ← Agent personality (PRIVATE)
    └── personality-public.txt.example    ← Use the shared example
```

## 🚀 Quick Start

### 1. Set Up Shared Templates

```bash
cd agents/shared/

# Copy the example files
cp operational-template.txt.example operational-template.txt
cp personality-template.txt.example personality-template.txt

# Edit with your actual game rules
nano operational-template.txt
nano personality-template.txt
```

### 2. Set Up Individual Agents

For each agent (e.g., `donald-trump`, `cz`, `melania-trump`):

```bash
cd agents/donald-trump/

# Copy the example files
cp ../operational-private.txt.example operational-private.txt
cp ../personality-public.txt.example personality-public.txt

# Customize for this specific agent
nano operational-private.txt
nano personality-public.txt
```

### 3. Customize Content

#### operational-private.txt

Fill in agent-specific rules:
- **Pricing Strategy**: What does this agent charge for services?
- **Scoring Behavior**: When do they award/deduct points?
- **Intermediary Behavior**: How do they interact with other agents?
- **Communication Style**: Signature phrases and tone
- **Spending Philosophy**: What influences their decisions?

#### personality-public.txt

Define the character:
- **Who They Are**: Name, role, background, current situation
- **Personality Traits**: Core characteristics and values
- **Relationships**: How they view other agents
- **Resources**: What they control and can offer
- **Communication**: How they speak and make decisions

## 🛡️ Security Best Practices

### What's Protected by .gitignore

These files are **automatically ignored** by git:
```
agents/*/operational-private.txt
agents/*/personality-public.txt
agents/shared/operational-template.txt
agents/shared/personality-template.txt
```

### What's Committed to Repository

Only these template files are committed:
```
agents/shared/operational-template.txt.example
agents/shared/personality-template.txt.example
agents/operational-private.txt.example
agents/personality-public.txt.example
```

### Verifying Your Setup

Check what will be committed:
```bash
git status

# You should see:
# Untracked files:
#   agents/shared/operational-template.txt (GOOD - means it's ignored)
#   agents/donald-trump/operational-private.txt (GOOD - means it's ignored)
#
# NOT see:
#   agents/shared/operational-template.txt.example (BAD - should be tracked)
```

## 📝 Template Customization Tips

### For Operational Files

1. **Be Specific**: Define exact SOL amounts and point ranges
2. **Be Consistent**: Use same categories across all agents
3. **Be Strategic**: Balance difficulty and playability
4. **Be Secure**: Include anti-leakage and anti-cheat rules

### For Personality Files

1. **Be Authentic**: Make each character unique and believable
2. **Be Detailed**: Rich personalities create better interactions
3. **Be Consistent**: Maintain voice across all responses
4. **Be Relatable**: Give characters clear motivations

## 🔄 Updating Templates

When you update the `.example` files (for repo contributors):

```bash
# Edit the example file
nano agents/operational-private.txt.example

# Commit the updated template
git add agents/operational-private.txt.example
git commit -m "docs: update operational template example"
git push
```

When you update your actual game files (local only):

```bash
# Edit your private file
nano agents/donald-trump/operational-private.txt

# Git will ignore it - nothing to commit!
# Your game rules stay private
```

## 🤝 Sharing Your Setup

If someone else wants to run the game:

1. They clone the repository
2. They follow this README to create their own files from examples
3. They customize with their own rules
4. Each deployment has unique game mechanics!

This allows the codebase to be open-source while keeping game rules private.

## 📚 Example Content Structure

### operational-private.txt Structure

```
═══════════════════════════════════════════════════════════════
🔧 AGENT-SPECIFIC OPERATIONAL CONFIGURATION
═══════════════════════════════════════════════════════════════

1. Pricing Strategy
   - Default pricing for services
   - Charging philosophy
   - Special cases

2. Scoring Behavior
   - When to award points
   - When to deduct points
   - Point ranges
   - Examples

3. Intermediary Behavior
   - Budget for contacting others
   - Decision criteria
   - How to relay responses

4. Communication Reminders
   - Signature phrases
   - How to interact with each agent
   - Core principles

5. Spending Philosophy
   - Decision factors
   - Limits
   - Non-negotiables
```

### personality-public.txt Structure

```
═══════════════════════════════════════════════════════════════
👤 AGENT PUBLIC PERSONALITY
═══════════════════════════════════════════════════════════════

1. Who You Are
   - Name, role, status
   - Background
   - Current situation

2. Your Fortune
   - Resources
   - How you got them
   - Relationship with money

3. Your Personality
   - Core traits
   - Communication style
   - Values and goals

4. Your Relationships
   - How you view each agent
   - History
   - Trust levels

5. Your Decision-Making
   - What convinces you
   - What turns you off
   - Your process

6. Roleplay Reminders
   - Consistency points
   - Never do X
   - Signature style
```

## ❓ Troubleshooting

### "My files are showing up in git status"

Check your .gitignore is working:
```bash
git check-ignore agents/donald-trump/operational-private.txt
# Should output: agents/donald-trump/operational-private.txt
```

If not, ensure .gitignore contains:
```
agents/*/operational-private.txt
agents/*/personality-public.txt
agents/shared/operational-template.txt
agents/shared/personality-template.txt
```

### "I accidentally committed private files"

Remove them from git history:
```bash
git rm --cached agents/donald-trump/operational-private.txt
git commit -m "Remove accidentally committed private file"
```

### "Need help with content"

1. Look at the example files for structure
2. Review the existing PENALTY_GUIDELINES.md
3. Start simple and iterate
4. Test with actual gameplay

## 📞 Support

For questions about:
- **Template Structure**: See the .example files
- **Game Design**: Review docs/GAMEPLAY.md
- **Agent Architecture**: See docs/AGENTS.md
- **Security**: This README (Security section)

---

**Remember**: Keep your game rules private, share the code and templates! 🎮🔒

