import os
from typing import Any


def get_default_executor_limits():
    """
    Shared helper to configure executor limits via environment variables.
    """
    return {
        "max_iterations": int(os.getenv("AGENT_MAX_ITERATIONS", "10")),
        "max_execution_time": int(os.getenv("AGENT_MAX_EXECUTION_TIME", "90")),
        "invoke_timeout": int(os.getenv("AGENT_INVOKE_TIMEOUT", "105")),
    }


def set_executor_invoke_timeout(executor: Any, invoke_timeout: int) -> None:
    """
    LangChain's AgentExecutor inherits from Pydantic's BaseModel which forbids
    setting arbitrary attributes. Some of our agents rely on reading an
    `invoke_timeout` attribute later when routing messages, so we need to attach
    it in a way that works for both strict Pydantic models and plain objects.
    """
    if executor is None:
        return

    try:
        setattr(executor, "invoke_timeout", invoke_timeout)
        return
    except Exception:
        if hasattr(executor, "__dict__"):
            # Fallback: write directly to __dict__ which bypasses Pydantic's setter.
            # This mirrors how BaseModel stores dynamic state internally and keeps
            # getattr(executor, "invoke_timeout", default) working everywhere else.
            executor.__dict__["invoke_timeout"] = invoke_timeout
            return
        raise

