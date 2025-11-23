import os
import re
from functools import lru_cache
from typing import Dict


@lru_cache(maxsize=None)
def get_dynamic_content(agent_dir: str, agent_id: str) -> Dict[str, str]:
    """
    Load and cache dynamic prompt assets for a given agent directory.

    Returns a dict containing the original templates plus a precomputed
    scoring mandate string so message handlers don't have to rebuild the
    large prompt on every mention.
    """
    shared_dir = os.path.join(os.path.dirname(agent_dir), "shared")

    with open(os.path.join(shared_dir, "scoring-mandate.txt"), "r", encoding="utf-8") as f:
        scoring_mandate_template = f.read()

    with open(os.path.join(shared_dir, "agent-comms-note.txt"), "r", encoding="utf-8") as f:
        agent_comms_note = f.read()

    with open(os.path.join(agent_dir, "scoring-config.txt"), "r", encoding="utf-8") as f:
        scoring_config = f.read()

    evaluation_criteria = _extract_section(scoring_config, r"## Evaluation Criteria\n(.+?)(?=\n## )")
    evaluation_score_guide = _extract_section(
        scoring_config,
        r"## Evaluation Score Guide[^\n]*\n(.+?)(?=\n## |\nNote:)"
    )
    routing_instructions = _extract_section(scoring_config, r"## Routing Instructions\n(.+?)$")

    scoring_mandate = scoring_mandate_template.format(
        evaluation_criteria=evaluation_criteria,
        evaluation_score_guide=evaluation_score_guide,
        routing_instructions=routing_instructions,
        agent_id=agent_id,
    )

    return {
        "scoring_mandate_template": scoring_mandate_template,
        "agent_comms_note": agent_comms_note,
        "scoring_config": scoring_config,
        "scoring_mandate": scoring_mandate,
    }


def _extract_section(source: str, pattern: str) -> str:
    match = re.search(pattern, source, re.DOTALL)
    return match.group(1).strip() if match else ""

