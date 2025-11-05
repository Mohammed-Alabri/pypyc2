'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getAgent,
  getAgentStatus,
  formatDate,
  formatBytes,
  downloadFile,
  deleteAgent,
  setSleepTime,
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
  Copy,
  Check,
  Trash2,
  Timer,
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
  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showSleepTimeModal, setShowSleepTimeModal] = useState(false);
  const [newSleepTime, setNewSleepTime] = useState<string>('3');
  const [isChangingSleepTime, setIsChangingSleepTime] = useState(false);

  const fetchAgent = useCallback(async () => {
    // Don't fetch if we're in the process of deleting
    if (isDeleting) {
      return;
    }

    try {
      const data = await getAgent(agentId);
      setAgent(data);
    } catch (error) {
      console.error('Failed to fetch agent:', error);
    } finally {
      setLoading(false);
    }
  }, [agentId, isDeleting]);

  useEffect(() => {
    if (!agentId || isNaN(agentId)) {
      router.push('/agents');
      return;
    }

    fetchAgent();
    const interval = setInterval(fetchAgent, 5000); // Refresh every 5 seconds

    return () => clearInterval(interval);
  }, [agentId, fetchAgent, router]);

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

  const handleCopy = async (text: string, itemId: string) => {
    try {
      // Check if clipboard API is available (requires HTTPS or localhost)
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        setCopiedItem(itemId);
        setTimeout(() => setCopiedItem(null), 2000);
      } else {
        // Fallback for HTTP contexts or older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        setCopiedItem(itemId);
        setTimeout(() => setCopiedItem(null), 2000);
      }
    } catch (error) {
      console.error('Failed to copy:', error);
      // Try fallback one more time in case the first attempt failed
      try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        setCopiedItem(itemId);
        setTimeout(() => setCopiedItem(null), 2000);
      } catch (fallbackError) {
        console.error('Fallback copy also failed:', fallbackError);
      }
    }
  };

  const handleDeleteAgent = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteAgent(agentId);
      // Show success message mentioning if agent was terminated
      const message = result.terminated
        ? 'Agent terminated and deleted successfully'
        : 'Agent deleted successfully';
      console.log(message);
      router.push('/agents');
    } catch (error) {
      console.error('Failed to delete agent:', error);
      alert(`Failed to delete agent: ${error}`);
      setIsDeleting(false);
    }
  };

  const handleChangeSleepTime = async () => {
    if (!agent) return;

    const sleepTimeValue = parseInt(newSleepTime);
    if (isNaN(sleepTimeValue) || sleepTimeValue < 1 || sleepTimeValue > 60) {
      alert('Sleep time must be a number between 1 and 60 seconds');
      return;
    }

    setIsChangingSleepTime(true);
    try {
      const response = await setSleepTime(agentId, sleepTimeValue);
      alert(response.message || 'Sleep time command sent successfully');
      setShowSleepTimeModal(false);
      // Refresh agent data to show updated sleep_time once command completes
      setTimeout(() => fetchAgent(), 2000);
    } catch (error) {
      console.error('Failed to set sleep time:', error);
      alert(`Failed to set sleep time: ${error}`);
    } finally {
      setIsChangingSleepTime(false);
    }
  };

  const openSleepTimeModal = () => {
    if (agent) {
      setNewSleepTime((agent.sleep_time ?? 3).toString());
      setShowSleepTimeModal(true);
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

  const status = getAgentStatus(agent.last_seen, agent.sleep_time ?? 3);
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
          <button
            onClick={openSleepTimeModal}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg transition-colors"
            title="Change polling interval"
          >
            <Timer className="w-4 h-4" />
            Sleep Time ({agent.sleep_time ?? 3}s)
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
          <button
            onClick={() => setShowDeleteModal(true)}
            className="flex items-center gap-2 border-2 border-red-500 text-red-500 hover:bg-red-500 hover:text-white px-4 py-2 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Delete Agent
          </button>
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
              <div>
                <p className="text-gray-400 text-sm">Polling Interval</p>
                <p className="mt-1 flex items-center gap-2">
                  <Timer className="w-4 h-4 text-purple-500" />
                  <span className="font-semibold text-purple-400">{agent.sleep_time ?? 3}s</span>
                </p>
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
                      : cmd.type === 'set_sleep_time' && cmd.data?.sleep_time
                      ? `set_sleep_time: ${cmd.data.sleep_time}s`
                      : cmd.type === 'list_directory' && cmd.data?.path
                      ? `list_directory: ${cmd.data.path}`
                      : cmd.type;

                  return (
                    <details key={cmd.command_id} className="p-4 hover:bg-gray-800/50 group">
                      <summary className="cursor-pointer flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {cmd.status === 'completed' ? (
                            <CheckCircle className="w-5 h-5 text-green-500" />
                          ) : cmd.status === 'failed' ? (
                            <XCircle className="w-5 h-5 text-red-500" />
                          ) : (
                            <Clock className="w-5 h-5 text-yellow-500" />
                          )}
                          <div className="flex items-center gap-2">
                            <div>
                              <p className="font-mono text-sm">{commandDisplay}</p>
                              <p className="text-xs text-gray-400 mt-1">
                                {formatDate(cmd.created_at)}
                              </p>
                            </div>
                            {/* Copy command button - shows on hover */}
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleCopy(commandDisplay, `cmd-${cmd.command_id}`);
                              }}
                              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-gray-700 rounded"
                              title="Copy command"
                            >
                              {copiedItem === `cmd-${cmd.command_id}` ? (
                                <Check className="w-4 h-4 text-green-500" />
                              ) : (
                                <Copy className="w-4 h-4 text-gray-400" />
                              )}
                            </button>
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
                          <div className="relative group/output">
                            {/* Copy output button - top right */}
                            <button
                              onClick={() => handleCopy(cmd.result || '', `output-${cmd.command_id}`)}
                              className="absolute top-2 right-2 opacity-0 group-hover/output:opacity-100 transition-opacity p-1.5 bg-gray-800 hover:bg-gray-700 rounded z-10"
                              title="Copy output"
                            >
                              {copiedItem === `output-${cmd.command_id}` ? (
                                <Check className="w-4 h-4 text-green-500" />
                              ) : (
                                <Copy className="w-4 h-4 text-gray-400" />
                              )}
                            </button>
                            <pre className="bg-black p-3 rounded text-sm text-gray-300 overflow-x-auto">
                              {cmd.result}
                            </pre>
                          </div>
                        ) : cmd.error ? (
                          <div className="relative group/output">
                            {/* Copy error button */}
                            <button
                              onClick={() => handleCopy(cmd.error || '', `error-${cmd.command_id}`)}
                              className="absolute top-2 right-2 opacity-0 group-hover/output:opacity-100 transition-opacity p-1.5 bg-red-900/30 hover:bg-red-900/50 rounded z-10"
                              title="Copy error"
                            >
                              {copiedItem === `error-${cmd.command_id}` ? (
                                <Check className="w-4 h-4 text-green-500" />
                              ) : (
                                <Copy className="w-4 h-4 text-gray-400" />
                              )}
                            </button>
                            <pre className="bg-red-900/20 p-3 rounded text-sm text-red-300 overflow-x-auto">
                              Error: {cmd.error}
                            </pre>
                          </div>
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

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-lg max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-red-500/20 rounded-full">
                <Trash2 className="w-6 h-6 text-red-500" />
              </div>
              <h2 className="text-xl font-bold">Delete Agent</h2>
            </div>

            <div className="mb-6">
              <p className="text-gray-300 mb-4">
                Are you sure you want to delete agent <span className="font-bold">{agent.hostname}</span> (ID: {agent.id})?
              </p>

              <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-3 mb-4">
                <p className="text-yellow-300 text-sm font-semibold mb-2">This action will:</p>
                <ul className="text-yellow-200 text-sm space-y-1 list-disc list-inside">
                  {status === 'online' && <li>Send terminate command to gracefully shut down the agent</li>}
                  <li>Delete all {agent.total_commands} command history records</li>
                  <li>Remove {agent.uploaded_files_count} uploaded files</li>
                  <li>Remove {agent.downloaded_files_count} download records</li>
                  <li>Permanently remove all agent data</li>
                </ul>
              </div>

              {status === 'online' && (
                <div className="bg-green-900/20 border border-green-700 rounded-lg p-3">
                  <p className="text-green-300 text-sm flex items-center gap-2">
                    <Activity className="w-4 h-4" />
                    <span className="font-semibold">Note:</span> Agent is online and will be terminated first
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
                className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAgent}
                disabled={isDeleting}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    {status === 'online' ? 'Terminating & Deleting...' : 'Deleting...'}
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    {status === 'online' ? 'Terminate & Delete' : 'Delete Permanently'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sleep Time Modal */}
      {showSleepTimeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-lg max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-purple-500/20 rounded-full">
                <Timer className="w-6 h-6 text-purple-500" />
              </div>
              <h2 className="text-xl font-bold">Change Sleep Time</h2>
            </div>

            <div className="mb-6">
              <p className="text-gray-300 mb-4">
                Adjust how often the agent polls the server for commands.
              </p>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Polling Interval (seconds)
                </label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={newSleepTime}
                  onChange={(e) => setNewSleepTime(e.target.value)}
                  className="w-full bg-gray-800 text-white px-4 py-2 rounded-lg border border-gray-700 focus:outline-none focus:border-purple-500"
                  disabled={isChangingSleepTime}
                />
              </div>

              <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-3 mb-4">
                <p className="text-blue-300 text-sm">
                  <strong>Current:</strong> {agent?.sleep_time ?? 3}s
                  <br />
                  <strong>Range:</strong> 1-60 seconds
                </p>
              </div>

              <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-3">
                <p className="text-yellow-300 text-sm font-semibold mb-1">Note:</p>
                <ul className="text-yellow-200 text-sm space-y-1 list-disc list-inside">
                  <li>Lower values = Faster response but more network traffic</li>
                  <li>Higher values = Slower response but less network traffic</li>
                  <li>Recommended: 3-10 seconds for normal operation</li>
                </ul>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowSleepTimeModal(false)}
                disabled={isChangingSleepTime}
                className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleChangeSleepTime}
                disabled={isChangingSleepTime}
                className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isChangingSleepTime ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Timer className="w-4 h-4" />
                    Change Sleep Time
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
