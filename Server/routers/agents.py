"""
Agent Dashboard & Admin Routes
Handles agent listing, details, and deletion operations
"""

import shutil
import time
from datetime import datetime
from typing import Dict
from fastapi import APIRouter, HTTPException, Depends

from core.agent import Agent
from config import agents, UPLOAD_DIR
from dependencies import get_current_user


router = APIRouter(prefix="", tags=["agents"])


@router.get("/agents")
def get_agents(user: Dict = Depends(get_current_user)):
    """Get list of all agents with their details"""
    return [agents[agent_id].to_dict() for agent_id in agents]


@router.get("/agent/{agent_id}")
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


@router.delete("/agent/{agent_id}")
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
