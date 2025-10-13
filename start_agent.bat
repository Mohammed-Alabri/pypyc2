@echo off
if "%1"=="" (
    echo Usage: start_agent.bat ^<server_ip^>
    echo Example: start_agent.bat 192.168.1.100
    exit /b 1
)
echo Starting pypyc2 Agent...
cd agent
python main.py %1
