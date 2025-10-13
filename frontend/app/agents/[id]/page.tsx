'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getAgent,
  getAgentStatus,
  formatDate,
  formatBytes,
  downloadFile,
} from '@/lib/api';
import { AgentDetailed } from '@/types/agent';
import {
  ArrowLeft,
  Terminal as TerminalIcon,
  FolderOpen,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Download,
  Upload,
  Activity,
} from 'lucide-react';
import Link from 'next/link';

type TabType = 'overview' | 'commands' | 'files';

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = Number(params.id);

  const [agent, setAgent] = useState<AgentDetailed | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [commandFilter, setCommandFilter] = useState<string>('all');

  useEffect(() => {
    if (!agentId || isNaN(agentId)) {
      router.push('/agents');
      return;
    }

    fetchAgent();
    const interval = setInterval(fetchAgent, 5000); // Refresh every 5 seconds

    return () => clearInterval(interval);
  }, [agentId]);

  const fetchAgent = async () => {
    try {
      const data = await getAgent(agentId);
      setAgent(data);
    } catch (error) {
      console.error('Failed to fetch agent:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadFile = async (filename: string) => {
    try {
      const blob = await downloadFile(`agent_${agentId}`, filename);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to download file:', error);
      alert(`Failed to download file: ${error}`);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
        <span className="ml-3 text-gray-400">Loading agent details...</span>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="p-8">
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-6 text-center">
          <XCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
          <h2 className="text-xl font-semibold mb-2">Agent Not Found</h2>
          <p className="text-gray-400 mb-4">
            Agent ID {agentId} does not exist or has been disconnected.
          </p>
          <Link
            href="/agents"
            className="inline-flex items-center gap-2 bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Agents
          </Link>
        </div>
      </div>
    );
  }

  const status = getAgentStatus(agent.last_seen);
  const filteredCommands =
    commandFilter === 'all'
      ? agent.commands
      : agent.commands.filter((cmd) => cmd.status === commandFilter);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link
            href="/agents"
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold">{agent.hostname}</h1>
            <p className="text-gray-400">Agent ID: {agent.id}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchAgent}
            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <Link
            href={`/terminal?agent=${agent.id}`}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg transition-colors"
          >
            <TerminalIcon className="w-4 h-4" />
            Open Terminal
          </Link>
          <Link
            href={`/files`}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition-colors"
          >
            <FolderOpen className="w-4 h-4" />
            Manage Files
          </Link>
        </div>
      </div>

      {/* Status Card */}
      <div className="bg-gray-900 rounded-lg p-6 border border-gray-800 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div>
            <p className="text-gray-400 text-sm mb-2">Status</p>
            <div className="flex items-center gap-2">
              <div
                className={`w-3 h-3 rounded-full ${
                  status === 'online' ? 'bg-green-500 animate-pulse' : 'bg-red-500'
                }`}
              />
              <span
                className={`font-semibold ${
                  status === 'online' ? 'text-green-400' : 'text-red-400'
                }`}
              >
                {status.toUpperCase()}
              </span>
            </div>
          </div>
          <div>
            <p className="text-gray-400 text-sm mb-2">IP Address</p>
            <p className="font-mono">{agent.ipaddr}</p>
          </div>
          <div>
            <p className="text-gray-400 text-sm mb-2">User</p>
            <p className="font-mono">{agent.user}</p>
          </div>
          <div>
            <p className="text-gray-400 text-sm mb-2">Last Seen</p>
            <p className="text-sm">{formatDate(agent.last_seen)}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-800">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-3 font-semibold transition-colors ${
            activeTab === 'overview'
              ? 'text-red-500 border-b-2 border-red-500'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('commands')}
          className={`px-4 py-3 font-semibold transition-colors ${
            activeTab === 'commands'
              ? 'text-red-500 border-b-2 border-red-500'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Commands ({agent.commands.length})
        </button>
        <button
          onClick={() => setActiveTab('files')}
          className={`px-4 py-3 font-semibold transition-colors ${
            activeTab === 'files'
              ? 'text-red-500 border-b-2 border-red-500'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Files ({agent.uploaded_files.length + agent.downloaded_files.length})
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Total Commands</p>
                  <p className="text-3xl font-bold mt-2">{agent.total_commands}</p>
                </div>
                <Activity className="w-10 h-10 text-purple-500" />
              </div>
            </div>
            <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Files Uploaded</p>
                  <p className="text-3xl font-bold mt-2">{agent.uploaded_files_count}</p>
                </div>
                <Upload className="w-10 h-10 text-green-500" />
              </div>
            </div>
            <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Files Downloaded</p>
                  <p className="text-3xl font-bold mt-2">{agent.downloaded_files_count}</p>
                </div>
                <Download className="w-10 h-10 text-blue-500" />
              </div>
            </div>
          </div>

          {/* Agent Info */}
          <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
            <h3 className="text-xl font-semibold mb-4">Agent Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-gray-400 text-sm">Hostname</p>
                <p className="font-mono mt-1">{agent.hostname}</p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">Username</p>
                <p className="font-mono mt-1">{agent.user}</p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">IP Address</p>
                <p className="font-mono mt-1">{agent.ipaddr}</p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">Agent ID</p>
                <p className="font-mono mt-1">{agent.id}</p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">Joined At</p>
                <p className="mt-1">{formatDate(agent.joined_at)}</p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">Last Seen</p>
                <p className="mt-1">{formatDate(agent.last_seen)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'commands' && (
        <div>
          {/* Command Filter */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setCommandFilter('all')}
              className={`px-4 py-2 rounded-lg ${
                commandFilter === 'all'
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              All ({agent.commands.length})
            </button>
            <button
              onClick={() => setCommandFilter('completed')}
              className={`px-4 py-2 rounded-lg ${
                commandFilter === 'completed'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              Completed (
              {agent.commands.filter((c) => c.status === 'completed').length})
            </button>
            <button
              onClick={() => setCommandFilter('failed')}
              className={`px-4 py-2 rounded-lg ${
                commandFilter === 'failed'
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              Failed ({agent.commands.filter((c) => c.status === 'failed').length})
            </button>
            <button
              onClick={() => setCommandFilter('pending')}
              className={`px-4 py-2 rounded-lg ${
                commandFilter === 'pending'
                  ? 'bg-yellow-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              Pending (
              {
                agent.commands.filter(
                  (c) => c.status === 'pending' || c.status === 'retrieved'
                ).length
              }
              )
            </button>
          </div>

          {/* Commands List */}
          <div className="bg-gray-900 rounded-lg border border-gray-800">
            {filteredCommands.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                No {commandFilter === 'all' ? '' : commandFilter} commands found
              </div>
            ) : (
              <div className="divide-y divide-gray-800">
                {filteredCommands.map((cmd) => {
                  const commandDisplay =
                    cmd.type === 'exec' && cmd.data?.command
                      ? cmd.data.command
                      : cmd.type === 'upload' && cmd.data?.source_path
                      ? `upload: ${cmd.data.source_path}`
                      : cmd.type === 'download' && cmd.data?.filename
                      ? `download: ${cmd.data.filename}`
                      : cmd.type;

                  return (
                    <details key={cmd.command_id} className="p-4 hover:bg-gray-800/50">
                      <summary className="cursor-pointer flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {cmd.status === 'completed' ? (
                            <CheckCircle className="w-5 h-5 text-green-500" />
                          ) : cmd.status === 'failed' ? (
                            <XCircle className="w-5 h-5 text-red-500" />
                          ) : (
                            <Clock className="w-5 h-5 text-yellow-500" />
                          )}
                          <div>
                            <p className="font-mono text-sm">{commandDisplay}</p>
                            <p className="text-xs text-gray-400 mt-1">
                              {formatDate(cmd.created_at)}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`text-xs px-2 py-1 rounded ${
                            cmd.status === 'completed'
                              ? 'bg-green-900 text-green-300'
                              : cmd.status === 'failed'
                              ? 'bg-red-900 text-red-300'
                              : 'bg-yellow-900 text-yellow-300'
                          }`}
                        >
                          {cmd.status}
                        </span>
                      </summary>
                      <div className="mt-3 pl-8">
                        {cmd.result ? (
                          <pre className="bg-black p-3 rounded text-sm text-gray-300 overflow-x-auto">
                            {cmd.result}
                          </pre>
                        ) : cmd.error ? (
                          <pre className="bg-red-900/20 p-3 rounded text-sm text-red-300 overflow-x-auto">
                            Error: {cmd.error}
                          </pre>
                        ) : (
                          <p className="text-gray-400 text-sm">No output available</p>
                        )}
                      </div>
                    </details>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'files' && (
        <div className="space-y-6">
          {/* Uploaded Files */}
          <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
            <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Upload className="w-5 h-5 text-green-500" />
              Uploaded Files (From Agent)
            </h3>
            {agent.uploaded_files.length === 0 ? (
              <p className="text-gray-400">No files uploaded from this agent</p>
            ) : (
              <div className="space-y-2">
                {agent.uploaded_files.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 bg-gray-800 rounded-lg"
                  >
                    <div>
                      <p className="font-semibold">{file.filename}</p>
                      <p className="text-sm text-gray-400">
                        {formatBytes(file.size)} • {formatDate(file.uploaded_at)}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDownloadFile(file.filename)}
                      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded text-sm transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Download
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Downloaded Files */}
          <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
            <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Download className="w-5 h-5 text-blue-500" />
              Downloaded Files (Sent to Agent)
            </h3>
            {agent.downloaded_files.length === 0 ? (
              <p className="text-gray-400">No files sent to this agent</p>
            ) : (
              <div className="space-y-2">
                {agent.downloaded_files.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 bg-gray-800 rounded-lg"
                  >
                    <div>
                      <p className="font-semibold">{file.filename}</p>
                      <p className="text-sm text-gray-400">
                        {formatDate(file.downloaded_at)}
                      </p>
                    </div>
                    <span className="text-xs px-2 py-1 rounded bg-blue-900 text-blue-300">
                      Sent to Agent
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
