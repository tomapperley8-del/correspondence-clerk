#!/bin/bash
# Wrapper script to call PowerShell screenshot helper
# Usage: ./scripts/paste-screenshot.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Run PowerShell script
powershell.exe -ExecutionPolicy Bypass -File "$SCRIPT_DIR/paste-screenshot.ps1"
