# Quick Start Guide

## 1. Installation (First Time Only)

```bash
# Install server dependencies
cd server
pip install -r requirements.txt
cd ..

# Install frontend dependencies
cd frontend
npm install
cd ..

# Install agent dependencies
cd agent
pip install -r requirements.txt
cd ..
```

## 2. Starting the System

### Windows (Easy Mode)

Open 3 separate terminals:

**Terminal 1:**
```batch
start_server.bat
```

**Terminal 2:**
```batch
start_frontend.bat
```

**Terminal 3:**
```batch
start_agent.bat 127.0.0.1
```

### Linux/Mac or Manual

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
python main.py 127.0.0.1
```

## 3. Access the Dashboard

Open your browser: **http://localhost:3000**

## 4. First Steps

1. **Dashboard** - You should see 1 agent connected
2. **Agents** - View your agent details
3. **Terminal** - Click to open terminal, select the agent, try:
   ```
   whoami
   hostname
   ipconfig
   ```
4. **Files** - Upload/download files

## That's it! 🎉

For detailed usage, see [USAGE.md](USAGE.md)

## Quick Test Commands

Once in the terminal, try these:

```powershell
# Windows
whoami
hostname
ipconfig /all
Get-Process | Select-Object -First 5

# Linux/Mac
whoami
uname -a
ifconfig
ps aux | head -5
```

## Troubleshooting

**"Module not found" error?**
```bash
pip install fastapi uvicorn pydantic python-multipart requests
```

**Port already in use?**
- Server: Edit `server/server.py` line 329
- Frontend: Edit `frontend/package.json` dev script

**Agent shows offline?**
- Wait 10 seconds, it polls every 3s
- Check if agent is still running
- Verify server IP is correct

## Architecture

```
Browser (localhost:3000)
    ↓
Next.js Frontend
    ↓ (API calls)
FastAPI Server (localhost:8000)
    ↓ (HTTP polling)
Python Agent (target machine)
```

## Next Steps

- Add more agents by running `start_agent.bat` on other machines
- Try file upload/download
- Execute PowerShell commands
- Check out [README.md](README.md) for full documentation
