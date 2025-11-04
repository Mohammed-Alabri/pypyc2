from pydantic import BaseModel
from typing import List, Optional, Dict, Any

class Command(BaseModel):
    command_id: int
    result: str

class Commands(BaseModel):
    agent_id: int
    commands: List[Command]

# New unified command structure
class CommandData(BaseModel):
    type: str  # "exec", "upload", "download"
    data: Dict[str, Any]  # Command-specific data

class CommandResult(BaseModel):
    agent_id: int
    command_id: int
    status: str  # "success", "error"
    result: Optional[str] = None  # Output for exec commands
    error: Optional[str] = None  # Error message if failed


class AgentIntial(BaseModel):
    hostname: str
    user: str