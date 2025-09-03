from pydantic import BaseModel
from typing import List

class Command(BaseModel):
    command_id: int
    result: str

class Commands(BaseModel):
    agent_id: int
    commands: List[Command]