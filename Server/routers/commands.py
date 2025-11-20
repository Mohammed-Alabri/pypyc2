"""
Command Management Routes
Handles creating and managing commands sent from server to agents
"""

import os
from typing import Dict
from fastapi import APIRouter, HTTPException, Depends

from core.agent import Agent
from config import agents, UPLOAD_DIR
from dependencies import get_current_user
from models import WriteFileRequest


router = APIRouter(prefix="", tags=["commands"])


@router.post("/create_command/{agent_id}")
def create_exec_command(agent_id: int, command: str, user: Dict = Depends(get_current_user)):
    """Legacy endpoint - create an exec command"""
    if agent_id not in agents:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")
    ag: Agent = agents[agent_id]
    command_id = ag.add_command("exec", {"command": command})
    return {'command_id': command_id, 'type': 'exec'}


@router.post("/command/{agent_id}/exec")
def create_exec_command_v2(agent_id: int, command: str, user: Dict = Depends(get_current_user)):
    """Create an exec command"""
    if agent_id not in agents:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")
    ag: Agent = agents[agent_id]
    command_id = ag.add_command("exec", {"command": command})
    return {'command_id': command_id, 'type': 'exec', 'status': 'queued'}


@router.post("/command/{agent_id}/upload")
def create_upload_command(agent_id: int, source_path: str, filename: str = None, user: Dict = Depends(get_current_user)):
    """
    Create an upload command - agent will upload a file from source_path

    Args:
        agent_id: The agent ID
        source_path: Path on agent's machine to upload
        filename: Optional custom filename (defaults to basename of source_path)
    """
    if agent_id not in agents:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")

    if not filename:
        filename = os.path.basename(source_path)

    ag: Agent = agents[agent_id]
    command_id = ag.add_command("upload", {
        "source_path": source_path,
        "filename": filename
    })
    return {
        'command_id': command_id,
        'type': 'upload',
        'status': 'queued',
        'message': f'Agent will upload {source_path} as {filename}'
    }


@router.post("/command/{agent_id}/download")
def create_download_command(agent_id: int, filename: str, save_as: str = None, user: Dict = Depends(get_current_user)):
    """
    Create a download command - agent will download a file from server

    Args:
        agent_id: The agent ID
        filename: File in the agent's directory to download
        save_as: Optional path where agent should save the file
    """
    if agent_id not in agents:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")

    # Check if file exists in agent's directory
    agent_dir = UPLOAD_DIR / f"agent_{agent_id}"
    file_path = agent_dir / filename

    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"File {filename} not found for this agent")

    if not save_as:
        save_as = filename

    ag: Agent = agents[agent_id]
    command_id = ag.add_command("download", {
        "filename": filename,
        "save_as": save_as,
        "url": f"/files/agent_{agent_id}/{filename}"
    })
    return {
        'command_id': command_id,
        'type': 'download',
        'status': 'queued',
        'message': f'Agent will download {filename} and save as {save_as}'
    }


@router.post("/command/{agent_id}/terminate")
def create_terminate_command(agent_id: int, user: Dict = Depends(get_current_user)):
    """
    Create a terminate command - agent will gracefully shut down

    Args:
        agent_id: The agent ID
    """
    if agent_id not in agents:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")

    ag: Agent = agents[agent_id]
    command_id = ag.add_command("terminate", {})
    return {
        'command_id': command_id,
        'type': 'terminate',
        'status': 'queued',
        'message': f'Agent {agent_id} will terminate'
    }


@router.post("/command/{agent_id}/list_directory")
def create_list_directory_command(agent_id: int, path: str, user: Dict = Depends(get_current_user)):
    """
    Create a list_directory command - agent will list contents of a directory

    Args:
        agent_id: The agent ID
        path: The directory path to list
    """
    if agent_id not in agents:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")

    ag: Agent = agents[agent_id]
    command_id = ag.add_command("list_directory", {"path": path})
    return {
        'command_id': command_id,
        'type': 'list_directory',
        'status': 'queued',
        'message': f'Agent will list directory: {path}'
    }


@router.post("/command/{agent_id}/set_sleep_time")
def create_set_sleep_time_command(agent_id: int, sleep_time: int, user: Dict = Depends(get_current_user)):
    """
    Create a set_sleep_time command - agent will change its polling interval

    Args:
        agent_id: The agent ID
        sleep_time: New sleep time in seconds (1-60)
    """
    if agent_id not in agents:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")

    # Validate sleep_time
    if sleep_time < 1 or sleep_time > 60:
        raise HTTPException(status_code=400, detail="Sleep time must be between 1 and 60 seconds")

    ag: Agent = agents[agent_id]
    old_sleep_time = ag.sleep_time
    command_id = ag.add_command("set_sleep_time", {"sleep_time": sleep_time})
    return {
        'command_id': command_id,
        'type': 'set_sleep_time',
        'status': 'queued',
        'message': f'Agent will change sleep time from {old_sleep_time}s to {sleep_time}s'
    }


@router.post("/command/{agent_id}/read_file")
def create_read_file_command(agent_id: int, path: str, max_size: int = 10 * 1024 * 1024, user: Dict = Depends(get_current_user)):
    """
    Create a read_file command - agent will read file content for editing

    Args:
        agent_id: The agent ID
        path: The file path to read
        max_size: Maximum file size in bytes (default 10MB)
    """
    if agent_id not in agents:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")

    ag: Agent = agents[agent_id]
    command_id = ag.add_command("read_file", {
        "path": path,
        "max_size": max_size
    })
    return {
        'command_id': command_id,
        'type': 'read_file',
        'status': 'queued',
        'message': f'Agent will read file: {path}'
    }


@router.post("/command/{agent_id}/write_file")
def create_write_file_command(agent_id: int, request: WriteFileRequest, user: Dict = Depends(get_current_user)):
    """
    Create a write_file command - agent will write content to file

    Args:
        agent_id: The agent ID
        request: WriteFileRequest with path and content
    """
    if agent_id not in agents:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")

    ag: Agent = agents[agent_id]
    command_id = ag.add_command("write_file", {
        "path": request.path,
        "content": request.content
    })
    return {
        'command_id': command_id,
        'type': 'write_file',
        'status': 'queued',
        'message': f'Agent will save file: {request.path}'
    }


@router.post("/command/{agent_id}/delete")
def create_delete_command(agent_id: int, path: str, recursive: bool = False, user: Dict = Depends(get_current_user)):
    """
    Create a delete command - agent will delete file or directory

    Args:
        agent_id: The agent ID
        path: The path to delete
        recursive: Whether to delete directories recursively (default False)
    """
    if agent_id not in agents:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")

    ag: Agent = agents[agent_id]
    command_id = ag.add_command("delete", {
        "path": path,
        "recursive": recursive
    })
    return {
        'command_id': command_id,
        'type': 'delete',
        'status': 'queued',
        'message': f'Agent will delete: {path}'
    }


@router.get("/command/{agent_id}/{command_id}")
def get_command_result(agent_id: int, command_id: int, user: Dict = Depends(get_current_user)):
    """Get the result of a specific command"""
    if agent_id not in agents:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")
    ag: Agent = agents[agent_id]
    result = ag.get_result(command_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Command {command_id} not found")
    return result
