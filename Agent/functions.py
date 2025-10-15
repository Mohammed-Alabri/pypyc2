import subprocess
import os

# Global working directory state
cwd = os.getcwd()

def execute_command(command: str):
    global cwd

    # Handle cd commands to maintain persistent directory state
    if command.strip().lower().startswith("cd "):
        path = command[3:].strip()
        new_dir = os.path.abspath(os.path.expanduser(os.path.join(cwd, path)))

        if os.path.isdir(new_dir):
            cwd = new_dir
            return f"Changed directory to: {cwd}"
        else:
            return f"The system cannot find the path specified: {path}"

    # Execute all other commands in the current working directory
    res = subprocess.run(
        ["powershell", "-NoProfile", "-Command", command],
        cwd=cwd,
        capture_output=True,
        text=True
    ).stdout.strip()
    return res


def get_hostname():
    res = subprocess.run(["hostname"], cwd=cwd, capture_output=True, text=True).stdout.strip()
    return res

def get_whoami():
    res = subprocess.run(["whoami"], cwd=cwd, capture_output=True, text=True).stdout.strip()
    return res

def get_systeminfo():
    res = subprocess.run(["systeminfo"], cwd=cwd, capture_output=True, text=True).stdout.strip()
    return res
