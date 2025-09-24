from typing import Union
from agent import Agent
from fastapi import FastAPI, Request
from pydantic import BaseModel
from collections import defaultdict
from models import *
id_counter = 1

app = FastAPI()
# id : agent
agents = {}

@app.get("/")
def read_root():
    return {"Hello": "World"}


################### for server
@app.get("/agents")
def get_agents():
    return agents.keys()

@app.get("/agent/{id}")
def get_agent(agent_id: int):
    return agents[agent_id]

@app.post("/create_command/{agent_id}")
def create_command(agent_id: int, command: str):
    ag: Agent
    ag = agents[agent_id]
    command_id = ag.add_command(command)
    return {'command_id': command_id}


@app.post("/get_command/{agent_id}")
def get_command(agent_id: int, command_id: int):
    ag: Agent
    ag = agents[agent_id]
    res = ag.get_result(command_id)
    return {'command_id': command_id, 'result': res}


################### for agent
@app.post("/join")
def create_agent(hostname: str, user: str, request: Request):
    global id_counter
    ag = Agent(id_counter, request.client.host, hostname, user)
    agents[id_counter] = ag
    id_counter += 1

    return {'id': id_counter - 1, "status": True}

@app.get("/agent/get_commands/{agent_id}")
def get_commands(agent_id: int):
    ag: Agent
    ag = agents[agent_id]
    commands = ag.get_commands()
    return {'commands': commands}



@app.post("/agent/set_commands")
def set_commands(commands: Commands):
    ag: Agent
    ag = agents[commands.agent_id]
    for command in commands.commands:
        ag.set_result(command.command_id, command.result)
    return {'status': True}


