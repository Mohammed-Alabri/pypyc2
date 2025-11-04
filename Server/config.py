"""
Configuration constants and global state for PyPyC2 Server
"""

from pathlib import Path
from core.token_manager import PayloadTokenManager


# =============================================================================
# FILE CONFIGURATION
# =============================================================================

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB limit for file uploads/downloads


# =============================================================================
# GLOBAL STATE
# =============================================================================

# Global agent storage: id -> Agent instance
agents = {}

# Initialize the payload token manager
payload_token_manager = PayloadTokenManager()
