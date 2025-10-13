# pypyc2

A Command and Control (C2) Framework with a modern web-based GUI dashboard.

## Architecture

```
pypyc2/
├── agent/          # Agent (implant) code - runs on target machines
├── server/         # FastAPI backend server
└── frontend/       # Next.js web dashboard
```

## Features

- **Modern Web Dashboard** - Next.js-based responsive UI
- **Real-time Agent Management** - Track online/offline agents
- **Interactive Terminal** - Execute commands on remote agents
- **File Transfer** - Upload/download files between server and agents
- **Command History** - View all executed commands and results
- **Agent Monitoring** - Last-seen tracking, status indicators

## Quick Start

### 1. Start the FastAPI Server

```bash
cd server
pip install -r requirements.txt
python server.py
```

Server will run on `http://localhost:8000`

### 2. Start the Next.js Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend will run on `http://localhost:3000`

### 3. Start an Agent (on target/test machine)

```bash
cd agent
pip install -r requirements.txt
python main.py <SERVER_IP>
```

Example: `python main.py 192.168.1.100`

## Usage

### Web Dashboard

Access the dashboard at `http://localhost:3000`

**Pages:**
- **Dashboard** - Overview of all agents and stats
- **Agents** - Detailed agent list with filtering
- **Terminal** - Interactive command execution
- **Files** - File management and transfer

### Terminal Commands

Select an agent from the sidebar and execute commands:

```
whoami                  # Get current user
hostname                # Get hostname
ipconfig                # Network configuration (Windows)
ifconfig                # Network configuration (Linux/Mac)
Get-Process             # PowerShell commands work too
```

### File Operations

**Upload from Agent to Server:**
1. Go to Files page
2. Select agent
3. Click "Request from Agent"
4. Enter the file path on the agent (e.g., `C:\Users\Public\file.txt`)
5. File will be uploaded to `server/uploads/agent_<id>/`

**Download from Server to Agent:**
1. Upload a file to the server first (or stage it)
2. Select the file
3. Click "Send to Agent"
4. Enter the destination path on the agent

## API Endpoints

### Agent Management
- `GET /agents` - List all agents
- `GET /agent/{agent_id}` - Get agent details

### Command Execution
- `POST /command/{agent_id}/exec?command=<cmd>` - Execute command
- `POST /command/{agent_id}/upload?source_path=<path>` - Request file upload
- `POST /command/{agent_id}/download?filename=<file>&save_as=<path>` - Send file to agent
- `GET /command/{agent_id}/{command_id}` - Get command result

### File Management
- `GET /files/{agent_id}` - List agent files
- `POST /upload_for_agent/{agent_id}` - Upload file for agent
- `GET /files/agent_{agent_id}/{filename}` - Download file

## Development

### Project Structure

```
server/
  ├── server.py        # FastAPI application
  ├── agent.py         # Agent class
  ├── models.py        # Pydantic models
  └── uploads/         # Uploaded files storage

frontend/
  ├── app/             # Next.js pages
  ├── components/      # React components
  ├── lib/             # API client and utilities
  └── types/           # TypeScript types

agent/
  ├── main.py          # Agent client
  └── functions.py     # Helper functions
```

### Technologies

**Backend:**
- FastAPI - Modern Python web framework
- Uvicorn - ASGI server
- Pydantic - Data validation

**Frontend:**
- Next.js 14 - React framework
- TypeScript - Type safety
- Tailwind CSS - Styling
- Lucide React - Icons

**Agent:**
- Python 3.x
- Requests - HTTP client

## Security Notes

⚠️ **Educational/Research Use Only**

This is a Command & Control framework designed for:
- Security research
- Red team exercises
- Educational purposes
- Authorized penetration testing

**Not for malicious use. Always obtain proper authorization.**

## Configuration

### Server Configuration

Edit `server/server.py`:
```python
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB
UPLOAD_DIR = Path("uploads")
```

### Frontend Configuration

Edit `frontend/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Agent Configuration

Edit `agent/main.py`:
```python
REQUEST_TIMEOUT = 30
UPLOAD_TIMEOUT = 120
DOWNLOAD_TIMEOUT = 120
```

## License

MIT License - Use responsibly and ethically.

## Contributing

Feel free to submit issues and pull requests!