# pypyc2 Usage Guide

## Installation

### Prerequisites
- Python 3.8+ installed
- Node.js 18+ and npm installed

### First Time Setup

1. **Install Server Dependencies**
```bash
cd server
pip install -r requirements.txt
```

2. **Install Frontend Dependencies**
```bash
cd frontend
npm install
```

3. **Install Agent Dependencies**
```bash
cd agent
pip install -r requirements.txt
```

## Running the System

### Option 1: Using Batch Scripts (Windows)

1. **Start the Server** (Terminal 1)
```batch
start_server.bat
```
Server runs on: `http://localhost:8000`

2. **Start the Frontend** (Terminal 2)
```batch
start_frontend.bat
```
Frontend runs on: `http://localhost:3000`

3. **Start an Agent** (Terminal 3)
```batch
start_agent.bat <SERVER_IP>
```
Example: `start_agent.bat 192.168.1.100`

### Option 2: Manual Commands

**Terminal 1 - Server:**
```bash
cd server
python server.py
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

**Terminal 3 - Agent:**
```bash
cd agent
python main.py <SERVER_IP>
```

## Accessing the Dashboard

Open your browser and navigate to: `http://localhost:3000`

You'll see:
- **Dashboard** - Overview of connected agents
- **Agents** - Detailed agent management
- **Terminal** - Interactive command execution
- **Files** - File upload/download management

## Using the Terminal

1. Navigate to the **Terminal** page
2. Select an agent from the left sidebar
3. Type commands in the input field at the bottom
4. Press Enter or click "Execute"
5. View results in the terminal window

### Example Commands:

**Windows:**
```powershell
whoami                          # Current user
hostname                        # Computer name
ipconfig                        # Network info
Get-Process                     # Running processes
Get-ChildItem C:\              # List files
systeminfo                      # System information
```

**PowerShell Advanced:**
```powershell
Get-ComputerInfo | Select-Object CsName, OsArchitecture
Get-LocalUser
Get-NetAdapter
```

## File Operations

### Uploading a File from Agent to Server

1. Go to **Files** page
2. Select an agent
3. Click "Request from Agent"
4. Enter the file path on the agent machine
   - Example: `C:\Users\Public\test.txt`
   - Example: `/etc/passwd` (Linux)
5. The file will be uploaded to `server/uploads/agent_<id>/`

### Downloading a File from Server to Agent

1. First, upload a file to the server (or use "Upload to Server" button)
2. Select the file from the list
3. Click "Send to Agent"
4. Enter where the agent should save it
   - Example: `C:\Users\Public\downloaded.txt`
5. The agent will download and save the file

### Downloading Files to Your Computer

1. Go to **Files** page
2. Select an agent
3. Click "Download" next to any file
4. File will be downloaded to your browser's download folder

## API Usage (for scripting)

### Get All Agents
```bash
curl http://localhost:8000/agents
```

### Execute Command
```bash
curl -X POST "http://localhost:8000/command/123456/exec?command=whoami"
```

### Get Command Result
```bash
curl http://localhost:8000/command/123456/1
```

### Upload File for Agent
```bash
curl -X POST -F "file=@myfile.txt" http://localhost:8000/upload_for_agent/123456
```

## Troubleshooting

### Server won't start
- Make sure port 8000 is not in use
- Check if Python dependencies are installed: `pip list | grep fastapi`
- Try: `pip install fastapi uvicorn pydantic python-multipart`

### Frontend won't start
- Make sure port 3000 is not in use
- Delete `node_modules` and run `npm install` again
- Check Node.js version: `node --version` (should be 18+)

### Agent won't connect
- Check if server is running on port 8000
- Verify the IP address is correct
- Check firewall settings
- Try connecting to localhost first: `python main.py 127.0.0.1`

### Agent shows as "Offline"
- Agents are considered online if last seen within 10 seconds
- Agent polls every 3 seconds
- Check if agent process is still running
- Check network connectivity

### CORS Errors in Browser
- Make sure server has CORS configured for `http://localhost:3000`
- Server should show "Application startup complete" message
- Try restarting both server and frontend

## Configuration

### Change Server Port
Edit `server/server.py`, line 329:
```python
uvicorn.run(app, host="127.0.0.1", port=8000)
```

### Change Frontend Port
Edit `frontend/package.json`:
```json
"scripts": {
  "dev": "next dev -p 3001"
}
```

### Change API URL
Edit `frontend/.env.local`:
```
NEXT_PUBLIC_API_URL=http://your-server-ip:8000
```

### Change Agent Poll Interval
Edit `agent/main.py`, line 162:
```python
time.sleep(3)  # Change to desired seconds
```

## Security Best Practices

1. **Never expose the server to the internet without authentication**
2. **Use only on authorized networks and systems**
3. **Change default ports in production**
4. **Implement authentication (not included in this version)**
5. **Monitor uploaded files for malware**
6. **Use HTTPS in production environments**
7. **Keep logs of all operations**

## Development

### Adding New Commands

Edit `agent/main.py` to add new command types in `execute_command_by_type()`.

### Modifying the UI

Frontend components are in `frontend/components/` and `frontend/app/`.

### Adding API Endpoints

Edit `server/server.py` to add new FastAPI endpoints.

## Support

For issues, check:
1. Console logs (browser F12)
2. Server terminal output
3. Agent terminal output
4. Network connectivity between components

## Advanced Usage

### Running Multiple Agents

Open multiple terminals and start agents with different server IPs or the same server:

```bash
# Terminal 1
python main.py 192.168.1.100

# Terminal 2 (on another machine)
python main.py 192.168.1.100
```

### Remote Server Setup

1. Change server host in `server/server.py`:
```python
uvicorn.run(app, host="0.0.0.0", port=8000)
```

2. Update frontend API URL in `frontend/.env.local`:
```
NEXT_PUBLIC_API_URL=http://<server-ip>:8000
```

3. Allow firewall rules for port 8000 and 3000

### Production Deployment

For production, consider:
- Using a reverse proxy (nginx)
- Adding authentication middleware
- Using HTTPS/SSL certificates
- Setting up systemd services (Linux)
- Using PM2 for Node.js process management
- Setting up a proper database for persistence
- Implementing rate limiting
- Adding request logging and monitoring
