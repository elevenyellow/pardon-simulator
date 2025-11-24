#!/usr/bin/env bash
set -e

VENV_PYTHON=".venv/bin/python"

# Force x86_64 to match Java architecture  
if [[ "$OSTYPE" == "darwin"* ]] && [[ "$(uname -m)" == "arm64" ]]; then
    # Force x86_64 (Rosetta) to match Java
    exec arch -x86_64 $VENV_PYTHON -u "$@"
else
    # Non-macOS or x86_64 system
    exec $VENV_PYTHON -u "$@"
fi
