import subprocess

def execute_command(command: str):
    res = subprocess.run(["powershell", "-NoProfile", "-Command", command], capture_output=True, text=True).stdout.strip()
    return res


def get_hostname():
    res = subprocess.run(["hostname"], capture_output=True, text=True).stdout.strip()
    return res

def get_whoami():
    res = subprocess.run(["whoami"], capture_output=True, text=True).stdout.strip()
    return res

def get_systeminfo():
    res = subprocess.run(["systeminfo"], capture_output=True, text=True).stdout.strip()
    return res
