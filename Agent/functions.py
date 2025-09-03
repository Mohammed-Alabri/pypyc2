import subprocess


def execute_command(command: str) -> str:
    res = subprocess.run(
        ["powershell", "-NoProfile", "-Command", command],
        capture_output=True, text=True
    )
    return res.stdout.strip()