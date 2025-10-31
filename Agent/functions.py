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

                items.append({
                    "name": item,
                    "is_directory": is_dir,
                    "size": size,
                    "path": full_path
                })
            except Exception as e:
                # Skip items we can't access
                print(f"[DEBUG] Skipping item due to error: {e}")
                continue

        # Sort: directories first, then files, alphabetically
        items.sort(key=lambda x: (not x['is_directory'], x['name'].lower()))

        print(f"[DEBUG] Successfully listed {len(items)} items ({sum(1 for i in items if i['is_directory'])} dirs, {sum(1 for i in items if not i['is_directory'])} files)")
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

